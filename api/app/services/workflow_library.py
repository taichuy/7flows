from __future__ import annotations

from copy import deepcopy
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.plugin import PluginToolRecord
from app.models.workflow import Workflow
from app.schemas.plugin import PluginToolItem
from app.schemas.workflow_library import (
    WorkflowLibrarySnapshot,
    WorkflowLibrarySourceLane,
    WorkflowLibraryStarterItem,
    WorkflowNodeCatalogItem,
)
from app.schemas.workspace_starter import (
    WorkflowBusinessTrack,
    WorkspaceStarterSourceGovernanceKind,
)
from app.services.plugin_registry_store import get_plugin_registry_store
from app.services.plugin_runtime import CompatibilityAdapterRegistration, get_plugin_registry
from app.services.tool_execution_governance import (
    build_tool_sensitivity_index,
    governed_default_execution_class,
    resolve_tool_sensitivity_level,
)
from app.services.workflow_definition_governance import (
    summarize_workflow_definition_tool_governance,
)
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
        business_track: WorkflowBusinessTrack | None = None,
        search: str | None = None,
        source_governance_kind: WorkspaceStarterSourceGovernanceKind | None = None,
        needs_follow_up: bool = False,
        include_builtin_starters: bool = True,
        include_starter_definitions: bool = False,
    ) -> WorkflowLibrarySnapshot:
        tools = self.list_tool_items(db, workspace_id=workspace_id)
        tool_source_lanes = self.build_tool_source_lanes(tools)
        nodes = self.list_node_catalog_items(tool_source_lanes=tool_source_lanes)
        tool_index = {tool.id: tool for tool in tools}
        starters = self.list_starter_items(
            db,
            workspace_id=workspace_id,
            node_catalog=nodes,
            tool_index=tool_index,
            business_track=business_track,
            search=search,
            source_governance_kind=source_governance_kind,
            needs_follow_up=needs_follow_up,
            include_builtin_starters=include_builtin_starters,
            include_starter_definitions=include_starter_definitions,
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
        sensitivity_index = build_tool_sensitivity_index(db)
        adapters_by_id = {adapter.id: adapter for adapter in registry.list_adapters()}

        return [
            self._serialize_tool_definition(
                tool,
                adapter_id=tool_adapter_ids.get(tool.id),
                sensitivity_index=sensitivity_index,
            )
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
        tool_index: dict[str, PluginToolItem] | None = None,
        business_track: WorkflowBusinessTrack | None = None,
        search: str | None = None,
        source_governance_kind: WorkspaceStarterSourceGovernanceKind | None = None,
        needs_follow_up: bool = False,
        include_builtin_starters: bool = True,
        include_starter_definitions: bool = False,
    ) -> list[WorkflowLibraryStarterItem]:
        catalog = node_catalog or self.list_node_catalog_items()
        resolved_tool_index = tool_index or {}
        builtin_starters = (
            self._with_tool_governance(
                build_builtin_starters(catalog),
                tool_index=resolved_tool_index,
            )
            if include_builtin_starters
            else []
        )
        starters = [
            *builtin_starters,
            *self._build_workspace_starters(
                db,
                workspace_id=workspace_id,
                tool_index=resolved_tool_index,
                business_track=business_track,
                search=search,
                source_governance_kind=source_governance_kind,
                needs_follow_up=needs_follow_up,
            ),
        ]
        return [
            self._serialize_starter_item(
                starter,
                include_definition=include_starter_definitions,
            )
            for starter in starters
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
        tool_index: dict[str, PluginToolItem] | None = None,
        business_track: WorkflowBusinessTrack | None = None,
        search: str | None = None,
        source_governance_kind: WorkspaceStarterSourceGovernanceKind | None = None,
        needs_follow_up: bool = False,
    ) -> list[WorkflowLibraryStarterItem]:
        service = get_workspace_starter_template_service()
        records = service.list_templates(
            db,
            workspace_id=workspace_id,
            business_track=business_track,
            search=search,
        )
        workspace_source = build_workspace_starter_source()
        source_workflows_by_id = self._load_source_workflows(db, records)
        source_governance_by_template_id = service.build_source_governance_by_template_id(
            records,
            source_workflows_by_id,
        )
        filtered_records = service.filter_records_by_source_governance(
            records,
            source_governance_by_template_id,
            source_governance_kind=source_governance_kind,
            needs_follow_up=needs_follow_up,
        )
        return [
            WorkflowLibraryStarterItem(
                id=serialized.id,
                origin="workspace",
                workspace_id=serialized.workspace_id,
                name=serialized.name,
                description=serialized.description,
                business_track=serialized.business_track,
                default_workflow_name=serialized.default_workflow_name,
                workflow_focus=serialized.workflow_focus,
                recommended_next_step=serialized.recommended_next_step,
                tags=list(serialized.tags),
                definition=deepcopy(serialized.definition),
                source=workspace_source,
                created_from_workflow_id=serialized.created_from_workflow_id,
                created_from_workflow_version=serialized.created_from_workflow_version,
                archived=serialized.archived,
                archived_at=serialized.archived_at,
                created_at=serialized.created_at,
                updated_at=serialized.updated_at,
                tool_governance=summarize_workflow_definition_tool_governance(
                    serialized.definition,
                    tool_index=tool_index or {},
                ),
                source_governance=source_governance_by_template_id.get(record.id),
            )
            for record, serialized in (
                (record, service.serialize(record)) for record in filtered_records
            )
        ]

    def _with_tool_governance(
        self,
        starters: list[WorkflowLibraryStarterItem],
        *,
        tool_index: dict[str, PluginToolItem],
    ) -> list[WorkflowLibraryStarterItem]:
        return [
            starter.model_copy(
                update={
                    "tool_governance": summarize_workflow_definition_tool_governance(
                        starter.definition,
                        tool_index=tool_index,
                    )
                }
            )
            for starter in starters
        ]

    def _serialize_starter_item(
        self,
        starter: WorkflowLibraryStarterItem,
        *,
        include_definition: bool,
    ) -> WorkflowLibraryStarterItem:
        definition = deepcopy(starter.definition or {})
        return starter.model_copy(
            update={
                "node_count": self._count_nodes(definition),
                "node_types": self._collect_node_types(definition),
                "publish_count": self._count_publish_entries(definition),
                "definition": definition if include_definition else None,
            }
        )

    @staticmethod
    def _count_nodes(definition: dict) -> int:
        nodes = definition.get("nodes")
        return len(nodes) if isinstance(nodes, list) else 0

    @staticmethod
    def _collect_node_types(definition: dict) -> list[str]:
        node_types: list[str] = []
        for node in definition.get("nodes", []):
            node_type = node.get("type") if isinstance(node, dict) else None
            if isinstance(node_type, str) and node_type and node_type not in node_types:
                node_types.append(node_type)
        return node_types

    @staticmethod
    def _count_publish_entries(definition: dict) -> int:
        publish_entries = definition.get("publish")
        return len(publish_entries) if isinstance(publish_entries, list) else 0

    def _load_source_workflows(
        self,
        db: Session,
        records,
    ) -> dict[str, Workflow]:
        source_workflow_ids = sorted(
            {
                record.created_from_workflow_id
                for record in records
                if record.created_from_workflow_id
            }
        )
        if not source_workflow_ids:
            return {}

        return {
            workflow.id: workflow
            for workflow in db.scalars(
                select(Workflow).where(Workflow.id.in_(source_workflow_ids))
            ).all()
        }

    def _serialize_tool_definition(
        self,
        tool,
        *,
        adapter_id: str | None,
        sensitivity_index: dict[tuple[str, str | None, str | None], str] | None,
    ) -> PluginToolItem:
        registry = get_plugin_registry()
        sensitivity_level = resolve_tool_sensitivity_level(
            tool_id=tool.id,
            ecosystem=tool.ecosystem,
            adapter_id=adapter_id,
            sensitivity_index=sensitivity_index,
        )
        default_execution_class = governed_default_execution_class(
            configured_default_execution_class=tool.default_execution_class,
            sensitivity_level=sensitivity_level,
        )
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
            supported_execution_classes=list(tool.supported_execution_classes),
            default_execution_class=default_execution_class,
            sensitivity_level=sensitivity_level,
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
