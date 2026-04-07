import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures(
    "workspace_console_auth", "default_console_route_headers"
)


def _publishable_definition(
    *,
    answer: str = "done",
    auth_mode: str = "api_key",
) -> dict:
    return {
        "nodes": [
            {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
            {
                "id": "toolNode",
                "type": "toolNode",
                "name": "toolNode",
                "config": {"mock_output": {"answer": answer}},
            },
            {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "toolNode"},
            {"id": "e2", "sourceNodeId": "toolNode", "targetNodeId": "endNode"},
        ],
        "publish": [
            {
                "id": "native-chat",
                "name": "Native Chat",
                "protocol": "native",
                "workflowVersion": "0.1.0",
                "authMode": auth_mode,
                "streaming": False,
                "inputSchema": {"type": "object"},
            }
        ],
    }


def _create_published_api_key_binding(client: TestClient) -> tuple[str, dict]:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Protected Native Endpoint Workflow",
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
    return workflow_id, bindings_response.json()[0]


def test_create_list_and_revoke_published_endpoint_api_keys(client: TestClient) -> None:
    workflow_id, binding = _create_published_api_key_binding(client)

    create_key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "CI Key"},
    )
    assert create_key_response.status_code == 201
    created_key = create_key_response.json()
    assert created_key["name"] == "CI Key"
    assert created_key["status"] == "active"
    assert created_key["secret_key"].startswith("sf_pub_")
    assert created_key["key_prefix"] == created_key["secret_key"][:16]

    list_keys_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys"
    )
    assert list_keys_response.status_code == 200
    listed_keys = list_keys_response.json()
    assert len(listed_keys) == 1
    assert listed_keys[0]["id"] == created_key["id"]
    assert listed_keys[0]["status"] == "active"

    revoke_response = client.delete(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys/{created_key['id']}"
    )
    assert revoke_response.status_code == 200
    revoked_key = revoke_response.json()
    assert revoked_key["status"] == "revoked"
    assert revoked_key["revoked_at"] is not None

    revoked_list_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        params={"include_revoked": "true"},
    )
    assert revoked_list_response.status_code == 200
    assert revoked_list_response.json()[0]["status"] == "revoked"


def test_invoke_published_native_endpoint_accepts_valid_api_key(client: TestClient) -> None:
    workflow_id, binding = _create_published_api_key_binding(client)

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    create_key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "Runtime Key"},
    )
    assert create_key_response.status_code == 201
    secret_key = create_key_response.json()["secret_key"]

    invoke_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "hello"}},
        headers={"x-api-key": secret_key},
    )
    assert invoke_response.status_code == 200
    body = invoke_response.json()
    assert body["binding_id"] == binding["id"]
    assert body["run"]["output_payload"] == {"toolNode": {"answer": "done"}}

    list_keys_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys"
    )
    assert list_keys_response.status_code == 200
    assert list_keys_response.json()[0]["last_used_at"] is not None


def test_invoke_published_native_endpoint_requires_api_key_when_binding_uses_api_key(
    client: TestClient,
) -> None:
    workflow_id, binding = _create_published_api_key_binding(client)

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    invoke_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {}},
    )
    assert invoke_response.status_code == 401
    assert invoke_response.json()["detail"] == "Published endpoint API key is required."


def test_invoke_published_native_endpoint_rejects_invalid_or_revoked_api_key(
    client: TestClient,
) -> None:
    workflow_id, binding = _create_published_api_key_binding(client)

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    create_key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys",
        json={"name": "Temporary Key"},
    )
    assert create_key_response.status_code == 201
    created_key = create_key_response.json()

    invalid_key_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {}},
        headers={"Authorization": "Bearer invalid-key"},
    )
    assert invalid_key_response.status_code == 401
    assert invalid_key_response.json()["detail"] == "Published endpoint API key is invalid."

    revoke_response = client.delete(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/api-keys/{created_key['id']}"
    )
    assert revoke_response.status_code == 200

    revoked_key_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {}},
        headers={"x-api-key": created_key["secret_key"]},
    )
    assert revoked_key_response.status_code == 401
    assert revoked_key_response.json()["detail"] == "Published endpoint API key is invalid."
