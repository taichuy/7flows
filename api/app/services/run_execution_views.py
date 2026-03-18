from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import RunCallbackTicket
from app.schemas.run_views import (
    RunExecutionFocusReason,
    RunExecutionNodeItem,
    RunExecutionSkillTrace,
    RunExecutionSkillTraceNodeItem,
    RunExecutionSummary,
    RunExecutionView,
    SkillReferenceLoadItem,
    SkillReferenceLoadReferenceItem,
)
from app.services.run_execution_focus_explanations import (
    build_run_execution_focus_explanation,
)
from app.services.run_view_serializers import (
    serialize_ai_call,
    serialize_callback_ticket,
    serialize_callback_waiting_lifecycle_summary,
    serialize_callback_waiting_scheduled_resume,
    serialize_run_artifact,
    serialize_run_callback_waiting_summary,
    serialize_tool_call,
)
from app.services.runtime_execution_policy import (
    execution_policy_from_node_run_input,
)
from app.services.runtime_records import ExecutionArtifacts
from app.services.sensitive_access_presenters import (
    serialize_sensitive_access_timeline_entry,
)
from app.services.sensitive_access_timeline import SensitiveAccessTimelineSnapshot

_EXECUTION_SIGNAL_EVENT_TYPES = {
    "node.execution.dispatched",
    "node.execution.fallback",
    "node.execution.unavailable",
    "tool.execution.dispatched",
    "tool.execution.fallback",
    "tool.execution.blocked",
}

_SKILL_REFERENCE_LOAD_EVENT_TYPE = "agent.skill.references.loaded"


@dataclass
class NodeExecutionSignalSnapshot:
    dispatched_count: int = 0
    fallback_count: int = 0
    blocked_count: int = 0
    unavailable_count: int = 0
    requested_execution_class: str | None = None
    effective_execution_class: str | None = None
    executor_ref: str | None = None
    sandbox_backend_id: str | None = None
    sandbox_backend_executor_ref: str | None = None
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
    sandbox_backend_counts: dict[str, int] = field(default_factory=dict)


@dataclass
class RunSkillReferenceLoadSummary:
    by_node_run: dict[str, list[SkillReferenceLoadItem]] = field(default_factory=dict)
    reference_count: int = 0
    phase_counts: dict[str, int] = field(default_factory=dict)
    source_counts: dict[str, int] = field(default_factory=dict)


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
    skill_reference_loads = summarize_skill_reference_loads(artifacts)
    nodes = build_execution_nodes(
        artifacts,
        callback_tickets,
        sensitive_access_timeline.by_node_run,
        skill_reference_loads.by_node_run,
    )
    blocking_node_run_id = resolve_blocking_node_run_id(nodes)
    execution_focus_node, execution_focus_reason = resolve_execution_focus_node(
        execution_nodes=nodes,
        blocking_node_run_id=blocking_node_run_id,
        current_node_id=artifacts.run.current_node_id,
    )
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
            skill_reference_load_count=skill_reference_loads.reference_count,
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
            execution_sandbox_backend_counts=execution_signals.sandbox_backend_counts,
            skill_reference_phase_counts=skill_reference_loads.phase_counts,
            skill_reference_source_counts=skill_reference_loads.source_counts,
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
        blocking_node_run_id=blocking_node_run_id,
        execution_focus_reason=execution_focus_reason,
        execution_focus_node=execution_focus_node,
        execution_focus_explanation=build_run_execution_focus_explanation(
            execution_focus_node
        ),
        skill_trace=build_run_execution_skill_trace(
            node_runs=artifacts.node_runs,
            summary=skill_reference_loads,
            execution_focus_node_run_id=(
                execution_focus_node.node_run_id if execution_focus_node is not None else None
            ),
        ),
        nodes=nodes,
    )


