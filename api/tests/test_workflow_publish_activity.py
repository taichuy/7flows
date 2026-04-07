import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.run import AICallRecord, NodeRun
from app.models.sensitive_access import (
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import (
    Workflow,
    WorkflowPublishedEndpoint,
    WorkflowPublishedInvocation,
)
from tests.workflow_publish_helpers import (
    legacy_auth_export_snapshot_for_single_published_blocker,
    legacy_auth_mode_contract,
    publishable_definition,
)

pytestmark = pytest.mark.usefixtures(
    "workspace_console_auth", "default_console_route_headers"
)


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
    assert (
        openai_activity["facets"]["api_key_usage"][0]["last_reason_code"]
        == "streaming_unsupported"
    )
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
        "run_status": None,
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
    assert {
        item["value"]: item["count"] for item in all_activity["facets"]["run_status_counts"]
    } == {"succeeded": 3}

    api_key_usage = {item["name"]: item for item in all_activity["facets"]["api_key_usage"]}
    assert api_key_usage["Primary Key"]["invocation_count"] == 2
    assert api_key_usage["Primary Key"]["succeeded_count"] == 2
    assert api_key_usage["Primary Key"]["failed_count"] == 0
    assert api_key_usage["Primary Key"]["rejected_count"] == 0
    assert api_key_usage["Primary Key"]["last_reason_code"] is None
    assert api_key_usage["Fallback Key"]["invocation_count"] == 1
    assert api_key_usage["Fallback Key"]["succeeded_count"] == 1
    assert api_key_usage["Fallback Key"]["failed_count"] == 0
    assert api_key_usage["Fallback Key"]["rejected_count"] == 0
    assert api_key_usage["Fallback Key"]["last_reason_code"] is None
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
    assert all_activity["facets"]["timeline"][0]["run_status_counts"] == [
        {"value": "succeeded", "count": 3}
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
    succeeded_item = next(
        item for item in all_activity["items"] if item["run_id"] is not None
    )
    assert succeeded_item["run_snapshot"]["workflow_id"] == workflow_id
    assert succeeded_item["run_snapshot"]["status"] == "succeeded"
    assert succeeded_item["run_snapshot"]["execution_focus_reason"] is None

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
        "run_status": None,
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
        "run_status": None,
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

    node_runs = sqlite_session.scalars(
        select(NodeRun).where(
            NodeRun.run_id.in_([record.run_id for record in records if record.run_id])
        )
    ).all()
    first_node_run_by_run_id: dict[str, NodeRun] = {}
    for node_run in sorted(node_runs, key=lambda item: (item.created_at, item.id)):
        first_node_run_by_run_id.setdefault(node_run.run_id, node_run)

    for record in records:
        if record.run_id is None:
            continue
        source = record.request_preview["sample"]["source"]
        if source != "alias-mid":
            continue
        sqlite_session.add(
            AICallRecord(
                id="ai-call-alias-mid",
                run_id=record.run_id,
                node_run_id=first_node_run_by_run_id[record.run_id].id,
                role="assistant_distill",
                status="succeeded",
                provider="mock-provider",
                model_id="mock-model",
                input_summary="Summarize published invocation",
                output_summary="Timeline alias response",
                latency_ms=900,
                token_usage={"output_tokens": 18, "total_tokens": 42},
                assistant=True,
                created_at=record.created_at,
                finished_at=record.finished_at,
            )
        )
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
        "run_status": None,
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
            "run_status_counts": [
                {"value": "succeeded", "count": 1},
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
    assert filtered_body["facets"]["monitor"] == {
        "supported_windows": ["hour", "day", "month", "year"],
        "token_output_speed": {
            "status": "available",
            "value": 20.0,
            "unit": "tokens/s",
            "detail": (
                "基于 1 条 ai_call_records 的 output_tokens/completion_tokens 与 "
                "latency_ms 聚合，只覆盖存在稳定 token 事实的 published runs。"
            ),
            "fact_source": "ai_call_records.token_usage + ai_call_records.latency_ms",
            "coverage_count": 1,
        },
        "session_count": {
            "status": "unavailable",
            "value": None,
            "unit": None,
            "detail": (
                "workflow_published_invocations 当前未持久化稳定 session identity；"
                "不能把 invocation/run 数量冒充会话数。"
            ),
            "fact_source": "workflow_published_invocations.request_preview",
            "coverage_count": 0,
        },
        "message_count": {
            "status": "unavailable",
            "value": None,
            "unit": None,
            "detail": (
                "workflow_published_invocations / ai_call_records 当前没有跨 "
                "native/openai/anthropic 的 canonical message count seam；"
                "全部消息数保持 fail-closed。"
            ),
            "fact_source": (
                "workflow_published_invocations.request_preview + "
                "ai_call_records.token_usage"
            ),
            "coverage_count": 0,
        },
        "timeline": [
            {
                "bucket_start": "2026-03-12T09:00:00Z",
                "bucket_end": "2026-03-12T10:00:00Z",
                "token_output_speed": 20.0,
                "session_count": None,
                "message_count": None,
                "token_output_tokens": 18,
                "token_latency_ms": 900,
            }
        ],
    }

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

    source_to_wide_timestamp = {
        "workflow-early": datetime(2024, 1, 15, 8, 0, tzinfo=UTC),
        "alias-mid": datetime(2025, 6, 12, 9, 15, tzinfo=UTC),
        "workflow-rejected": datetime(2026, 2, 5, 9, 45, tzinfo=UTC),
        "path-late": datetime(2026, 12, 1, 10, 0, tzinfo=UTC),
    }
    for record in records:
        source = record.request_preview["sample"]["source"]
        timestamp = source_to_wide_timestamp[source]
        record.created_at = timestamp
        record.finished_at = timestamp
    sqlite_session.commit()

    month_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "created_from": "2025-01-01T00:00:00Z",
            "created_to": "2025-12-31T23:59:59Z",
        },
    )
    assert month_response.status_code == 200
    month_body = month_response.json()
    assert month_body["facets"]["timeline_granularity"] == "month"
    assert month_body["facets"]["timeline"] == [
        {
            "bucket_start": "2025-06-01T00:00:00Z",
            "bucket_end": "2025-07-01T00:00:00Z",
            "total_count": 1,
            "succeeded_count": 1,
            "failed_count": 0,
            "rejected_count": 0,
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
                {"value": "bypass", "count": 1},
            ],
            "run_status_counts": [
                {"value": "succeeded", "count": 1},
            ],
            "request_surface_counts": [
                {"value": "native.alias", "count": 1},
            ],
            "reason_counts": [],
        }
    ]

    year_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations",
        params={
            "created_from": "2024-01-01T00:00:00Z",
            "created_to": "2026-12-31T23:59:59Z",
        },
    )
    assert year_response.status_code == 200
    year_body = year_response.json()
    assert year_body["facets"]["timeline_granularity"] == "year"
    assert year_body["facets"]["timeline"] == [
        {
            "bucket_start": "2026-01-01T00:00:00Z",
            "bucket_end": "2027-01-01T00:00:00Z",
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
            "run_status_counts": [
                {"value": "succeeded", "count": 1},
            ],
            "request_surface_counts": [
                {"value": "native.workflow", "count": 1},
                {"value": "native.path", "count": 1},
            ],
            "reason_counts": [
                {"value": "api_key_invalid", "count": 1},
            ],
        },
        {
            "bucket_start": "2025-01-01T00:00:00Z",
            "bucket_end": "2026-01-01T00:00:00Z",
            "total_count": 1,
            "succeeded_count": 1,
            "failed_count": 0,
            "rejected_count": 0,
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
                {"value": "bypass", "count": 1},
            ],
            "run_status_counts": [
                {"value": "succeeded", "count": 1},
            ],
            "request_surface_counts": [
                {"value": "native.alias", "count": 1},
            ],
            "reason_counts": [],
        },
        {
            "bucket_start": "2024-01-01T00:00:00Z",
            "bucket_end": "2025-01-01T00:00:00Z",
            "total_count": 1,
            "succeeded_count": 1,
            "failed_count": 0,
            "rejected_count": 0,
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
                {"value": "bypass", "count": 1},
            ],
            "run_status_counts": [
                {"value": "succeeded", "count": 1},
            ],
            "request_surface_counts": [
                {"value": "native.workflow", "count": 1},
            ],
            "reason_counts": [],
        },
    ]


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
        "run_status": None,
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
    assert filtered_body["facets"]["timeline"][0]["run_status_counts"] == [
        {"value": "succeeded", "count": 1}
    ]


