from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy.orm import Session

from app.models.run import NodeRun, RunArtifact
from app.schemas.run import RunDetail, RunDetailExecutionFocusNode, RunOverview
from app.schemas.run_views import (
    EvidenceEntryItem,
    RunEvidenceNodeItem,
    RunEvidenceSummary,
    RunEvidenceView,
    RunExecutionView,
)
from app.schemas.workflow import WorkflowToolGovernanceSummary
from app.services.operator_follow_up_snapshots import build_operator_run_snapshot
from app.services.run_execution_views import build_run_execution_view, list_callback_tickets
from app.services.run_view_serializers import (
    serialize_ai_call,
    serialize_run_artifact,
    serialize_run_event,
    serialize_tool_call,
)
from app.services.runtime import RuntimeService
from app.services.runtime_records import ExecutionArtifacts
from app.services.sensitive_access_timeline import load_sensitive_access_timeline
from app.services.workflow_publish import WorkflowPublishBindingService
from app.services.workflow_views import load_workflow_run_tool_governance_summary

workflow_publish_service = WorkflowPublishBindingService()


def _load_run_legacy_auth_governance(
    db: Session,
    workflow_id: str,
):
    snapshot = workflow_publish_service.build_legacy_auth_governance_snapshot(
        db,
        workflow_id=workflow_id,
    )
    return snapshot if snapshot.binding_count > 0 else None


def load_run_legacy_auth_governance_summary(
    db: Session,
    workflow_id: str,
):
    return _load_run_legacy_auth_governance(db, workflow_id)


def _hydrate_sampled_run_follow_up(
    run_follow_up,
    *,
    legacy_auth_governance=None,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
):
    if run_follow_up is None:
        return None

    sampled_runs = []
    for sample in run_follow_up.sampled_runs:
        updates = {}
        if tool_governance is not None:
            updates["tool_governance"] = tool_governance
        if legacy_auth_governance is not None:
            updates["legacy_auth_governance"] = legacy_auth_governance
        sampled_runs.append(sample.model_copy(update=updates) if updates else sample)

    return run_follow_up.model_copy(update={"sampled_runs": sampled_runs})


def _hydrate_sensitive_access_entries(
    entries,
    *,
    legacy_auth_governance=None,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
):
    hydrated_entries = []
    for entry in entries:
        updates = {
            "run_follow_up": _hydrate_sampled_run_follow_up(
                entry.run_follow_up,
                legacy_auth_governance=legacy_auth_governance,
                tool_governance=tool_governance,
            )
        }
        if legacy_auth_governance is not None:
            updates["legacy_auth_governance"] = legacy_auth_governance
        hydrated_entries.append(entry.model_copy(update=updates))
    return hydrated_entries


def _hydrate_sensitive_access_payloads(
    entries,
    *,
    legacy_auth_governance_payload: dict | None = None,
):
    hydrated_entries = []
    for entry in entries:
        updated_entry = {**entry}
        if legacy_auth_governance_payload is not None:
            updated_entry["legacy_auth_governance"] = legacy_auth_governance_payload
        hydrated_entries.append(updated_entry)
    return hydrated_entries


def _attach_run_governance_to_execution_view(
    execution_view: RunExecutionView,
    *,
    legacy_auth_governance=None,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
) -> None:
    if legacy_auth_governance is None and tool_governance is None:
        return

    legacy_auth_governance_payload = (
        legacy_auth_governance.model_dump(mode="json")
        if legacy_auth_governance is not None
        else None
    )
    execution_view.nodes = [
        node.model_copy(
            update={
                "sensitive_access_entries": _hydrate_sensitive_access_entries(
                    node.sensitive_access_entries,
                    legacy_auth_governance=legacy_auth_governance,
                    tool_governance=tool_governance,
                )
            }
        )
        if node.sensitive_access_entries
        else node
        for node in execution_view.nodes
    ]

    if (
        execution_view.execution_focus_node is not None
        and execution_view.execution_focus_node.sensitive_access_entries
    ):
        execution_view.execution_focus_node = execution_view.execution_focus_node.model_copy(
            update={
                "sensitive_access_entries": _hydrate_sensitive_access_entries(
                    execution_view.execution_focus_node.sensitive_access_entries,
                    legacy_auth_governance=legacy_auth_governance,
                    tool_governance=tool_governance,
                )
            }
        )

    if execution_view.run_follow_up is None:
        return

    sampled_runs = []
    for sample in execution_view.run_follow_up.sampled_runs:
        updates = {}
        if tool_governance is not None:
            updates["tool_governance"] = tool_governance
        if legacy_auth_governance is not None:
            updates["legacy_auth_governance"] = legacy_auth_governance
        if sample.sensitive_access_entries:
            updates["sensitive_access_entries"] = _hydrate_sensitive_access_payloads(
                sample.sensitive_access_entries,
                legacy_auth_governance_payload=legacy_auth_governance_payload,
            )
        sampled_runs.append(sample.model_copy(update=updates) if updates else sample)

    execution_view.run_follow_up = execution_view.run_follow_up.model_copy(
        update={"sampled_runs": sampled_runs}
    )


