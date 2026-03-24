from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from app.models.run import (
    AICallRecord,
    NodeRun,
    RunArtifact,
    RunCallbackTicket,
    RunEvent,
    ToolCallRecord,
)
from app.schemas.run import AICallItem, RunArtifactItem, RunEventItem, ToolCallItem
from app.schemas.run_views import (
    CallbackWaitingLifecycleSummary,
    RunCallbackTicketItem,
    RunCallbackWaitingSummary,
)
from app.services.callback_waiting_lifecycle import (
    load_callback_waiting_lifecycle,
    load_callback_waiting_scheduled_resume,
)
from app.services.tool_execution_fact_honesty import (
    normalize_blocked_execution_trace_facts,
)


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def serialize_callback_waiting_lifecycle_summary(
    checkpoint_payload: dict | None,
) -> CallbackWaitingLifecycleSummary | None:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    if not any(
        lifecycle.get(key)
        for key in (
            "wait_cycle_count",
            "issued_ticket_count",
            "expired_ticket_count",
            "consumed_ticket_count",
            "canceled_ticket_count",
            "late_callback_count",
            "resume_schedule_count",
            "max_expired_ticket_count",
            "terminated",
            "termination_reason",
            "terminated_at",
            "last_ticket_status",
            "last_late_callback_status",
            "last_resume_delay_seconds",
            "last_resume_backoff_attempt",
        )
    ):
        return None
    return CallbackWaitingLifecycleSummary(**lifecycle)


def serialize_callback_waiting_scheduled_resume(
    checkpoint_payload: dict | None,
) -> dict[str, str | float | None]:
    scheduled_resume = load_callback_waiting_scheduled_resume(checkpoint_payload)
    return {
        "scheduled_resume_delay_seconds": scheduled_resume["delay_seconds"],
        "scheduled_resume_reason": scheduled_resume["reason"],
        "scheduled_resume_source": scheduled_resume["source"],
        "scheduled_waiting_status": scheduled_resume["waiting_status"],
        "scheduled_resume_scheduled_at": scheduled_resume["scheduled_at"],
        "scheduled_resume_due_at": scheduled_resume["due_at"],
        "scheduled_resume_requeued_at": scheduled_resume["requeued_at"],
        "scheduled_resume_requeue_source": scheduled_resume["requeue_source"],
    }


def serialize_run_callback_waiting_summary(
    node_runs: list[NodeRun],
) -> RunCallbackWaitingSummary:
    lifecycle_summaries = [
        summary
        for summary in (
            serialize_callback_waiting_lifecycle_summary(node_run.checkpoint_payload)
            for node_run in node_runs
        )
        if summary is not None
    ]
    resume_source_counts = Counter(
        summary.last_resume_source
        for summary in lifecycle_summaries
        if summary.last_resume_source is not None
    )
    scheduled_resume_summaries = [
        serialize_callback_waiting_scheduled_resume(node_run.checkpoint_payload)
        for node_run in node_runs
    ]
    scheduled_resume_source_counts = Counter(
        summary["scheduled_resume_source"]
        for summary in scheduled_resume_summaries
        if summary["scheduled_resume_delay_seconds"] is not None
        and summary["scheduled_resume_source"] is not None
    )
    termination_reason_counts = Counter(
        summary.termination_reason
        for summary in lifecycle_summaries
        if summary.termination_reason is not None
    )
    return RunCallbackWaitingSummary(
        node_count=len(lifecycle_summaries),
        terminated_node_count=sum(1 for summary in lifecycle_summaries if summary.terminated),
        issued_ticket_count=sum(summary.issued_ticket_count for summary in lifecycle_summaries),
        expired_ticket_count=sum(summary.expired_ticket_count for summary in lifecycle_summaries),
        consumed_ticket_count=sum(summary.consumed_ticket_count for summary in lifecycle_summaries),
        canceled_ticket_count=sum(summary.canceled_ticket_count for summary in lifecycle_summaries),
        late_callback_count=sum(summary.late_callback_count for summary in lifecycle_summaries),
        resume_schedule_count=sum(summary.resume_schedule_count for summary in lifecycle_summaries),
        scheduled_resume_pending_node_count=sum(
            1
            for summary in scheduled_resume_summaries
            if summary["scheduled_resume_delay_seconds"] is not None
            and summary["scheduled_resume_requeued_at"] is None
        ),
        scheduled_resume_requeued_node_count=sum(
            1
            for summary in scheduled_resume_summaries
            if summary["scheduled_resume_delay_seconds"] is not None
            and summary["scheduled_resume_requeued_at"] is not None
        ),
        resume_source_counts=dict(sorted(resume_source_counts.items())),
        scheduled_resume_source_counts=dict(
            sorted(scheduled_resume_source_counts.items())
        ),
        termination_reason_counts=dict(sorted(termination_reason_counts.items())),
    )


def serialize_run_event(event: RunEvent) -> RunEventItem:
    return RunEventItem(
        id=event.id,
        run_id=event.run_id,
        node_run_id=event.node_run_id,
        event_type=event.event_type,
        payload=event.payload,
        created_at=event.created_at,
    )


def serialize_run_artifact(artifact: RunArtifact) -> RunArtifactItem:
    return RunArtifactItem(
        id=artifact.id,
        run_id=artifact.run_id,
        node_run_id=artifact.node_run_id,
        artifact_kind=artifact.artifact_kind,
        content_type=artifact.content_type,
        summary=artifact.summary,
        uri=f"artifact://{artifact.id}",
        metadata_payload=artifact.metadata_payload or {},
        created_at=artifact.created_at,
    )