def _seed_sensitive_run_access(
    sqlite_session,
    *,
    run_id: str,
    node_run_id: str,
    sensitivity_level: str,
) -> None:
    now = datetime.now(UTC)
    resource = SensitiveResourceRecord(
        id=f"resource-{run_id}",
        label=f"Publish export sensitive resource {sensitivity_level}",
        description="Seeded sensitive resource for publish export tests.",
        sensitivity_level=sensitivity_level,
        source="workflow_context",
        metadata_payload={
            "run_id": run_id,
            "artifact_type": "json",
            "source_node_id": "tool",
        },
        created_at=now,
        updated_at=now,
    )
    sqlite_session.add(resource)
    sqlite_session.add(
        SensitiveAccessRequestRecord(
            id=f"access-{run_id}",
            run_id=run_id,
            node_run_id=node_run_id,
            requester_type="workflow",
            requester_id="toolNode",
            resource_id=resource.id,
            action_type="read",
            purpose_text="seed publish export sensitivity",
            decision="allow",
            reason_code="seeded_publish_export_sensitive_access",
            created_at=now,
            decided_at=now,
        )
    )
    sqlite_session.commit()


def test_export_published_endpoint_invocations_supports_json_and_jsonl(
    client: TestClient,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Invocation Export Workflow",
            "definition": publishable_definition(
                answer="export",
                alias="native-export-audit",
                path="/team/native-export-audit",
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

    workflow_invoke = client.post(
        f"/v1/workflows/{workflow_id}/published-endpoints/native-chat/run",
        json={"input_payload": {"source": "workflow"}},
    )
    assert workflow_invoke.status_code == 200

    alias_invoke = client.post(
        "/v1/published-aliases/native-export-audit/run",
        json={"input_payload": {"source": "alias"}},
    )
    assert alias_invoke.status_code == 200

    path_invoke = client.post(
        "/v1/published-paths/team/native-export-audit",
        json={"input_payload": {"source": "path"}},
    )
    assert path_invoke.status_code == 200

    export_json_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={
            "request_source": "alias",
            "limit": 10,
            "format": "json",
        },
    )
    assert export_json_response.status_code == 200
    assert "published-native-export-audit-native-chat-invocations.json" in (
        export_json_response.headers["content-disposition"]
    )
    export_json_body = export_json_response.json()
    assert export_json_body["export"]["format"] == "json"
    assert export_json_body["export"]["limit"] == 10
    assert export_json_body["filters"]["request_source"] == "alias"
    assert export_json_body["summary"]["total_count"] == 1
    assert len(export_json_body["items"]) == 1
    assert export_json_body["items"][0]["request_source"] == "alias"
    assert export_json_body["items"][0]["run_snapshot"]["status"] == "succeeded"
    assert export_json_body["items"][0]["run_snapshot"]["execution_focus_reason"] is None

    export_jsonl_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={
            "request_source": "path",
            "limit": 10,
            "format": "jsonl",
        },
    )
    assert export_jsonl_response.status_code == 200
    assert export_jsonl_response.headers["content-type"].startswith("application/x-ndjson")
    jsonl_lines = export_jsonl_response.text.strip().splitlines()
    assert len(jsonl_lines) == 2
    meta_record = json.loads(jsonl_lines[0])
    invocation_record = json.loads(jsonl_lines[1])
    assert meta_record["record_type"] == "published_invocation_export"
    assert meta_record["filters"]["request_source"] == "path"
    assert invocation_record["record_type"] == "invocation"
    assert invocation_record["request_source"] == "path"
    assert invocation_record["run_snapshot"]["status"] == "succeeded"
    assert invocation_record["run_snapshot"]["execution_focus_reason"] is None


