from __future__ import annotations

from copy import deepcopy

from app.schemas.plugin import PluginToolItem
from app.schemas.workflow_library import (
    WorkflowLibrarySourceDescriptor,
    WorkflowLibrarySourceLane,
    WorkflowLibraryStarterItem,
    WorkflowNodeCatalogDefaults,
    WorkflowNodeCatalogItem,
    WorkflowNodeCatalogPalette,
    WorkflowNodeCatalogPosition,
    WorkflowNodeType,
)

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


def build_node_catalog_items(
    *,
    tool_source_lanes: list[WorkflowLibrarySourceLane] | None = None,
) -> list[WorkflowNodeCatalogItem]:
    tool_binding_lanes = clone_source_lanes(tool_source_lanes or [])
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
            palette=_build_palette(enabled=False, order=0, x=80, y=200),
            defaults=_build_defaults(name="Trigger"),
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
            palette=_build_palette(enabled=True, order=10, x=340, y=120),
            defaults=_build_defaults(
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
            palette=_build_palette(enabled=True, order=20, x=340, y=280),
            defaults=_build_defaults(name="Tool"),
            binding_required=True,
            binding_source_lanes=tool_binding_lanes,
        ),
        WorkflowNodeCatalogItem(
            type="sandbox_code",
            label="Sandbox Code",
            description="高风险代码执行节点，当前已接入 runtime / persistence 主链，并沿 execution readiness 诚实校验。",
            ecosystem="native",
            source=NATIVE_NODE_SOURCE,
            capability_group="integration",
            business_track="编排节点能力",
            tags=["sandbox", "code", "runtime-ready"],
            palette=_build_palette(enabled=True, order=25, x=500, y=420),
            defaults=_build_defaults(
                name="Sandbox Code",
                config={
                    "language": "python",
                    "code": "result = {'ok': True}",
                },
            ),
            support_status="available",
            support_summary=(
                "当前已进入 editor / persistence / runtime 主链，并会在保存时按 sandbox readiness fail-closed；"
                "默认仍走强隔离 execution class，若当前只想走 host-controlled MVP 路径，请在 runtime policy 中显式改成 subprocess。"
            ),
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
            palette=_build_palette(enabled=True, order=30, x=620, y=120),
            defaults=_build_defaults(
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
            palette=_build_palette(enabled=True, order=40, x=620, y=280),
            defaults=_build_defaults(name="Condition"),
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
            palette=_build_palette(enabled=True, order=50, x=620, y=420),
            defaults=_build_defaults(name="Router"),
        ),
        WorkflowNodeCatalogItem(
            type="loop",
            label="Loop",
            description="显式表达循环语义的节点类型，避免通过隐式回边或调度技巧偷渡循环。",
            ecosystem="native",
            source=NATIVE_NODE_SOURCE,
            capability_group="logic",
            business_track="编排节点能力",
            tags=["loop", "control-flow", "planned"],
            palette=_build_palette(enabled=False, order=55, x=760, y=420),
            defaults=_build_defaults(name="Loop"),
            support_status="planned",
            support_summary=(
                "显式 loop 节点语义已收敛，但 MVP executor 仍未支持；当前只在 catalog 中保留"
                "路线对齐，不开放进 editor palette 或 runtime 主链。"
            ),
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
            palette=_build_palette(enabled=True, order=60, x=900, y=200),
            defaults=_build_defaults(name="Output", config={"format": "json"}),
        ),
    ]


def build_starter_source_lanes(
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
        build_source_lane(
            BUILTIN_STARTER_SOURCE,
            sum(1 for starter in starters if starter.origin == "builtin"),
        ),
        build_source_lane(workspace_source, workspace_count),
        build_source_lane(ECOSYSTEM_TEMPLATE_SOURCE, 0),
    ]


def build_node_source_lanes(
    nodes: list[WorkflowNodeCatalogItem],
) -> list[WorkflowLibrarySourceLane]:
    return [
        build_source_lane(
            NATIVE_NODE_SOURCE,
            sum(1 for item in nodes if item.palette.enabled),
        )
    ]


def build_tool_source_lanes(
    tools: list[PluginToolItem],
) -> list[WorkflowLibrarySourceLane]:
    summary: dict[str, WorkflowLibrarySourceLane] = {}
    for tool in tools:
        source = describe_tool_source(tool)
        key = f"{source.scope}:{source.ecosystem}:{source.short_label}"
        existing = summary.get(key)
        if existing is not None:
            existing.count += 1
            continue
        summary[key] = build_source_lane(source, 1)

    return sorted(summary.values(), key=lambda item: (item.label, item.short_label))


