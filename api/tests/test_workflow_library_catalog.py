from app.schemas.plugin import PluginToolItem
from app.schemas.workflow_library import WorkflowLibraryStarterItem
from app.services.workflow_library_catalog import (
    BUILTIN_STARTER_SOURCE,
    build_builtin_starters,
    build_node_catalog_items,
    build_starter_source_lanes,
    build_tool_source_lanes,
    build_workspace_starter_source,
)


def test_builtin_agent_starter_preserves_catalog_defaults_and_canvas_positions() -> None:
    node_catalog = build_node_catalog_items()

    starters = build_builtin_starters(node_catalog)
    agent_starter = next(item for item in starters if item.id == "agent")
    agent_node = next(node for node in agent_starter.definition["nodes"] if node["id"] == "agent")

    assert agent_node["type"] == "llm_agent"
    assert agent_node["name"] == "LLM Agent"
    assert agent_node["config"]["assistant"] == {
        "enabled": False,
        "trigger": "on_multi_tool_results",
    }
    assert agent_node["config"]["toolPolicy"] == {"allowedToolIds": []}
    assert agent_node["config"]["ui"]["position"] == {"x": 420, "y": 220}

    output_node = next(node for node in agent_starter.definition["nodes"] if node["id"] == "output")
    assert output_node["config"]["ui"]["position"] == {"x": 760, "y": 220}


def test_build_tool_source_lanes_groups_native_and_compat_tools() -> None:
    lanes = build_tool_source_lanes(
        [
            PluginToolItem(
                id="native:search",
                name="Search",
                ecosystem="native",
                description="",
                source="builtin",
                callable=True,
            ),
            PluginToolItem(
                id="compat:dify:weather",
                name="Weather",
                ecosystem="compat:dify",
                description="",
                source="plugin",
                callable=True,
            ),
            PluginToolItem(
                id="compat:dify:calendar",
                name="Calendar",
                ecosystem="compat:dify",
                description="",
                source="plugin",
                callable=True,
            ),
        ]
    )

    lane_by_label = {lane.label: lane for lane in lanes}
    assert lane_by_label["Tool registry"].count == 1
    assert lane_by_label["compat:dify tools"].count == 2


def test_build_node_catalog_marks_planned_nodes_without_confusing_palette_visibility() -> None:
    node_catalog = build_node_catalog_items()

    trigger_node = next(item for item in node_catalog if item.type == "trigger")
    sandbox_node = next(item for item in node_catalog if item.type == "sandbox_code")
    loop_node = next(item for item in node_catalog if item.type == "loop")

    assert trigger_node.support_status == "available"
    assert trigger_node.palette.enabled is False

    assert sandbox_node.support_status == "available"
    assert sandbox_node.palette.enabled is True
    assert sandbox_node.defaults.config == {
        "language": "python",
        "code": "result = {'ok': True}",
    }
    assert "editor / persistence / runtime 主链" in sandbox_node.support_summary

    assert loop_node.support_status == "planned"
    assert loop_node.palette.enabled is False
    assert "MVP executor" in loop_node.support_summary


def test_build_starter_source_lanes_marks_workspace_source_available() -> None:
    lanes = build_starter_source_lanes(
        [
            WorkflowLibraryStarterItem(
                id="blank",
                origin="builtin",
                name="Blank",
                business_track="应用新建编排",
                default_workflow_name="Blank Workflow",
                source=BUILTIN_STARTER_SOURCE,
            ),
            WorkflowLibraryStarterItem(
                id="workspace-agent",
                origin="workspace",
                workspace_id="default",
                name="Workspace Agent",
                business_track="编排节点能力",
                default_workflow_name="Workspace Agent Workflow",
                source=build_workspace_starter_source(),
            ),
        ]
    )

    workspace_lane = next(lane for lane in lanes if lane.scope == "workspace")
    assert workspace_lane.status == "available"
    assert workspace_lane.short_label == "workspace ready"
    assert workspace_lane.count == 1
