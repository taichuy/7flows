from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.plugin import PluginToolRecord
from app.services.plugin_registry_store import PluginRegistryStore
from app.services.plugin_runtime import (
    CompatibilityAdapterRegistration,
    PluginRegistry,
    PluginToolDefinition,
)


def test_plugin_registry_store_persists_and_hydrates_registry(sqlite_session: Session) -> None:
    store = PluginRegistryStore()
    adapter = CompatibilityAdapterRegistration(
        id="dify-default",
        ecosystem="compat:dify",
        endpoint="http://adapter.local",
        enabled=True,
        healthcheck_path="/healthz",
        workspace_ids=("ws-demo",),
        plugin_kinds=("node", "provider"),
    )
    tool = PluginToolDefinition(
        id="compat:dify:plugin:demo/search",
        name="Demo Search",
        ecosystem="compat:dify",
        description="Search via Dify adapter",
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}},
        output_schema={"type": "object"},
        source="plugin",
        plugin_meta={"origin": "dify"},
        constrained_ir={
            "ir_version": "2026-03-10",
            "kind": "tool",
            "ecosystem": "compat:dify",
            "tool_id": "compat:dify:plugin:demo/search",
            "name": "Demo Search",
            "input_schema": {"type": "object"},
            "constraints": {"additional_properties": False},
        },
    )

    store.upsert_adapter(sqlite_session, adapter)
    store.upsert_tool(sqlite_session, tool, adapter_id=adapter.id)
    sqlite_session.commit()

    registry = PluginRegistry()
    store.hydrate_registry(sqlite_session, registry)

    hydrated_adapter = registry.get_adapter("dify-default")
    assert hydrated_adapter == adapter

    hydrated_tool = registry.get_tool("compat:dify:plugin:demo/search")
    assert hydrated_tool == PluginToolDefinition(
        id="compat:dify:plugin:demo/search",
        name="Demo Search",
        ecosystem="compat:dify",
        description="Search via Dify adapter",
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}},
        output_schema={"type": "object"},
        source="plugin",
        plugin_meta={"origin": "dify"},
        constrained_ir={
            "ir_version": "2026-03-10",
            "kind": "tool",
            "ecosystem": "compat:dify",
            "tool_id": "compat:dify:plugin:demo/search",
            "name": "Demo Search",
            "input_schema": {"type": "object"},
            "constraints": {"additional_properties": False},
        },
    )


def test_plugin_registry_store_replace_adapter_tools_prunes_stale_rows(
    sqlite_session: Session,
) -> None:
    store = PluginRegistryStore()
    old_tool = PluginToolDefinition(
        id="compat:dify:plugin:demo/old-search",
        name="Old Search",
        ecosystem="compat:dify",
        description="old",
        input_schema={"type": "object"},
        source="plugin",
    )
    keep_tool = PluginToolDefinition(
        id="compat:dify:plugin:demo/search",
        name="Search",
        ecosystem="compat:dify",
        description="new",
        input_schema={"type": "object"},
        source="plugin",
    )

    store.upsert_tool(sqlite_session, old_tool, adapter_id="dify-default")
    store.upsert_tool(sqlite_session, keep_tool, adapter_id="dify-default")
    sqlite_session.commit()

    stale_ids = store.replace_adapter_tools(
        sqlite_session,
        adapter_id="dify-default",
        tools=[keep_tool],
    )
    sqlite_session.commit()

    remaining_ids = sqlite_session.scalars(
        select(PluginToolRecord.id).order_by(PluginToolRecord.id.asc())
    ).all()

    assert stale_ids == ["compat:dify:plugin:demo/old-search"]
    assert remaining_ids == ["compat:dify:plugin:demo/search"]
