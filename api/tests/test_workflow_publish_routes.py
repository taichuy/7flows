from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.workflow import WorkflowPublishedInvocation


def _publishable_definition(
    *,
    answer: str = "done",
    workflow_version: str | None = "0.1.0",
    alias: str | None = None,
    path: str | None = None,
    auth_mode: str = "internal",
    rate_limit: dict | None = None,
) -> dict:
    endpoint: dict[str, object] = {
        "id": "native-chat",
        "name": "Native Chat",
        "protocol": "native",
        "authMode": auth_mode,
        "streaming": False,
        "inputSchema": {"type": "object"},
    }
    if alias is not None:
        endpoint["alias"] = alias
    if path is not None:
        endpoint["path"] = path
    if workflow_version is not None:
        endpoint["workflowVersion"] = workflow_version
    if rate_limit is not None:
        endpoint["rateLimit"] = rate_limit

    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
            {
                "id": "tool",
                "type": "tool",
                "name": "Tool",
                "config": {"mock_output": {"answer": answer}},
            },
            {"id": "output", "type": "output", "name": "Output", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "tool"},
            {"id": "e2", "sourceNodeId": "tool", "targetNodeId": "output"},
        ],
        "publish": [endpoint],
    }


def test_create_workflow_persists_publish_bindings(client: TestClient) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Publishable Workflow",
            "definition": _publishable_definition(),
        },
    )

    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    response = client.get(f"/api/workflows/{workflow_id}/published-endpoints")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["workflow_version"] == "0.1.0"
    assert body[0]["target_workflow_version"] == "0.1.0"
    assert body[0]["compiled_blueprint_id"] is not None
    assert body[0]["endpoint_id"] == "native-chat"
    assert body[0]["endpoint_alias"] == "native-chat"
    assert body[0]["route_path"] == "/native-chat"
    assert body[0]["lifecycle_status"] == "draft"
    assert body[0]["rate_limit_policy"] is None
    assert body[0]["published_at"] is None
    assert body[0]["unpublished_at"] is None


def test_list_published_endpoints_supports_current_and_all_versions(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Versioned Publish Workflow",
            "definition": _publishable_definition(),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "definition": {
                **_publishable_definition(answer="updated", workflow_version=None),
                "publish": [
                    {
                        "id": "native-chat",
                        "name": "Native Chat Stable",
                        "alias": "stable-native-chat",
                        "path": "/stable/native-chat",
                        "protocol": "native",
                        "workflowVersion": "0.1.0",
                        "authMode": "internal",
                        "streaming": False,
                        "inputSchema": {"type": "object"},
                    },
                    {
                        "id": "openai-chat",
                        "name": "OpenAI Chat Latest",
                        "protocol": "openai",
                        "authMode": "api_key",
                        "streaming": True,
                        "inputSchema": {"type": "object"},
                    },
                ],
            }
        },
    )
    assert update_response.status_code == 200

    current_response = client.get(f"/api/workflows/{workflow_id}/published-endpoints")
    assert current_response.status_code == 200
    current_body = current_response.json()
    assert [item["endpoint_id"] for item in current_body] == ["native-chat", "openai-chat"]
    assert current_body[0]["workflow_version"] == "0.1.1"
    assert current_body[0]["target_workflow_version"] == "0.1.0"
    assert current_body[0]["endpoint_alias"] == "stable-native-chat"
    assert current_body[0]["route_path"] == "/stable/native-chat"
    assert current_body[1]["target_workflow_version"] == "0.1.1"
    assert current_body[1]["endpoint_alias"] == "openai-chat"
    assert current_body[1]["route_path"] == "/openai-chat"

    all_versions_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert all_versions_response.status_code == 200
    all_versions_body = all_versions_response.json()
    assert [(item["workflow_version"], item["endpoint_id"]) for item in all_versions_body] == [
        ("0.1.1", "native-chat"),
        ("0.1.1", "openai-chat"),
        ("0.1.0", "native-chat"),
    ]


def test_create_workflow_rejects_publish_binding_to_unknown_version(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows",
        json={
            "name": "Broken Publish Binding",
            "definition": _publishable_definition(workflow_version="9.9.9"),
        },
    )

    assert response.status_code == 422
    assert "references unknown workflow version" in response.json()["detail"]


