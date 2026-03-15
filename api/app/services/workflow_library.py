from __future__ import annotations

from copy import deepcopy
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.plugin import PluginToolRecord
from app.schemas.plugin import PluginToolItem
from app.schemas.workflow_library import (
    WorkflowLibrarySnapshot,
    WorkflowLibrarySourceLane,
    WorkflowLibraryStarterItem,
    WorkflowNodeCatalogItem,
)
from app.services.plugin_registry_store import get_plugin_registry_store
from app.services.plugin_runtime import CompatibilityAdapterRegistration, get_plugin_registry
from app.services.workflow_library_catalog import (
    build_builtin_starters,
    build_node_catalog_items,
    build_node_source_lanes,
    build_starter_source_lanes,
    build_tool_source_lanes,
    build_workspace_starter_source,
)
from app.services.workspace_starter_templates import get_workspace_starter_template_service


class WorkflowLibraryService:
    def build_snapshot(
        self,
        db: Session,
        *,
        workspace_id: str = "default",
    ) -> WorkflowLibrarySnapshot:
        tools = self.list_tool_items(db, workspace_id=workspace_id)
        tool_source_lanes = self.build_tool_source_lanes(tools)
        nodes = self.list_node_catalog_items(tool_source_lanes=tool_source_lanes)
        starters = self.list_starter_items(
            db,
            workspace_id=workspace_id,
            node_catalog=nodes,
        )
        return WorkflowLibrarySnapshot(
            nodes=nodes,
            starters=starters,
            starter_source_lanes=self.build_starter_source_lanes(starters),
            node_source_lanes=self.build_node_source_lanes(nodes),
            tool_source_lanes=tool_source_lanes,
            tools=tools,
        )

    def list_node_catalog_items(
        self,
        *,
        tool_source_lanes: list[WorkflowLibrarySourceLane] | None = None,
    ) -> list[WorkflowNodeCatalogItem]:
        return build_node_catalog_items(tool_source_lanes=tool_source_lanes)

    def list_tool_items(
        self,
        db: Session,
        *,
        workspace_id: str,
    ) -> list[PluginToolItem]:
        registry = get_plugin_registry()
        get_plugin_registry_store().hydrate_registry(db, registry)
        tool_adapter_ids = self._load_tool_adapter_ids(db)
        adapters_by_id = {adapter.id: adapter for adapter in registry.list_adapters()}

        return [
            self._serialize_tool_definition(tool)
            for tool in sorted(
                (
                    tool
                    for tool in registry.list_tools()
                    if self._tool_visible_for_workspace(
                        ecosystem=tool.ecosystem,
                        adapter_id=tool_adapter_ids.get(tool.id),
                        workspace_id=workspace_id,
                        adapters_by_id=adapters_by_id,
                    )
                ),
                key=lambda item: (item.ecosystem, item.name.lower(), item.id),
            )
        ]

    def list_starter_items(
        self,
        db: Session,
        *,
        workspace_id: str,
        node_catalog: list[WorkflowNodeCatalogItem] | None = None,
    ) -> list[WorkflowLibraryStarterItem]:
        catalog = node_catalog or self.list_node_catalog_items()
        return [
            *build_builtin_starters(catalog),
            *self._build_workspace_starters(db, workspace_id=workspace_id),
        ]

    def build_starter_source_lanes(
        self,
        starters: list[WorkflowLibraryStarterItem],
    ) -> list[WorkflowLibrarySourceLane]:
        return build_starter_source_lanes(starters)

    def build_node_source_lanes(
        self,
        nodes: list[WorkflowNodeCatalogItem],
    ) -> list[WorkflowLibrarySourceLane]:
        return build_node_source_lanes(nodes)

    def build_tool_source_lanes(
        self,
        tools: list[PluginToolItem],
    ) -> list[WorkflowLibrarySourceLane]:
        return build_tool_source_lanes(tools)

    def _build_workspace_starters(
        self,
        db: Session,
        *,
        workspace_id: str,
    ) -> list[WorkflowLibraryStarterItem]:
        service = get_workspace_starter_template_service()
        records = service.list_templates(db, workspace_id=workspace_id)
        workspace_source = build_workspace_starter_source()
        return [
            WorkflowLibraryStarterItem(
                id=item.id,
                origin="workspace",
                workspace_id=item.workspace_id,
                name=item.name,
                description=item.description,
                business_track=item.business_track,
                default_workflow_name=item.default_workflow_name,
                workflow_focus=item.workflow_focus,
                recommended_next_step=item.recommended_next_step,
                tags=list(item.tags),
                definition=deepcopy(item.definition),
                source=workspace_source,
                created_from_workflow_id=item.created_from_workflow_id,
                created_from_workflow_version=item.created_from_workflow_version,
                archived=item.archived,
                archived_at=item.archived_at,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in (service.serialize(record) for record in records)
        ]

    def _serialize_tool_definition(self, tool) -> PluginToolItem:
        registry = get_plugin_registry()
        return PluginToolItem(
            id=tool.id,
            name=tool.name,
            ecosystem=tool.ecosystem,
            description=tool.description,
            input_schema=deepcopy(tool.input_schema),
            output_schema=(
                deepcopy(tool.output_schema)
                if isinstance(tool.output_schema, dict)
                else None
            ),
            source=tool.source,
            plugin_meta=deepcopy(tool.plugin_meta) if isinstance(tool.plugin_meta, dict) else None,
            callable=(tool.ecosystem != "native") or registry.has_native_invoker(tool.id),
        )

    def _load_tool_adapter_ids(
        self,
        db: Session,
    ) -> dict[str, str | None]:
        rows = db.execute(
            select(PluginToolRecord.id, PluginToolRecord.adapter_id).order_by(
                PluginToolRecord.created_at.asc()
            )
        ).all()
        return {
            str(tool_id): (str(adapter_id) if adapter_id else None)
            for tool_id, adapter_id in rows
        }

    def _tool_visible_for_workspace(
        self,
        *,
        ecosystem: str,
        adapter_id: str | None,
        workspace_id: str,
        adapters_by_id: dict[str, CompatibilityAdapterRegistration],
    ) -> bool:
        if ecosystem == "native" or adapter_id is None:
            return True

        adapter = adapters_by_id.get(adapter_id)
        if adapter is None or not adapter.enabled:
            return False

        workspace_ids = tuple(adapter.workspace_ids or ())
        if not workspace_ids:
            return True

        return workspace_id in workspace_ids


@lru_cache(maxsize=1)
def get_workflow_library_service() -> WorkflowLibraryService:
    return WorkflowLibraryService()