def _serialize_run_detail_execution_focus_node(
    execution_view: RunExecutionView | None,
) -> RunDetailExecutionFocusNode | None:
    focus_node = execution_view.execution_focus_node if execution_view is not None else None
    if focus_node is None:
        return None

    return RunDetailExecutionFocusNode(
        node_run_id=focus_node.node_run_id,
        node_id=focus_node.node_id,
        node_name=focus_node.node_name,
        node_type=focus_node.node_type,
        status=focus_node.status,
        callback_waiting_explanation=focus_node.callback_waiting_explanation,
        callback_waiting_lifecycle=(
            focus_node.callback_waiting_lifecycle.model_dump()
            if focus_node.callback_waiting_lifecycle is not None
            else None
        ),
        phase=focus_node.phase,
        execution_class=focus_node.execution_class,
        execution_source=focus_node.execution_source,
        requested_execution_class=focus_node.requested_execution_class,
        requested_execution_source=focus_node.requested_execution_source,
        requested_execution_profile=focus_node.requested_execution_profile,
        requested_execution_timeout_ms=focus_node.requested_execution_timeout_ms,
        requested_execution_network_policy=focus_node.requested_execution_network_policy,
        requested_execution_filesystem_policy=(
            focus_node.requested_execution_filesystem_policy
        ),
        requested_execution_dependency_mode=(
            focus_node.requested_execution_dependency_mode
        ),
        requested_execution_builtin_package_set=(
            focus_node.requested_execution_builtin_package_set
        ),
        requested_execution_dependency_ref=focus_node.requested_execution_dependency_ref,
        requested_execution_backend_extensions=(
            dict(focus_node.requested_execution_backend_extensions)
            if focus_node.requested_execution_backend_extensions
            else None
        ),
        effective_execution_class=focus_node.effective_execution_class,
        execution_executor_ref=focus_node.execution_executor_ref,
        execution_sandbox_backend_id=focus_node.execution_sandbox_backend_id,
        execution_sandbox_backend_executor_ref=(
            focus_node.execution_sandbox_backend_executor_ref
        ),
        execution_sandbox_runner_kind=focus_node.execution_sandbox_runner_kind,
        execution_blocking_reason=focus_node.execution_blocking_reason,
        execution_fallback_reason=focus_node.execution_fallback_reason,
        scheduled_resume_delay_seconds=focus_node.scheduled_resume_delay_seconds,
        scheduled_resume_reason=focus_node.scheduled_resume_reason,
        scheduled_resume_source=focus_node.scheduled_resume_source,
        scheduled_waiting_status=focus_node.scheduled_waiting_status,
        scheduled_resume_scheduled_at=focus_node.scheduled_resume_scheduled_at,
        scheduled_resume_due_at=focus_node.scheduled_resume_due_at,
        scheduled_resume_requeued_at=focus_node.scheduled_resume_requeued_at,
        scheduled_resume_requeue_source=focus_node.scheduled_resume_requeue_source,
        artifact_refs=list(focus_node.artifact_refs),
        artifacts=list(focus_node.artifacts),
        tool_calls=list(focus_node.tool_calls),
        callback_tickets=[
            ticket.model_dump() for ticket in focus_node.callback_tickets
        ],
        sensitive_access_entries=list(focus_node.sensitive_access_entries),
    )