def test_publish_binding_promotes_selected_version_and_offlines_previous_one(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Publish Lifecycle Workflow",
            "definition": _publishable_definition(),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    initial_bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert initial_bindings_response.status_code == 200
    initial_binding_id = initial_bindings_response.json()[0]["id"]

    publish_initial_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{initial_binding_id}/lifecycle",
        json={"status": "published"},
    )
    assert publish_initial_response.status_code == 200
    published_initial = publish_initial_response.json()
    assert published_initial["lifecycle_status"] == "published"
    assert published_initial["published_at"] is not None
    assert published_initial["unpublished_at"] is None

    update_response = client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "definition": {
                **_publishable_definition(answer="updated", workflow_version=None),
                "publish": [
                    {
                        "id": "native-chat",
                        "name": "Native Chat Stable",
                        "protocol": "native",
                        "workflowVersion": "0.1.1",
                        "authMode": "internal",
                        "streaming": False,
                        "inputSchema": {"type": "object"},
                    }
                ],
            }
        },
    )
    assert update_response.status_code == 200

    all_bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert all_bindings_response.status_code == 200
    all_bindings = all_bindings_response.json()
    latest_binding = next(item for item in all_bindings if item["workflow_version"] == "0.1.1")
    previous_binding = next(item for item in all_bindings if item["workflow_version"] == "0.1.0")
    assert latest_binding["lifecycle_status"] == "draft"
    assert previous_binding["lifecycle_status"] == "published"

    publish_latest_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{latest_binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_latest_response.status_code == 200
    published_latest = publish_latest_response.json()
    assert published_latest["lifecycle_status"] == "published"
    assert published_latest["published_at"] is not None
    assert published_latest["unpublished_at"] is None

    published_only_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true", "lifecycle_status": "published"},
    )
    assert published_only_response.status_code == 200
    published_only = published_only_response.json()
    assert [(item["workflow_version"], item["lifecycle_status"]) for item in published_only] == [
        ("0.1.1", "published")
    ]

    all_bindings_after_publish_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert all_bindings_after_publish_response.status_code == 200
    all_bindings_after_publish = all_bindings_after_publish_response.json()
    previous_binding_after_publish = next(
        item for item in all_bindings_after_publish if item["workflow_version"] == "0.1.0"
    )
    assert previous_binding_after_publish["lifecycle_status"] == "offline"
    assert previous_binding_after_publish["unpublished_at"] is not None


