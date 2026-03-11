from __future__ import annotations

from copy import deepcopy
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.plugin import PluginToolRecord
from app.schemas.plugin import PluginToolItem
from app.schemas.workflow_library import (
    WorkflowLibrarySnapshot,
    WorkflowLibrarySourceDescriptor,
    WorkflowLibrarySourceLane,
    WorkflowLibraryStarterItem,
    WorkflowNodeCatalogDefaults,
    WorkflowNodeCatalogItem,
    WorkflowNodeCatalogPalette,
    WorkflowNodeCatalogPosition,
    WorkflowNodeType,
)
from app.services.plugin_registry_store import get_plugin_registry_store
from app.services.plugin_runtime import CompatibilityAdapterRegistration, get_plugin_registry
from app.services.workspace_starter_templates import get_workspace_starter_template_service

BUILTIN_STARTER_SOURCE = WorkflowLibrarySourceDescriptor(
    kind="starter",
    scope="builtin",
    status="available",
    governance="repo",
    ecosystem="native",
    label="Builtin starter library",
    short_label="7Flows builtin",
    summary="仓库内置 starter，当前由代码库统一维护，是创建入口的真实来源。",
)

WORKSPACE_TEMPLATE_SOURCE = WorkflowLibrarySourceDescriptor(
    kind="starter",
    scope="workspace",
    status="planned",
    governance="workspace",
    ecosystem="workspace",
    label="Workspace templates",
    short_label="workspace planned",
    summary="下一步接入工作空间级模板治理，让团队模板不再混进仓库内置 starter。",
)

ECOSYSTEM_TEMPLATE_SOURCE = WorkflowLibrarySourceDescriptor(
    kind="starter",
    scope="ecosystem",
    status="planned",
    governance="adapter",
    ecosystem="compat:*",
    label="Ecosystem templates",
    short_label="ecosystem planned",
    summary="后续允许 compat / plugin 生态提供模板，但必须先经过来源治理和受约束建模。",
)

NATIVE_NODE_SOURCE = WorkflowLibrarySourceDescriptor(
    kind="node",
    scope="builtin",
    status="available",
    governance="repo",
    ecosystem="native",
    label="Native node catalog",
    short_label="native nodes",
    summary="当前 palette 中的原生节点目录，由 7Flows 内部事实模型直接维护。",
)