def test_export_published_endpoint_invocations_includes_workflow_legacy_auth_handoff(
    client: TestClient,
    sqlite_session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Invocation Export Governance Workflow",
            "definition": publishable_definition(
                answer="export-governance",
                alias="native-export-governance",
                path="/team/native-export-governance",
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
        json={"input_payload": {"source": "workflow"}},
    )
    assert invoke_response.status_code == 200

    binding_record = sqlite_session.get(WorkflowPublishedEndpoint, binding["id"])
    assert binding_record is not None
    binding_record.auth_mode = "token"
    sqlite_session.commit()

    export_json_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={
            "request_source": "workflow",
            "limit": 10,
            "format": "json",
        },
    )
    assert export_json_response.status_code == 200
    export_json_body = export_json_response.json()
    expected_governance = legacy_auth_export_snapshot_for_single_published_blocker(
        generated_at=export_json_body["legacy_auth_governance"]["generated_at"],
        workflow_id=workflow_id,
        workflow_name="Published Invocation Export Governance Workflow",
        workflow_version="0.1.0",
        binding_id=binding["id"],
        endpoint_id="native-chat",
        endpoint_name="Native Chat",
    )
    assert export_json_body["legacy_auth_governance"] == expected_governance

    export_jsonl_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={
            "request_source": "workflow",
            "limit": 10,
            "format": "jsonl",
        },
    )
    assert export_jsonl_response.status_code == 200
    jsonl_lines = export_jsonl_response.text.strip().splitlines()
    assert len(jsonl_lines) == 4
    meta_record = json.loads(jsonl_lines[0])
    governance_record = json.loads(jsonl_lines[1])
    governance_binding_record = json.loads(jsonl_lines[2])
    invocation_record = json.loads(jsonl_lines[3])
    assert meta_record["legacy_auth_governance"] == {
        "binding_count": expected_governance["binding_count"],
        "auth_mode_contract": expected_governance["auth_mode_contract"],
        "workflow": expected_governance["workflow"],
        "summary": expected_governance["summary"],
    }
    assert governance_record["record_type"] == "workflow_legacy_auth_governance"
    assert governance_record["binding_count"] == 1
    assert governance_record["auth_mode_contract"] == legacy_auth_mode_contract()
    assert governance_record["workflow"]["workflow_id"] == workflow_id
    assert governance_binding_record == {
        "record_type": "workflow_legacy_auth_binding",
        "bucket": "published_blockers",
        **expected_governance["buckets"]["published_blockers"][0],
    }
    assert invocation_record["record_type"] == "invocation"
    assert invocation_record["request_source"] == "workflow"