def test_publish_binding_rejects_conflicting_alias_or_path_across_workflows(
    client: TestClient,
) -> None:
    first_workflow = client.post(
        "/api/workflows",
        json={
            "name": "First Published Workflow",
            "definition": _publishable_definition(alias="shared-alias", path="/shared/path"),
        },
    )
    assert first_workflow.status_code == 201
    first_workflow_id = first_workflow.json()["id"]

    first_binding_response = client.get(
        f"/api/workflows/{first_workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert first_binding_response.status_code == 200
    first_binding_id = first_binding_response.json()[0]["id"]

    publish_first_response = client.patch(
        f"/api/workflows/{first_workflow_id}/published-endpoints/{first_binding_id}/lifecycle",
        json={"status": "published"},
    )
    assert publish_first_response.status_code == 200

    second_workflow = client.post(
        "/api/workflows",
        json={
            "name": "Second Published Workflow",
            "definition": _publishable_definition(answer="other", alias="shared-alias"),
        },
    )
    assert second_workflow.status_code == 201
    second_workflow_id = second_workflow.json()["id"]

    second_binding_response = client.get(
        f"/api/workflows/{second_workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert second_binding_response.status_code == 200
    second_binding_id = second_binding_response.json()[0]["id"]

    publish_second_response = client.patch(
        f"/api/workflows/{second_workflow_id}/published-endpoints/{second_binding_id}/lifecycle",
        json={"status": "published"},
    )
    assert publish_second_response.status_code == 422
    assert "alias 'shared-alias' is already used" in publish_second_response.json()["detail"]

    third_workflow = client.post(
        "/api/workflows",
        json={
            "name": "Third Published Workflow",
            "definition": _publishable_definition(
                answer="other-path",
                alias="another-alias",
                path="/shared/path",
            ),
        },
    )
    assert third_workflow.status_code == 201
    third_workflow_id = third_workflow.json()["id"]

    third_binding_response = client.get(
        f"/api/workflows/{third_workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert third_binding_response.status_code == 200
    third_binding_id = third_binding_response.json()[0]["id"]

    publish_third_response = client.patch(
        f"/api/workflows/{third_workflow_id}/published-endpoints/{third_binding_id}/lifecycle",
        json={"status": "published"},
    )
    assert publish_third_response.status_code == 422
    assert "path '/shared/path' is already used" in publish_third_response.json()["detail"]


def test_unpublish_binding_marks_binding_offline(client: TestClient) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Offline Publish Workflow",
            "definition": _publishable_definition(),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding_id = bindings_response.json()[0]["id"]

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    offline_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle",
        json={"status": "offline"},
    )
    assert offline_response.status_code == 200
    body = offline_response.json()
    assert body["lifecycle_status"] == "offline"
    assert body["published_at"] is not None
    assert body["unpublished_at"] is not None


def test_invoke_published_native_endpoint_uses_active_binding_blueprint(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Invoke Workflow",
            "definition": _publishable_definition(answer="v1"),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    initial_bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert initial_bindings_response.status_code == 200
    initial_binding = initial_bindings_response.json()[0]

    publish_initial_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{initial_binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_initial_response.status_code == 200

    update_response = client.put(
        f"/api/workflows/{workflow_id}",
        json={
            "definition": _publishable_definition(answer="v2"),
        },
    )
    assert update_response.status_code == 200

    invoke_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "hello"}},
    )
    assert invoke_response.status_code == 200
    body = invoke_response.json()
    assert body["binding_id"] == initial_binding["id"]
    assert body["workflow_version"] == "0.1.0"
    assert body["compiled_blueprint_id"] == initial_binding["compiled_blueprint_id"]
    assert body["run"]["workflow_version"] == "0.1.0"
    assert body["run"]["compiled_blueprint_id"] == initial_binding["compiled_blueprint_id"]
    assert body["run"]["input_payload"] == {"question": "hello"}
    assert body["run"]["output_payload"] == {"tool": {"answer": "v1"}}
    assert body["endpoint_alias"] == "native-chat"
    assert body["route_path"] == "/native-chat"


def test_invoke_published_native_endpoint_supports_alias_and_path_routes(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Alias Workflow",
            "definition": _publishable_definition(
                answer="alias-path",
                alias="native-chat-stable",
                path="/team/native-chat",
            ),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding = bindings_response.json()[0]

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    alias_response = client.post(
        "/v1/published-aliases/native-chat-stable/run",
        json={"input_payload": {"source": "alias"}},
    )
    assert alias_response.status_code == 200
    assert alias_response.json()["run"]["output_payload"] == {"tool": {"answer": "alias-path"}}

    path_response = client.post(
        "/v1/published-paths/team/native-chat",
        json={"input_payload": {"source": "path"}},
    )
    assert path_response.status_code == 200
    assert path_response.json()["endpoint_alias"] == "native-chat-stable"
    assert path_response.json()["route_path"] == "/team/native-chat"

    bindings_after_invocation = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_after_invocation.status_code == 200
    activity = bindings_after_invocation.json()[0]["activity"]
    assert activity["total_count"] == 2
    assert activity["succeeded_count"] == 2
    assert activity["last_status"] == "succeeded"

    invocation_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert invocation_response.status_code == 200
    invocation_body = invocation_response.json()
    assert invocation_body["summary"]["total_count"] == 2
    assert [item["request_source"] for item in invocation_body["items"]] == ["path", "alias"]
    assert invocation_body["items"][0]["request_preview"]["sample"]["source"] == "path"
    assert invocation_body["items"][1]["request_preview"]["sample"]["source"] == "alias"
    assert all(item["run_id"] for item in invocation_body["items"])


def test_list_published_endpoint_invocations_supports_filters_and_api_key_audit(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Audit Workflow",
            "definition": _publishable_definition(
                answer="audit",
                alias="native-chat-audit",
                path="/team/native-audit",
                auth_mode="api_key",
            ),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding = bindings_response.json()[0]

    primary_key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "Primary Key"},
    )
    assert primary_key_response.status_code == 201
    primary_key = primary_key_response.json()

    fallback_key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "Fallback Key"},
    )
    assert fallback_key_response.status_code == 201
    fallback_key = fallback_key_response.json()

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    workflow_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"source": "workflow"}},
        headers={"x-api-key": primary_key["secret_key"]},
    )
    assert workflow_invoke.status_code == 200

    alias_invoke = client.post(
        "/v1/published-aliases/native-chat-audit/run",
        json={"input_payload": {"source": "alias"}},
        headers={"x-api-key": fallback_key["secret_key"]},
    )
    assert alias_invoke.status_code == 200

    path_invoke = client.post(
        "/v1/published-paths/team/native-audit",
        json={"input_payload": {"source": "path"}},
        headers={"x-api-key": primary_key["secret_key"]},
    )
    assert path_invoke.status_code == 200

    rejected_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"source": "rejected"}},
        headers={"Authorization": "Bearer invalid-key"},
    )
    assert rejected_invoke.status_code == 401

    all_activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert all_activity_response.status_code == 200
    all_activity = all_activity_response.json()
    assert all_activity["filters"] == {
        "status": None,
        "request_source": None,
        "api_key_id": None,
        "created_from": None,
        "created_to": None,
    }
    assert all_activity["summary"]["total_count"] == 4
    assert all_activity["summary"]["succeeded_count"] == 3
    assert all_activity["summary"]["rejected_count"] == 1

    status_counts = {
        item["value"]: item["count"] for item in all_activity["facets"]["status_counts"]
    }
    assert status_counts == {"succeeded": 3, "failed": 0, "rejected": 1}

    request_source_counts = {
        item["value"]: item["count"] for item in all_activity["facets"]["request_source_counts"]
    }
    assert request_source_counts == {"workflow": 2, "alias": 1, "path": 1}

    api_key_usage = {
        item["name"]: item["invocation_count"] for item in all_activity["facets"]["api_key_usage"]
    }
    assert api_key_usage == {"Primary Key": 2, "Fallback Key": 1}
    assert (
        all_activity["facets"]["recent_failure_reasons"][0]["message"]
        == "Published endpoint API key is invalid."
    )
    assert all_activity["facets"]["timeline_granularity"] in {"hour", "day"}
    assert len(all_activity["facets"]["timeline"]) >= 1

    filtered_activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "status": "succeeded",
            "api_key_id": primary_key["id"],
        },
    )
    assert filtered_activity_response.status_code == 200
    filtered_activity = filtered_activity_response.json()
    assert filtered_activity["filters"] == {
        "status": "succeeded",
        "request_source": None,
        "api_key_id": primary_key["id"],
        "created_from": None,
        "created_to": None,
    }
    assert filtered_activity["summary"]["total_count"] == 2
    assert [item["request_source"] for item in filtered_activity["items"]] == [
        "path",
        "workflow",
    ]
    assert all(item["api_key_name"] == "Primary Key" for item in filtered_activity["items"])
    assert all(
        item["api_key_prefix"] == primary_key["key_prefix"] for item in filtered_activity["items"]
    )


