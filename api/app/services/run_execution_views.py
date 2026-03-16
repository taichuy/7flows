from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import RunCallbackTicket
from app.schemas.run_views import RunExecutionNodeItem, RunExecutionSummary, RunExecutionView
from app.services.run_view_serializers import (
    serialize_ai_call,
    serialize_callback_ticket,
    serialize_callback_waiting_lifecycle_summary,
    serialize_run_artifact,
    serialize_run_callback_waiting_summary,
    serialize_tool_call,
)
from app.services.runtime_execution_policy import execution_policy_from_node_run_input
from app.services.runtime_records import ExecutionArtifacts
from app.services.sensitive_access_presenters import serialize_sensitive_access_timeline_entry
from app.services.sensitive_access_timeline import SensitiveAccessTimelineSnapshot


_EXECUTION_SIGNAL_EVENT_TYPES = {
    "node.execution.dispatched",
    "node.execution.fallback",
    "node.execution.unavailable",
    "tool.execution.dispatched",
    "tool.execution.fallback",
    "tool.execution.blocked",
}


@dataclass
class NodeExecutionSignalSnapshot:
    dispatched_count: int = 0
    fallback_count: int = 0
    blocked_count: int = 0
    unavailable_count: int = 0
    requested_execution_class: str | None = None
    effective_execution_class: str | None = None
    executor_ref: str | None = None
    blocking_reason: str | None = None
    fallback_reason: str | None = None


@dataclass
class RunExecutionSignalSummary:
    by_node_run: dict[str, NodeExecutionSignalSnapshot] = field(default_factory=dict)
    dispatched_node_count: int = 0
    fallback_node_count: int = 0
    blocked_node_count: int = 0
    unavailable_node_count: int = 0
    requested_class_counts: dict[str, int] = field(default_factory=dict)
    effective_class_counts: dict[str, int] = field(default_factory=dict)
    executor_ref_counts: dict[str, int] = field(default_factory=dict)


def list_callback_tickets(db: Session, run_id: str) -> list[RunCallbackTicket]:
    return db.scalars(
        select(RunCallbackTicket)
        .where(RunCallbackTicket.run_id == run_id)
        .order_by(RunCallbackTicket.created_at.asc())
    ).all()


def build_run_execution_view(
    artifacts: ExecutionArtifacts,
    callback_tickets: list[RunCallbackTicket],
    sensitive_access_timeline: SensitiveAccessTimelineSnapshot,
) -> RunExecutionView:
    assistant_call_count = sum(1 for call in artifacts.ai_calls if call.assistant)
    execution_signals = summarize_execution_signals(artifacts)
    return RunExecutionView(
        run_id=artifacts.run.id,
        workflow_id=artifacts.run.workflow_id,
        workflow_version=artifacts.run.workflow_version,
        compiled_blueprint_id=artifacts.run.compiled_blueprint_id,
        status=artifacts.run.status,
        summary=RunExecutionSummary(
            node_run_count=len(artifacts.node_runs),
            waiting_node_count=sum(
                1 for node_run in artifacts.node_runs if "waiting" in node_run.status
            ),
            errored_node_count=sum(
                1 for node_run in artifacts.node_runs if node_run.status == "failed"
            ),
            execution_dispatched_node_count=execution_signals.dispatched_node_count,
            execution_fallback_node_count=execution_signals.fallback_node_count,
            execution_blocked_node_count=execution_signals.blocked_node_count,
            execution_unavailable_node_count=execution_signals.unavailable_node_count,
            artifact_count=len(artifacts.artifacts),
            tool_call_count=len(artifacts.tool_calls),
            ai_call_count=len(artifacts.ai_calls),
            assistant_call_count=assistant_call_count,
            callback_ticket_count=len(callback_tickets),
            sensitive_access_request_count=sensitive_access_timeline.request_count,
            sensitive_access_approval_ticket_count=sensitive_access_timeline.approval_ticket_count,
            sensitive_access_notification_count=sensitive_access_timeline.notification_count,
            artifact_kind_counts=dict(
                sorted(Counter(item.artifact_kind for item in artifacts.artifacts).items())
            ),
            tool_status_counts=dict(
                sorted(Counter(item.status for item in artifacts.tool_calls).items())
            ),
            ai_role_counts=dict(
                sorted(Counter(item.role for item in artifacts.ai_calls).items())
            ),
            execution_requested_class_counts=execution_signals.requested_class_counts,
            execution_effective_class_counts=execution_signals.effective_class_counts,
            execution_executor_ref_counts=execution_signals.executor_ref_counts,
            callback_ticket_status_counts=dict(
                sorted(Counter(item.status for item in callback_tickets).items())
            ),
            sensitive_access_decision_counts=sensitive_access_timeline.decision_counts or {},
            sensitive_access_approval_status_counts=(
                sensitive_access_timeline.approval_status_counts or {}
            ),
            sensitive_access_notification_status_counts=(
                sensitive_access_timeline.notification_status_counts or {}
            ),
            callback_waiting=serialize_run_callback_waiting_summary(artifacts.node_runs),
        ),
        nodes=build_execution_nodes(
            artifacts,
            callback_tickets,
            sensitive_access_timeline.by_node_run,
        ),
    )