def test_export_published_endpoint_invocations_keep_missing_tool_scope_in_legacy_auth_handoff(
    client: TestClient,
    sqlite_session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Invocation Export Catalog Gap Workflow",
            "definition": publishable_definition(
                answer="export-catalog-gap",
                alias="native-export-catalog-gap",
                path="/team/native-export-catalog-gap",
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
        json={"input_payload": {"source": "workflow"}},
    )
    assert invoke_response.status_code == 200

    workflow_record = sqlite_session.get(Workflow, workflow_id)
    assert workflow_record is not None
    workflow_record.definition = {
        "nodes": [
            {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
            {
                "id": "toolNode",
                "type": "toolNode",
                "name": "Catalog Gap Tool",
                "config": {
                    "tool": {
                        "toolId": "native.catalog-gap",
                        "ecosystem": "native",
                    }
                },
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
                "alias": "native-export-catalog-gap",
                "path": "/team/native-export-catalog-gap",
                "protocol": "native",
                "authMode": "internal",
                "streaming": False,
                "inputSchema": {"type": "object"},
                "workflowVersion": "0.1.0",
            }
        ],
    }
    binding_record = sqlite_session.get(WorkflowPublishedEndpoint, binding["id"])
    assert binding_record is not None
    binding_record.auth_mode = "token"
    sqlite_session.commit()

    export_json_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={
            "request_source": "workflow",
            "limit": 10,
            "format": "json",
        },
    )
    assert export_json_response.status_code == 200
    export_json_body = export_json_response.json()
    expected_governance = legacy_auth_export_snapshot_for_single_published_blocker(
        generated_at=export_json_body["legacy_auth_governance"]["generated_at"],
        workflow_id=workflow_id,
        workflow_name="Published Invocation Export Catalog Gap Workflow",
        workflow_version="0.1.0",
        binding_id=binding["id"],
        endpoint_id="native-chat",
        endpoint_name="Native Chat",
        missing_tool_ids=["native.catalog-gap"],
    )
    assert export_json_body["legacy_auth_governance"] == expected_governance

    export_jsonl_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={
            "request_source": "workflow",
            "limit": 10,
            "format": "jsonl",
        },
    )
    assert export_jsonl_response.status_code == 200
    jsonl_lines = export_jsonl_response.text.strip().splitlines()
    assert len(jsonl_lines) == 4
    meta_record = json.loads(jsonl_lines[0])
    governance_record = json.loads(jsonl_lines[1])
    governance_binding_record = json.loads(jsonl_lines[2])
    assert meta_record["legacy_auth_governance"]["workflow"]["workflow_follow_up"] == {
        "workflow_detail_href": f"/workflows/{workflow_id}?definition_issue=legacy_publish_auth",
        "workflow_detail_label": "回到 workflow 编辑器",
        "definition_issue": "legacy_publish_auth",
    }
    assert governance_record["workflow"]["workflow_follow_up"] == {
        "workflow_detail_href": f"/workflows/{workflow_id}?definition_issue=legacy_publish_auth",
        "workflow_detail_label": "回到 workflow 编辑器",
        "definition_issue": "legacy_publish_auth",
    }
    assert governance_binding_record == {
        "record_type": "workflow_legacy_auth_binding",
        "bucket": "published_blockers",
        **expected_governance["buckets"]["published_blockers"][0],
    }


