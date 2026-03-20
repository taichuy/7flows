from datetime import UTC, datetime
from types import SimpleNamespace

from app.api.routes.published_endpoint_invocation_support import (
    build_waiting_lifecycle_lookup,
    serialize_published_invocation_item,
)
from app.models.run import NodeRun, Run, RunCallbackTicket
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.services.sensitive_access_timeline import SensitiveAccessTimelineSnapshot
from app.services.sensitive_access_types import SensitiveAccessRequestBundle


def test_build_waiting_lifecycle_lookup_keeps_terminated_callback_context_without_waiting_reason(
) -> None:
    now = datetime(2026, 3, 17, 18, 0, tzinfo=UTC)
    terminated_at = datetime(2026, 3, 17, 18, 5, tzinfo=UTC)
    run = Run(
        id="run-terminated-callback",
        workflow_id="wf-terminated-callback",
        workflow_version="0.1.0",
        status="failed",
        input_payload={"question": "hello"},
        checkpoint_payload={"waiting_node_run_id": None},
        current_node_id=None,
        error_message="Callback waiting terminated after 2 expired ticket cycle(s) (max 2).",
        started_at=now,
        finished_at=terminated_at,
        created_at=now,
    )
    node_run = NodeRun(
        id="node-run-terminated-callback",
        run_id=run.id,
        node_id="tool_wait",
        node_name="Tool Wait",
        node_type="tool",
        status="failed",
        phase="failed",
        retry_count=0,
        input_payload={"question": "hello"},
        output_payload=None,
        checkpoint_payload={
            "callback_waiting_lifecycle": {
                "wait_cycle_count": 2,
                "issued_ticket_count": 2,
                "expired_ticket_count": 2,
                "consumed_ticket_count": 0,
                "canceled_ticket_count": 0,
                "late_callback_count": 0,
                "resume_schedule_count": 1,
                "max_expired_ticket_count": 2,
                "terminated": True,
                "termination_reason": "callback_waiting_max_expired_tickets_reached",
                "terminated_at": terminated_at.isoformat().replace("+00:00", "Z"),
                "last_ticket_status": "expired",
                "last_ticket_reason": "callback_ticket_expired",
                "last_ticket_updated_at": terminated_at.isoformat().replace("+00:00", "Z"),
                "last_late_callback_status": None,
                "last_late_callback_reason": None,
                "last_late_callback_at": None,
                "last_resume_delay_seconds": 5.0,
                "last_resume_reason": "callback pending",
                "last_resume_source": "callback_ticket_monitor",
                "last_resume_backoff_attempt": 2,
            }
        },
        working_context={},
        evidence_context=None,
        artifact_refs=[],
        error_message=run.error_message,
        waiting_reason="callback pending",
        started_at=now,
        phase_started_at=terminated_at,
        finished_at=terminated_at,
        created_at=now,
    )
    callback_ticket = RunCallbackTicket(
        id="ticket-terminated-callback",
        run_id=run.id,
        node_run_id=node_run.id,
        tool_call_id=None,
        tool_id="native.search",
        tool_call_index=0,
        waiting_status="waiting_callback",
        status="expired",
        reason="callback pending",
        callback_payload={"reason": "callback_ticket_expired"},
        created_at=now,
        expires_at=terminated_at,
        expired_at=terminated_at,
    )

    waiting_reason_lookup, waiting_lifecycle_lookup = build_waiting_lifecycle_lookup(
        {run.id: run},
        [node_run],
        [callback_ticket],
    )

    waiting_lifecycle = waiting_lifecycle_lookup[run.id]
    assert waiting_reason_lookup[run.id] is None
    assert waiting_lifecycle is not None
    assert waiting_lifecycle.node_run_id == node_run.id
    assert waiting_lifecycle.node_status == "failed"
    assert waiting_lifecycle.waiting_reason is None
    assert waiting_lifecycle.callback_ticket_count == 1
    assert waiting_lifecycle.callback_ticket_status_counts == {"expired": 1}
    assert waiting_lifecycle.callback_waiting_lifecycle is not None
    assert waiting_lifecycle.callback_waiting_lifecycle.terminated is True
    assert (
        waiting_lifecycle.callback_waiting_lifecycle.termination_reason
        == "callback_waiting_max_expired_tickets_reached"
    )