def build_builtin_starters(
    node_catalog: list[WorkflowNodeCatalogItem],
) -> list[WorkflowLibraryStarterItem]:
    catalog_by_type = {item.type: item for item in node_catalog}
    return [
        _build_builtin_starter_item(
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
            edges=[create_edge("edge_trigger_output", "trigger", "output")],
        ),
        _build_builtin_starter_item(
            catalog_by_type,
            id="agent",
            name="Agent Draft",
            description="预留一个 LLM Agent 节点，方便继续补提示词、上下文授权和输出结构。",
            business_track="编排节点能力",
            default_workflow_name="Agent Workflow",
            workflow_focus="把高频 Agent 节点先放上画布，再按具体场景继续补模型、工具与 schema。",
            recommended_next_step="优先配置 Agent prompt、允许的工具目录和最终 output schema。",
            tags=["agent", "提示词草稿", "常用起点"],
            nodes=[
                {"id": "trigger", "type": "trigger", "position": {"x": 100, "y": 220}},
                {"id": "agent", "type": "llm_agent", "position": {"x": 420, "y": 220}},
                {"id": "output", "type": "output", "position": {"x": 760, "y": 220}},
            ],
            edges=[
                create_edge("edge_trigger_agent", "trigger", "agent"),
                create_edge("edge_agent_output", "agent", "output"),
            ],
        ),
        _build_builtin_starter_item(
            catalog_by_type,
            id="tooling",
            name="Tool-enabled Agent",
            description="内置 Agent + Tool 骨架，适合先把工具编排与受控调用链路跑通。",
            business_track="Dify 插件兼容",
            default_workflow_name="Tool Agent Workflow",
            workflow_focus="优先把工具节点绑定到真实 catalog，再决定 Agent 的调用策略和失败处理。",
            recommended_next_step="先选 tool binding，再补 Agent 的 toolPolicy、超时与输出格式。",
            tags=["tool", "agent", "compat-ready"],
            nodes=[
                {"id": "trigger", "type": "trigger", "position": {"x": 80, "y": 220}},
                {"id": "agent", "type": "llm_agent", "position": {"x": 360, "y": 220}},
                {
                    "id": "tool",
                    "type": "tool",
                    "position": {"x": 360, "y": 420},
                    "config": {"binding": {"toolId": None}},
                },
                {"id": "output", "type": "output", "position": {"x": 720, "y": 220}},
            ],
            edges=[
                create_edge("edge_trigger_agent", "trigger", "agent"),
                create_edge("edge_agent_output", "agent", "output"),
            ],
        ),
        _build_builtin_starter_item(
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
                {"id": "trigger", "type": "trigger", "position": {"x": 120, "y": 220}},
                {"id": "output", "type": "output", "position": {"x": 520, "y": 220}},
            ],
            edges=[create_edge("edge_trigger_output", "trigger", "output")],
        ),
    ]


def build_workspace_starter_source() -> WorkflowLibrarySourceDescriptor:
    return WorkflowLibrarySourceDescriptor(
        **{
            **WORKSPACE_TEMPLATE_SOURCE.model_dump(),
            "status": "available",
            "short_label": "workspace ready",
            "summary": "工作空间模板已落到后端真实数据源，可作为团队 starter 持续复用。",
        }
    )


def clone_source_lanes(
    lanes: list[WorkflowLibrarySourceLane],
) -> list[WorkflowLibrarySourceLane]:
    return [WorkflowLibrarySourceLane(**lane.model_dump()) for lane in lanes]


def describe_tool_source(
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


def build_source_lane(
    source: WorkflowLibrarySourceDescriptor,
    count: int,
) -> WorkflowLibrarySourceLane:
    return WorkflowLibrarySourceLane(**source.model_dump(), count=count)


def create_edge(
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


def _build_builtin_starter_item(
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
            _build_catalog_node_definition(catalog_by_type, node_blueprint)
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
        "config": _with_canvas_position(config, position),
    }


def _with_canvas_position(
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


def _build_palette(
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
    *,
    name: str,
    config: dict | None = None,
) -> WorkflowNodeCatalogDefaults:
    return WorkflowNodeCatalogDefaults(
        name=name,
        config=deepcopy(config or {}),
    )