def build_execution_nodes(
    artifacts: ExecutionArtifacts,
    callback_tickets: list[RunCallbackTicket],
    sensitive_access_by_node_run,
    skill_reference_loads_by_node_run: dict[str, list[SkillReferenceLoadItem]],
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
            skill_reference_loads=skill_reference_loads_by_node_run.get(node_run.id, []),
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
    skill_reference_loads: list[SkillReferenceLoadItem],
    execution_signal: NodeExecutionSignalSnapshot | None,
) -> RunExecutionNodeItem:
    execution_policy = execution_policy_from_node_run_input(
        node_run.input_payload,
        node_type=node_run.node_type,
    )
    scheduled_resume = serialize_callback_waiting_scheduled_resume(
        node_run.checkpoint_payload
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
        execution_sandbox_backend_id=(
            execution_signal.sandbox_backend_id if execution_signal else None
        ),
        execution_sandbox_backend_executor_ref=(
            execution_signal.sandbox_backend_executor_ref if execution_signal else None
        ),
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
        skill_reference_load_count=sum(
            len(load.references) for load in skill_reference_loads
        ),
        skill_reference_loads=skill_reference_loads,
        sensitive_access_entries=[
            serialize_sensitive_access_timeline_entry(bundle)
            for bundle in sensitive_access_by_node_run.get(node_run.id, [])
        ],
        callback_waiting_lifecycle=serialize_callback_waiting_lifecycle_summary(
            node_run.checkpoint_payload
        ),
        scheduled_resume_delay_seconds=scheduled_resume[
            "scheduled_resume_delay_seconds"
        ],
        scheduled_resume_reason=scheduled_resume["scheduled_resume_reason"],
        scheduled_resume_source=scheduled_resume["scheduled_resume_source"],
        scheduled_waiting_status=scheduled_resume["scheduled_waiting_status"],
        scheduled_resume_scheduled_at=scheduled_resume[
            "scheduled_resume_scheduled_at"
        ],
        scheduled_resume_due_at=scheduled_resume["scheduled_resume_due_at"],
        scheduled_resume_requeued_at=scheduled_resume[
            "scheduled_resume_requeued_at"
        ],
        scheduled_resume_requeue_source=scheduled_resume[
            "scheduled_resume_requeue_source"
        ],
    )


def _count_pending_approvals(node: RunExecutionNodeItem) -> int:
    return sum(
        1
        for entry in node.sensitive_access_entries
        if entry.approval_ticket is not None and entry.approval_ticket.status == "pending"
    )


def _count_pending_tickets(node: RunExecutionNodeItem) -> int:
    return sum(1 for ticket in node.callback_tickets if ticket.status == "pending")


def _has_waiting_blocker(node: RunExecutionNodeItem) -> bool:
    if _count_pending_approvals(node) > 0 or _count_pending_tickets(node) > 0:
        return True
    if (
        node.callback_waiting_lifecycle is not None
        and not node.callback_waiting_lifecycle.terminated
    ):
        return True
    if node.waiting_reason and (
        node.callback_tickets or node.sensitive_access_entries or node.status.startswith("waiting")
    ):
        return True
    return False


def _blocker_node_score(node: RunExecutionNodeItem) -> tuple[int, int, int, int]:
    lifecycle = node.callback_waiting_lifecycle
    pending_approvals = _count_pending_approvals(node)
    pending_tickets = _count_pending_tickets(node)
    score = pending_approvals * 100
    score += pending_tickets * 80
    score += (lifecycle.expired_ticket_count if lifecycle is not None else 0) * 20
    score += (lifecycle.late_callback_count if lifecycle is not None else 0) * 15
    score += len(node.callback_tickets) * 5
    score += len(node.sensitive_access_entries) * 3
    if node.waiting_reason:
        score += 10
    if node.status.startswith("waiting"):
        score += 10
    if lifecycle is not None and lifecycle.terminated:
        score -= 25
    return (
        score,
        pending_approvals,
        pending_tickets,
        len(node.callback_tickets) + len(node.sensitive_access_entries),
    )


def resolve_blocking_node_run_id(execution_nodes: list[RunExecutionNodeItem]) -> str | None:
    blocker_nodes = [node for node in execution_nodes if _has_waiting_blocker(node)]
    if not blocker_nodes:
        return None

    blocker_nodes.sort(key=_blocker_node_score, reverse=True)
    return blocker_nodes[0].node_run_id