def test_list_published_endpoint_invocations_supports_time_window_and_timeline(
    client: TestClient,
    sqlite_session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Audit Timeline Workflow",
            "definition": _publishable_definition(
                answer="timeline",
                alias="native-chat-timeline",
                path="/team/native-timeline",
                auth_mode="api_key",
            ),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding = bindings_response.json()[0]

    key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "Timeline Key"},
    )
    assert key_response.status_code == 201
    api_key = key_response.json()

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    workflow_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"source": "workflow-early"}},
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert workflow_invoke.status_code == 200

    alias_invoke = client.post(
        "/v1/published-aliases/native-chat-timeline/run",
        json={"input_payload": {"source": "alias-mid"}},
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert alias_invoke.status_code == 200

    rejected_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"source": "workflow-rejected"}},
        headers={"Authorization": "Bearer invalid-key"},
    )
    assert rejected_invoke.status_code == 401

    path_invoke = client.post(
        "/v1/published-paths/team/native-timeline",
        json={"input_payload": {"source": "path-late"}},
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert path_invoke.status_code == 200

    records = sqlite_session.scalars(
        select(WorkflowPublishedInvocation)
        .where(WorkflowPublishedInvocation.binding_id == binding["id"])
        .order_by(WorkflowPublishedInvocation.created_at.asc())
    ).all()
    assert len(records) == 4

    source_to_timestamp = {
        "workflow-early": datetime(2026, 3, 12, 8, 0, tzinfo=UTC),
        "alias-mid": datetime(2026, 3, 12, 9, 15, tzinfo=UTC),
        "workflow-rejected": datetime(2026, 3, 12, 9, 45, tzinfo=UTC),
        "path-late": datetime(2026, 3, 13, 10, 0, tzinfo=UTC),
    }
    for record in records:
        source = record.request_preview["sample"]["source"]
        timestamp = source_to_timestamp[source]
        record.created_at = timestamp
        record.finished_at = timestamp
    sqlite_session.commit()

    filtered_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "created_from": "2026-03-12T08:30:00Z",
            "created_to": "2026-03-12T23:59:59Z",
        },
    )
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["filters"] == {
        "status": None,
        "request_source": None,
        "api_key_id": None,
        "created_from": "2026-03-12T08:30:00Z",
        "created_to": "2026-03-12T23:59:59Z",
    }
    assert filtered_body["summary"]["total_count"] == 2
    assert filtered_body["summary"]["succeeded_count"] == 1
    assert filtered_body["summary"]["rejected_count"] == 1
    assert [item["request_source"] for item in filtered_body["items"]] == [
        "workflow",
        "alias",
    ]
    assert filtered_body["facets"]["timeline_granularity"] == "hour"
    assert filtered_body["facets"]["timeline"] == [
        {
            "bucket_start": "2026-03-12T09:00:00Z",
            "bucket_end": "2026-03-12T10:00:00Z",
            "total_count": 2,
            "succeeded_count": 1,
            "failed_count": 0,
            "rejected_count": 1,
        }
    ]

    invalid_range_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "created_from": "2026-03-13T00:00:00Z",
            "created_to": "2026-03-12T00:00:00Z",
        },
    )
    assert invalid_range_response.status_code == 422
    assert (
        invalid_range_response.json()["detail"]
        == "'created_from' must be earlier than or equal to 'created_to'."
    )


