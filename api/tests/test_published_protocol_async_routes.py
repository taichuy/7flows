import pytest
from fastapi.testclient import TestClient

from app.services.plugin_runtime import PluginToolDefinition, reset_plugin_registry
from tests.workflow_publish_helpers import (
    publishable_definition,
    waiting_agent_publishable_definition,
)


def _publish_binding(client: TestClient, definition: dict, *, name: str) -> tuple[str, dict]:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": name,
            "definition": definition,
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
    return workflow_id, binding


def test_published_openai_chat_completion_async_route_uses_async_cache_surface(
    client: TestClient,
) -> None:
    workflow_id, binding = _publish_binding(
        client,
        publishable_definition(
            answer="openai-chat-async-answer",
            endpoint_id="openai-chat-async",
            endpoint_name="OpenAI Chat Async",
            alias="openai.chat.async.workflow",
            path="/openai/chat/async",
            protocol="openai",
            cache={"ttl": 300, "maxEntries": 4},
        ),
        name="Published OpenAI Chat Async Workflow",
    )

    payload = {
        "model": "openai.chat.async.workflow",
        "messages": [{"role": "user", "content": "hello"}],
    }

    first_response = client.post("/v1/chat/completions-async", json=payload)
    assert first_response.status_code == 200
    assert first_response.headers["X-7Flows-Cache"] == "MISS"
    assert first_response.headers["X-7Flows-Run-Status"] == "SUCCEEDED"
    first_body = first_response.json()
    assert first_response.headers["X-7Flows-Run-Id"] == first_body["run"]["id"]
    assert first_body["protocol"] == "openai"
    assert first_body["request_surface"] == "openai.chat.completions.async"
    assert first_body["run"]["status"] == "succeeded"
    assert first_body["response_payload"]["object"] == "chat.completion"
    assert first_body["response_payload"]["model"] == "openai.chat.async.workflow"
    assert first_body["response_payload"]["choices"][0]["message"]["content"] == (
        "openai-chat-async-answer"
    )

    second_response = client.post("/v1/chat/completions-async", json=payload)
    assert second_response.status_code == 200
    assert second_response.headers["X-7Flows-Cache"] == "HIT"
    assert second_response.headers["X-7Flows-Run-Status"] == "SUCCEEDED"
    second_body = second_response.json()
    assert second_response.headers["X-7Flows-Run-Id"] == second_body["run"]["id"]
    assert second_body["run"]["id"] == first_body["run"]["id"]
    assert second_body["response_payload"] == first_body["response_payload"]

    activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
    )
    assert activity_response.status_code == 200
    activity = activity_response.json()
    assert activity["summary"]["total_count"] == 2
    assert activity["summary"]["succeeded_count"] == 2
    assert activity["summary"]["cache_hit_count"] == 1
    assert activity["summary"]["cache_miss_count"] == 1
    assert activity["summary"]["last_run_status"] == "succeeded"
    assert [item["request_surface"] for item in activity["items"]] == [
        "openai.chat.completions.async",
        "openai.chat.completions.async",
    ]


@pytest.mark.parametrize(
    ("route", "protocol", "alias", "path", "payload", "request_surface"),
    [
        (
            "/v1/responses-async",
            "openai",
            "openai.responses.waiting.workflow",
            "/openai/responses/waiting",
            {
                "model": "openai.responses.waiting.workflow",
                "input": "hello",
            },
            "openai.responses.async",
        ),
        (
            "/v1/messages-async",
            "anthropic",
            "anthropic.messages.waiting.workflow",
            "/anthropic/messages/waiting",
            {
                "model": "anthropic.messages.waiting.workflow",
                "max_tokens": 128,
                "messages": [{"role": "user", "content": "hi"}],
            },
            "anthropic.messages.async",
        ),
    ],
)
def test_published_protocol_async_routes_accept_waiting_runs_without_caching(
    client: TestClient,
    route: str,
    protocol: str,
    alias: str,
    path: str,
    payload: dict,
    request_surface: str,
) -> None:
    registry = reset_plugin_registry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _: {
            "status": "waiting",
            "content_type": "json",
            "summary": "awaiting callback",
            "structured": {"ticket": "tool-async-789"},
            "meta": {
                "tool_name": "Native Search",
                "waiting_reason": "callback pending",
                "waiting_status": "waiting_callback",
            },
        },
    )

    try:
        workflow_id, binding = _publish_binding(
            client,
            waiting_agent_publishable_definition(
                alias=alias,
                path=path,
                endpoint_id=f"{protocol}-waiting-async",
                endpoint_name=f"{protocol} waiting async",
                protocol=protocol,
                cache={"ttl": 300, "maxEntries": 4},
            ),
            name=f"Published {protocol} Waiting Async Workflow",
        )

        first_response = client.post(route, json=payload)
        assert first_response.status_code == 202
        assert first_response.headers["X-7Flows-Cache"] == "BYPASS"
        assert first_response.headers["X-7Flows-Run-Status"] == "WAITING"
        first_body = first_response.json()
        assert first_response.headers["X-7Flows-Run-Id"] == first_body["run"]["id"]
        assert first_body["protocol"] == protocol
        assert first_body["request_surface"] == request_surface
        assert first_body["run"]["status"] == "waiting"
        assert first_body.get("response_payload") is None
        first_run_id = first_body["run"]["id"]

        second_response = client.post(route, json=payload)
        assert second_response.status_code == 202
        assert second_response.headers["X-7Flows-Cache"] == "BYPASS"
        assert second_response.headers["X-7Flows-Run-Status"] == "WAITING"
        second_body = second_response.json()
        assert second_response.headers["X-7Flows-Run-Id"] == second_body["run"]["id"]
        assert second_body["run"]["status"] == "waiting"
        assert second_body["run"]["id"] != first_run_id

        activity_response = client.get(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations"
        )
        assert activity_response.status_code == 200
        activity = activity_response.json()
        assert activity["summary"]["total_count"] == 2
        assert activity["summary"]["succeeded_count"] == 2
        assert activity["summary"]["cache_bypass_count"] == 2
        assert activity["summary"]["last_run_status"] == "waiting"
        assert [item["request_surface"] for item in activity["items"]] == [
            request_surface,
            request_surface,
        ]
        assert all(item["run_status"] == "waiting" for item in activity["items"])
        assert all(item["run_waiting_reason"] == "callback pending" for item in activity["items"])
        assert all(item["run_snapshot"]["status"] == "waiting" for item in activity["items"])
        assert all(
            item["run_snapshot"]["waiting_reason"] == "callback pending"
            for item in activity["items"]
        )
        assert all(
            item["run_waiting_lifecycle"]["callback_ticket_count"] == 1
            for item in activity["items"]
        )
        assert all(
            item["run_waiting_lifecycle"]["callback_ticket_status_counts"] == {"pending": 1}
            for item in activity["items"]
        )
        assert all(
            item["run_waiting_lifecycle"]["callback_waiting_lifecycle"]["wait_cycle_count"] == 1
            for item in activity["items"]
        )
        assert all(
            item["run_waiting_lifecycle"]["callback_waiting_lifecycle"]["issued_ticket_count"] == 1
            for item in activity["items"]
        )
        assert all(
            item["run_waiting_lifecycle"]["callback_waiting_lifecycle"]["last_ticket_status"]
            == "pending"
            for item in activity["items"]
        )
    finally:
        reset_plugin_registry()