def build_execution_nodes(
    artifacts: ExecutionArtifacts,
    callback_tickets: list[RunCallbackTicket],
    sensitive_access_by_node_run,
) -> list[RunExecutionNodeItem]:
    artifacts_by_node_run = _group_by_node_run(artifacts.artifacts)
    tool_calls_by_node_run = _group_by_node_run(artifacts.tool_calls)
    ai_calls_by_node_run = _group_by_node_run(artifacts.ai_calls)
    events_by_node_run = _group_by_node_run(
        [event for event in artifacts.events if event.node_run_id is not None]
    )
    tickets_by_node_run = _group_by_node_run(callback_tickets)
    execution_signals = summarize_execution_signals(artifacts)

    return [
        _build_execution_node_item(
            node_run=node_run,
            events=events_by_node_run[node_run.id],
            artifacts_by_node_run=artifacts_by_node_run,
            tool_calls_by_node_run=tool_calls_by_node_run,
            ai_calls_by_node_run=ai_calls_by_node_run,
            tickets_by_node_run=tickets_by_node_run,
            sensitive_access_by_node_run=sensitive_access_by_node_run,
            execution_signal=execution_signals.by_node_run.get(node_run.id),
        )
        for node_run in artifacts.node_runs
    ]


def _build_execution_node_item(
    *,
    node_run,
    events,
    artifacts_by_node_run,
    tool_calls_by_node_run,
    ai_calls_by_node_run,
    tickets_by_node_run,
    sensitive_access_by_node_run,
    execution_signal: NodeExecutionSignalSnapshot | None,
) -> RunExecutionNodeItem:
    execution_policy = execution_policy_from_node_run_input(
        node_run.input_payload,
        node_type=node_run.node_type,
    )
    return RunExecutionNodeItem(
        node_run_id=node_run.id,
        node_id=node_run.node_id,
        node_name=node_run.node_name,
        node_type=node_run.node_type,
        status=node_run.status,
        phase=node_run.phase,
        **execution_policy.as_execution_view_payload(),
        execution_dispatched_count=(execution_signal.dispatched_count if execution_signal else 0),
        execution_fallback_count=(execution_signal.fallback_count if execution_signal else 0),
        execution_blocked_count=(execution_signal.blocked_count if execution_signal else 0),
        execution_unavailable_count=(execution_signal.unavailable_count if execution_signal else 0),
        effective_execution_class=(
            execution_signal.effective_execution_class if execution_signal else None
        ),
        execution_executor_ref=(execution_signal.executor_ref if execution_signal else None),
        execution_blocking_reason=(
            execution_signal.blocking_reason if execution_signal else None
        ),
        execution_fallback_reason=(
            execution_signal.fallback_reason if execution_signal else None
        ),
        retry_count=node_run.retry_count,
        waiting_reason=node_run.waiting_reason,
        error_message=node_run.error_message,
        started_at=node_run.started_at,
        finished_at=node_run.finished_at,
        event_count=len(events),
        event_type_counts=dict(sorted(Counter(event.event_type for event in events).items())),
        last_event_type=(events[-1].event_type if events else None),
        artifact_refs=list(node_run.artifact_refs or []),
        artifacts=[
            serialize_run_artifact(artifact)
            for artifact in artifacts_by_node_run[node_run.id]
        ],
        tool_calls=[
            serialize_tool_call(tool_call)
            for tool_call in tool_calls_by_node_run[node_run.id]
        ],
        ai_calls=[serialize_ai_call(ai_call) for ai_call in ai_calls_by_node_run[node_run.id]],
        callback_tickets=[
            serialize_callback_ticket(ticket)
            for ticket in tickets_by_node_run[node_run.id]
        ],
        sensitive_access_entries=[
            serialize_sensitive_access_timeline_entry(bundle)
            for bundle in sensitive_access_by_node_run.get(node_run.id, [])
        ],
        callback_waiting_lifecycle=serialize_callback_waiting_lifecycle_summary(
            node_run.checkpoint_payload
        ),
    )


