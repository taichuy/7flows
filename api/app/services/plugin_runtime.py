from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import Settings, get_settings

NativeToolInvoker = Callable[["PluginCallRequest"], "PluginCallResponse | dict[str, Any]"]
ClientFactory = Callable[[int], httpx.Client]


class PluginInvocationError(RuntimeError):
    pass


class PluginCatalogError(RuntimeError):
    pass


@dataclass(frozen=True)
class PluginToolDefinition:
    id: str
    name: str
    ecosystem: str = "native"
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] | None = None
    source: str = "builtin"
    plugin_meta: dict[str, Any] | None = None
    constrained_ir: dict[str, Any] | None = None


@dataclass(frozen=True)
class CompatibilityAdapterRegistration:
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool = True
    health_status: str = "degraded"
    healthcheck_path: str = "/healthz"
    workspace_ids: tuple[str, ...] = ()
    plugin_kinds: tuple[str, ...] = ("node", "provider")


@dataclass(frozen=True)
class CompatibilityAdapterHealth:
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool
    status: str
    detail: str | None = None


@dataclass(frozen=True)
class PluginCallRequest:
    tool_id: str
    ecosystem: str
    inputs: dict[str, Any]
    adapter_id: str | None = None
    credentials: dict[str, str] = field(default_factory=dict)
    timeout_ms: int = 30_000
    trace_id: str = ""


@dataclass(frozen=True)
class PluginCallResponse:
    status: str
    output: dict[str, Any]
    logs: list[str] = field(default_factory=list)
    duration_ms: int = 0


class PluginRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, PluginToolDefinition] = {}
        self._native_invokers: dict[str, NativeToolInvoker] = {}
        self._adapters: dict[str, CompatibilityAdapterRegistration] = {}

    def register_tool(
        self,
        definition: PluginToolDefinition,
        *,
        invoker: NativeToolInvoker | None = None,
    ) -> None:
        self._tools[definition.id] = definition
        if invoker is not None:
            self._native_invokers[definition.id] = invoker

    def get_tool(self, tool_id: str) -> PluginToolDefinition | None:
        return self._tools.get(tool_id)

    def list_tools(self) -> list[PluginToolDefinition]:
        return list(self._tools.values())

    def get_native_invoker(self, tool_id: str) -> NativeToolInvoker | None:
        return self._native_invokers.get(tool_id)

    def has_native_invoker(self, tool_id: str) -> bool:
        return tool_id in self._native_invokers

    def unregister_tool(self, tool_id: str) -> None:
        self._tools.pop(tool_id, None)
        self._native_invokers.pop(tool_id, None)

    def get_adapter(self, adapter_id: str) -> CompatibilityAdapterRegistration | None:
        return self._adapters.get(adapter_id)

    def register_adapter(self, registration: CompatibilityAdapterRegistration) -> None:
        self._adapters[registration.id] = registration

    def list_adapters(self) -> list[CompatibilityAdapterRegistration]:
        return list(self._adapters.values())

    def unregister_adapter(self, adapter_id: str) -> None:
        self._adapters.pop(adapter_id, None)

    def resolve_adapter(
        self,
        *,
        ecosystem: str,
        adapter_id: str | None = None,
    ) -> CompatibilityAdapterRegistration:
        if adapter_id is not None:
            adapter = self._adapters.get(adapter_id)
            if adapter is None:
                raise PluginInvocationError(f"Plugin adapter '{adapter_id}' is not registered.")
            if adapter.ecosystem != ecosystem:
                raise PluginInvocationError(
                    f"Plugin adapter '{adapter_id}' does not serve ecosystem '{ecosystem}'."
                )
            if not adapter.enabled:
                raise PluginInvocationError(f"Plugin adapter '{adapter_id}' is disabled.")
            return adapter

        for adapter in self._adapters.values():
            if adapter.ecosystem == ecosystem and adapter.enabled:
                return adapter

        raise PluginInvocationError(f"No enabled plugin adapter is registered for '{ecosystem}'.")


