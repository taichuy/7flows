from __future__ import annotations

import json
from datetime import UTC, datetime

from app.models.workflow import WorkflowPublishedEndpoint
from app.schemas.operator_follow_up import OperatorRunFocusToolCallItem, OperatorRunSnapshot
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationFacets,
    PublishedEndpointInvocationFilters,
    PublishedEndpointInvocationItem,
    PublishedEndpointInvocationListResponse,
    PublishedEndpointInvocationSummary,
)
from app.services.published_invocation_exports import (
    build_published_invocation_export_payload,
    serialize_published_invocation_export_jsonl,
)


def build_binding() -> WorkflowPublishedEndpoint:
    return WorkflowPublishedEndpoint(
        id="binding-1",
        workflow_id="workflow-1",
        workflow_version_id="workflow-version-1",
        workflow_version="1.0.0",
        target_workflow_version_id="workflow-version-1",
        target_workflow_version="1.0.0",
        compiled_blueprint_id="blueprint-1",
        endpoint_id="endpoint-1",
        endpoint_name="Published Search",
        endpoint_alias="published-search",
        route_path="/published/search",
        protocol="openai",
        auth_mode="api_key",
        streaming=False,
        lifecycle_status="published",
        input_schema={},
        output_schema=None,
        rate_limit_policy=None,
        cache_policy=None,
    )


def build_response() -> PublishedEndpointInvocationListResponse:
    run_snapshot = OperatorRunSnapshot(
        workflow_id="workflow-1",
        status="waiting",
        current_node_id="tool_wait",
        waiting_reason="waiting callback",
        execution_focus_node_id="tool_wait",
        execution_focus_node_run_id="node-run-1",
        execution_focus_node_name="Tool Wait",
        execution_focus_node_type="tool",
        execution_focus_tool_call_count=1,
        execution_focus_tool_calls=[
            OperatorRunFocusToolCallItem(
                id="tool-call-1",
                tool_id="native.search",
                tool_name="Native Search",
                phase="execute",
                status="waiting",
                effective_execution_class="sandbox",
                execution_executor_ref="tool:compat-adapter:dify-default",
                execution_sandbox_backend_id="sandbox-default",
                execution_sandbox_backend_executor_ref="sandbox-backend:sandbox-default",
                execution_sandbox_runner_kind="container",
                response_summary="callback payload queued",
                response_content_type="application/json",
            )
        ],
    )
    item = PublishedEndpointInvocationItem(
        id="invocation-1",
        workflow_id="workflow-1",
        binding_id="binding-1",
        endpoint_id="endpoint-1",
        endpoint_alias="published-search",
        route_path="/published/search",
        protocol="openai",
        auth_mode="api_key",
        request_source="workflow",
        request_surface="native.workflow",
        status="succeeded",
        cache_status="miss",
        run_id="run-1",
        run_status="waiting",
        run_current_node_id="tool_wait",
        run_waiting_reason="waiting callback",
        run_snapshot=run_snapshot,
        request_preview={"key_count": 1, "keys": ["query"]},
        response_preview={"ok": True},
        duration_ms=1500,
        created_at=datetime(2026, 3, 20, 10, 0, tzinfo=UTC),
        finished_at=datetime(2026, 3, 20, 10, 0, 1, tzinfo=UTC),
    )
    return PublishedEndpointInvocationListResponse(
        filters=PublishedEndpointInvocationFilters(),
        summary=PublishedEndpointInvocationSummary(total_count=1, succeeded_count=1),
        facets=PublishedEndpointInvocationFacets(),
        items=[item],
    )


def test_build_published_invocation_export_payload_preserves_canonical_run_snapshot_execution_facts() -> None:
    payload = build_published_invocation_export_payload(
        binding=build_binding(),
        export_format="json",
        limit=50,
        response=build_response(),
    )

    assert payload["items"][0]["run_snapshot"]["execution_focus_tool_calls"][0] == {
        "id": "tool-call-1",
        "tool_id": "native.search",
        "tool_name": "Native Search",
        "phase": "execute",
        "status": "waiting",
        "requested_execution_class": None,
        "requested_execution_source": None,
        "requested_execution_profile": None,
        "requested_execution_timeout_ms": None,
        "requested_execution_network_policy": None,
        "requested_execution_filesystem_policy": None,
        "requested_execution_dependency_mode": None,
        "requested_execution_builtin_package_set": None,
        "requested_execution_dependency_ref": None,
        "requested_execution_backend_extensions": None,
        "effective_execution_class": "sandbox",
        "execution_executor_ref": "tool:compat-adapter:dify-default",
        "execution_sandbox_backend_id": "sandbox-default",
        "execution_sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
        "execution_sandbox_runner_kind": "container",
        "execution_blocking_reason": None,
        "execution_fallback_reason": None,
        "response_summary": "callback payload queued",
        "response_content_type": "application/json",
        "raw_ref": None,
    }


def test_serialize_published_invocation_export_jsonl_keeps_run_snapshot_execution_facts() -> None:
    payload = build_published_invocation_export_payload(
        binding=build_binding(),
        export_format="jsonl",
        limit=50,
        response=build_response(),
    )

    lines = serialize_published_invocation_export_jsonl(payload).strip().splitlines()

    assert len(lines) == 2
    invocation = json.loads(lines[1])
    assert invocation["record_type"] == "invocation"
    assert invocation["run_snapshot"]["execution_focus_tool_calls"][0][
        "effective_execution_class"
    ] == "sandbox"
    assert invocation["run_snapshot"]["execution_focus_tool_calls"][0][
        "execution_executor_ref"
    ] == "tool:compat-adapter:dify-default"
    assert invocation["run_snapshot"]["execution_focus_tool_calls"][0][
        "execution_sandbox_backend_id"
    ] == "sandbox-default"
    assert invocation["run_snapshot"]["execution_focus_tool_calls"][0][
        "execution_sandbox_runner_kind"
    ] == "container"