def test_invoke_published_native_endpoint_rejects_unimplemented_token_auth_mode(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Protected Native Endpoint Workflow",
            "definition": {
                **_publishable_definition(),
                "publish": [
                    {
                        "id": "native-chat",
                        "name": "Native Chat",
                        "protocol": "native",
                        "workflowVersion": "0.1.0",
                        "authMode": "token",
                        "streaming": False,
                        "inputSchema": {"type": "object"},
                    }
                ],
            },
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding_id = bindings_response.json()[0]["id"]

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    invoke_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {}},
    )
    assert invoke_response.status_code == 422
    assert "auth mode 'token' is not supported yet" in invoke_response.json()["detail"]

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations"
    )
    assert activity_response.status_code == 200
    body = activity_response.json()
    assert body["summary"]["total_count"] == 1
    assert body["summary"]["rejected_count"] == 1
    assert body["summary"]["last_status"] == "rejected"
    assert body["items"][0]["status"] == "rejected"
    assert body["items"][0]["run_id"] is None


def test_create_workflow_persists_publish_binding_rate_limit_policy(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Publishable Workflow With Rate Limit",
            "definition": _publishable_definition(
                rate_limit={"requests": 2, "windowSeconds": 3600}
            ),
        },
    )

    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    response = client.get(f"/api/workflows/{workflow_id}/published-endpoints")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["rate_limit_policy"] == {
        "requests": 2,
        "windowSeconds": 3600,
    }


def test_invoke_published_native_endpoint_enforces_rate_limit(
    client: TestClient,
) -> None:
    detail = (
        "Published endpoint rate limit exceeded: "
        "2 successful/failed invocations per 3600 seconds."
    )
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Rate Limit Workflow",
            "definition": _publishable_definition(
                answer="limited",
                rate_limit={"requests": 2, "windowSeconds": 3600},
            ),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding = bindings_response.json()[0]

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    first_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"attempt": 1}},
    )
    assert first_invoke.status_code == 200

    second_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"attempt": 2}},
    )
    assert second_invoke.status_code == 200

    limited_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"attempt": 3}},
    )
    assert limited_invoke.status_code == 429
    assert limited_invoke.json()["detail"] == detail

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 3
    assert activity["summary"]["succeeded_count"] == 2
    assert activity["summary"]["rejected_count"] == 1
    assert any(item["status"] == "rejected" for item in activity["items"])
    assert activity["facets"]["recent_failure_reasons"][0]["message"] == detail


def test_rejected_published_invocation_does_not_consume_rate_limit_quota(
    client: TestClient,
) -> None:
    detail = (
        "Published endpoint rate limit exceeded: "
        "1 successful/failed invocations per 3600 seconds."
    )
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Rate Limit Rejected Workflow",
            "definition": _publishable_definition(
                answer="limited-once",
                auth_mode="api_key",
                rate_limit={"requests": 1, "windowSeconds": 3600},
            ),
        },
    )
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    bindings_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert bindings_response.status_code == 200
    binding = bindings_response.json()[0]

    key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "Rate Limit Key"},
    )
    assert key_response.status_code == 201
    api_key = key_response.json()

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    rejected_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"attempt": "rejected"}},
        headers={"Authorization": "Bearer invalid-key"},
    )
    assert rejected_invoke.status_code == 401

    first_valid_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"attempt": "valid-1"}},
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert first_valid_invoke.status_code == 200

    limited_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"attempt": "valid-2"}},
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert limited_invoke.status_code == 429
    assert limited_invoke.json()["detail"] == detail

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 3
    assert activity["summary"]["succeeded_count"] == 1
    assert activity["summary"]["rejected_count"] == 2
    assert activity["facets"]["recent_failure_reasons"][0]["message"] == detail