class PluginCallProxy:
    def __init__(
        self,
        registry: PluginRegistry,
        *,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._registry = registry
        self._client_factory = client_factory or self._default_client_factory

    def invoke(self, request: PluginCallRequest) -> PluginCallResponse:
        tool = self._registry.get_tool(request.tool_id)
        if tool is None:
            raise PluginInvocationError(f"Plugin tool '{request.tool_id}' is not registered.")

        if tool.ecosystem != request.ecosystem:
            raise PluginInvocationError(
                f"Plugin tool '{request.tool_id}' belongs to ecosystem '{tool.ecosystem}', "
                f"not '{request.ecosystem}'."
            )

        if request.ecosystem == "native":
            return self._invoke_native_tool(request)

        adapter = self._registry.resolve_adapter(
            ecosystem=request.ecosystem,
            adapter_id=request.adapter_id,
        )
        return self._invoke_adapter_tool(tool, adapter, request)

    def _invoke_native_tool(self, request: PluginCallRequest) -> PluginCallResponse:
        invoker = self._registry.get_native_invoker(request.tool_id)
        if invoker is None:
            raise PluginInvocationError(
                f"Native plugin tool '{request.tool_id}' does not provide an invoker."
            )

        started_at = time.perf_counter()
        result = invoker(request)
        duration_ms = int((time.perf_counter() - started_at) * 1000)

        if isinstance(result, PluginCallResponse):
            if result.duration_ms > 0:
                return result
            return PluginCallResponse(
                status=result.status,
                output=result.output,
                logs=result.logs,
                duration_ms=duration_ms,
            )

        return PluginCallResponse(status="success", output=result, duration_ms=duration_ms)

    def _invoke_adapter_tool(
        self,
        tool: PluginToolDefinition,
        adapter: CompatibilityAdapterRegistration,
        request: PluginCallRequest,
    ) -> PluginCallResponse:
        started_at = time.perf_counter()
        invoke_url = f"{adapter.endpoint.rstrip('/')}/invoke"
        execution_contract = self._build_execution_contract(tool)
        normalized_inputs, normalized_credentials = self._normalize_contract_bound_request(
            request,
            execution_contract,
        )
        payload = {
            "toolId": request.tool_id,
            "ecosystem": request.ecosystem,
            "adapterId": adapter.id,
            "inputs": normalized_inputs,
            "credentials": normalized_credentials,
            "timeout": request.timeout_ms,
            "traceId": request.trace_id,
            "executionContract": execution_contract,
        }

        with self._client_factory(request.timeout_ms) as client:
            response = client.post(
                invoke_url,
                json=payload,
                headers={"x-sevenflows-adapter-id": adapter.id},
            )

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise PluginInvocationError(
                f"Plugin adapter '{adapter.id}' rejected '{request.tool_id}' with "
                f"status {response.status_code}."
            ) from exc

        body = response.json()
        status = str(body.get("status", "error"))
        if status != "success":
            raise PluginInvocationError(
                str(body.get("error") or f"Plugin adapter '{adapter.id}' invocation failed.")
            )

        return PluginCallResponse(
            status=status,
            output=body.get("output") or {},
            logs=list(body.get("logs") or []),
            duration_ms=int(
                body.get("durationMs") or int((time.perf_counter() - started_at) * 1000)
            ),
        )

    def _build_execution_contract(self, tool: PluginToolDefinition) -> dict[str, Any]:
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

    def _normalize_contract_bound_request(
        self,
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
            name
            for name, field in fields_by_name.items()
            if field.get("valueSource") != "credential"
        }
        allowed_credential_fields = set(constraints.get("credentialFields") or [])
        additional_properties = bool(constraints.get("additionalProperties", False))

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
            json_schema = field.get("jsonSchema") or {}
            required = bool(field.get("required"))
            if value_source == "credential":
                if name in request.inputs:
                    raise PluginInvocationError(
                        f"Compat plugin tool '{request.tool_id}' must receive credential field "
                        f"'{name}' via credentials, not inputs."
                    )
                if name not in request.credentials:
                    if required:
                        raise PluginInvocationError(
                            f"Compat plugin tool '{request.tool_id}' is missing required "
                            f"credential '{name}'."
                        )
                    continue
                value = request.credentials[name]
                self._validate_contract_value(
                    tool_id=request.tool_id,
                    field_name=name,
                    value=value,
                    value_source=value_source,
                    json_schema=json_schema,
                )
                normalized_credentials[name] = value
                continue

            if name in request.credentials:
                raise PluginInvocationError(
                    f"Compat plugin tool '{request.tool_id}' must receive field '{name}' via "
                    f"inputs, not credentials."
                )
            if name not in request.inputs:
                if required:
                    raise PluginInvocationError(
                        f"Compat plugin tool '{request.tool_id}' is missing required input '{name}'."
                    )
                continue
            value = request.inputs[name]
            self._validate_contract_value(
                tool_id=request.tool_id,
                field_name=name,
                value=value,
                value_source=value_source,
                json_schema=json_schema,
            )
            normalized_inputs[name] = value

        return normalized_inputs, normalized_credentials

    def _validate_contract_value(
        self,
        *,
        tool_id: str,
        field_name: str,
        value: Any,
        value_source: str,
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

    @staticmethod
    def _default_client_factory(timeout_ms: int) -> httpx.Client:
        timeout_seconds = None if timeout_ms <= 0 else timeout_ms / 1000
        return httpx.Client(timeout=timeout_seconds)


class CompatibilityAdapterHealthChecker:
    def __init__(
        self,
        *,
        client_factory: ClientFactory | None = None,
        timeout_ms: int = 3_000,
    ) -> None:
        self._client_factory = client_factory or PluginCallProxy._default_client_factory
        self._timeout_ms = timeout_ms

    def probe(self, adapter: CompatibilityAdapterRegistration) -> CompatibilityAdapterHealth:
        if not adapter.enabled:
            return CompatibilityAdapterHealth(
                id=adapter.id,
                ecosystem=adapter.ecosystem,
                endpoint=adapter.endpoint,
                enabled=False,
                status="disabled",
            )

        health_url = f"{adapter.endpoint.rstrip('/')}{adapter.healthcheck_path}"
        try:
            with self._client_factory(self._timeout_ms) as client:
                response = client.get(health_url)
            response.raise_for_status()
        except Exception as exc:
            return CompatibilityAdapterHealth(
                id=adapter.id,
                ecosystem=adapter.ecosystem,
                endpoint=adapter.endpoint,
                enabled=True,
                status="down",
                detail=str(exc),
            )

        return CompatibilityAdapterHealth(
            id=adapter.id,
            ecosystem=adapter.ecosystem,
            endpoint=adapter.endpoint,
            enabled=True,
            status="up",
        )

    def probe_all(self, registry: PluginRegistry) -> list[CompatibilityAdapterHealth]:
        return [self.probe(adapter) for adapter in registry.list_adapters()]


class CompatibilityAdapterCatalogClient:
    def __init__(
        self,
        *,
        client_factory: ClientFactory | None = None,
        timeout_ms: int = 5_000,
    ) -> None:
        self._client_factory = client_factory or PluginCallProxy._default_client_factory
        self._timeout_ms = timeout_ms

    def fetch_tools(
        self,
        adapter: CompatibilityAdapterRegistration,
    ) -> list[PluginToolDefinition]:
        tools_url = f"{adapter.endpoint.rstrip('/')}/tools"
        try:
            with self._client_factory(self._timeout_ms) as client:
                response = client.get(
                    tools_url,
                    headers={"x-sevenflows-adapter-id": adapter.id},
                )
            response.raise_for_status()
        except Exception as exc:
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' tool catalog request failed."
            ) from exc

        body = response.json()
        raw_tools = body.get("tools") if isinstance(body, dict) else body
        if not isinstance(raw_tools, list):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned an invalid tool catalog payload."
            )

        definitions: list[PluginToolDefinition] = []
        for item in raw_tools:
            if not isinstance(item, dict):
                raise PluginCatalogError(
                    f"Plugin adapter '{adapter.id}' returned a non-object tool entry."
                )

            definitions.append(self._parse_constrained_tool(adapter, item))

        for definition in definitions:
            if not definition.id or not definition.name:
                raise PluginCatalogError(
                    f"Plugin adapter '{adapter.id}' returned a tool without id or name."
                )

        return definitions

    def _parse_constrained_tool(
        self,
        adapter: CompatibilityAdapterRegistration,
        item: dict[str, Any],
    ) -> PluginToolDefinition:
        constrained_ir = item.get("constrained_ir")
        if not isinstance(constrained_ir, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned tool '{item.get('id')}' without constrained_ir."
            )

        kind = str(constrained_ir.get("kind") or "")
        if kind != "tool":
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned constrained_ir kind '{kind}', expected 'tool'."
            )

        ecosystem = str(constrained_ir.get("ecosystem") or adapter.ecosystem)
        if ecosystem != adapter.ecosystem:
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned tool ecosystem '{ecosystem}', "
                f"expected '{adapter.ecosystem}'."
            )

        tool_id = str(constrained_ir.get("tool_id") or "")
        top_level_id = str(item.get("id") or tool_id)
        if top_level_id and tool_id and top_level_id != tool_id:
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned mismatched tool ids '{top_level_id}' and '{tool_id}'."
            )

        name = str(constrained_ir.get("name") or item.get("name") or "")
        input_schema = constrained_ir.get("input_schema") or {}
        if not isinstance(input_schema, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned invalid input_schema for '{tool_id or top_level_id}'."
            )

        plugin_meta = constrained_ir.get("plugin_meta") or item.get("plugin_meta")
        if plugin_meta is not None and not isinstance(plugin_meta, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned invalid plugin_meta for '{tool_id or top_level_id}'."
            )

        output_schema = constrained_ir.get("output_schema")
        if output_schema is not None and not isinstance(output_schema, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned invalid output_schema for '{tool_id or top_level_id}'."
            )

        return PluginToolDefinition(
            id=tool_id or top_level_id,
            name=name,
            ecosystem=ecosystem,
            description=str(constrained_ir.get("description") or item.get("description") or ""),
            input_schema=dict(input_schema),
            output_schema=dict(output_schema) if isinstance(output_schema, dict) else None,
            source=str(constrained_ir.get("source") or item.get("source") or "plugin"),
            plugin_meta=dict(plugin_meta) if isinstance(plugin_meta, dict) else None,
            constrained_ir=constrained_ir,
        )


