from datetime import UTC, datetime

from app.models.plugin import PluginAdapterRecord, PluginToolRecord
from app.models.workspace_starter import WorkspaceStarterTemplateRecord
from app.services.plugin_runtime import PluginRegistry, PluginToolDefinition


def _create_workspace_starter(client, *, name: str, business_track: str) -> dict:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": name,
            "description": f"{name} description",
            "business_track": business_track,
            "default_workflow_name": f"{name} Workflow",
            "workflow_focus": f"{name} focus",
            "recommended_next_step": f"{name} next step",
            "tags": [name.lower(), "workspace"],
            "definition": {
                "nodes": [
                    {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                    {"id": "output", "type": "output", "name": "Output", "config": {}},
                ],
                "edges": [
                    {
                        "id": "edge_trigger_output",
                        "sourceNodeId": "trigger",
                        "targetNodeId": "output",
                    }
                ],
            },
        },
    )
    assert response.status_code == 201
    return response.json()


def test_workflow_library_snapshot_includes_shared_catalog_contract(
    client,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.echo",
            name="Echo",
            ecosystem="native",
            source="builtin",
        ),
        invoker=lambda request: {"ok": True},
    )
    monkeypatch.setattr(
        "app.services.workflow_library.get_plugin_registry",
        lambda: registry,
    )

    workspace_starter = _create_workspace_starter(
        client,
        name="Workspace Agent Starter",
        business_track="编排节点能力",
    )

    tool_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify:plugin:demo/search",
            "name": "Demo Search",
            "ecosystem": "compat:dify",
            "description": "Search via adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
            "source": "plugin",
            "plugin_meta": {"origin": "dify"},
        },
    )
    assert tool_response.status_code == 201

    response = client.get("/api/workflow-library")

    assert response.status_code == 200
    body = response.json()
    assert len(body["nodes"]) == 9
    tool_node = next(item for item in body["nodes"] if item["type"] == "tool")
    loop_node = next(item for item in body["nodes"] if item["type"] == "loop")
    assert {item["id"] for item in body["starters"]} >= {
        "blank",
        "agent",
        "sandbox-code",
        "tooling",
        "response",
        workspace_starter["id"],
    }
    assert any(
        lane["short_label"] == "workspace ready" and lane["count"] == 1
        for lane in body["starter_source_lanes"]
    )
    assert body["node_source_lanes"] == [
        {
            "kind": "node",
            "scope": "builtin",
            "status": "available",
            "governance": "repo",
            "ecosystem": "native",
            "label": "Native node catalog",
            "short_label": "native nodes",
            "summary": "当前 palette 中的原生节点目录，由 7Flows 内部事实模型直接维护。",
            "count": 7,
        }
    ]
    assert tool_node["binding_required"] is True
    assert loop_node["support_status"] == "planned"
    assert loop_node["support_summary"]
    assert loop_node["palette"]["enabled"] is False
    assert {lane["short_label"] for lane in tool_node["binding_source_lanes"]} == {
        "compat:dify",
        "tool registry",
    }
    assert any(
        lane["short_label"] == "tool registry" and lane["count"] == 1
        for lane in body["tool_source_lanes"]
    )
    assert any(
        lane["short_label"] == "compat:dify" and lane["count"] == 1
        for lane in body["tool_source_lanes"]
    )
    assert {tool["id"] for tool in body["tools"]} == {
        "compat:dify:plugin:demo/search",
        "native.echo",
    }


