from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import (
    AICallRecord,
    NodeRun,
    RunArtifact,
    RunCallbackTicket,
    RunEvent,
    ToolCallRecord,
)
from app.schemas.run import (
    AICallItem,
    RunArtifactItem,
    RunDetail,
    RunEventItem,
    ToolCallItem,
)
from app.schemas.run_views import (
    CallbackWaitingLifecycleSummary,
    EvidenceEntryItem,
    RunCallbackTicketItem,
    RunCallbackWaitingSummary,
    RunEvidenceNodeItem,
    RunEvidenceSummary,
    RunEvidenceView,
    RunExecutionNodeItem,
    RunExecutionSummary,
    RunExecutionView,
)
from app.services.callback_waiting_lifecycle import load_callback_waiting_lifecycle
from app.services.runtime import RuntimeService
from app.services.runtime_execution_policy import execution_policy_from_node_run_input
from app.services.runtime_records import ExecutionArtifacts


def _normalize_datetime(value: datetime | None) -> datetime | None:
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
        resume_source_counts=dict(sorted(resume_source_counts.items())),
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
    return ToolCallItem(
        id=tool_call.id,
        run_id=tool_call.run_id,
        node_run_id=tool_call.node_run_id,
        tool_id=tool_call.tool_id,
        tool_name=tool_call.tool_name,
        phase=tool_call.phase,
        status=tool_call.status,
        request_summary=tool_call.request_summary,
        response_summary=tool_call.response_summary,
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


def serialize_run_detail(
    artifacts: ExecutionArtifacts,
    *,
    include_events: bool = True,
) -> RunDetail:
    event_type_counts = dict(
        sorted(Counter(event.event_type for event in artifacts.events).items())
    )
    first_event_at = artifacts.events[0].created_at if artifacts.events else None
    last_event_at = artifacts.events[-1].created_at if artifacts.events else None

    return RunDetail(
        id=artifacts.run.id,
        workflow_id=artifacts.run.workflow_id,
        workflow_version=artifacts.run.workflow_version,
        compiled_blueprint_id=artifacts.run.compiled_blueprint_id,
        status=artifacts.run.status,
        input_payload=artifacts.run.input_payload,
        output_payload=artifacts.run.output_payload,
        checkpoint_payload=artifacts.run.checkpoint_payload or {},
        error_message=artifacts.run.error_message,
        current_node_id=artifacts.run.current_node_id,
        started_at=artifacts.run.started_at,
        finished_at=artifacts.run.finished_at,
        created_at=artifacts.run.created_at,
        event_count=len(artifacts.events),
        event_type_counts=event_type_counts,
        first_event_at=first_event_at,
        last_event_at=last_event_at,
        node_runs=[
            {
                "id": node_run.id,
                "node_id": node_run.node_id,
                "node_name": node_run.node_name,
                "node_type": node_run.node_type,
                "status": node_run.status,
                "phase": node_run.phase,
                "retry_count": node_run.retry_count,
                "input_payload": node_run.input_payload,
                "output_payload": node_run.output_payload,
                "checkpoint_payload": node_run.checkpoint_payload or {},
                "working_context": node_run.working_context or {},
                "evidence_context": node_run.evidence_context,
                "artifact_refs": list(node_run.artifact_refs or []),
                "error_message": node_run.error_message,
                "waiting_reason": node_run.waiting_reason,
                "started_at": node_run.started_at,
                "phase_started_at": node_run.phase_started_at,
                "finished_at": node_run.finished_at,
            }
            for node_run in artifacts.node_runs
        ],
        artifacts=[serialize_run_artifact(artifact) for artifact in artifacts.artifacts],
        tool_calls=[serialize_tool_call(tool_call) for tool_call in artifacts.tool_calls],
        ai_calls=[serialize_ai_call(ai_call) for ai_call in artifacts.ai_calls],
        events=(
            [serialize_run_event(event) for event in artifacts.events] if include_events else []
        ),
    )


class RunViewService:
    def __init__(self, runtime_service: RuntimeService | None = None) -> None:
        self._runtime_service = runtime_service or RuntimeService()

    def get_execution_view(self, db: Session, run_id: str) -> RunExecutionView | None:
        artifacts = self._runtime_service.load_run(db, run_id)
        if artifacts is None:
            return None

        callback_tickets = self._list_callback_tickets(db, run_id)
        assistant_call_count = sum(1 for call in artifacts.ai_calls if call.assistant)

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
                artifact_count=len(artifacts.artifacts),
                tool_call_count=len(artifacts.tool_calls),
                ai_call_count=len(artifacts.ai_calls),
                assistant_call_count=assistant_call_count,
                callback_ticket_count=len(callback_tickets),
                artifact_kind_counts=dict(
                    sorted(Counter(item.artifact_kind for item in artifacts.artifacts).items())
                ),
                tool_status_counts=dict(
                    sorted(Counter(item.status for item in artifacts.tool_calls).items())
                ),
                ai_role_counts=dict(
                    sorted(Counter(item.role for item in artifacts.ai_calls).items())
                ),
                callback_ticket_status_counts=dict(
                    sorted(Counter(item.status for item in callback_tickets).items())
                ),
                callback_waiting=serialize_run_callback_waiting_summary(artifacts.node_runs),
            ),
            nodes=self._build_execution_nodes(artifacts, callback_tickets),
        )

    def get_evidence_view(self, db: Session, run_id: str) -> RunEvidenceView | None:
        artifacts = self._runtime_service.load_run(db, run_id)
        if artifacts is None:
            return None

        artifact_by_id = {artifact.id: artifact for artifact in artifacts.artifacts}
        artifacts_by_node_run = self._group_by_node_run(artifacts.artifacts)
        tool_calls_by_node_run = self._group_by_node_run(artifacts.tool_calls)
        ai_calls_by_node_run = self._group_by_node_run(artifacts.ai_calls)

        evidence_nodes: list[RunEvidenceNodeItem] = []
        total_artifact_count = 0
        total_tool_call_count = 0
        total_assistant_call_count = 0

        for node_run in artifacts.node_runs:
            node_evidence = dict(node_run.evidence_context or {})
            assistant_calls = [
                call for call in ai_calls_by_node_run[node_run.id] if call.assistant
            ]
            if not node_evidence and not assistant_calls:
                continue

            supporting_artifacts = self._resolve_supporting_artifacts(
                node_run=node_run,
                artifact_by_id=artifact_by_id,
                fallback_artifacts=artifacts_by_node_run[node_run.id],
            )
            tool_calls = tool_calls_by_node_run[node_run.id]
            total_artifact_count += len(supporting_artifacts)
            total_tool_call_count += len(tool_calls)
            total_assistant_call_count += len(assistant_calls)

            evidence_nodes.append(
                RunEvidenceNodeItem(
                    node_run_id=node_run.id,
                    node_id=node_run.node_id,
                    node_name=node_run.node_name,
                    node_type=node_run.node_type,
                    status=node_run.status,
                    phase=node_run.phase,
                    summary=str(node_evidence.get("summary") or ""),
                    key_points=self._normalize_string_list(node_evidence.get("key_points")),
                    evidence=[
                        EvidenceEntryItem(
                            title=str(item.get("title") or ""),
                            detail=str(item.get("detail") or ""),
                            source_ref=self._optional_string(item.get("source_ref")),
                        )
                        for item in node_evidence.get("evidence", [])
                        if isinstance(item, dict)
                    ],
                    conflicts=self._normalize_string_list(node_evidence.get("conflicts")),
                    unknowns=self._normalize_string_list(node_evidence.get("unknowns")),
                    recommended_focus=self._normalize_string_list(
                        node_evidence.get("recommended_focus")
                    ),
                    confidence=self._optional_float(node_evidence.get("confidence")),
                    artifact_refs=list(node_run.artifact_refs or []),
                    decision_output=node_run.output_payload or {},
                    tool_calls=[serialize_tool_call(tool_call) for tool_call in tool_calls],
                    assistant_calls=[serialize_ai_call(ai_call) for ai_call in assistant_calls],
                    supporting_artifacts=[
                        serialize_run_artifact(artifact) for artifact in supporting_artifacts
                    ],
                )
            )

        return RunEvidenceView(
            run_id=artifacts.run.id,
            workflow_id=artifacts.run.workflow_id,
            workflow_version=artifacts.run.workflow_version,
            status=artifacts.run.status,
            summary=RunEvidenceSummary(
                node_count=len(evidence_nodes),
                artifact_count=total_artifact_count,
                tool_call_count=total_tool_call_count,
                assistant_call_count=total_assistant_call_count,
            ),
            nodes=evidence_nodes,
        )

    def _build_execution_nodes(
        self,
        artifacts: ExecutionArtifacts,
        callback_tickets: list[RunCallbackTicket],
    ) -> list[RunExecutionNodeItem]:
        artifacts_by_node_run = self._group_by_node_run(artifacts.artifacts)
        tool_calls_by_node_run = self._group_by_node_run(artifacts.tool_calls)
        ai_calls_by_node_run = self._group_by_node_run(artifacts.ai_calls)
        events_by_node_run = self._group_by_node_run(
            [event for event in artifacts.events if event.node_run_id is not None]
        )
        tickets_by_node_run = self._group_by_node_run(callback_tickets)

        return [
            RunExecutionNodeItem(
                node_run_id=node_run.id,
                node_id=node_run.node_id,
                node_name=node_run.node_name,
                node_type=node_run.node_type,
                status=node_run.status,
                phase=node_run.phase,
                **execution_policy_from_node_run_input(
                    node_run.input_payload,
                    node_type=node_run.node_type,
                ).as_execution_view_payload(),
                retry_count=node_run.retry_count,
                waiting_reason=node_run.waiting_reason,
                error_message=node_run.error_message,
                started_at=node_run.started_at,
                finished_at=node_run.finished_at,
                event_count=len(events_by_node_run[node_run.id]),
                event_type_counts=dict(
                    sorted(
                        Counter(
                            event.event_type for event in events_by_node_run[node_run.id]
                        ).items()
                    )
                ),
                last_event_type=(
                    events_by_node_run[node_run.id][-1].event_type
                    if events_by_node_run[node_run.id]
                    else None
                ),
                artifact_refs=list(node_run.artifact_refs or []),
                artifacts=[
                    serialize_run_artifact(artifact)
                    for artifact in artifacts_by_node_run[node_run.id]
                ],
                tool_calls=[
                    serialize_tool_call(tool_call)
                    for tool_call in tool_calls_by_node_run[node_run.id]
                ],
                ai_calls=[
                    serialize_ai_call(ai_call) for ai_call in ai_calls_by_node_run[node_run.id]
                ],
                callback_tickets=[
                    self._serialize_callback_ticket(ticket)
                    for ticket in tickets_by_node_run[node_run.id]
                ],
                callback_waiting_lifecycle=serialize_callback_waiting_lifecycle_summary(
                    node_run.checkpoint_payload
                ),
            )
            for node_run in artifacts.node_runs
        ]

    def _list_callback_tickets(self, db: Session, run_id: str) -> list[RunCallbackTicket]:
        return db.scalars(
            select(RunCallbackTicket)
            .where(RunCallbackTicket.run_id == run_id)
            .order_by(RunCallbackTicket.created_at.asc())
        ).all()

    def _serialize_callback_ticket(self, ticket: RunCallbackTicket) -> RunCallbackTicketItem:
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
            created_at=_normalize_datetime(ticket.created_at),
            expires_at=_normalize_datetime(ticket.expires_at),
            consumed_at=_normalize_datetime(ticket.consumed_at),
            canceled_at=_normalize_datetime(ticket.canceled_at),
            expired_at=_normalize_datetime(ticket.expired_at),
        )

    def _resolve_supporting_artifacts(
        self,
        *,
        node_run: NodeRun,
        artifact_by_id: dict[str, RunArtifact],
        fallback_artifacts: list[RunArtifact],
    ) -> list[RunArtifact]:
        resolved: list[RunArtifact] = []
        seen_ids: set[str] = set()
        for artifact_ref in node_run.artifact_refs or []:
            artifact_id = self._artifact_id_from_ref(str(artifact_ref))
            if artifact_id is None or artifact_id in seen_ids:
                continue
            artifact = artifact_by_id.get(artifact_id)
            if artifact is None:
                continue
            resolved.append(artifact)
            seen_ids.add(artifact_id)

        if resolved:
            return resolved

        for artifact in fallback_artifacts:
            if artifact.id in seen_ids:
                continue
            resolved.append(artifact)
            seen_ids.add(artifact.id)
        return resolved

    def _artifact_id_from_ref(self, value: str) -> str | None:
        prefix = "artifact://"
        if not value.startswith(prefix):
            return None
        artifact_id = value.removeprefix(prefix).strip()
        return artifact_id or None

    def _group_by_node_run(self, items: list[object]) -> dict[str, list[object]]:
        grouped: dict[str, list[object]] = defaultdict(list)
        for item in items:
            node_run_id = getattr(item, "node_run_id", None)
            if node_run_id is None:
                continue
            grouped[str(node_run_id)].append(item)
        return grouped

    def _normalize_string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value if str(item).strip()]

    def _optional_string(self, value: object) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    def _optional_float(self, value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, (float, int)):
            return float(value)
        return None