def build_plugin_registry(settings: Settings | None = None) -> PluginRegistry:
    app_settings = settings or get_settings()
    registry = PluginRegistry()

    if app_settings.plugin_compat_dify_enabled:
        registry.register_adapter(
            CompatibilityAdapterRegistration(
                id=app_settings.plugin_compat_dify_adapter_id,
                ecosystem="compat:dify",
                endpoint=app_settings.plugin_compat_dify_endpoint,
                enabled=True,
                health_status="degraded",
            )
        )

    return registry

_plugin_registry: PluginRegistry | None = None


def reset_plugin_registry(settings: Settings | None = None) -> PluginRegistry:
    global _plugin_registry
    _plugin_registry = build_plugin_registry(settings)
    return _plugin_registry


def get_plugin_registry() -> PluginRegistry:
    global _plugin_registry
    if _plugin_registry is None:
        _plugin_registry = build_plugin_registry()
    return _plugin_registry


def get_plugin_call_proxy() -> PluginCallProxy:
    return PluginCallProxy(get_plugin_registry())


@lru_cache(maxsize=1)
def get_compatibility_adapter_health_checker() -> CompatibilityAdapterHealthChecker:
    return CompatibilityAdapterHealthChecker()


@lru_cache(maxsize=1)
def get_compatibility_adapter_catalog_client() -> CompatibilityAdapterCatalogClient:
    return CompatibilityAdapterCatalogClient()
