from fastapi.testclient import TestClient


def _publishable_definition(
    *,
    answer: str = "done",
    workflow_version: str | None = "0.1.0",
) -> dict:
    endpoint: dict[str, object] = {
        "id": "native-chat",
        "name": "Native Chat",
        "protocol": "native",
        "authMode": "internal",
        "streaming": False,
        "inputSchema": {"type": "object"},
    }
    if workflow_version is not None:
        endpoint["workflowVersion"] = workflow_version

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
    assert body[0]["lifecycle_status"] == "draft"
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
    assert current_body[1]["target_workflow_version"] == "0.1.1"

    all_versions_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints",
        params={"include_all_versions": "true"},
    )
    assert all_versions_response.status_code == 200
    all_versions_body = all_versions_response.json()
    assert [
        (item["workflow_version"], item["endpoint_id"])
        for item in all_versions_body
    ] == [
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


def test_invoke_published_native_endpoint_rejects_unimplemented_auth_modes(
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
                        "authMode": "api_key",
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
    assert "auth mode 'api_key' is not supported yet" in invoke_response.json()["detail"]
