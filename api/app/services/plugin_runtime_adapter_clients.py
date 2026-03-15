from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.services.plugin_runtime_proxy import default_plugin_client_factory
from app.services.plugin_runtime_registry import PluginRegistry
from app.services.plugin_runtime_types import (
    ClientFactory,
    CompatibilityAdapterHealth,
    CompatibilityAdapterRegistration,
    PluginCatalogError,
    PluginToolDefinition,
)


class CompatibilityAdapterHealthChecker:
    def __init__(
        self,
        *,
        client_factory: ClientFactory | None = None,
        timeout_ms: int = 3_000,
    ) -> None:
        self._client_factory = client_factory or default_plugin_client_factory
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
        self._client_factory = client_factory or default_plugin_client_factory
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
                f"Plugin adapter '{adapter.id}' returned tool "
                f"'{item.get('id')}' without constrained_ir."
            )

        kind = str(constrained_ir.get("kind") or "")
        if kind != "tool":
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned constrained_ir kind "
                f"'{kind}', expected 'tool'."
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
                f"Plugin adapter '{adapter.id}' returned mismatched tool ids "
                f"'{top_level_id}' and '{tool_id}'."
            )

        name = str(constrained_ir.get("name") or item.get("name") or "")
        input_schema = constrained_ir.get("input_schema") or {}
        if not isinstance(input_schema, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned invalid input_schema "
                f"for '{tool_id or top_level_id}'."
            )

        plugin_meta = constrained_ir.get("plugin_meta") or item.get("plugin_meta")
        if plugin_meta is not None and not isinstance(plugin_meta, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned invalid plugin_meta "
                f"for '{tool_id or top_level_id}'."
            )

        output_schema = constrained_ir.get("output_schema")
        if output_schema is not None and not isinstance(output_schema, dict):
            raise PluginCatalogError(
                f"Plugin adapter '{adapter.id}' returned invalid output_schema "
                f"for '{tool_id or top_level_id}'."
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


@lru_cache(maxsize=1)
def get_compatibility_adapter_health_checker() -> CompatibilityAdapterHealthChecker:
    return CompatibilityAdapterHealthChecker()


@lru_cache(maxsize=1)
def get_compatibility_adapter_catalog_client() -> CompatibilityAdapterCatalogClient:
    return CompatibilityAdapterCatalogClient()
