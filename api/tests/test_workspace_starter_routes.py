from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _valid_definition() -> dict:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "output"},
        ],
    }


def _create_workspace_starter(
    client: TestClient,
    *,
    name: str,
    business_track: str,
    description: str,
) -> dict:
    response = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": name,
            "description": description,
            "business_track": business_track,
            "default_workflow_name": f"{name} Workflow",
            "workflow_focus": f"{name} focus",
            "recommended_next_step": f"{name} next",
            "tags": [name.lower(), business_track],
            "definition": _valid_definition(),
            "created_from_workflow_id": "wf-demo",
            "created_from_workflow_version": "0.1.0",
        },
    )

    assert response.status_code == 201
    return response.json()


def test_workspace_starter_list_supports_filters_and_search(client: TestClient) -> None:
    app_template = _create_workspace_starter(
        client,
        name="App Starter",
        business_track="应用新建编排",
        description="Template for application creation",
    )
    _create_workspace_starter(
        client,
        name="API Response Starter",
        business_track="API 调用开放",
        description="Template for API publishing",
    )

    filtered_response = client.get(
        "/api/workspace-starters",
        params={"business_track": "应用新建编排", "search": "application"},
    )

    assert filtered_response.status_code == 200
    filtered_items = filtered_response.json()
    assert [item["id"] for item in filtered_items] == [app_template["id"]]


