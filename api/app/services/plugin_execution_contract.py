from __future__ import annotations

from typing import Any

from app.services.plugin_runtime_types import (
    PluginCallRequest,
    PluginInvocationError,
    PluginToolDefinition,
)


def build_execution_contract(tool: PluginToolDefinition) -> dict[str, Any]:
    constrained_ir = tool.constrained_ir
    if not isinstance(constrained_ir, dict):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool.id}' is missing constrained_ir and cannot be invoked."
        )

    input_contract = constrained_ir.get("input_contract")
    constraints = constrained_ir.get("constraints")
    if not isinstance(input_contract, list) or not isinstance(constraints, dict):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool.id}' has an invalid constrained_ir execution contract."
        )

    contract_fields: list[dict[str, Any]] = []
    for raw_field in input_contract:
        if not isinstance(raw_field, dict):
            raise PluginInvocationError(
                f"Compat plugin tool '{tool.id}' has a non-object input_contract field."
            )
        field_name = str(raw_field.get("name") or "").strip()
        value_source = str(raw_field.get("value_source") or "").strip()
        json_schema = raw_field.get("json_schema") or {}
        if not field_name or value_source not in {"llm", "user", "credential", "file"}:
            raise PluginInvocationError(
                f"Compat plugin tool '{tool.id}' has an invalid input_contract field."
            )
        if not isinstance(json_schema, dict):
            raise PluginInvocationError(
                f"Compat plugin tool '{tool.id}' has an invalid json_schema for '{field_name}'."
            )
        contract_fields.append(
            {
                "name": field_name,
                "required": bool(raw_field.get("required")),
                "valueSource": value_source,
                "jsonSchema": dict(json_schema),
            }
        )

    return {
        "irVersion": str(constrained_ir.get("ir_version") or "2026-03-10"),
        "kind": "tool_execution",
        "ecosystem": str(constrained_ir.get("ecosystem") or tool.ecosystem),
        "toolId": str(constrained_ir.get("tool_id") or tool.id),
        "inputContract": contract_fields,
        "constraints": {
            "additionalProperties": bool(constraints.get("additional_properties", False)),
            "credentialFields": list(constraints.get("credential_fields") or []),
            "fileFields": list(constraints.get("file_fields") or []),
            "llmFillableFields": list(constraints.get("llm_fillable_fields") or []),
            "userConfigFields": list(constraints.get("user_config_fields") or []),
        },
        "pluginMeta": dict(constrained_ir.get("plugin_meta") or {}),
    }


def build_sandbox_tool_execution_contract(tool: PluginToolDefinition) -> dict[str, Any]:
    constrained_ir = tool.constrained_ir
    if isinstance(constrained_ir, dict):
        return build_execution_contract(tool)

    input_schema = tool.input_schema if isinstance(tool.input_schema, dict) else {}
    raw_properties = input_schema.get("properties")
    properties = raw_properties if isinstance(raw_properties, dict) else {}
    required_fields = {
        str(item)
        for item in (input_schema.get("required") or [])
        if isinstance(item, str) and item.strip()
    }
    contract_fields: list[dict[str, Any]] = []
    for field_name, raw_schema in properties.items():
        normalized_field_name = str(field_name or "").strip()
        if not normalized_field_name:
            continue
        json_schema = raw_schema if isinstance(raw_schema, dict) else {}
        contract_fields.append(
            {
                "name": normalized_field_name,
                "required": normalized_field_name in required_fields,
                "valueSource": "llm",
                "jsonSchema": dict(json_schema),
            }
        )

    additional_properties = input_schema.get("additionalProperties")
    if isinstance(additional_properties, bool):
        allow_additional_properties = additional_properties
    else:
        allow_additional_properties = not contract_fields

    field_names = [str(field["name"]) for field in contract_fields]
    return {
        "irVersion": "2026-03-10",
        "kind": "tool_execution",
        "ecosystem": tool.ecosystem,
        "toolId": tool.id,
        "inputContract": contract_fields,
        "constraints": {
            "additionalProperties": allow_additional_properties,
            "credentialFields": [],
            "fileFields": [],
            "llmFillableFields": field_names,
            "userConfigFields": [],
        },
        "pluginMeta": dict(tool.plugin_meta or {}),
    }