def test_build_waiting_lifecycle_lookup_includes_blocking_sensitive_access_summary() -> None:
    now = datetime(2026, 3, 18, 9, 0, tzinfo=UTC)
    run = Run(
        id="run-sensitive-summary",
        workflow_id="wf-sensitive-summary",
        workflow_version="0.1.0",
        status="waiting_callback",
        input_payload={"question": "hello"},
        checkpoint_payload={"waiting_node_run_id": "node-run-sensitive-summary"},
        current_node_id="tool_wait",
        error_message=None,
        started_at=now,
        finished_at=None,
        created_at=now,
    )
    node_run = NodeRun(
        id="node-run-sensitive-summary",
        run_id=run.id,
        node_id="tool_wait",
        node_name="Tool Wait",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        retry_count=0,
        input_payload={"question": "hello"},
        output_payload=None,
        checkpoint_payload={},
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
        id="ticket-sensitive-summary",
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
        expires_at=now,
    )
    resource = SensitiveResourceRecord(
        id="resource-sensitive-summary",
        label="Search tool",
        description="Requires approval",
        sensitivity_level="L3",
        source="local_capability",
        metadata_payload={"tool_id": "native.search"},
        created_at=now,
        updated_at=now,
    )
    access_request = SensitiveAccessRequestRecord(
        id="access-sensitive-summary",
        run_id=run.id,
        node_run_id=node_run.id,
        requester_type="workflow",
        requester_id=node_run.node_id,
        resource_id=resource.id,
        action_type="invoke",
        purpose_text="Invoke search tool",
        decision="require_approval",
        reason_code="approval_required_high_sensitive_access",
        created_at=now,
        decided_at=None,
    )
    approval_ticket = ApprovalTicketRecord(
        id="approval-sensitive-summary",
        access_request_id=access_request.id,
        run_id=run.id,
        node_run_id=node_run.id,
        status="pending",
        waiting_status="waiting",
        approved_by=None,
        decided_at=None,
        expires_at=now,
        created_at=now,
    )
    notification = NotificationDispatchRecord(
        id="notification-sensitive-summary",
        approval_ticket_id=approval_ticket.id,
        channel="in_app",
        target="sensitive-access-inbox",
        status="failed",
        delivered_at=None,
        error="inbox unavailable",
        created_at=now,
    )
    bundle = SensitiveAccessRequestBundle(
        resource=resource,
        access_request=access_request,
        approval_ticket=approval_ticket,
        notifications=[notification],
    )
    sensitive_access_snapshot = SensitiveAccessTimelineSnapshot(
        bundles=[bundle],
        by_node_run={node_run.id: [bundle]},
        request_count=1,
        approval_ticket_count=1,
        notification_count=1,
        decision_counts={"require_approval": 1},
        approval_status_counts={"pending": 1},
        notification_status_counts={"failed": 1},
    )

    _, waiting_lifecycle_lookup = build_waiting_lifecycle_lookup(
        {run.id: run},
        [node_run],
        [callback_ticket],
        {run.id: sensitive_access_snapshot},
    )

    waiting_lifecycle = waiting_lifecycle_lookup[run.id]
    assert waiting_lifecycle is not None
    assert waiting_lifecycle.sensitive_access_summary is not None
    assert waiting_lifecycle.sensitive_access_summary.request_count == 1
    assert waiting_lifecycle.sensitive_access_summary.approval_ticket_count == 1
    assert waiting_lifecycle.sensitive_access_summary.pending_approval_count == 1
    assert waiting_lifecycle.sensitive_access_summary.failed_notification_count == 1


