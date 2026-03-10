from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.config import Settings
from app.schemas import (
    AdapterExecutionContract,
    AdapterExecutionContractConstraints,
    AdapterExecutionContractField,
    AdapterToolItem,
    ConstrainedToolConstraints,
    ConstrainedToolInputField,
    ConstrainedToolIR,
)

_SERVICE_ROOT = Path(__file__).resolve().parents[1]


def list_catalog_tools(settings: Settings) -> list[AdapterToolItem]:
    catalog_root = _resolve_catalog_root(settings.catalog_root)
    if not catalog_root.exists():
        return []

    catalog: dict[str, AdapterToolItem] = {}
    manifest_paths = sorted(catalog_root.rglob("manifest.y*ml"))
    for manifest_path in manifest_paths:
        for tool in _load_manifest_tools(settings, manifest_path):
            catalog[tool.id] = tool

    return [catalog[tool_id] for tool_id in sorted(catalog)]


def get_catalog_tool(settings: Settings, tool_id: str) -> AdapterToolItem | None:
    for tool in list_catalog_tools(settings):
        if tool.id == tool_id:
            return tool
    return None


def build_execution_contract(tool: AdapterToolItem) -> AdapterExecutionContract:
    constrained_ir = tool.constrained_ir
    return AdapterExecutionContract(
        irVersion=constrained_ir.ir_version,
        kind="tool_execution",
        ecosystem=constrained_ir.ecosystem,
        toolId=constrained_ir.tool_id,
        inputContract=[
            AdapterExecutionContractField(
                name=field.name,
                required=field.required,
                valueSource=field.value_source,
                jsonSchema=dict(field.json_schema),
            )
            for field in constrained_ir.input_contract
        ],
        constraints=AdapterExecutionContractConstraints(
            additionalProperties=constrained_ir.constraints.additional_properties,
            credentialFields=list(constrained_ir.constraints.credential_fields),
            fileFields=list(constrained_ir.constraints.file_fields),
            llmFillableFields=list(constrained_ir.constraints.llm_fillable_fields),
            userConfigFields=list(constrained_ir.constraints.user_config_fields),
        ),
        pluginMeta=dict(constrained_ir.plugin_meta) if constrained_ir.plugin_meta else None,
    )


def _resolve_catalog_root(catalog_root: str) -> Path:
    root = Path(catalog_root)
    if root.is_absolute():
        return root
    return (_SERVICE_ROOT / root).resolve()


def _load_manifest_tools(settings: Settings, manifest_path: Path) -> list[AdapterToolItem]:
    manifest = _load_yaml(manifest_path)
    manifest_version = str(manifest.get("version") or "")
    tool_refs = list(((manifest.get("plugins") or {}).get("tools") or []))
    if not tool_refs:
        return []

    tools: list[AdapterToolItem] = []
    for tool_ref in tool_refs:
        tool_path = (manifest_path.parent / str(tool_ref)).resolve()
        tool_definition = _load_yaml(tool_path)
        tools.append(
            _translate_tool_definition(
                settings=settings,
                manifest_version=manifest_version,
                manifest_path=manifest_path,
                tool_path=tool_path,
                definition=tool_definition,
            )
        )
    return tools


def _load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"YAML document at '{path}' must be an object.")
    return data


