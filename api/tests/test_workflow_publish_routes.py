import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunCallbackTicket
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import (
    WorkflowPublishedCacheEntry,
    WorkflowPublishedEndpoint,
)
from app.services.plugin_runtime import PluginToolDefinition, reset_plugin_registry
from app.services.published_invocations import PublishedInvocationService
from tests.workflow_publish_helpers import (
    publishable_definition as _publishable_definition,
)
from tests.workflow_publish_helpers import (
    waiting_agent_publishable_definition as _waiting_agent_publishable_definition,
)


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
    assert body[0]["cache_policy"] is None
    assert body[0]["published_at"] is None
    assert body[0]["unpublished_at"] is None


def test_create_workflow_persists_publish_cache_policy(client: TestClient) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Publishable Workflow With Cache",
            "definition": _publishable_definition(
                cache={
                    "ttl": 120,
                    "maxEntries": 16,
                    "varyBy": ["question", "session.id"],
                }
            ),
        },
    )

    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    response = client.get(f"/api/workflows/{workflow_id}/published-endpoints")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["cache_policy"] == {
        "enabled": True,
        "ttl": 120,
        "maxEntries": 16,
        "varyBy": ["question", "session.id"],
    }


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
    detail = response.json()["detail"]
    assert isinstance(detail, dict)
    assert "references unknown workflow version" in detail["message"]
    assert any(issue["category"] == "publish_version" for issue in detail["issues"])


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


