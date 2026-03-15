from __future__ import annotations

from app.core.config import Settings, get_settings
from app.services.plugin_runtime_types import (
    CompatibilityAdapterRegistration,
    NativeToolInvoker,
    PluginInvocationError,
    PluginToolDefinition,
)


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
