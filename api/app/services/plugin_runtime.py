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


@dataclass(frozen=True)
class CompatibilityAdapterRegistration:
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool = True
    health_status: str = "degraded"
    workspace_ids: tuple[str, ...] = ()
    plugin_kinds: tuple[str, ...] = ("node", "provider")


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

    def get_native_invoker(self, tool_id: str) -> NativeToolInvoker | None:
        return self._native_invokers.get(tool_id)

    def register_adapter(self, registration: CompatibilityAdapterRegistration) -> None:
        self._adapters[registration.id] = registration

    def list_adapters(self) -> list[CompatibilityAdapterRegistration]:
        return list(self._adapters.values())

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
        return self._invoke_adapter_tool(adapter, request)

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
        adapter: CompatibilityAdapterRegistration,
        request: PluginCallRequest,
    ) -> PluginCallResponse:
        started_at = time.perf_counter()
        invoke_url = f"{adapter.endpoint.rstrip('/')}/invoke"
        payload = {
            "toolId": request.tool_id,
            "ecosystem": request.ecosystem,
            "adapterId": adapter.id,
            "inputs": request.inputs,
            "credentials": request.credentials,
            "timeout": request.timeout_ms,
            "traceId": request.trace_id,
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

    @staticmethod
    def _default_client_factory(timeout_ms: int) -> httpx.Client:
        timeout_seconds = None if timeout_ms <= 0 else timeout_ms / 1000
        return httpx.Client(timeout=timeout_seconds)


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


@lru_cache(maxsize=1)
def get_plugin_registry() -> PluginRegistry:
    return build_plugin_registry()


@lru_cache(maxsize=1)
def get_plugin_call_proxy() -> PluginCallProxy:
    return PluginCallProxy(get_plugin_registry())