def resolve_execution_focus_node(
    *,
    execution_nodes: list[RunExecutionNodeItem],
    blocking_node_run_id: str | None,
    current_node_id: str | None,
) -> tuple[RunExecutionNodeItem | None, RunExecutionFocusReason | None]:
    if blocking_node_run_id:
        for node in execution_nodes:
            if node.node_run_id == blocking_node_run_id:
                return node, "blocking_node_run"

    for node in reversed(execution_nodes):
        if node.execution_blocking_reason or node.execution_blocked_count > 0:
            return node, "blocked_execution"
        if node.execution_unavailable_count > 0:
            return node, "blocked_execution"

    if current_node_id:
        for node in reversed(execution_nodes):
            if node.node_id == current_node_id:
                return node, "current_node"

    for node in reversed(execution_nodes):
        if node.execution_fallback_reason or node.execution_fallback_count > 0:
            return node, "fallback_node"

    return None, None


def _count_skill_references(loads: list[SkillReferenceLoadItem]) -> int:
    return sum(len(load.references) for load in loads)


def _summarize_skill_reference_sources(
    loads: list[SkillReferenceLoadItem],
) -> dict[str, int]:
    source_counts: Counter[str] = Counter()
    for load in loads:
        for reference in load.references:
            source = reference.load_source or "unknown"
            source_counts[source] += 1
    return dict(sorted(source_counts.items()))


def _summarize_skill_reference_phases(loads: list[SkillReferenceLoadItem]) -> dict[str, int]:
    phase_counts: Counter[str] = Counter()
    for load in loads:
        if load.references:
            phase_counts[load.phase] += len(load.references)
    return dict(sorted(phase_counts.items()))


def _serialize_run_execution_skill_trace_node(
    *,
    node_run_id: str,
    node_run,
    loads: list[SkillReferenceLoadItem],
) -> RunExecutionSkillTraceNodeItem:
    return RunExecutionSkillTraceNodeItem(
        node_run_id=node_run_id,
        node_id=(node_run.node_id if node_run is not None else None),
        node_name=(node_run.node_name if node_run is not None else None),
        reference_count=_count_skill_references(loads),
        loads=list(loads),
    )