def test_workspace_starter_detail_returns_single_template(client: TestClient) -> None:
    created = _create_workspace_starter(
        client,
        name="Detail Starter",
        business_track="编排节点能力",
        description="Template for node orchestration",
    )

    response = client.get(f"/api/workspace-starters/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created["id"]
    assert body["name"] == "Detail Starter"
    assert body["definition"]["nodes"][0]["id"] == "trigger"


def test_workspace_starter_update_persists_metadata_changes(client: TestClient) -> None:
    created = _create_workspace_starter(
        client,
        name="Original Starter",
        business_track="Dify 插件兼容",
        description="Template for compat tools",
    )

    response = client.put(
        f"/api/workspace-starters/{created['id']}",
        json={
            "name": "Updated Starter",
            "description": "Updated governance description",
            "workflow_focus": "Updated workflow focus",
            "recommended_next_step": "Updated next step",
            "tags": ["updated", "workspace starter"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Updated Starter"
    assert body["description"] == "Updated governance description"
    assert body["workflow_focus"] == "Updated workflow focus"
    assert body["recommended_next_step"] == "Updated next step"
    assert body["tags"] == ["updated", "workspace starter"]

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert [item["action"] for item in history_items[:2]] == ["updated", "created"]
    assert history_items[0]["payload"]["fields"] == [
        "description",
        "name",
        "recommended_next_step",
        "tags",
        "workflow_focus",
    ]


def test_workspace_starter_archive_and_restore_change_visibility(
    client: TestClient,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Archive Starter",
        business_track="应用新建编排",
        description="Template for archive flow",
    )

    archive_response = client.post(f"/api/workspace-starters/{created['id']}/archive")
    assert archive_response.status_code == 200
    archived = archive_response.json()
    assert archived["archived"] is True
    assert archived["archived_at"] is not None

    default_list = client.get("/api/workspace-starters")
    assert default_list.status_code == 200
    assert default_list.json() == []

    archived_list = client.get(
        "/api/workspace-starters",
        params={"archived_only": True},
    )
    assert archived_list.status_code == 200
    assert [item["id"] for item in archived_list.json()] == [created["id"]]

    restore_response = client.post(f"/api/workspace-starters/{created['id']}/restore")
    assert restore_response.status_code == 200
    restored = restore_response.json()
    assert restored["archived"] is False
    assert restored["archived_at"] is None

    active_list = client.get("/api/workspace-starters")
    assert active_list.status_code == 200
    assert [item["id"] for item in active_list.json()] == [created["id"]]

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert [item["action"] for item in history_items[:3]] == [
        "restored",
        "archived",
        "created",
    ]


def test_workspace_starter_refresh_updates_snapshot_and_records_history(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Refresh Starter",
        business_track="编排节点能力",
        description="Template for refresh flow",
    )

    sample_workflow.version = "0.1.1"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "agent",
                "type": "llm_agent",
                "name": "Agent",
                "config": {"prompt": "Refresh me"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "agent"},
            {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(f"/api/workspace-starters/{created['id']}/refresh")
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["created_from_workflow_version"] == "0.1.1"
    assert [node["id"] for node in refreshed["definition"]["nodes"]] == [
        "trigger",
        "agent",
        "output",
    ]

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "refreshed"
    assert history_items[0]["payload"] == {
        "source_workflow_id": "wf-demo",
        "previous_workflow_version": "0.1.0",
        "source_workflow_version": "0.1.1",
        "changed": True,
    }


def test_workspace_starter_source_diff_reports_node_edge_and_name_drift(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Diff Starter",
        business_track="编排节点能力",
        description="Template for diff flow",
    )

    sample_workflow.name = "Demo Workflow v2"
    sample_workflow.version = "0.1.1"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "mock_tool",
                "type": "tool",
                "name": "Mock Tool",
                "config": {"mock_output": {"answer": "updated"}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
            {
                "id": "auditor",
                "type": "llm_agent",
                "name": "Auditor",
                "config": {"prompt": "Check output"},
            },
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "mock_tool"},
            {"id": "e2", "sourceNodeId": "mock_tool", "targetNodeId": "auditor"},
            {"id": "e3", "sourceNodeId": "auditor", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.get(f"/api/workspace-starters/{created['id']}/source-diff")

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is True
    assert body["workflow_name_changed"] is True
    assert body["rebase_fields"] == [
        "definition",
        "created_from_workflow_version",
        "default_workflow_name",
    ]
    assert body["node_summary"] == {
        "template_count": 2,
        "source_count": 4,
        "added_count": 2,
        "removed_count": 0,
        "changed_count": 0,
    }
    assert body["edge_summary"] == {
        "template_count": 1,
        "source_count": 3,
        "added_count": 2,
        "removed_count": 0,
        "changed_count": 1,
    }
    assert [entry["id"] for entry in body["node_entries"]] == ["auditor", "mock_tool"]
    assert [entry["status"] for entry in body["node_entries"]] == ["added", "added"]
    changed_edge = next(
        entry for entry in body["edge_entries"] if entry["id"] == "e1"
    )
    assert changed_edge["changed_fields"] == ["targetNodeId"]


def test_workspace_starter_rebase_syncs_source_derived_fields_and_records_history(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    created = _create_workspace_starter(
        client,
        name="Rebase Starter",
        business_track="应用新建编排",
        description="Template for rebase flow",
    )

    sample_workflow.name = "Rebased Demo Workflow"
    sample_workflow.version = "0.1.2"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "planner",
                "type": "llm_agent",
                "name": "Planner",
                "config": {"prompt": "Plan next step"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
            {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    response = client.post(f"/api/workspace-starters/{created['id']}/rebase")

    assert response.status_code == 200
    body = response.json()
    assert body["created_from_workflow_version"] == "0.1.2"
    assert body["default_workflow_name"] == "Rebased Demo Workflow"
    assert [node["id"] for node in body["definition"]["nodes"]] == [
        "trigger",
        "planner",
        "output",
    ]

    diff_response = client.get(f"/api/workspace-starters/{created['id']}/source-diff")
    assert diff_response.status_code == 200
    diff_body = diff_response.json()
    assert diff_body["changed"] is False
    assert diff_body["rebase_fields"] == []

    history_response = client.get(f"/api/workspace-starters/{created['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "rebased"
    assert history_items[0]["payload"]["changed"] is True
    assert history_items[0]["payload"]["rebase_fields"] == [
        "definition",
        "created_from_workflow_version",
        "default_workflow_name",
    ]


def test_workspace_starter_delete_requires_archive_first(client: TestClient) -> None:
    created = _create_workspace_starter(
        client,
        name="Delete Starter",
        business_track="API 调用开放",
        description="Template for delete flow",
    )

    conflict_response = client.delete(f"/api/workspace-starters/{created['id']}")
    assert conflict_response.status_code == 409

    archive_response = client.post(f"/api/workspace-starters/{created['id']}/archive")
    assert archive_response.status_code == 200

    delete_response = client.delete(f"/api/workspace-starters/{created['id']}")
    assert delete_response.status_code == 204

    detail_response = client.get(
        f"/api/workspace-starters/{created['id']}",
    )
    assert detail_response.status_code == 404


def test_workspace_starter_bulk_archive_and_restore_returns_summary(
    client: TestClient,
) -> None:
    active = _create_workspace_starter(
        client,
        name="Bulk Active Starter",
        business_track="应用新建编排",
        description="Template for bulk archive flow",
    )
    archived = _create_workspace_starter(
        client,
        name="Bulk Archived Starter",
        business_track="编排节点能力",
        description="Template for bulk restore flow",
    )
    archive_response = client.post(f"/api/workspace-starters/{archived['id']}/archive")
    assert archive_response.status_code == 200

    archive_bulk_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "archive",
            "template_ids": [active["id"], archived["id"], "missing-template"],
        },
    )
    assert archive_bulk_response.status_code == 200
    archive_result = archive_bulk_response.json()
    assert archive_result["updated_count"] == 1
    assert archive_result["skipped_count"] == 2
    assert [item["id"] for item in archive_result["updated_items"]] == [active["id"]]
    assert {item["reason"] for item in archive_result["skipped_items"]} == {
        "already_archived",
        "not_found",
    }

    restore_bulk_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "restore",
            "template_ids": [active["id"], archived["id"]],
        },
    )
    assert restore_bulk_response.status_code == 200
    restore_result = restore_bulk_response.json()
    assert restore_result["updated_count"] == 2
    assert restore_result["skipped_count"] == 0

    history_response = client.get(f"/api/workspace-starters/{active['id']}/history")
    assert history_response.status_code == 200
    history_items = history_response.json()
    assert history_items[0]["action"] == "restored"
    assert history_items[0]["payload"]["bulk"] is True


def test_workspace_starter_bulk_refresh_and_rebase_skip_invalid_sources(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow,
) -> None:
    derived = _create_workspace_starter(
        client,
        name="Bulk Derived Starter",
        business_track="编排节点能力",
        description="Template for bulk refresh flow",
    )
    manual = client.post(
        "/api/workspace-starters",
        json={
            "workspace_id": "default",
            "name": "Bulk Manual Starter",
            "description": "Manual template with no source workflow",
            "business_track": "API 调用开放",
            "default_workflow_name": "Manual Workflow",
            "workflow_focus": "Manual focus",
            "recommended_next_step": "Manual next",
            "tags": ["manual"],
            "definition": _valid_definition(),
        },
    )
    assert manual.status_code == 201
    manual_body = manual.json()

    sample_workflow.name = "Bulk Source Workflow"
    sample_workflow.version = "0.1.3"
    sample_workflow.definition = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "planner",
                "type": "llm_agent",
                "name": "Planner",
                "config": {"prompt": "Plan in bulk"},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "planner"},
            {"id": "e2", "sourceNodeId": "planner", "targetNodeId": "output"},
        ],
    }
    sqlite_session.add(sample_workflow)
    sqlite_session.commit()

    refresh_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "refresh",
            "template_ids": [derived["id"], manual_body["id"]],
        },
    )
    assert refresh_response.status_code == 200
    refresh_result = refresh_response.json()
    assert refresh_result["updated_count"] == 1
    assert refresh_result["skipped_count"] == 1
    assert refresh_result["updated_items"][0]["created_from_workflow_version"] == "0.1.3"
    assert refresh_result["skipped_items"][0]["reason"] == "no_source_workflow"

    rebase_response = client.post(
        "/api/workspace-starters/bulk",
        json={
            "workspace_id": "default",
            "action": "rebase",
            "template_ids": [derived["id"]],
        },
    )
    assert rebase_response.status_code == 200
    rebase_result = rebase_response.json()
    assert rebase_result["updated_count"] == 1
    assert rebase_result["updated_items"][0]["default_workflow_name"] == "Bulk Source Workflow"