def test_export_published_endpoint_invocations_requires_approval_for_sensitive_runs(
    client: TestClient,
    sqlite_session,
) -> None:
    create_response = client.post(
        "/api/workflows",
        json={
            "name": "Published Invocation Export Sensitive Workflow",
            "definition": publishable_definition(
                answer="sensitive-export",
                alias="native-sensitive-export",
                path="/team/native-sensitive-export",
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
        json={"input_payload": {"question": "hello"}},
    )
    assert invoke_response.status_code == 200

    invocation = sqlite_session.scalars(
        select(WorkflowPublishedInvocation)
        .where(WorkflowPublishedInvocation.binding_id == binding["id"])
        .order_by(
            WorkflowPublishedInvocation.created_at.desc(),
            WorkflowPublishedInvocation.id.desc(),
        )
    ).first()
    assert invocation is not None
    assert invocation.run_id is not None

    node_run = sqlite_session.scalars(
        select(NodeRun)
        .where(NodeRun.run_id == invocation.run_id)
        .order_by(NodeRun.created_at.asc(), NodeRun.id.asc())
    ).first()
    assert node_run is not None

    _seed_sensitive_run_access(
        sqlite_session,
        run_id=invocation.run_id,
        node_run_id=node_run.id,
        sensitivity_level="L3",
    )

    export_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={"requester_id": "ops-reviewer"},
    )
    assert export_response.status_code == 409
    export_body = export_response.json()
    assert export_body["detail"] == (
        "Published invocation export requires approval before the payload can be exported."
    )
    assert export_body["resource"]["source"] == "workspace_resource"
    assert export_body["resource"]["metadata"]["resource_kind"] == "published_invocation_export"
    assert export_body["resource"]["metadata"]["binding_id"] == binding["id"]
    assert export_body["access_request"]["action_type"] == "export"
    assert export_body["access_request"]["decision"] == "require_approval"
    assert export_body["approval_ticket"]["status"] == "pending"
    assert export_body["outcome_explanation"]["primary_signal"]
    assert "审批" in export_body["outcome_explanation"]["follow_up"]
    assert export_body["run_snapshot"]["status"] == "succeeded"
    assert export_body["run_snapshot"]["workflow_id"] == workflow_id
    assert export_body["run_follow_up"]["affected_run_count"] == 1
    assert export_body["run_follow_up"]["sampled_run_count"] == 1
    assert export_body["run_follow_up"]["explanation"]["primary_signal"]

    approval_response = client.post(
        f"/api/sensitive-access/approval-tickets/{export_body['approval_ticket']['id']}/decision",
        json={"status": "approved", "approved_by": "ops-manager"},
    )
    assert approval_response.status_code == 200

    approved_export_response = client.get(
        f"/api/workflows/{workflow_id}/published-endpoints/{binding['id']}/invocations/export",
        params={"requester_id": "ops-reviewer"},
    )
    assert approved_export_response.status_code == 200
    approved_body = approved_export_response.json()
    assert approved_body["summary"]["total_count"] == 1
    assert approved_body["items"][0]["id"] == invocation.id
