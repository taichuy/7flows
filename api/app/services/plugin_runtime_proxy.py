from __future__ import annotations

import time
from functools import lru_cache
from typing import Any

import httpx

from app.services.plugin_runtime_registry import PluginRegistry
from app.services.plugin_runtime_types import (
    ClientFactory,
    CompatibilityAdapterRegistration,
    PluginCallRequest,
    PluginCallResponse,
    PluginInvocationError,
    PluginToolDefinition,
)


def default_plugin_client_factory(timeout_ms: int) -> httpx.Client:
    timeout_seconds = None if timeout_ms <= 0 else timeout_ms / 1000
    return httpx.Client(timeout=timeout_seconds)


class PluginCallProxy:
    def __init__(
        self,
        registry: PluginRegistry,
        *,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._registry = registry
        self._client_factory = client_factory or default_plugin_client_factory

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
            "execution": dict(request.execution or {}),
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
                self._validate_contract_field_value(
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
            self._validate_contract_field_value(
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
        self,
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


@lru_cache(maxsize=1)
def get_plugin_call_proxy() -> PluginCallProxy:
    from app.services.plugin_runtime_registry import get_plugin_registry

    return PluginCallProxy(get_plugin_registry())