def summarize_execution_signals(artifacts: ExecutionArtifacts) -> RunExecutionSignalSummary:
    by_node_run: dict[str, NodeExecutionSignalSnapshot] = defaultdict(NodeExecutionSignalSnapshot)
    for event in artifacts.events:
        if event.node_run_id is None or event.event_type not in _EXECUTION_SIGNAL_EVENT_TYPES:
            continue
        snapshot = by_node_run[str(event.node_run_id)]
        payload = event.payload or {}
        requested_execution_class = payload.get("requested_execution_class")
        if isinstance(requested_execution_class, str) and requested_execution_class.strip():
            snapshot.requested_execution_class = requested_execution_class
        effective_execution_class = payload.get("effective_execution_class")
        if isinstance(effective_execution_class, str) and effective_execution_class.strip():
            snapshot.effective_execution_class = effective_execution_class
        executor_ref = payload.get("executor_ref")
        if isinstance(executor_ref, str) and executor_ref.strip():
            snapshot.executor_ref = executor_ref
        reason = payload.get("reason")
        if event.event_type.endswith("dispatched"):
            snapshot.dispatched_count += 1
        elif event.event_type.endswith("fallback"):
            snapshot.fallback_count += 1
            if isinstance(reason, str) and reason.strip():
                snapshot.fallback_reason = reason
        elif event.event_type.endswith("blocked"):
            snapshot.blocked_count += 1
            if isinstance(reason, str) and reason.strip():
                snapshot.blocking_reason = reason
        elif event.event_type.endswith("unavailable"):
            snapshot.unavailable_count += 1
            if isinstance(reason, str) and reason.strip():
                snapshot.blocking_reason = reason

    requested_class_counts = Counter(
        snapshot.requested_execution_class
        for snapshot in by_node_run.values()
        if snapshot.requested_execution_class is not None
    )
    effective_class_counts = Counter(
        snapshot.effective_execution_class
        for snapshot in by_node_run.values()
        if snapshot.effective_execution_class is not None
    )
    executor_ref_counts = Counter(
        snapshot.executor_ref
        for snapshot in by_node_run.values()
        if snapshot.executor_ref is not None
    )
    return RunExecutionSignalSummary(
        by_node_run=dict(by_node_run),
        dispatched_node_count=sum(1 for snapshot in by_node_run.values() if snapshot.dispatched_count > 0),
        fallback_node_count=sum(1 for snapshot in by_node_run.values() if snapshot.fallback_count > 0),
        blocked_node_count=sum(1 for snapshot in by_node_run.values() if snapshot.blocked_count > 0),
        unavailable_node_count=sum(1 for snapshot in by_node_run.values() if snapshot.unavailable_count > 0),
        requested_class_counts=dict(sorted(requested_class_counts.items())),
        effective_class_counts=dict(sorted(effective_class_counts.items())),
        executor_ref_counts=dict(sorted(executor_ref_counts.items())),
    )


def _group_by_node_run(items: list[object]) -> dict[str, list[object]]:
    grouped: dict[str, list[object]] = defaultdict(list)
    for item in items:
        node_run_id = getattr(item, "node_run_id", None)
        if node_run_id is None:
            continue
        grouped[str(node_run_id)].append(item)
    return grouped