def test_build_waiting_lifecycle_lookup_prefers_latest_current_waiting_node_run() -> None:
    now = datetime(2026, 3, 20, 11, 0, tzinfo=UTC)
    run = Run(
        id="run-current-node-waiting",
        workflow_id="wf-current-node-waiting",
        workflow_version="0.1.0",
        status="waiting_callback",
        input_payload={"question": "hello"},
        checkpoint_payload={"waiting_node_run_id": "node-run-current-new"},
        current_node_id="tool_wait",
        error_message=None,
        started_at=now,
        finished_at=None,
        created_at=now,
    )
    current_terminated_node_run = NodeRun(
        id="node-run-current-old",
        run_id=run.id,
        node_id="tool_wait",
        node_name="Tool Wait",
        node_type="tool",
        status="failed",
        phase="failed",
        retry_count=0,
        input_payload={},
        output_payload=None,
        checkpoint_payload={
            "callback_waiting_lifecycle": {
                "terminated": True,
                "termination_reason": "callback_waiting_max_expired_tickets_reached",
            }
        },
        working_context={},
        evidence_context=None,
        artifact_refs=[],
        error_message="old callback waiting terminated",
        waiting_reason="old callback pending",
        started_at=now,
        phase_started_at=now,
        finished_at=now,
        created_at=now,
    )
    competing_waiting_node_run = NodeRun(
        id="node-run-other-waiting",
        run_id=run.id,
        node_id="other_wait",
        node_name="Other Wait",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        retry_count=0,
        input_payload={},
        output_payload=None,
        checkpoint_payload={},
        working_context={},
        evidence_context=None,
        artifact_refs=[],
        error_message=None,
        waiting_reason="other callback pending",
        started_at=now,
        phase_started_at=now,
        finished_at=None,
        created_at=now,
    )
    current_waiting_node_run = NodeRun(
        id="node-run-current-new",
        run_id=run.id,
        node_id="tool_wait",
        node_name="Tool Wait",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        retry_count=1,
        input_payload={},
        output_payload=None,
        checkpoint_payload={},
        working_context={},
        evidence_context=None,
        artifact_refs=[],
        error_message=None,
        waiting_reason="current callback pending",
        started_at=now,
        phase_started_at=datetime(2026, 3, 20, 11, 5, tzinfo=UTC),
        finished_at=None,
        created_at=datetime(2026, 3, 20, 11, 5, tzinfo=UTC),
    )

    waiting_reason_lookup, waiting_lifecycle_lookup = build_waiting_lifecycle_lookup(
        {run.id: run},
        [
            current_terminated_node_run,
            competing_waiting_node_run,
            current_waiting_node_run,
        ],
        [],
    )

    waiting_lifecycle = waiting_lifecycle_lookup[run.id]
    assert waiting_reason_lookup[run.id] == "current callback pending"
    assert waiting_lifecycle is not None
    assert waiting_lifecycle.node_run_id == current_waiting_node_run.id
    assert waiting_lifecycle.waiting_reason == "current callback pending"