def normalize_contract_bound_request(
    request: PluginCallRequest,
    execution_contract: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, str]]:
    raw_fields = execution_contract.get("inputContract") or []
    constraints = execution_contract.get("constraints") or {}
    fields_by_name = {
        str(field.get("name")): field
        for field in raw_fields
        if isinstance(field, dict) and field.get("name")
    }
    allowed_input_fields = {
        name for name, field in fields_by_name.items() if field.get("valueSource") != "credential"
    }
    allowed_credential_fields = set(constraints.get("credentialFields") or [])
    additional_properties = bool(constraints.get("additionalProperties", False))

    for name, field in fields_by_name.items():
        value_source = str(field.get("valueSource") or "")
        if value_source == "credential" and name in request.inputs:
            raise PluginInvocationError(
                f"Compat plugin tool '{request.tool_id}' must receive credential field "
                f"'{name}' via credentials, not inputs."
            )
        if value_source != "credential" and name in request.credentials:
            raise PluginInvocationError(
                f"Compat plugin tool '{request.tool_id}' must receive field '{name}' via "
                f"inputs, not credentials."
            )

    extra_inputs = sorted(set(request.inputs) - allowed_input_fields)
    if extra_inputs and not additional_properties:
        raise PluginInvocationError(
            f"Compat plugin tool '{request.tool_id}' received unsupported input fields: "
            f"{', '.join(extra_inputs)}."
        )
    extra_credentials = sorted(set(request.credentials) - allowed_credential_fields)
    if extra_credentials and not additional_properties:
        raise PluginInvocationError(
            f"Compat plugin tool '{request.tool_id}' received unsupported credential fields: "
            f"{', '.join(extra_credentials)}."
        )

    normalized_inputs: dict[str, Any] = {}
    normalized_credentials: dict[str, str] = {}
    for name, field in fields_by_name.items():
        value_source = str(field.get("valueSource") or "")
        required = bool(field.get("required"))
        json_schema = field.get("jsonSchema") or {}
        if value_source == "credential":
            if name not in request.credentials:
                if required:
                    raise PluginInvocationError(
                        f"Compat plugin tool '{request.tool_id}' is missing required "
                        f"credential '{name}'."
                    )
                continue
            value = request.credentials[name]
            _validate_contract_field_value(
                tool_id=request.tool_id,
                field_name=name,
                value_source=value_source,
                value=value,
                json_schema=json_schema,
            )
            normalized_credentials[name] = value
            continue

        if name not in request.inputs:
            if required:
                raise PluginInvocationError(
                    f"Compat plugin tool '{request.tool_id}' is missing "
                    f"required input '{name}'."
                )
            continue
        value = request.inputs[name]
        _validate_contract_field_value(
            tool_id=request.tool_id,
            field_name=name,
            value_source=value_source,
            value=value,
            json_schema=json_schema,
        )
        normalized_inputs[name] = value

    if additional_properties:
        for name, value in request.inputs.items():
            normalized_inputs.setdefault(name, value)
        for name, value in request.credentials.items():
            normalized_credentials.setdefault(name, value)

    return normalized_inputs, normalized_credentials


def _validate_contract_field_value(
    *,
    tool_id: str,
    field_name: str,
    value_source: str,
    value: Any,
    json_schema: dict[str, Any],
) -> None:
    schema_type = str(json_schema.get("type") or "").strip()
    if schema_type == "string" and not isinstance(value, str):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' expects a string "
            f"({value_source})."
        )
    if schema_type == "number" and (
        not isinstance(value, (int, float)) or isinstance(value, bool)
    ):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' expects a number "
            f"({value_source})."
        )
    if schema_type == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' expects an integer "
            f"({value_source})."
        )
    if schema_type == "boolean" and not isinstance(value, bool):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' expects a boolean "
            f"({value_source})."
        )
    if schema_type == "object" and not isinstance(value, dict):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' expects an object "
            f"({value_source})."
        )
    if schema_type == "array" and not isinstance(value, list):
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' expects an array "
            f"({value_source})."
        )

    enum_values = json_schema.get("enum")
    if isinstance(enum_values, list) and value not in enum_values:
        raise PluginInvocationError(
            f"Compat plugin tool '{tool_id}' field '{field_name}' must be one of "
            f"{', '.join(str(item) for item in enum_values)}."
        )