def serialize_run_overview(
    *,
    run,
    event_count: int,
    event_type_counts: dict[str, int],
    first_event_at,
    last_event_at,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
    legacy_auth_governance=None,
) -> RunOverview:
    return RunOverview(
        id=run.id,
        workflow_id=run.workflow_id,
        workflow_version=run.workflow_version,
        compiled_blueprint_id=run.compiled_blueprint_id,
        status=run.status,
        input_payload=run.input_payload,
        output_payload=run.output_payload,
        checkpoint_payload=run.checkpoint_payload or {},
        error_message=run.error_message,
        current_node_id=run.current_node_id,
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
        event_count=event_count,
        event_type_counts=dict(sorted(event_type_counts.items())),
        first_event_at=first_event_at,
        last_event_at=last_event_at,
        tool_governance=tool_governance,
        legacy_auth_governance=legacy_auth_governance,
    )


def serialize_run_overview_from_artifacts(
    artifacts: ExecutionArtifacts,
    *,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
    legacy_auth_governance=None,
) -> RunOverview:
    event_type_counts = dict(
        sorted(Counter(event.event_type for event in artifacts.events).items())
    )
    first_event_at = artifacts.events[0].created_at if artifacts.events else None
    last_event_at = artifacts.events[-1].created_at if artifacts.events else None
    return serialize_run_overview(
        run=artifacts.run,
        event_count=len(artifacts.events),
        event_type_counts=event_type_counts,
        first_event_at=first_event_at,
        last_event_at=last_event_at,
        tool_governance=tool_governance,
        legacy_auth_governance=legacy_auth_governance,
    )


def serialize_run_detail(
    artifacts: ExecutionArtifacts,
    *,
    include_events: bool = True,
    execution_view: RunExecutionView | None = None,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
) -> RunDetail:
    operator_snapshot = (
        build_operator_run_snapshot(artifacts.run, execution_view=execution_view)
        if execution_view is not None
        else None
    )
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
        blocking_node_run_id=(
            execution_view.blocking_node_run_id if execution_view is not None else None
        ),
        execution_focus_reason=(
            execution_view.execution_focus_reason if execution_view is not None else None
        ),
        execution_focus_node=_serialize_run_detail_execution_focus_node(execution_view),
        execution_focus_explanation=(
            execution_view.execution_focus_explanation if execution_view is not None else None
        ),
        execution_focus_skill_trace=(
            operator_snapshot.execution_focus_skill_trace
            if operator_snapshot is not None
            else None
        ),
        tool_governance=tool_governance,
        legacy_auth_governance=(
            execution_view.legacy_auth_governance if execution_view is not None else None
        ),
        run_follow_up=(execution_view.run_follow_up if execution_view is not None else None),
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


def build_run_execution_view_for_artifacts(
    db: Session,
    artifacts: ExecutionArtifacts,
) -> RunExecutionView:
    callback_tickets = list_callback_tickets(db, artifacts.run.id)
    sensitive_access_timeline = load_sensitive_access_timeline(db, run_id=artifacts.run.id)
    execution_view = build_run_execution_view(
        artifacts,
        callback_tickets,
        sensitive_access_timeline,
    )
    legacy_auth_governance = _load_run_legacy_auth_governance(
        db,
        artifacts.run.workflow_id,
    )
    tool_governance = load_workflow_run_tool_governance_summary(
        db,
        artifacts.run.workflow_id,
        artifacts.run.workflow_version,
    )
    execution_view.legacy_auth_governance = legacy_auth_governance
    _attach_run_governance_to_execution_view(
        execution_view,
        legacy_auth_governance=legacy_auth_governance,
        tool_governance=tool_governance,
    )
    return execution_view


def load_run_tool_governance_summary(
    db: Session,
    artifacts: ExecutionArtifacts,
) -> WorkflowToolGovernanceSummary | None:
    return load_workflow_run_tool_governance_summary(
        db,
        artifacts.run.workflow_id,
        artifacts.run.workflow_version,
    )


def load_run_tool_governance_summary_for_run(
    db: Session,
    *,
    workflow_id: str,
    workflow_version: str,
) -> WorkflowToolGovernanceSummary | None:
    return load_workflow_run_tool_governance_summary(
        db,
        workflow_id,
        workflow_version,
    )


class RunViewService:
    def __init__(self, runtime_service: RuntimeService | None = None) -> None:
        self._runtime_service = runtime_service or RuntimeService()

    def get_execution_view(self, db: Session, run_id: str) -> RunExecutionView | None:
        artifacts = self._runtime_service.load_run(db, run_id)
        if artifacts is None:
            return None

        return build_run_execution_view_for_artifacts(db, artifacts)

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
