from __future__ import annotations

import time
from functools import lru_cache

import httpx

from app.services.plugin_execution_contract import (
    build_execution_contract,
    build_sandbox_tool_execution_contract,
    normalize_contract_bound_request,
)
from app.services.plugin_execution_dispatch import PluginExecutionDispatchPlanner
from app.services.plugin_runtime_registry import PluginRegistry
from app.services.plugin_runtime_types import (
    ClientFactory,
    CompatibilityAdapterRegistration,
    PluginCallRequest,
    PluginCallResponse,
    PluginExecutionDispatchPlan,
    PluginInvocationError,
    PluginToolDefinition,
)
from app.services.sandbox_backends import (
    SandboxBackendClient,
    SandboxToolExecutionRequest,
    get_sandbox_backend_client,
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
        sandbox_backend_client: SandboxBackendClient | None = None,
    ) -> None:
        self._registry = registry
        self._client_factory = client_factory or default_plugin_client_factory
        self._sandbox_backend_client = sandbox_backend_client or get_sandbox_backend_client()
        self._execution_dispatch_planner = PluginExecutionDispatchPlanner(
            registry,
            sandbox_backend_client=self._sandbox_backend_client,
        )

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
            return self._invoke_native_tool(tool, request)

        adapter = self._registry.resolve_adapter(
            ecosystem=request.ecosystem,
            adapter_id=request.adapter_id,
        )
        return self._invoke_adapter_tool(tool, adapter, request)

    def describe_execution_dispatch(
        self,
        request: PluginCallRequest,
        *,
        adapter: CompatibilityAdapterRegistration | None = None,
    ) -> PluginExecutionDispatchPlan:
        return self._execution_dispatch_planner.describe(
            request,
            adapter=adapter,
        )

    def _invoke_native_tool(
        self,
        tool: PluginToolDefinition,
        request: PluginCallRequest,
    ) -> PluginCallResponse:
        execution_dispatch = self.describe_execution_dispatch(request)
        if execution_dispatch.blocked_reason:
            raise PluginInvocationError(execution_dispatch.blocked_reason)

        if execution_dispatch.effective_execution_class in {"sandbox", "microvm"}:
            return self._invoke_native_tool_via_sandbox(
                tool=tool,
                request=request,
                execution_dispatch=execution_dispatch,
            )

        invoker = self._registry.get_native_invoker(request.tool_id)
        if invoker is None:
            raise PluginInvocationError(
                f"Native plugin tool '{request.tool_id}' does not provide an invoker."
            )

        bound_request = PluginCallRequest(
            tool_id=request.tool_id,
            ecosystem=request.ecosystem,
            inputs=request.inputs,
            adapter_id=request.adapter_id,
            credentials=request.credentials,
            timeout_ms=request.timeout_ms,
            trace_id=request.trace_id,
            execution=execution_dispatch.effective_execution,
        )

        started_at = time.perf_counter()
        result = invoker(bound_request)
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
        execution_dispatch = self.describe_execution_dispatch(request, adapter=adapter)
        if execution_dispatch.blocked_reason:
            raise PluginInvocationError(execution_dispatch.blocked_reason)
        execution_contract = build_execution_contract(tool)
        normalized_inputs, normalized_credentials = normalize_contract_bound_request(
            request,
            execution_contract,
        )
        payload = {
            "toolId": request.tool_id,
            "ecosystem": request.ecosystem,
            "adapterId": adapter.id,
            "inputs": normalized_inputs,
            "credentials": normalized_credentials,
            "timeout": (
                execution_dispatch.requested_execution_timeout_ms or request.timeout_ms
            ),
            "traceId": request.trace_id,
            "execution": execution_dispatch.effective_execution,
            "executionContract": execution_contract,
        }

        if execution_dispatch.effective_execution_class in {"sandbox", "microvm"}:
            return self._invoke_adapter_tool_via_sandbox(
                adapter=adapter,
                request=request,
                execution_dispatch=execution_dispatch,
                normalized_inputs=normalized_inputs,
                normalized_credentials=normalized_credentials,
                execution_contract=execution_contract,
            )

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
            meta=self._build_adapter_response_meta(body),
        )

    def _invoke_adapter_tool_via_sandbox(
        self,
        *,
        adapter: CompatibilityAdapterRegistration,
        request: PluginCallRequest,
        execution_dispatch: PluginExecutionDispatchPlan,
        normalized_inputs: dict,
        normalized_credentials: dict,
        execution_contract: dict,
    ) -> PluginCallResponse:
        started_at = time.perf_counter()
        try:
            sandbox_response = self._sandbox_backend_client.execute_tool(
                SandboxToolExecutionRequest(
                    execution_class=execution_dispatch.effective_execution_class,
                    tool_id=request.tool_id,
                    ecosystem=request.ecosystem,
                    inputs=normalized_inputs,
                    credentials=normalized_credentials,
                    timeout_ms=(
                        execution_dispatch.requested_execution_timeout_ms or request.timeout_ms
                    ),
                    trace_id=request.trace_id,
                    execution=execution_dispatch.effective_execution,
                    execution_contract=execution_contract,
                    runner_kind="compat-adapter",
                    adapter_id=adapter.id,
                    adapter_endpoint=adapter.endpoint,
                    profile=execution_dispatch.requested_execution_profile,
                    dependency_mode=execution_dispatch.requested_dependency_mode,
                    builtin_package_set=execution_dispatch.requested_builtin_package_set,
                    dependency_ref=execution_dispatch.requested_dependency_ref,
                    network_policy=execution_dispatch.requested_network_policy,
                    filesystem_policy=execution_dispatch.requested_filesystem_policy,
                    backend_extensions=execution_dispatch.requested_backend_extensions,
                )
            )
        except RuntimeError as exc:
            raise PluginInvocationError(str(exc)) from exc

        return self._build_sandbox_tool_response(
            sandbox_response=sandbox_response,
            started_at=started_at,
        )

    def _invoke_native_tool_via_sandbox(
        self,
        *,
        tool: PluginToolDefinition,
        request: PluginCallRequest,
        execution_dispatch: PluginExecutionDispatchPlan,
    ) -> PluginCallResponse:
        started_at = time.perf_counter()
        try:
            sandbox_response = self._sandbox_backend_client.execute_tool(
                SandboxToolExecutionRequest(
                    execution_class=execution_dispatch.effective_execution_class,
                    tool_id=request.tool_id,
                    ecosystem=request.ecosystem,
                    inputs=request.inputs,
                    credentials=request.credentials,
                    timeout_ms=(
                        execution_dispatch.requested_execution_timeout_ms or request.timeout_ms
                    ),
                    trace_id=request.trace_id,
                    execution=execution_dispatch.effective_execution,
                    execution_contract=build_sandbox_tool_execution_contract(tool),
                    runner_kind="native-tool",
                    profile=execution_dispatch.requested_execution_profile,
                    dependency_mode=execution_dispatch.requested_dependency_mode,
                    builtin_package_set=execution_dispatch.requested_builtin_package_set,
                    dependency_ref=execution_dispatch.requested_dependency_ref,
                    network_policy=execution_dispatch.requested_network_policy,
                    filesystem_policy=execution_dispatch.requested_filesystem_policy,
                    backend_extensions=execution_dispatch.requested_backend_extensions,
                )
            )
        except RuntimeError as exc:
            raise PluginInvocationError(str(exc)) from exc

        return self._build_sandbox_tool_response(
            sandbox_response=sandbox_response,
            started_at=started_at,
        )

    @staticmethod
    def _build_sandbox_tool_response(
        *,
        sandbox_response,
        started_at: float,
    ) -> PluginCallResponse:

        body = sandbox_response.result
        if not isinstance(body, dict):
            raise PluginInvocationError(
                "Sandbox-backed tool execution returned a non-object payload."
            )
        status = str(body.get("status") or "error")
        if status != "success":
            raise PluginInvocationError(
                str(body.get("error") or "Sandbox-backed tool execution failed.")
            )

        if "output" in body:
            output = body.get("output")
        elif isinstance(body.get("structured"), dict):
            output = body.get("structured")
        else:
            output = {}
        if not isinstance(output, dict):
            raise PluginInvocationError(
                "Sandbox-backed tool execution returned a non-object output payload."
            )

        logs = list(body.get("logs") or [])
        if sandbox_response.stdout.strip():
            logs.append(sandbox_response.stdout)
        if sandbox_response.stderr.strip():
            logs.append(sandbox_response.stderr)

        meta = dict(body.get("meta") or {})
        request_meta = PluginCallProxy._normalize_request_meta(
            body.get("requestMeta")
            or body.get("request_meta")
            or meta.get("request_meta")
            or meta.get("requestMeta")
        )
        if request_meta is not None:
            meta["request_meta"] = request_meta
            meta.pop("requestMeta", None)
        meta.setdefault("sandbox_backend_id", sandbox_response.backend_id)
        meta.setdefault("sandbox_backend_executor_ref", sandbox_response.executor_ref)
        meta.setdefault(
            "effective_execution_class",
            sandbox_response.effective_execution_class,
        )
        artifact_refs = PluginCallProxy._normalize_artifact_refs(
            body.get("artifact_refs") or body.get("artifactRefs")
        )
        if artifact_refs:
            meta.setdefault("artifact_refs", artifact_refs)
        runner_trace = body.get("execution_trace") or body.get("executionTrace")
        if isinstance(runner_trace, dict):
            meta.setdefault("sandbox_runner_trace", dict(runner_trace))

        return PluginCallResponse(
            status=status,
            output=dict(output),
            logs=logs,
            duration_ms=int(
                body.get("durationMs") or int((time.perf_counter() - started_at) * 1000)
            ),
            content_type=PluginCallProxy._normalize_optional_string(
                body.get("content_type") or body.get("contentType")
            ),
            summary=PluginCallProxy._normalize_optional_string(body.get("summary")),
            raw_ref=PluginCallProxy._normalize_optional_string(
                body.get("raw_ref") or body.get("rawRef")
            ),
            meta=meta,
        )

    @staticmethod
    def _normalize_optional_string(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _build_adapter_response_meta(body: object) -> dict[str, object]:
        if not isinstance(body, dict):
            return {}

        meta = dict(body.get("meta") or {})
        request_meta = PluginCallProxy._normalize_request_meta(
            body.get("requestMeta")
            or body.get("request_meta")
            or meta.get("request_meta")
            or meta.get("requestMeta")
        )
        if request_meta is not None:
            meta["request_meta"] = request_meta
            meta.pop("requestMeta", None)
        return meta

    @staticmethod
    def _normalize_request_meta(value: object) -> dict[str, object] | None:
        if not isinstance(value, dict):
            return None

        normalized: dict[str, object] = {}
        trace_id = PluginCallProxy._normalize_optional_string(
            value.get("trace_id") or value.get("traceId")
        )
        if trace_id is not None:
            normalized["trace_id"] = trace_id

        execution = value.get("execution")
        if isinstance(execution, dict) and execution:
            normalized["execution"] = dict(execution)

        execution_contract = value.get("execution_contract") or value.get("executionContract")
        if isinstance(execution_contract, dict) and execution_contract:
            normalized["execution_contract"] = dict(execution_contract)

        return normalized or None

    @staticmethod
    def _normalize_artifact_refs(value: object) -> list[str]:
        normalized: list[str] = []
        if not isinstance(value, list):
            return normalized
        for item in value:
            if not isinstance(item, str):
                continue
            candidate = item.strip()
            if candidate:
                normalized.append(candidate)
        return normalized


@lru_cache(maxsize=1)
def get_plugin_call_proxy() -> PluginCallProxy:
    from app.services.plugin_runtime_registry import get_plugin_registry

    return PluginCallProxy(get_plugin_registry())