def build_run_execution_skill_trace(
    *,
    node_runs: list,
    summary: RunSkillReferenceLoadSummary,
    execution_focus_node_run_id: str | None,
) -> RunExecutionSkillTrace | None:
    if summary.reference_count <= 0:
        return None

    node_run_lookup = {node_run.id: node_run for node_run in node_runs}
    if (
        execution_focus_node_run_id
        and execution_focus_node_run_id in summary.by_node_run
    ):
        scoped_loads = summary.by_node_run[execution_focus_node_run_id]
        return RunExecutionSkillTrace(
            scope="execution_focus_node",
            reference_count=_count_skill_references(scoped_loads),
            phase_counts=_summarize_skill_reference_phases(scoped_loads),
            source_counts=_summarize_skill_reference_sources(scoped_loads),
            nodes=[
                _serialize_run_execution_skill_trace_node(
                    node_run_id=execution_focus_node_run_id,
                    node_run=node_run_lookup.get(execution_focus_node_run_id),
                    loads=scoped_loads,
                )
            ],
        )

    node_ids = [node_run.id for node_run in node_runs if node_run.id in summary.by_node_run]
    return RunExecutionSkillTrace(
        scope="run",
        reference_count=summary.reference_count,
        phase_counts=summary.phase_counts,
        source_counts=summary.source_counts,
        nodes=[
            _serialize_run_execution_skill_trace_node(
                node_run_id=node_run_id,
                node_run=node_run_lookup.get(node_run_id),
                loads=summary.by_node_run[node_run_id],
            )
            for node_run_id in node_ids
        ],
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
        sandbox_backend_id = payload.get("sandbox_backend_id")
        if isinstance(sandbox_backend_id, str) and sandbox_backend_id.strip():
            snapshot.sandbox_backend_id = sandbox_backend_id
        sandbox_backend_executor_ref = payload.get("sandbox_backend_executor_ref")
        if (
            isinstance(sandbox_backend_executor_ref, str)
            and sandbox_backend_executor_ref.strip()
        ):
            snapshot.sandbox_backend_executor_ref = sandbox_backend_executor_ref
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
    sandbox_backend_counts = Counter(
        snapshot.sandbox_backend_id
        for snapshot in by_node_run.values()
        if snapshot.sandbox_backend_id is not None
    )
    return RunExecutionSignalSummary(
        by_node_run=dict(by_node_run),
        dispatched_node_count=sum(
            1 for snapshot in by_node_run.values() if snapshot.dispatched_count > 0
        ),
        fallback_node_count=sum(
            1 for snapshot in by_node_run.values() if snapshot.fallback_count > 0
        ),
        blocked_node_count=sum(
            1 for snapshot in by_node_run.values() if snapshot.blocked_count > 0
        ),
        unavailable_node_count=sum(
            1 for snapshot in by_node_run.values() if snapshot.unavailable_count > 0
        ),
        requested_class_counts=dict(sorted(requested_class_counts.items())),
        effective_class_counts=dict(sorted(effective_class_counts.items())),
        executor_ref_counts=dict(sorted(executor_ref_counts.items())),
        sandbox_backend_counts=dict(sorted(sandbox_backend_counts.items())),
    )


def summarize_skill_reference_loads(
    artifacts: ExecutionArtifacts,
) -> RunSkillReferenceLoadSummary:
    by_node_run: dict[str, list[SkillReferenceLoadItem]] = defaultdict(list)
    phase_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()
    reference_count = 0

    for event in artifacts.events:
        if event.node_run_id is None or event.event_type != _SKILL_REFERENCE_LOAD_EVENT_TYPE:
            continue
        payload = event.payload or {}
        phase = str(payload.get("phase") or "unknown").strip() or "unknown"
        references: list[SkillReferenceLoadReferenceItem] = []
        for raw_reference in payload.get("references") or []:
            if not isinstance(raw_reference, dict):
                continue
            skill_id = str(raw_reference.get("skill_id") or "").strip()
            reference_id = str(raw_reference.get("reference_id") or "").strip()
            if not skill_id or not reference_id:
                continue
            retrieval_mcp_params = raw_reference.get("retrieval_mcp_params") or {}
            if not isinstance(retrieval_mcp_params, dict):
                retrieval_mcp_params = {}
            load_source = str(raw_reference.get("load_source") or "unknown").strip() or "unknown"
            references.append(
                SkillReferenceLoadReferenceItem(
                    skill_id=skill_id,
                    skill_name=(
                        str(raw_reference.get("skill_name")).strip()
                        if raw_reference.get("skill_name") is not None
                        else None
                    ),
                    reference_id=reference_id,
                    reference_name=(
                        str(raw_reference.get("reference_name")).strip()
                        if raw_reference.get("reference_name") is not None
                        else None
                    ),
                    load_source=load_source,
                    fetch_reason=(
                        str(raw_reference.get("fetch_reason")).strip()
                        if raw_reference.get("fetch_reason") is not None
                        else None
                    ),
                    fetch_request_index=(
                        int(raw_reference["fetch_request_index"])
                        if raw_reference.get("fetch_request_index") is not None
                        else None
                    ),
                    fetch_request_total=(
                        int(raw_reference["fetch_request_total"])
                        if raw_reference.get("fetch_request_total") is not None
                        else None
                    ),
                    retrieval_http_path=(
                        str(raw_reference.get("retrieval_http_path")).strip()
                        if raw_reference.get("retrieval_http_path") is not None
                        else None
                    ),
                    retrieval_mcp_method=(
                        str(raw_reference.get("retrieval_mcp_method")).strip()
                        if raw_reference.get("retrieval_mcp_method") is not None
                        else None
                    ),
                    retrieval_mcp_params={
                        str(key): str(value)
                        for key, value in retrieval_mcp_params.items()
                        if str(key).strip() and value is not None
                    },
                )
            )
            source_counts[load_source] += 1
        if not references:
            continue
        phase_counts[phase] += len(references)
        reference_count += len(references)
        by_node_run[str(event.node_run_id)].append(
            SkillReferenceLoadItem(phase=phase, references=references)
        )

    return RunSkillReferenceLoadSummary(
        by_node_run=dict(by_node_run),
        reference_count=reference_count,
        phase_counts=dict(sorted(phase_counts.items())),
        source_counts=dict(sorted(source_counts.items())),
    )


def _group_by_node_run(items: list[object]) -> dict[str, list[object]]:
    grouped: dict[str, list[object]] = defaultdict(list)
    for item in items:
        node_run_id = getattr(item, "node_run_id", None)
        if node_run_id is None:
            continue
        grouped[str(node_run_id)].append(item)
    return grouped
