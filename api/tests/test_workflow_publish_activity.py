from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.workflow import WorkflowPublishedInvocation
from tests.workflow_publish_helpers import publishable_definition


def test_protocol_streaming_rejections_are_recorded_in_publish_audit(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Protocol Streaming Audit Workflow",
            "definition": {
                **publishable_definition(
                    endpoint_id="openai-chat",
                    endpoint_name="OpenAI Chat",
                    protocol="openai",
                    alias="openai-stream-audit",
                    path="/openai-stream-audit",
                    auth_mode="api_key",
                ),
                "publish": [
                    {
                        "id": "openai-chat",
                        "name": "OpenAI Chat",
                        "alias": "openai-stream-audit",
                        "path": "/openai-stream-audit",
                        "protocol": "openai",
                        "workflowVersion": "0.1.0",
                        "authMode": "api_key",
                        "streaming": False,
                        "inputSchema": {"type": "object"},
                    },
                    {
                        "id": "anthropic-chat",
                        "name": "Anthropic Chat",
                        "alias": "anthropic-stream-audit",
                        "path": "/anthropic-stream-audit",
                        "protocol": "anthropic",
                        "workflowVersion": "0.1.0",
                        "authMode": "internal",
                        "streaming": False,
                        "inputSchema": {"type": "object"},
                    },
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
    bindings = {item["endpoint_id"]: item for item in bindings_response.json()}

    api_key_response = client.post(
        f"/api/workflows/{workflow_id}/published-endpoints/{bindings['openai-chat']['id']}/api-keys",
        json={"name": "Streaming Audit Key"},
    )
    assert api_key_response.status_code == 201
    api_key = api_key_response.json()

    for binding in bindings.values():
        publish_response = client.patch(
            f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/lifecycle",
            json={"status": "published"},
        )
        assert publish_response.status_code == 200

    chat_stream_response = client.post(
        "/v1/chat/completions",
        json={
            "model": "openai-stream-audit",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert chat_stream_response.status_code == 422

    response_stream_response = client.post(
        "/v1/responses",
        json={
            "model": "openai-stream-audit",
            "input": "hello",
            "stream": True,
        },
        headers={"x-api-key": api_key["secret_key"]},
    )
    assert response_stream_response.status_code == 422

    anthropic_stream_response = client.post(
        "/v1/messages",
        json={
            "model": "anthropic-stream-audit",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
            "max_tokens": 128,
        },
    )
    assert anthropic_stream_response.status_code == 422

    openai_activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{bindings['openai-chat']['id']}/invocations"
    )
    assert openai_activity_response.status_code == 200
    openai_activity = openai_activity_response.json()
    assert openai_activity["summary"]["total_count"] == 2
    assert openai_activity["summary"]["rejected_count"] == 2
    assert openai_activity["summary"]["last_reason_code"] == "streaming_unsupported"
    assert {
        item["value"]: item["count"] for item in openai_activity["facets"]["reason_counts"]
    } == {"streaming_unsupported": 2}
    assert {
        item["value"]: item["count"]
        for item in openai_activity["facets"]["request_surface_counts"]
    } == {
        "openai.chat.completions": 1,
        "openai.responses": 1,
    }
    assert {
        item["name"]: item["invocation_count"]
        for item in openai_activity["facets"]["api_key_usage"]
    } == {"Streaming Audit Key": 2}
    assert [item["request_surface"] for item in openai_activity["items"]] == [
        "openai.responses",
        "openai.chat.completions",
    ]

    anthropic_activity_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{bindings['anthropic-chat']['id']}/invocations"
    )
    assert anthropic_activity_response.status_code == 200
    anthropic_activity = anthropic_activity_response.json()
    assert anthropic_activity["summary"]["total_count"] == 1
    assert anthropic_activity["summary"]["rejected_count"] == 1
    assert anthropic_activity["summary"]["last_reason_code"] == "streaming_unsupported"
    assert anthropic_activity["items"][0]["request_surface"] == "anthropic.messages"
    assert anthropic_activity["items"][0]["reason_code"] == "streaming_unsupported"


def test_list_published_endpoint_invocations_supports_filters_and_api_key_audit(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Audit Workflow",
            "definition": publishable_definition(
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
        "request_surface": None,
        "cache_status": None,
        "api_key_id": None,
        "reason_code": None,
        "created_from": None,
        "created_to": None,
    }
    assert all_activity["summary"]["total_count"] == 4
    assert all_activity["summary"]["succeeded_count"] == 3
    assert all_activity["summary"]["rejected_count"] == 1
    assert all_activity["summary"]["last_reason_code"] == "api_key_invalid"

    status_counts = {
        item["value"]: item["count"] for item in all_activity["facets"]["status_counts"]
    }
    assert status_counts == {"succeeded": 3, "failed": 0, "rejected": 1}

    request_source_counts = {
        item["value"]: item["count"] for item in all_activity["facets"]["request_source_counts"]
    }
    assert request_source_counts == {"workflow": 2, "alias": 1, "path": 1}
    request_surface_counts = {
        item["value"]: item["count"] for item in all_activity["facets"]["request_surface_counts"]
    }
    assert request_surface_counts == {
        "native.workflow": 2,
        "native.alias": 1,
        "native.path": 1,
    }
    assert {
        item["value"]: item["count"] for item in all_activity["facets"]["cache_status_counts"]
    } == {"hit": 0, "miss": 0, "bypass": 4}

    api_key_usage = {item["name"]: item for item in all_activity["facets"]["api_key_usage"]}
    assert api_key_usage["Primary Key"]["invocation_count"] == 2
    assert api_key_usage["Primary Key"]["succeeded_count"] == 2
    assert api_key_usage["Primary Key"]["failed_count"] == 0
    assert api_key_usage["Primary Key"]["rejected_count"] == 0
    assert api_key_usage["Fallback Key"]["invocation_count"] == 1
    assert api_key_usage["Fallback Key"]["succeeded_count"] == 1
    assert api_key_usage["Fallback Key"]["failed_count"] == 0
    assert api_key_usage["Fallback Key"]["rejected_count"] == 0
    assert {
        item["value"]: item["count"] for item in all_activity["facets"]["reason_counts"]
    } == {"api_key_invalid": 1}
    assert (
        all_activity["facets"]["recent_failure_reasons"][0]["message"]
        == "Published endpoint API key is invalid."
    )
    assert all_activity["facets"]["timeline_granularity"] in {"hour", "day"}
    assert len(all_activity["facets"]["timeline"]) >= 1
    assert all_activity["facets"]["timeline"][0]["request_surface_counts"]
    assert all_activity["facets"]["timeline"][0]["reason_counts"] == [
        {"value": "api_key_invalid", "count": 1}
    ]
    assert all_activity["facets"]["timeline"][0]["api_key_counts"] == [
        {
            "api_key_id": primary_key["id"],
            "name": "Primary Key",
            "key_prefix": primary_key["key_prefix"],
            "count": 2,
        },
        {
            "api_key_id": fallback_key["id"],
            "name": "Fallback Key",
            "key_prefix": fallback_key["key_prefix"],
            "count": 1,
        },
    ]
    assert all_activity["items"][0]["reason_code"] == "api_key_invalid"

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
        "request_surface": None,
        "cache_status": None,
        "api_key_id": primary_key["id"],
        "reason_code": None,
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

    surface_filtered_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "request_surface": "native.workflow",
        },
    )
    assert surface_filtered_response.status_code == 200
    surface_filtered = surface_filtered_response.json()
    assert surface_filtered["filters"] == {
        "status": None,
        "request_source": None,
        "request_surface": "native.workflow",
        "cache_status": None,
        "api_key_id": None,
        "reason_code": None,
        "created_from": None,
        "created_to": None,
    }
    assert surface_filtered["summary"]["total_count"] == 2
    assert [item["request_surface"] for item in surface_filtered["items"]] == [
        "native.workflow",
        "native.workflow",
    ]


def test_list_published_endpoint_invocations_supports_time_window_and_timeline(
    client: TestClient,
    sqlite_session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Native Audit Timeline Workflow",
            "definition": publishable_definition(
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
        "request_surface": None,
        "cache_status": None,
        "api_key_id": None,
        "reason_code": None,
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
            "api_key_counts": [
                {
                    "api_key_id": api_key["id"],
                    "name": "Timeline Key",
                    "key_prefix": api_key["key_prefix"],
                    "count": 1,
                }
            ],
            "cache_status_counts": [
                {"value": "hit", "count": 0},
                {"value": "miss", "count": 0},
                {"value": "bypass", "count": 2},
            ],
            "request_surface_counts": [
                {"value": "native.workflow", "count": 1},
                {"value": "native.alias", "count": 1},
            ],
            "reason_counts": [
                {"value": "api_key_invalid", "count": 1},
            ],
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


def test_list_published_endpoint_invocations_supports_cache_status_filter(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Cache Audit Workflow",
            "definition": publishable_definition(
                answer="cached",
                alias="native-cache-audit",
                path="/team/native-cache-audit",
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

    second_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "same", "ignored": 2}},
    )
    assert second_response.status_code == 200
    assert second_response.headers["X-7Flows-Cache"] == "HIT"

    third_response = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"question": "different", "ignored": 3}},
    )
    assert third_response.status_code == 200
    assert third_response.headers["X-7Flows-Cache"] == "MISS"

    filtered_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={"cache_status": "hit"},
    )
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["filters"] == {
        "status": None,
        "request_source": None,
        "request_surface": None,
        "cache_status": "hit",
        "api_key_id": None,
        "reason_code": None,
        "created_from": None,
        "created_to": None,
    }
    assert filtered_body["summary"]["total_count"] == 1
    assert filtered_body["summary"]["cache_hit_count"] == 1
    assert filtered_body["summary"]["cache_miss_count"] == 0
    assert filtered_body["summary"]["cache_bypass_count"] == 0
    assert filtered_body["items"][0]["cache_status"] == "hit"
    assert filtered_body["facets"]["timeline"][0]["cache_status_counts"] == [
        {"value": "hit", "count": 1},
        {"value": "miss", "count": 0},
        {"value": "bypass", "count": 0},
    ]