def test_serialize_published_invocation_item_prefers_run_snapshot_lookup() -> None:
    now = datetime(2026, 3, 20, 15, 0, tzinfo=UTC)
    record = SimpleNamespace(
        id="invocation-1",
        workflow_id="wf-1",
        binding_id="binding-1",
        endpoint_id="endpoint-1",
        endpoint_alias="demo-endpoint",
        route_path="/demo",
        protocol="native",
        auth_mode="none",
        request_source="workflow",
        status="succeeded",
        cache_status="hit",
        api_key_id=None,
        run_id="run-1",
        run_status="succeeded",
        error_message=None,
        request_preview={"question": "hello"},
        response_preview={"answer": "world"},
        duration_ms=12,
        created_at=now,
        finished_at=now,
    )
    canonical_snapshot = OperatorRunSnapshot(
        workflow_id="wf-1",
        status="succeeded",
        current_node_id="output",
        execution_focus_reason=None,
        execution_focus_explanation={
            "primary_signal": "canonical snapshot",
            "follow_up": "use dedicated run snapshot lookup",
        },
        callback_waiting_explanation={
            "primary_signal": "canonical callback explanation",
            "follow_up": "use canonical snapshot explanation",
        },
    )
    sampled_snapshot = OperatorRunSnapshot(
        workflow_id="wf-1-stale",
        status="waiting",
        current_node_id="tool_wait",
        waiting_reason="callback pending",
        execution_focus_reason="blocking_node_run",
        execution_focus_explanation={
            "primary_signal": "sampled snapshot",
            "follow_up": "this should not win when canonical snapshot is present",
        },
        callback_waiting_explanation={
            "primary_signal": "sampled callback explanation",
            "follow_up": "this should not win when canonical snapshot is present",
        },
    )

    item = serialize_published_invocation_item(
        record,
        request_surface="native.workflow",
        run_snapshot_lookup={record.run_id: canonical_snapshot},
        run_follow_up_lookup={
            record.run_id: OperatorRunFollowUpSummary(
                affected_run_count=1,
                sampled_run_count=1,
                succeeded_run_count=1,
                sampled_runs=[
                    OperatorRunSnapshotSample(
                        run_id=record.run_id,
                        snapshot=sampled_snapshot,
                    )
                ],
            )
        },
    )

    assert item.run_snapshot == canonical_snapshot
    assert item.execution_focus_explanation is not None
    assert item.execution_focus_explanation.model_dump() == {
        "primary_signal": "canonical snapshot",
        "follow_up": "use dedicated run snapshot lookup",
    }
    assert item.callback_waiting_explanation is not None
    assert item.callback_waiting_explanation.model_dump() == {
        "primary_signal": "canonical callback explanation",
        "follow_up": "use canonical snapshot explanation",
    }


def test_serialize_published_invocation_item_matches_run_id_when_follow_up_contains_multiple_samples() -> None:
    now = datetime(2026, 3, 20, 15, 30, tzinfo=UTC)
    record = SimpleNamespace(
        id="invocation-2",
        workflow_id="wf-1",
        binding_id="binding-1",
        endpoint_id="endpoint-1",
        endpoint_alias="demo-endpoint",
        route_path="/demo",
        protocol="native",
        auth_mode="none",
        request_source="workflow",
        status="succeeded",
        cache_status="hit",
        api_key_id=None,
        run_id="run-primary",
        run_status="succeeded",
        error_message=None,
        request_preview={"question": "hello"},
        response_preview={"answer": "world"},
        duration_ms=12,
        created_at=now,
        finished_at=now,
    )

    item = serialize_published_invocation_item(
        record,
        request_surface="native.workflow",
        run_follow_up_lookup={
            record.run_id: OperatorRunFollowUpSummary(
                affected_run_count=2,
                sampled_run_count=2,
                succeeded_run_count=2,
                sampled_runs=[
                    OperatorRunSnapshotSample(
                        run_id="run-stale",
                        snapshot=OperatorRunSnapshot(
                            workflow_id="wf-stale",
                            status="waiting",
                            current_node_id="tool_wait",
                            execution_focus_explanation={
                                "primary_signal": "stale snapshot",
                                "follow_up": "should not win",
                            },
                        ),
                    ),
                    OperatorRunSnapshotSample(
                        run_id=record.run_id,
                        snapshot=OperatorRunSnapshot(
                            workflow_id="wf-primary",
                            status="succeeded",
                            current_node_id="output",
                            execution_focus_explanation={
                                "primary_signal": "primary snapshot",
                                "follow_up": "match current run id",
                            },
                        ),
                    ),
                ],
            )
        },
    )

    assert item.run_snapshot is not None
    assert item.run_snapshot.workflow_id == "wf-primary"
    assert item.execution_focus_explanation is not None
    assert item.execution_focus_explanation.model_dump() == {
        "primary_signal": "primary snapshot",
        "follow_up": "match current run id",
    }