TOOL_REGISTRY_SOURCE = WorkflowLibrarySourceDescriptor(
    kind="tool",
    scope="builtin",
    status="available",
    governance="adapter",
    ecosystem="native",
    label="Tool registry",
    short_label="tool registry",
    summary="工具目录与节点目录分层存在，通过 registry 接回 editor 和 workflow 绑定链路。",
)


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
        tool_binding_lanes = self._clone_source_lanes(tool_source_lanes or [])
        return [
            WorkflowNodeCatalogItem(
                type="trigger",
                label="Trigger",
                description="工作流入口节点，负责接收用户请求、表单输入或 API 调用。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="entry",
                business_track="应用新建编排",
                tags=["入口", "native", "workflow"],
                palette=self._build_palette(enabled=False, order=0, x=80, y=200),
                defaults=self._build_defaults(name="Trigger"),
            ),
            WorkflowNodeCatalogItem(
                type="llm_agent",
                label="LLM Agent",
                description="承载模型推理、角色设定和上下文授权的核心编排节点。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="agent",
                business_track="编排节点能力",
                tags=["agent", "llm", "native"],
                palette=self._build_palette(enabled=True, order=10, x=340, y=120),
                defaults=self._build_defaults(
                    name="LLM Agent",
                    config={
                        "assistant": {
                            "enabled": False,
                            "trigger": "on_multi_tool_results",
                        },
                        "toolPolicy": {
                            "allowedToolIds": [],
                        },
                    },
                ),
            ),
            WorkflowNodeCatalogItem(
                type="tool",
                label="Tool",
                description="绑定 native 或 compat tool catalog 的工具能力入口。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="integration",
                business_track="Dify 插件兼容",
                tags=["tool", "catalog", "compat-ready"],
                palette=self._build_palette(enabled=True, order=20, x=340, y=280),
                defaults=self._build_defaults(name="Tool"),
                binding_required=True,
                binding_source_lanes=tool_binding_lanes,
            ),
            WorkflowNodeCatalogItem(
                type="mcp_query",
                label="MCP Query",
                description="按授权读取上游上下文，为 Agent 或工具提供受控查询入口。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="integration",
                business_track="编排节点能力",
                tags=["mcp", "context", "authorized"],
                palette=self._build_palette(enabled=True, order=30, x=620, y=120),
                defaults=self._build_defaults(
                    name="MCP Query",
                    config={"query": {"type": "authorized_context"}},
                ),
            ),
            WorkflowNodeCatalogItem(
                type="condition",
                label="Condition",
                description="基于 selector 或安全表达式进行条件分支。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="logic",
                business_track="编排节点能力",
                tags=["branch", "logic", "safe-expression"],
                palette=self._build_palette(enabled=True, order=40, x=620, y=280),
                defaults=self._build_defaults(name="Condition"),
            ),
            WorkflowNodeCatalogItem(
                type="router",
                label="Router",
                description="根据意图或规则把请求路由到不同分支和节点链路。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="logic",
                business_track="编排节点能力",
                tags=["router", "branch", "decision"],
                palette=self._build_palette(enabled=True, order=50, x=620, y=420),
                defaults=self._build_defaults(name="Router"),
            ),
            WorkflowNodeCatalogItem(
                type="output",
                label="Output",
                description="聚合并整形最终结果，为后续发布映射和响应输出做准备。",
                ecosystem="native",
                source=NATIVE_NODE_SOURCE,
                capability_group="output",
                business_track="API 调用开放",
                tags=["output", "response", "publish-ready"],
                palette=self._build_palette(enabled=True, order=60, x=900, y=200),
                defaults=self._build_defaults(
                    name="Output",
                    config={"format": "json"},
                ),
            ),
        ]

    def list_tool_items(
        self,
        db: Session,
        *,
        workspace_id: str = "default",
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
            *self._build_builtin_starters(catalog),
            *self._build_workspace_starters(db, workspace_id=workspace_id),
        ]

    def build_starter_source_lanes(
        self,
        starters: list[WorkflowLibraryStarterItem],
    ) -> list[WorkflowLibrarySourceLane]:
        workspace_count = sum(1 for starter in starters if starter.origin == "workspace")
        workspace_source = WorkflowLibrarySourceDescriptor(
            **{
                **WORKSPACE_TEMPLATE_SOURCE.model_dump(),
                "status": "available" if workspace_count > 0 else "planned",
                "short_label": (
                    "workspace ready"
                    if workspace_count > 0
                    else WORKSPACE_TEMPLATE_SOURCE.short_label
                ),
                "summary": (
                    "工作空间模板已进入真实存储与读取链路，可从 editor 保存并回到创建页复用。"
                    if workspace_count > 0
                    else WORKSPACE_TEMPLATE_SOURCE.summary
                ),
            }
        )
        return [
            self._build_source_lane(
                BUILTIN_STARTER_SOURCE,
                sum(1 for starter in starters if starter.origin == "builtin"),
            ),
            self._build_source_lane(workspace_source, workspace_count),
            self._build_source_lane(ECOSYSTEM_TEMPLATE_SOURCE, 0),
        ]

    def build_node_source_lanes(
        self,
        nodes: list[WorkflowNodeCatalogItem],
    ) -> list[WorkflowLibrarySourceLane]:
        return [
            self._build_source_lane(
                NATIVE_NODE_SOURCE,
                sum(1 for item in nodes if item.palette.enabled),
            )
        ]

    def build_tool_source_lanes(
        self,
        tools: list[PluginToolItem],
    ) -> list[WorkflowLibrarySourceLane]:
        summary: dict[str, WorkflowLibrarySourceLane] = {}
        for tool in tools:
            source = self._describe_tool_source(tool)
            key = f"{source.scope}:{source.ecosystem}:{source.short_label}"
            existing = summary.get(key)
            if existing is not None:
                existing.count += 1
                continue
            summary[key] = self._build_source_lane(source, 1)

        return sorted(summary.values(), key=lambda item: (item.label, item.short_label))

    def _build_builtin_starters(
        self,
        node_catalog: list[WorkflowNodeCatalogItem],
    ) -> list[WorkflowLibraryStarterItem]:
        catalog_by_type = {item.type: item for item in node_catalog}
        return [
            self._build_builtin_starter_item(
                catalog_by_type,
                id="blank",
                name="Blank Flow",
                description="保留最小 trigger -> output 骨架，适合从零开始搭应用入口。",
                business_track="应用新建编排",
                default_workflow_name="Blank Workflow",
                workflow_focus="先生成一个真实可保存、可运行、可继续扩展的最小 workflow 草稿。",
                recommended_next_step="进入画布后优先补应用命名、首个业务节点和基础输出格式。",
                tags=["最小骨架", "可立即运行", "适合打草稿"],
                nodes=[
                    {"id": "trigger", "type": "trigger", "position": {"x": 140, "y": 220}},
                    {"id": "output", "type": "output", "position": {"x": 520, "y": 220}},
                ],
                edges=[self._create_edge("edge_trigger_output", "trigger", "output")],
            ),
            self._build_builtin_starter_item(
                catalog_by_type,
                id="agent",
                name="Agent Draft",
                description="预留一个 LLM Agent 节点，方便继续补提示词、上下文授权和输出结构。",
                business_track="编排节点能力",
                default_workflow_name="Agent Workflow",
                workflow_focus="把高频 Agent 节点先放进画布，继续往角色、上下文和结构化输出推进。",
                recommended_next_step="继续补 LLM Agent 的结构化配置和 output 节点的结果约束。",
                tags=["LLM Agent", "多 Agent 起点", "便于继续扩节点"],
                nodes=[
                    {"id": "trigger", "type": "trigger", "position": {"x": 100, "y": 220}},
                    {
                        "id": "agent",
                        "type": "llm_agent",
                        "name": "Planner Agent",
                        "position": {"x": 420, "y": 220},
                        "config": {
                            "prompt": "Describe how this agent should respond.",
                            "role": "planner",
                        },
                    },
                    {
                        "id": "output",
                        "type": "output",
                        "position": {"x": 760, "y": 220},
                        "config": {"format": "text"},
                    },
                ],
                edges=[
                    self._create_edge("edge_trigger_agent", "trigger", "agent"),
                    self._create_edge("edge_agent_output", "agent", "output"),
                ],
            ),
            self._build_builtin_starter_item(
                catalog_by_type,
                id="tooling",
                name="Tool Pipeline",
                description="预留一个 tool 节点，创建后即可在编辑器里绑定 catalog tool 或 compat tool。",
                business_track="Dify 插件兼容",
                default_workflow_name="Tool Workflow",
                workflow_focus="先把工具节点纳入编排主线，再接目录绑定、compat adapter 和外部生态。",
                recommended_next_step="创建后优先绑定一个 catalog tool，再继续补 adapter 与输入 schema。",
                tags=["工具节点", "插件目录", "compat 入口"],
                nodes=[
                    {"id": "trigger", "type": "trigger", "position": {"x": 100, "y": 220}},
                    {
                        "id": "tool",
                        "type": "tool",
                        "name": "Tool Node",
                        "position": {"x": 420, "y": 220},
                        "config": {
                            "notes": "Bind a catalog tool from the inspector after creation."
                        },
                    },
                    {"id": "output", "type": "output", "position": {"x": 760, "y": 220}},
                ],
                edges=[
                    self._create_edge("edge_trigger_tool", "trigger", "tool"),
                    self._create_edge("edge_tool_output", "tool", "output"),
                ],
            ),
            self._build_builtin_starter_item(
                catalog_by_type,
                id="response",
                name="Response Draft",
                description="围绕 output 响应整形预留一个最小 API-ready 草稿，方便后续接发布配置。",
                business_track="API 调用开放",
                default_workflow_name="Response Workflow",
                workflow_focus="先把响应结构、输出格式和发布前的最终结果整形组织在 workflow 内部。",
                recommended_next_step="继续在编辑器里补 output schema、发布配置和协议映射策略。",
                tags=["响应整形", "发布准备", "output 优先"],
                nodes=[
                    {"id": "trigger", "type": "trigger", "position": {"x": 100, "y": 220}},
                    {
                        "id": "agent",
                        "type": "llm_agent",
                        "name": "Response Agent",
                        "position": {"x": 420, "y": 220},
                        "config": {
                            "prompt": "Return a response that is ready for an API-facing output node.",
                            "role": "responder",
                        },
                    },
                    {
                        "id": "output",
                        "type": "output",
                        "position": {"x": 760, "y": 220},
                        "config": {"format": "json", "responseMode": "sync"},
                    },
                ],
                edges=[
                    self._create_edge("edge_trigger_response_agent", "trigger", "agent"),
                    self._create_edge("edge_response_agent_output", "agent", "output"),
                ],
            ),
        ]

    def _build_workspace_starters(
        self,
        db: Session,
        *,
        workspace_id: str,
    ) -> list[WorkflowLibraryStarterItem]:
        service = get_workspace_starter_template_service()
        records = service.list_templates(db, workspace_id=workspace_id)
        workspace_source = WorkflowLibrarySourceDescriptor(
            **{
                **WORKSPACE_TEMPLATE_SOURCE.model_dump(),
                "status": "available",
                "short_label": "workspace ready",
                "summary": "工作空间模板已落到后端真实数据源，可作为团队 starter 持续复用。",
            }
        )
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

    def _build_builtin_starter_item(
        self,
        catalog_by_type: dict[WorkflowNodeType, WorkflowNodeCatalogItem],
        *,
        id: str,
        name: str,
        description: str,
        business_track: str,
        default_workflow_name: str,
        workflow_focus: str,
        recommended_next_step: str,
        tags: list[str],
        nodes: list[dict],
        edges: list[dict],
    ) -> WorkflowLibraryStarterItem:
        definition = {
            "nodes": [
                self._build_catalog_node_definition(catalog_by_type, node_blueprint)
                for node_blueprint in nodes
            ],
            "edges": [deepcopy(edge) for edge in edges],
            "variables": [],
            "publish": [],
        }
        return WorkflowLibraryStarterItem(
            id=id,
            origin="builtin",
            name=name,
            description=description,
            business_track=business_track,
            default_workflow_name=default_workflow_name,
            workflow_focus=workflow_focus,
            recommended_next_step=recommended_next_step,
            tags=list(tags),
            definition=definition,
            source=BUILTIN_STARTER_SOURCE,
        )

    def _build_catalog_node_definition(
        self,
        catalog_by_type: dict[WorkflowNodeType, WorkflowNodeCatalogItem],
        blueprint: dict,
    ) -> dict:
        node_type = blueprint["type"]
        catalog_item = catalog_by_type.get(node_type)
        base_config = deepcopy(catalog_item.defaults.config if catalog_item else {})
        config = {**base_config, **deepcopy(blueprint.get("config") or {})}
        position = blueprint.get("position") or (
            catalog_item.palette.default_position.model_dump()
            if catalog_item is not None
            else {"x": 240, "y": 120}
        )
        return {
            "id": blueprint["id"],
            "type": node_type,
            "name": blueprint.get("name")
            or (catalog_item.defaults.name if catalog_item else node_type),
            "config": self._with_canvas_position(config, position),
        }

    def _with_canvas_position(
        self,
        config: dict,
        position: dict,
    ) -> dict:
        next_config = deepcopy(config)
        ui = next_config.get("ui") if isinstance(next_config.get("ui"), dict) else {}
        next_config["ui"] = {
            **ui,
            "position": {
                "x": int(position.get("x", 0)),
                "y": int(position.get("y", 0)),
            },
        }
        return next_config

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

    def _clone_source_lanes(
        self,
        lanes: list[WorkflowLibrarySourceLane],
    ) -> list[WorkflowLibrarySourceLane]:
        return [WorkflowLibrarySourceLane(**lane.model_dump()) for lane in lanes]

    def _describe_tool_source(
        self,
        tool: PluginToolItem,
    ) -> WorkflowLibrarySourceDescriptor:
        if tool.ecosystem.startswith("compat:"):
            return WorkflowLibrarySourceDescriptor(
                kind="tool",
                scope="ecosystem",
                status="available",
                governance="adapter",
                ecosystem=tool.ecosystem,
                label=f"{tool.ecosystem} tools",
                short_label=tool.ecosystem,
                summary="兼容层同步进来的工具目录项，后端已先压成受约束 IR 再进入 registry。",
            )

        if tool.source == "builtin":
            return TOOL_REGISTRY_SOURCE

        return WorkflowLibrarySourceDescriptor(
            kind="tool",
            scope="ecosystem",
            status="available",
            governance="adapter",
            ecosystem=tool.ecosystem,
            label=f"{tool.ecosystem} plugin tools",
            short_label=tool.source,
            summary="通过插件目录暴露给 workflow 的工具入口，仍走统一 registry，而不是直连页面。",
        )

    def _build_palette(
        self,
        *,
        enabled: bool,
        order: int,
        x: int,
        y: int,
    ) -> WorkflowNodeCatalogPalette:
        return WorkflowNodeCatalogPalette(
            enabled=enabled,
            order=order,
            default_position=WorkflowNodeCatalogPosition(x=x, y=y),
        )

    def _build_defaults(
        self,
        *,
        name: str,
        config: dict | None = None,
    ) -> WorkflowNodeCatalogDefaults:
        return WorkflowNodeCatalogDefaults(
            name=name,
            config=deepcopy(config or {}),
        )

    def _build_source_lane(
        self,
        source: WorkflowLibrarySourceDescriptor,
        count: int,
    ) -> WorkflowLibrarySourceLane:
        return WorkflowLibrarySourceLane(**source.model_dump(), count=count)

    def _create_edge(
        self,
        id: str,
        source_node_id: str,
        target_node_id: str,
    ) -> dict[str, str]:
        return {
            "id": id,
            "sourceNodeId": source_node_id,
            "targetNodeId": target_node_id,
            "channel": "control",
        }


@lru_cache(maxsize=1)
def get_workflow_library_service() -> WorkflowLibraryService:
    return WorkflowLibraryService()