def _translate_tool_definition(
    *,
    settings: Settings,
    manifest_version: str,
    manifest_path: Path,
    tool_path: Path,
    definition: dict[str, Any],
) -> AdapterToolItem:
    identity = definition.get("identity") or {}
    name = str(identity.get("name") or "").strip()
    author = str(identity.get("author") or "").strip()
    if not name or not author:
        raise ValueError(f"Tool definition '{tool_path}' is missing identity.name or identity.author.")

    translated_name = _pick_localized_text(identity.get("label"), fallback=name)
    description = _pick_localized_text(identity.get("description"), fallback="")
    icon = str(identity.get("icon") or "").strip()
    runtime_binding = _infer_runtime_binding(
        manifest_path=manifest_path,
        tool_definition=definition,
        author=author,
        tool_name=name,
    )

    properties: dict[str, Any] = {}
    required: list[str] = []
    credential_fields: list[str] = []
    file_fields: list[str] = []
    llm_fillable_fields: list[str] = []
    user_config_fields: list[str] = []
    input_contract: list[ConstrainedToolInputField] = []
    for parameter in definition.get("parameters") or []:
        if not isinstance(parameter, dict):
            continue
        parameter_name = str(parameter.get("name") or "").strip()
        if not parameter_name:
            continue
        schema = _translate_parameter_schema(parameter)
        properties[parameter_name] = schema

        is_required = bool(parameter.get("required"))
        if is_required:
            required.append(parameter_name)
        value_source = _resolve_value_source(parameter)
        if value_source == "credential":
            credential_fields.append(parameter_name)
        elif value_source == "file":
            file_fields.append(parameter_name)
        elif value_source == "llm":
            llm_fillable_fields.append(parameter_name)
        else:
            user_config_fields.append(parameter_name)

        input_contract.append(
            ConstrainedToolInputField(
                name=parameter_name,
                required=is_required,
                value_source=value_source,
                json_schema=schema,
            )
        )

    input_schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required:
        input_schema["required"] = required

    tool_id = f"{settings.supported_ecosystem}:plugin:{author}/{name}"
    plugin_meta = {
        "origin": "dify",
        "ecosystem": settings.supported_ecosystem,
        "manifest_version": manifest_version,
        "author": author,
        "icon": icon,
        "manifest_path": str(manifest_path),
        "tool_path": str(tool_path),
        "dify_runtime": runtime_binding,
    }
    constrained_ir = ConstrainedToolIR(
        ecosystem=settings.supported_ecosystem,
        tool_id=tool_id,
        name=translated_name,
        description=description,
        source="plugin",
        input_schema=input_schema,
        output_schema=None,
        input_contract=input_contract,
        constraints=ConstrainedToolConstraints(
            additional_properties=False,
            credential_fields=credential_fields,
            file_fields=file_fields,
            llm_fillable_fields=llm_fillable_fields,
            user_config_fields=user_config_fields,
        ),
        plugin_meta=plugin_meta,
    )

    return AdapterToolItem(
        id=tool_id,
        name=translated_name,
        ecosystem=settings.supported_ecosystem,
        description=description,
        input_schema=input_schema,
        output_schema=None,
        source="plugin",
        plugin_meta=plugin_meta,
        constrained_ir=constrained_ir,
    )


def _translate_parameter_schema(parameter: dict[str, Any]) -> dict[str, Any]:
    parameter_type = str(parameter.get("type") or "string")
    label = _pick_localized_text(parameter.get("label"), fallback=str(parameter.get("name") or ""))
    description = _pick_localized_text(parameter.get("human_description"), fallback="")

    schema: dict[str, Any]
    if parameter_type == "string":
        schema = {"type": "string"}
    elif parameter_type == "number":
        schema = {"type": "number"}
    elif parameter_type == "boolean":
        schema = {"type": "boolean"}
    elif parameter_type == "select":
        schema = {
            "type": "string",
            "enum": [option.get("value") for option in parameter.get("options") or [] if "value" in option],
        }
    elif parameter_type == "secret-input":
        schema = {"type": "string", "format": "password"}
    elif parameter_type == "file":
        schema = {"type": "string", "format": "uri"}
    else:
        raise ValueError(
            f"Unsupported Dify parameter type '{parameter_type}' for '{parameter.get('name')}'."
        )

    if label:
        schema["title"] = label
    if description:
        schema["description"] = description
    if "default" in parameter:
        schema["default"] = parameter["default"]
    if "form" in parameter:
        schema["x-dify-form"] = parameter["form"]

    return schema


def _resolve_value_source(parameter: dict[str, Any]) -> str:
    parameter_type = str(parameter.get("type") or "string")
    if parameter_type == "secret-input":
        return "credential"
    if parameter_type == "file":
        return "file"
    if str(parameter.get("form") or "").strip() == "llm":
        return "llm"
    return "user"


def _infer_runtime_binding(
    *,
    manifest_path: Path,
    tool_definition: dict[str, Any],
    author: str,
    tool_name: str,
) -> dict[str, str]:
    manifest_slug = manifest_path.parent.name.strip() or author or "plugin"
    runtime = (
        ((tool_definition.get("extra") or {}).get("dify_runtime") or {})
        if isinstance(tool_definition.get("extra"), dict)
        else {}
    )
    if not isinstance(runtime, dict):
        runtime = {}

    provider = str(runtime.get("provider") or manifest_slug).strip() or manifest_slug
    plugin_id = str(runtime.get("plugin_id") or author or manifest_slug).strip() or manifest_slug
    resolved_tool_name = str(runtime.get("tool_name") or tool_name).strip() or tool_name
    return {
        "plugin_id": plugin_id,
        "provider": provider,
        "tool_name": resolved_tool_name,
    }


def _pick_localized_text(value: Any, *, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        for key in ("en_US", "en", "zh_Hans", "zh_CN"):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip()
        for text in value.values():
            if isinstance(text, str) and text.strip():
                return text.strip()
    return fallback