def serialize_tool_call(tool_call: ToolCallRecord) -> ToolCallItem:
    execution_trace = normalize_blocked_execution_trace_facts(tool_call.execution_trace)
    requested_backend_extensions = execution_trace.get("requested_backend_extensions")
    adapter_request_execution = execution_trace.get("adapter_request_execution")
    adapter_request_execution_contract = execution_trace.get(
        "adapter_request_execution_contract"
    )
    response_meta = dict(tool_call.response_meta or {})
    return ToolCallItem(
        id=tool_call.id,
        run_id=tool_call.run_id,
        node_run_id=tool_call.node_run_id,
        tool_id=tool_call.tool_id,
        tool_name=tool_call.tool_name,
        phase=tool_call.phase,
        status=tool_call.status,
        request_summary=tool_call.request_summary,
        execution_trace=execution_trace or None,
        requested_execution_class=execution_trace.get("requested_execution_class"),
        requested_execution_source=execution_trace.get("execution_source"),
        requested_execution_profile=execution_trace.get("requested_execution_profile"),
        requested_execution_timeout_ms=execution_trace.get("requested_execution_timeout_ms"),
        requested_execution_network_policy=execution_trace.get("requested_network_policy"),
        requested_execution_filesystem_policy=execution_trace.get(
            "requested_filesystem_policy"
        ),
        requested_execution_dependency_mode=execution_trace.get(
            "requested_dependency_mode"
        ),
        requested_execution_builtin_package_set=execution_trace.get(
            "requested_builtin_package_set"
        ),
        requested_execution_dependency_ref=execution_trace.get(
            "requested_dependency_ref"
        ),
        requested_execution_backend_extensions=(
            dict(requested_backend_extensions)
            if isinstance(requested_backend_extensions, dict)
            else None
        ),
        effective_execution_class=execution_trace.get("effective_execution_class"),
        execution_executor_ref=execution_trace.get("executor_ref"),
        execution_sandbox_backend_id=execution_trace.get("sandbox_backend_id"),
        execution_sandbox_backend_executor_ref=execution_trace.get(
            "sandbox_backend_executor_ref"
        ),
        execution_sandbox_runner_kind=execution_trace.get("sandbox_runner_kind"),
        adapter_request_trace_id=execution_trace.get("adapter_request_trace_id"),
        adapter_request_execution=(
            dict(adapter_request_execution)
            if isinstance(adapter_request_execution, dict)
            else None
        ),
        adapter_request_execution_class=execution_trace.get(
            "adapter_request_execution_class"
        ),
        adapter_request_execution_source=execution_trace.get(
            "adapter_request_execution_source"
        ),
        adapter_request_execution_contract=(
            dict(adapter_request_execution_contract)
            if isinstance(adapter_request_execution_contract, dict)
            else None
        ),
        execution_blocking_reason=execution_trace.get("blocked_reason"),
        execution_fallback_reason=execution_trace.get("fallback_reason"),
        response_summary=tool_call.response_summary,
        response_content_type=tool_call.response_content_type,
        response_meta=response_meta,
        raw_ref=(
            f"artifact://{tool_call.raw_artifact_id}"
            if tool_call.raw_artifact_id is not None
            else None
        ),
        latency_ms=tool_call.latency_ms,
        retry_count=tool_call.retry_count,
        error_message=tool_call.error_message,
        created_at=tool_call.created_at,
        finished_at=tool_call.finished_at,
    )


def serialize_ai_call(ai_call: AICallRecord) -> AICallItem:
    return AICallItem(
        id=ai_call.id,
        run_id=ai_call.run_id,
        node_run_id=ai_call.node_run_id,
        role=ai_call.role,
        status=ai_call.status,
        provider=ai_call.provider,
        model_id=ai_call.model_id,
        input_summary=ai_call.input_summary,
        output_summary=ai_call.output_summary,
        input_ref=(
            f"artifact://{ai_call.input_artifact_id}"
            if ai_call.input_artifact_id is not None
            else None
        ),
        output_ref=(
            f"artifact://{ai_call.output_artifact_id}"
            if ai_call.output_artifact_id is not None
            else None
        ),
        latency_ms=ai_call.latency_ms,
        token_usage=ai_call.token_usage or {},
        cost_payload=ai_call.cost_payload or {},
        assistant=ai_call.assistant,
        error_message=ai_call.error_message,
        created_at=ai_call.created_at,
        finished_at=ai_call.finished_at,
    )


def serialize_callback_ticket(ticket: RunCallbackTicket) -> RunCallbackTicketItem:
    return RunCallbackTicketItem(
        ticket=ticket.id,
        run_id=ticket.run_id,
        node_run_id=ticket.node_run_id,
        tool_call_id=ticket.tool_call_id,
        tool_id=ticket.tool_id,
        tool_call_index=ticket.tool_call_index,
        waiting_status=ticket.waiting_status,
        status=ticket.status,
        reason=ticket.reason,
        callback_payload=ticket.callback_payload,
        created_at=normalize_datetime(ticket.created_at),
        expires_at=normalize_datetime(ticket.expires_at),
        consumed_at=normalize_datetime(ticket.consumed_at),
        canceled_at=normalize_datetime(ticket.canceled_at),
        expired_at=normalize_datetime(ticket.expired_at),
    )