def test_workflow_library_snapshot_filters_adapter_tools_by_workspace(
    client,
    sqlite_session,
    monkeypatch,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.echo",
            name="Echo",
            ecosystem="native",
            source="builtin",
        ),
        invoker=lambda request: {"ok": True},
    )
    monkeypatch.setattr(
        "app.services.workflow_library.get_plugin_registry",
        lambda: registry,
    )

    sqlite_session.add(
        PluginAdapterRecord(
            id="dify-workspace",
            ecosystem="compat:dify",
            endpoint="http://adapter.local",
            enabled=True,
            healthcheck_path="/healthz",
            workspace_ids=["ws-alpha"],
            plugin_kinds=["node", "provider"],
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    sqlite_session.add(
        PluginToolRecord(
            id="compat:dify:plugin:demo/search",
            adapter_id="dify-workspace",
            ecosystem="compat:dify",
            name="Demo Search",
            description="Search via scoped adapter",
            input_schema={"type": "object"},
            output_schema={"type": "object"},
            source="plugin",
            plugin_meta={"origin": "dify"},
            constrained_ir={
                "ir_version": "2026-03-10",
                "kind": "tool",
                "ecosystem": "compat:dify",
                "tool_id": "compat:dify:plugin:demo/search",
                "name": "Demo Search",
                "input_contract": [],
                "constraints": {"additional_properties": False},
            },
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    alpha_response = client.get("/api/workflow-library?workspace_id=ws-alpha")
    beta_response = client.get("/api/workflow-library?workspace_id=ws-beta")

    assert alpha_response.status_code == 200
    assert beta_response.status_code == 200

    alpha_body = alpha_response.json()
    beta_body = beta_response.json()
    alpha_tool_node = next(item for item in alpha_body["nodes"] if item["type"] == "tool")
    beta_tool_node = next(item for item in beta_body["nodes"] if item["type"] == "tool")

    assert {tool["id"] for tool in alpha_body["tools"]} == {
        "compat:dify:plugin:demo/search",
        "native.echo",
    }
    assert {tool["id"] for tool in beta_body["tools"]} == {"native.echo"}
    assert {lane["short_label"] for lane in alpha_tool_node["binding_source_lanes"]} == {
        "compat:dify",
        "tool registry",
    }
    assert [lane["short_label"] for lane in beta_tool_node["binding_source_lanes"]] == [
        "tool registry"
    ]


def test_workflow_library_snapshot_surfaces_workspace_starter_source_governance(
    client,
    sqlite_session,
    sample_workflow,
) -> None:
    starter_response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Governed Workspace Starter",
            "description": "Starter backed by a source workflow.",
            "business_track": "编排节点能力",
            "default_workflow_name": sample_workflow.name,
            "workflow_focus": "Keep starter governance aligned with the source workflow.",
            "recommended_next_step": "Review source governance before creating a new draft.",
            "tags": ["governed", "workspace starter"],
            "created_from_workflow_id": sample_workflow.id,
            "created_from_workflow_version": sample_workflow.version,
            "definition": sample_workflow.definition,
        },
    )
    assert starter_response.status_code == 201
    starter = starter_response.json()

    sample_workflow.version = "0.2.0"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Renamed Mock Tool",
                "config": {"mock_output": {"answer": "updated"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "output"},
        ],
    }
    sample_workflow.updated_at = datetime.now(UTC)
    sqlite_session.add(sample_workflow)
    sqlite_session.add(
        WorkspaceStarterTemplateRecord(
            id="starter-orphan",
            workspace_id="default",
            name="Orphan Workspace Starter",
            description="Source workflow is gone.",
            business_track="应用新建编排",
            default_workflow_name="Orphan Workflow",
            workflow_focus="Handle missing source governance.",
            recommended_next_step="Inspect the starter before reuse.",
            tags=["orphan", "workspace starter"],
            definition={
                "nodes": [
                    {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                    {"id": "output", "type": "output", "name": "Output", "config": {}},
                ],
                "edges": [
                    {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "output"}
                ],
            },
            created_from_workflow_id="wf-missing",
            created_from_workflow_version="9.9.9",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    sqlite_session.commit()

    response = client.get("/api/workflow-library")

    assert response.status_code == 200
    body = response.json()
    governed_starter = next(item for item in body["starters"] if item["id"] == starter["id"])
    orphan_starter = next(item for item in body["starters"] if item["id"] == "starter-orphan")

    governed_source = governed_starter["source_governance"]
    assert governed_source["kind"] == "drifted"
    assert governed_source["status_label"] == "建议 refresh"
    assert governed_source["source_workflow_id"] == sample_workflow.id
    assert governed_source["template_version"] == "0.1.0"
    assert governed_source["source_version"] == "0.2.0"
    assert governed_source["action_decision"]["recommended_action"] == "refresh"
    assert "来源 workflow 0.2.0" in governed_source["outcome_explanation"]["primary_signal"]
    assert "refresh" in governed_source["outcome_explanation"]["follow_up"]

    orphan_source = orphan_starter["source_governance"]
    assert orphan_source["kind"] == "missing_source"
    assert orphan_source["status_label"] == "来源缺失"
    assert orphan_source["source_workflow_id"] == "wf-missing"
    assert orphan_source["source_version"] is None
    assert orphan_source["action_decision"] is None
    assert "来源 workflow 已不可用" in orphan_source["outcome_explanation"]["primary_signal"]