def test_invoke_published_native_endpoint_stream_returns_event_stream(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Streaming Workflow",
            "definition": _publishable_definition(
                answer="native streamed hello",
                alias="native-stream-chat",
                path="/native/stream-chat",
                streaming=True,
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

    with client.stream(
        "POST",
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={
            "input_payload": {"question": "hello"},
            "stream": True,
        },
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["X-7Flows-Cache"] == "BYPASS"
        assert response.headers["X-7Flows-Run-Status"] == "SUCCEEDED"
        lines = [line for line in response.iter_lines() if line]

    event_names = [line.removeprefix("event: ") for line in lines if line.startswith("event: ")]
    assert event_names[0] == "run.started"
    assert "node.started" in event_names
    assert "node.output.completed" in event_names
    assert "run.output.delta" in event_names
    assert event_names[-1] == "run.completed"

    data_lines = [line.removeprefix("data: ") for line in lines if line.startswith("data: ")]
    assert data_lines[-1] == "[DONE]"
    streamed_payloads = [json.loads(line) for line in data_lines[:-1]]
    assert streamed_payloads[0]["type"] == "run.started"
    assert any(item["type"] == "node.output.completed" for item in streamed_payloads)
    completed_payload = streamed_payloads[-1]
    assert completed_payload["type"] == "run.completed"
    assert completed_payload["status"] == "succeeded"
    assert completed_payload["output_payload"] == {"tool": {"answer": "native streamed hello"}}

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 1
    assert activity["items"][0]["run_status"] == "succeeded"
    assert activity["items"][0]["run_id"] is not None


def test_invoke_published_native_endpoint_rejects_streaming_when_binding_disabled(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Non Streaming Workflow",
            "definition": _publishable_definition(
                answer="native non stream",
                alias="native-non-stream-chat",
                streaming=False,
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

    invoke_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={
            "input_payload": {"question": "hello"},
            "stream": True,
        },
    )
    assert invoke_response.status_code == 422
    assert (
        invoke_response.json()["detail"]
        == "Streaming is not supported for this published endpoint."
    )

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 1
    assert activity["summary"]["rejected_count"] == 1
    assert activity["summary"]["last_reason_code"] == "streaming_unsupported"
    assert activity["items"][0]["status"] == "rejected"


def test_invoke_published_openai_chat_completion_uses_model_alias(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published OpenAI Chat Workflow",
            "definition": _publishable_definition(
                answer="openai-chat-answer",
                endpoint_id="openai-chat",
                endpoint_name="OpenAI Chat",
                alias="openai.chat.workflow",
                path="/openai/chat",
                protocol="openai",
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

    invoke_response = client.post(
        "/v1/chat/completions",
        json={
            "model": "openai.chat.workflow",
            "messages": [{"role": "user", "content": "hello"}],
        },
    )
    assert invoke_response.status_code == 200
    assert invoke_response.headers["X-7Flows-Cache"] == "BYPASS"
    body = invoke_response.json()
    assert body["object"] == "chat.completion"
    assert body["model"] == "openai.chat.workflow"
    assert body["choices"][0]["message"] == {
        "role": "assistant",
        "content": "openai-chat-answer",
    }

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 1
    assert activity["summary"]["succeeded_count"] == 1
    assert activity["items"][0]["request_surface"] == "openai.chat.completions"
    assert activity["facets"]["request_source_counts"] == [
        {
            "value": "workflow",
            "count": 0,
            "last_invoked_at": None,
            "last_status": None,
        },
        {
            "value": "alias",
            "count": 1,
            "last_invoked_at": activity["summary"]["last_invoked_at"],
            "last_status": "succeeded",
        },
        {
            "value": "path",
            "count": 0,
            "last_invoked_at": None,
            "last_status": None,
        },
    ]
    assert activity["facets"]["request_surface_counts"] == [
        {
            "value": "openai.chat.completions",
            "count": 1,
            "last_invoked_at": activity["summary"]["last_invoked_at"],
            "last_status": "succeeded",
        }
    ]


def test_openai_chat_and_responses_use_surface_specific_publish_cache(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published OpenAI Cache Workflow",
            "definition": _publishable_definition(
                answer="surface-cache-answer",
                endpoint_id="openai-cache",
                endpoint_name="OpenAI Cache",
                alias="openai.cache.workflow",
                path="/openai/cache",
                protocol="openai",
                cache={"ttl": 300, "maxEntries": 8},
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

    chat_payload = {
        "model": "openai.cache.workflow",
        "messages": [{"role": "user", "content": "same-input"}],
    }
    first_chat = client.post("/v1/chat/completions", json=chat_payload)
    assert first_chat.status_code == 200
    assert first_chat.headers["X-7Flows-Cache"] == "MISS"

    second_chat = client.post("/v1/chat/completions", json=chat_payload)
    assert second_chat.status_code == 200
    assert second_chat.headers["X-7Flows-Cache"] == "HIT"

    response_payload = {
        "model": "openai.cache.workflow",
        "input": [{"role": "user", "content": "same-input"}],
    }
    responses_invoke = client.post("/v1/responses", json=response_payload)
    assert responses_invoke.status_code == 200
    assert responses_invoke.headers["X-7Flows-Cache"] == "MISS"
    assert responses_invoke.json()["object"] == "response"
    assert responses_invoke.json()["output_text"] == "surface-cache-answer"

    cache_inventory_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/cache-entries"
    )
    assert cache_inventory_response.status_code == 200
    cache_inventory = cache_inventory_response.json()
    assert cache_inventory["summary"]["active_entry_count"] == 2


def test_invoke_published_anthropic_message_uses_model_alias(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Anthropic Workflow",
            "definition": _publishable_definition(
                answer="anthropic-answer",
                endpoint_id="anthropic-message",
                endpoint_name="Anthropic Message",
                alias="anthropic.message.workflow",
                path="/anthropic/message",
                protocol="anthropic",
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

    invoke_response = client.post(
        "/v1/messages",
        json={
            "model": "anthropic.message.workflow",
            "max_tokens": 128,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert invoke_response.status_code == 200
    body = invoke_response.json()
    assert body["type"] == "message"
    assert body["model"] == "anthropic.message.workflow"
    assert body["content"] == [{"type": "text", "text": "anthropic-answer"}]


def test_published_sync_routes_reject_waiting_runs(
    client: TestClient,
) -> None:
    registry = reset_plugin_registry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _: {
            "status": "waiting",
            "content_type": "json",
            "summary": "awaiting callback",
            "structured": {"ticket": "tool-789"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )

    try:
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Published Waiting Workflow",
                "definition": _waiting_agent_publishable_definition(
                    alias="openai.waiting.workflow",
                    path="/openai/waiting",
                    endpoint_id="openai-waiting",
                    endpoint_name="OpenAI Waiting",
                    protocol="openai",
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

        invoke_response = client.post(
            "/v1/chat/completions",
            json={
                "model": "openai.waiting.workflow",
                "messages": [{"role": "user", "content": "hello"}],
            },
        )
        assert invoke_response.status_code == 409
        assert invoke_response.json()["detail"] == (
            "Published sync invocation entered waiting state. "
            "Waiting runs are not supported for sync published endpoints yet."
        )

        activity_response = client.get(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
        )
        assert activity_response.status_code == 200
        activity = activity_response.json()
        assert activity["summary"]["total_count"] == 1
        assert activity["summary"]["rejected_count"] == 1
        assert activity["summary"]["last_reason_code"] == "sync_waiting_unsupported"
        assert {
            item["value"]: item["count"] for item in activity["facets"]["reason_counts"]
        } == {"sync_waiting_unsupported": 1}
        assert activity["items"][0]["status"] == "rejected"
        assert activity["items"][0]["reason_code"] == "sync_waiting_unsupported"
        assert activity["items"][0]["run_id"] is None
    finally:
        reset_plugin_registry()


def test_published_openai_routes_reject_streaming_requests(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "OpenAI Non Streaming Workflow",
            "definition": _publishable_definition(
                protocol="openai",
                alias="openai.non-stream.workflow",
                endpoint_id="openai-non-stream",
                endpoint_name="OpenAI Non Stream",
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

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "openai.non-stream.workflow",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Streaming is not supported for this published endpoint."


def test_published_openai_chat_stream_returns_sse_and_tracks_run(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "OpenAI Streaming Workflow",
            "definition": _publishable_definition(
                protocol="openai",
                alias="openai.stream.workflow",
                endpoint_id="openai-stream",
                endpoint_name="OpenAI Stream",
                streaming=True,
                answer="streamed hello from 7flows",
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

    with client.stream(
        "POST",
        "/v1/chat/completions",
        json={
            "model": "openai.stream.workflow",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["X-7Flows-Cache"] == "BYPASS"
        assert response.headers["X-7Flows-Run-Status"] == "SUCCEEDED"
        lines = [line for line in response.iter_lines() if line]

    data_lines = [line.removeprefix("data: ") for line in lines if line.startswith("data: ")]
    assert data_lines[-1] == "[DONE]"
    streamed_chunks = [json.loads(line) for line in data_lines[:-1]]
    assert streamed_chunks[0]["object"] == "chat.completion.chunk"
    assert streamed_chunks[-1]["choices"][0]["finish_reason"] == "stop"
    assert any(
        "content" in chunk["choices"][0].get("delta", {}) for chunk in streamed_chunks
    )

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 1
    assert activity["summary"]["last_run_status"] == "succeeded"
    assert activity["items"][0]["run_status"] == "succeeded"
    assert activity["items"][0]["run_id"] is not None


def test_published_anthropic_message_stream_returns_event_stream(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Anthropic Streaming Workflow",
            "definition": _publishable_definition(
                protocol="anthropic",
                alias="anthropic.stream.workflow",
                endpoint_id="anthropic-stream",
                endpoint_name="Anthropic Stream",
                streaming=True,
                answer="anthropic streamed output",
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

    with client.stream(
        "POST",
        "/v1/messages",
        json={
            "model": "anthropic.stream.workflow",
            "max_tokens": 128,
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["X-7Flows-Run-Status"] == "SUCCEEDED"
        lines = [line for line in response.iter_lines() if line]

    event_names = [line.removeprefix("event: ") for line in lines if line.startswith("event: ")]
    assert event_names[0] == "message_start"
    assert "content_block_delta" in event_names
    assert event_names[-1] == "message_stop"


def test_invoke_published_native_endpoint_uses_response_cache(
    client: TestClient,
    sqlite_session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Cache Workflow",
            "definition": _publishable_definition(
                answer="cached",
                cache={
                    "ttl": 300,
                    "maxEntries": 2,
                    "varyBy": ["question"],
                },
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
    assert binding["cache_policy"] == {
        "enabled": True,
        "ttl": 300,
        "maxEntries": 2,
        "varyBy": ["question"],
    }

    publish_response = client.patch(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
        json={"status": "published"},
    )
    assert publish_response.status_code == 200

    first_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "same", "ignored": 1}},
    )
    assert first_response.status_code == 200
    assert first_response.headers["X-7Flows-Cache"] == "MISS"
    first_body = first_response.json()

    second_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "same", "ignored": 2}},
    )
    assert second_response.status_code == 200
    assert second_response.headers["X-7Flows-Cache"] == "HIT"
    second_body = second_response.json()
    assert second_body["run"]["id"] == first_body["run"]["id"]
    assert second_body["run"]["output_payload"] == first_body["run"]["output_payload"]

    third_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "different", "ignored": 3}},
    )
    assert third_response.status_code == 200
    assert third_response.headers["X-7Flows-Cache"] == "MISS"
    third_body = third_response.json()
    assert third_body["run"]["id"] != first_body["run"]["id"]

    workflow_runs_response = client.get(f"/api/workflows/{workflow_id}/runs")
    assert workflow_runs_response.status_code == 200
    workflow_runs = workflow_runs_response.json()
    assert len(workflow_runs) == 2

    cache_entries = sqlite_session.scalars(
        select(WorkflowPublishedCacheEntry)
        .where(WorkflowPublishedCacheEntry.binding_id == binding["id"])
        .order_by(WorkflowPublishedCacheEntry.created_at.asc())
    ).all()
    assert len(cache_entries) == 2
    assert cache_entries[0].hit_count == 1
    assert cache_entries[0].last_hit_at is not None

    invocation_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert invocation_response.status_code == 200
    invocation_body = invocation_response.json()
    assert invocation_body["summary"]["total_count"] == 3
    assert invocation_body["summary"]["succeeded_count"] == 3
    assert invocation_body["summary"]["cache_hit_count"] == 1
    assert invocation_body["summary"]["cache_miss_count"] == 2
    assert invocation_body["summary"]["cache_bypass_count"] == 0
    assert invocation_body["summary"]["last_cache_status"] in {"hit", "miss"}
    assert {
        item["value"]: item["count"]
        for item in invocation_body["facets"]["cache_status_counts"]
    } == {
        "hit": 1,
        "miss": 2,
        "bypass": 0,
    }
    assert [item["cache_status"] for item in invocation_body["items"]] == [
        "miss",
        "hit",
        "miss",
    ]

    list_response = client.get(f"/api/workflows/{workflow_id}/published-endpoints")
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert list_body[0]["activity"]["cache_hit_count"] == 1
    assert list_body[0]["activity"]["cache_miss_count"] == 2
    assert list_body[0]["activity"]["cache_bypass_count"] == 0
    assert list_body[0]["cache_inventory"] == {
        "enabled": True,
        "ttl": 300,
        "max_entries": 2,
        "vary_by": ["question"],
        "active_entry_count": 2,
        "total_hit_count": 1,
        "last_hit_at": cache_entries[0].last_hit_at.isoformat().replace("+00:00", "Z"),
        "nearest_expires_at": cache_entries[0].expires_at.isoformat().replace("+00:00", "Z"),
        "latest_created_at": cache_entries[1].created_at.isoformat().replace("+00:00", "Z"),
    }

    cache_inventory_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/cache-entries"
    )
    assert cache_inventory_response.status_code == 200
    cache_inventory_body = cache_inventory_response.json()
    assert cache_inventory_body["summary"]["enabled"] is True
    assert cache_inventory_body["summary"]["ttl"] == 300
    assert cache_inventory_body["summary"]["max_entries"] == 2
    assert cache_inventory_body["summary"]["vary_by"] == ["question"]
    assert cache_inventory_body["summary"]["active_entry_count"] == 2
    assert cache_inventory_body["summary"]["total_hit_count"] == 1
    assert [item["hit_count"] for item in cache_inventory_body["items"]] == [1, 0]
    assert (
        cache_inventory_body["items"][0]["response_preview"]["sample"]["binding_id"]
        == binding["id"]
    )
    assert all(item["cache_key"] for item in cache_inventory_body["items"])


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


def test_get_published_invocation_detail_drills_into_run_callback_and_cache(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Publish Invocation Detail Workflow",
            "definition": _publishable_definition(
                cache={
                    "ttl": 300,
                    "maxEntries": 8,
                    "varyBy": ["question"],
                }
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

    binding_record = sqlite_session.get(WorkflowPublishedEndpoint, binding["id"])
    assert binding_record is not None

    now = datetime.now(UTC)
    run = Run(
        id="run-publish-detail",
        workflow_id=workflow_id,
        workflow_version=binding_record.workflow_version,
        compiled_blueprint_id=binding_record.compiled_blueprint_id,
        status="waiting",
        input_payload={"question": "hello"},
        checkpoint_payload={},
        current_node_id="tool_wait",
        started_at=now,
        created_at=now,
    )
    node_run = NodeRun(
        id="node-run-publish-detail",
        run_id=run.id,
        node_id="tool_wait",
        node_name="Tool Wait",
        node_type="tool",
        status="waiting",
        phase="waiting_callback",
        retry_count=0,
        input_payload={"question": "hello"},
        output_payload=None,
        checkpoint_payload={
            "callback_waiting_lifecycle": {
                "wait_cycle_count": 1,
                "issued_ticket_count": 1,
                "expired_ticket_count": 0,
                "consumed_ticket_count": 0,
                "canceled_ticket_count": 0,
                "late_callback_count": 0,
                "resume_schedule_count": 1,
                "last_ticket_status": "pending",
                "last_ticket_reason": "callback pending",
                "last_ticket_updated_at": now.isoformat().replace("+00:00", "Z"),
                "last_late_callback_status": None,
                "last_late_callback_reason": None,
                "last_late_callback_at": None,
                "last_resume_delay_seconds": 30.0,
                "last_resume_reason": "callback pending",
                "last_resume_source": "callback_ticket_monitor",
                "last_resume_backoff_attempt": 0,
            },
            "scheduled_resume": {
                "delay_seconds": 30,
                "reason": "callback pending",
                "source": "callback_ticket_monitor",
                "waiting_status": "waiting_callback",
            }
        },
        working_context={},
        evidence_context=None,
        artifact_refs=[],
        error_message=None,
        waiting_reason="callback pending",
        started_at=now,
        phase_started_at=now,
        finished_at=None,
        created_at=now,
    )
    callback_ticket = RunCallbackTicket(
        id="cb-publish-detail",
        run_id=run.id,
        node_run_id=node_run.id,
        tool_call_id=None,
        tool_id="native.search",
        tool_call_index=0,
        waiting_status="waiting_callback",
        status="pending",
        reason="callback pending",
        callback_payload=None,
        created_at=now,
        expires_at=now + timedelta(minutes=5),
    )
    sensitive_resource = SensitiveResourceRecord(
        id="resource-publish-detail-tool",
        label="Published Search Tool",
        description="Published invocation depends on approved search access.",
        sensitivity_level="L2",
        source="local_capability",
        metadata_payload={"tool_id": "native.search", "workflow_id": workflow_id},
        created_at=now,
        updated_at=now,
    )
    sensitive_request = SensitiveAccessRequestRecord(
        id="access-request-publish-detail",
        run_id=run.id,
        node_run_id=node_run.id,
        requester_type="workflow",
        requester_id=node_run.node_id,
        resource_id=sensitive_resource.id,
        action_type="invoke",
        purpose_text="Invoke search tool for published callback response.",
        decision="allow",
        reason_code="approved_after_review",
        created_at=now,
        decided_at=now + timedelta(seconds=45),
    )
    approval_ticket = ApprovalTicketRecord(
        id="approval-ticket-publish-detail",
        access_request_id=sensitive_request.id,
        run_id=run.id,
        node_run_id=node_run.id,
        status="approved",
        waiting_status="resumed",
        approved_by="ops-manager",
        decided_at=now + timedelta(seconds=45),
        expires_at=now + timedelta(minutes=10),
        created_at=now,
    )
    notification_dispatch = NotificationDispatchRecord(
        id="notification-publish-detail",
        approval_ticket_id=approval_ticket.id,
        channel="in_app",
        target="sensitive-access-inbox",
        status="delivered",
        delivered_at=now + timedelta(seconds=10),
        error=None,
        created_at=now,
    )
    cache_entry = WorkflowPublishedCacheEntry(
        id="cache-entry-publish-detail",
        workflow_id=workflow_id,
        binding_id=binding_record.id,
        endpoint_id=binding_record.endpoint_id,
        cache_key="cache-key-publish-detail",
        response_payload={
            "binding_id": binding_record.id,
            "answer": "cached detail",
        },
        hit_count=2,
        last_hit_at=now,
        expires_at=now + timedelta(minutes=10),
        created_at=now,
        updated_at=now,
    )
    sqlite_session.add(run)
    sqlite_session.add(node_run)
    sqlite_session.add(callback_ticket)
    sqlite_session.add(sensitive_resource)
    sqlite_session.add(sensitive_request)
    sqlite_session.add(approval_ticket)
    sqlite_session.add(notification_dispatch)
    sqlite_session.add(cache_entry)

    invocation_service = PublishedInvocationService()
    invocation = invocation_service.record_invocation(
        sqlite_session,
        binding=binding_record,
        request_source="workflow",
        input_payload={"question": "hello"},
        status="succeeded",
        cache_status="hit",
        cache_key=cache_entry.cache_key,
        cache_entry_id=cache_entry.id,
        run_id=run.id,
        run_status=run.status,
        response_payload={"answer": "cached detail"},
        started_at=now,
        finished_at=now,
    )
    sqlite_session.commit()
    expected_now = now.replace(tzinfo=None).isoformat()
    expected_callback_expires_at = (now + timedelta(minutes=5)).replace(tzinfo=None).isoformat()
    expected_cache_expires_at = (now + timedelta(minutes=10)).replace(tzinfo=None).isoformat()

    detail_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/{invocation.id}"
    )
    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    assert detail_body["invocation"]["id"] == invocation.id
    assert detail_body["invocation"]["run_id"] == run.id
    assert detail_body["invocation"]["run_status"] == "waiting"
    assert detail_body["invocation"]["run_waiting_reason"] == "callback pending"
    assert detail_body["invocation"]["run_waiting_lifecycle"] == {
        "node_run_id": node_run.id,
        "node_status": "waiting",
        "waiting_reason": "callback pending",
        "callback_ticket_count": 1,
        "callback_ticket_status_counts": {"pending": 1},
        "callback_waiting_lifecycle": {
            "wait_cycle_count": 1,
            "issued_ticket_count": 1,
            "expired_ticket_count": 0,
            "consumed_ticket_count": 0,
            "canceled_ticket_count": 0,
            "late_callback_count": 0,
            "resume_schedule_count": 1,
            "max_expired_ticket_count": 0,
            "terminated": False,
            "termination_reason": None,
            "terminated_at": None,
            "last_ticket_status": "pending",
            "last_ticket_reason": "callback pending",
            "last_ticket_updated_at": now.isoformat().replace("+00:00", "Z"),
            "last_late_callback_status": None,
            "last_late_callback_reason": None,
            "last_late_callback_at": None,
            "last_resume_delay_seconds": 30.0,
            "last_resume_reason": "callback pending",
            "last_resume_source": "callback_ticket_monitor",
            "last_resume_backoff_attempt": 0,
        },
        "scheduled_resume_delay_seconds": 30.0,
        "scheduled_resume_reason": "callback pending",
        "scheduled_resume_source": "callback_ticket_monitor",
        "scheduled_waiting_status": "waiting_callback",
    }
    assert detail_body["run"] == {
        "id": run.id,
        "status": "waiting",
        "current_node_id": "tool_wait",
        "error_message": None,
        "created_at": expected_now,
        "started_at": expected_now,
        "finished_at": None,
    }
    assert detail_body["callback_tickets"] == [
        {
            "ticket": callback_ticket.id,
            "run_id": run.id,
            "node_run_id": node_run.id,
            "tool_call_id": None,
            "tool_id": "native.search",
            "tool_call_index": 0,
            "waiting_status": "waiting_callback",
            "status": "pending",
            "reason": "callback pending",
            "callback_payload": None,
            "created_at": expected_now,
            "expires_at": expected_callback_expires_at,
            "consumed_at": None,
            "canceled_at": None,
            "expired_at": None,
        }
    ]
    assert len(detail_body["sensitive_access_entries"]) == 1
    assert detail_body["sensitive_access_entries"][0]["resource"]["label"] == (
        "Published Search Tool"
    )
    assert detail_body["sensitive_access_entries"][0]["request"]["decision"] == "allow"
    assert detail_body["sensitive_access_entries"][0]["request"]["reason_code"] == (
        "approved_after_review"
    )
    assert detail_body["sensitive_access_entries"][0]["approval_ticket"] == {
        "id": approval_ticket.id,
        "access_request_id": sensitive_request.id,
        "run_id": run.id,
        "node_run_id": node_run.id,
        "status": "approved",
        "waiting_status": "resumed",
        "approved_by": "ops-manager",
        "decided_at": (now + timedelta(seconds=45)).replace(tzinfo=None).isoformat(),
        "expires_at": (now + timedelta(minutes=10)).replace(tzinfo=None).isoformat(),
        "created_at": expected_now,
    }
    assert detail_body["sensitive_access_entries"][0]["notifications"] == [
        {
            "id": notification_dispatch.id,
            "approval_ticket_id": approval_ticket.id,
            "channel": "in_app",
            "target": "sensitive-access-inbox",
            "status": "delivered",
            "delivered_at": (now + timedelta(seconds=10)).replace(tzinfo=None).isoformat(),
            "error": None,
            "created_at": expected_now,
        }
    ]
    assert detail_body["cache"] == {
        "cache_status": "hit",
        "cache_key": cache_entry.cache_key,
        "cache_entry_id": cache_entry.id,
        "inventory_entry": {
            "id": cache_entry.id,
            "binding_id": binding_record.id,
            "cache_key": cache_entry.cache_key,
            "response_preview": {
                "key_count": 2,
                "keys": ["answer", "binding_id"],
                "sample": {
                    "answer": "cached detail",
                    "binding_id": binding_record.id,
                },
            },
            "hit_count": 2,
            "last_hit_at": expected_now,
            "expires_at": expected_cache_expires_at,
            "created_at": expected_now,
            "updated_at": expected_now,
        },
    }


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
    assert activity["summary"]["last_reason_code"] == "rate_limit_exceeded"
    assert any(item["status"] == "rejected" for item in activity["items"])
    assert {
        item["value"]: item["count"] for item in activity["facets"]["reason_counts"]
    } == {"rate_limit_exceeded": 1}
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
    assert activity["summary"]["last_reason_code"] == "rate_limit_exceeded"
    assert {
        item["value"]: item["count"] for item in activity["facets"]["reason_counts"]
    } == {"rate_limit_exceeded": 1, "api_key_invalid": 1}
    assert activity["facets"]["recent_failure_reasons"][0]["message"] == detail
    reason_filtered_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "reason_code": "api_key_invalid",
        },
    )
    assert reason_filtered_response.status_code == 200
    reason_filtered = reason_filtered_response.json()
    assert reason_filtered["filters"] == {
        "status": None,
        "request_source": None,
        "request_surface": None,
        "run_status": None,
        "cache_status": None,
        "api_key_id": None,
        "reason_code": "api_key_invalid",
        "created_from": None,
        "created_to": None,
    }
    assert reason_filtered["summary"]["total_count"] == 1
    assert reason_filtered["summary"]["rejected_count"] == 1
    assert reason_filtered["summary"]["last_reason_code"] == "api_key_invalid"
    assert [item["reason_code"] for item in reason_filtered["items"]] == [
        "api_key_invalid"
    ]
