from collections.abc import Iterable

from app.models.run import NodeRun, Run
from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.operator_follow_up import (
    OperatorRunFocusArtifactItem,
    OperatorRunFocusSkillLoadItem,
    OperatorRunFocusSkillReferenceItem,
    OperatorRunFocusSkillTrace,
    OperatorRunFocusToolCallItem,
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.schemas.run_views import (
    RunExecutionNodeItem,
    RunExecutionSkillTrace,
    RunExecutionView,
)

MAX_OPERATOR_FOCUS_ARTIFACT_SAMPLES = 3
MAX_OPERATOR_FOCUS_TOOL_CALL_SAMPLES = 3


def _join_parts(parts: Iterable[str | None]) -> str | None:
    normalized = [part.strip() for part in parts if isinstance(part, str) and part.strip()]
    if not normalized:
        return None
    return " ".join(normalized)


def _format_status_distribution(summary: OperatorRunFollowUpSummary) -> str:
    status_counts = [
        ("waiting", summary.waiting_run_count),
        ("running", summary.running_run_count),
        ("succeeded", summary.succeeded_run_count),
        ("failed", summary.failed_run_count),
        ("unknown", summary.unknown_run_count),
    ]
    parts = [f"{status} {count}" for status, count in status_counts if count > 0]
    return "、".join(parts) if parts else "unknown"


def _format_run_snapshot_summary(snapshot: OperatorRunSnapshot | None) -> str | None:
    if snapshot is None:
        return None

    normalized_status = str(snapshot.status or "").strip()
    if not normalized_status:
        return None

    execution_focus_primary_signal = (
        snapshot.execution_focus_explanation.primary_signal.strip()
        if snapshot.execution_focus_explanation is not None
        and snapshot.execution_focus_explanation.primary_signal
        else None
    )
    execution_focus_follow_up = (
        snapshot.execution_focus_explanation.follow_up.strip()
        if snapshot.execution_focus_explanation is not None
        and snapshot.execution_focus_explanation.follow_up
        else None
    )
    callback_waiting_primary_signal = (
        snapshot.callback_waiting_explanation.primary_signal.strip()
        if snapshot.callback_waiting_explanation is not None
        and snapshot.callback_waiting_explanation.primary_signal
        else None
    )
    callback_waiting_follow_up = (
        snapshot.callback_waiting_explanation.follow_up.strip()
        if snapshot.callback_waiting_explanation is not None
        and snapshot.callback_waiting_explanation.follow_up
        else None
    )
    normalized_focus_node_id = str(snapshot.execution_focus_node_id or "").strip() or None
    normalized_current_node_id = str(snapshot.current_node_id or "").strip() or None
    normalized_waiting_reason = str(snapshot.waiting_reason or "").strip() or None
    should_prefer_callback_waiting_explanation = bool(
        callback_waiting_primary_signal
        and (
            execution_focus_primary_signal is None
            or execution_focus_primary_signal.startswith("等待原因：")
        )
    )
    effective_primary_signal = (
        callback_waiting_primary_signal
        if should_prefer_callback_waiting_explanation
        else execution_focus_primary_signal
    )
    effective_follow_up = (
        callback_waiting_follow_up
        if should_prefer_callback_waiting_explanation and callback_waiting_follow_up
        else execution_focus_follow_up
    )

    return _join_parts(
        [
            f"当前 run 状态：{normalized_status}。",
            f"当前节点：{normalized_current_node_id}。"
            if normalized_current_node_id
            else None,
            f"聚焦节点：{normalized_focus_node_id}。"
            if normalized_focus_node_id
            and normalized_focus_node_id != normalized_current_node_id
            else None,
            f"重点信号：{effective_primary_signal}"
            if effective_primary_signal
            else None,
            f"后续动作：{effective_follow_up}"
            if effective_follow_up
            else None,
            f"waiting reason：{normalized_waiting_reason}。"
            if not effective_primary_signal and normalized_waiting_reason
            else None,
        ]
    )


def build_operator_run_follow_up_explanation(
    summary: OperatorRunFollowUpSummary,
) -> SignalFollowUpExplanation | None:
    if summary.affected_run_count <= 0:
        return None

    sample_count = len(summary.sampled_runs)
    if sample_count > 0:
        primary_signal = (
            f"本次影响 {summary.affected_run_count} 个 run；"
            f"整体状态分布：{_format_status_distribution(summary)}。"
            f"已回读 {sample_count} 个样本。"
        )
    else:
        primary_signal = (
            f"本次影响 {summary.affected_run_count} 个 run；"
            "当前还未读取到可用的 run 快照。"
        )

    sample_summaries = []
    for item in summary.sampled_runs:
        snapshot_summary = _format_run_snapshot_summary(item.snapshot)
        sample_summaries.append(
            f"run {item.run_id}：{snapshot_summary}"
            if snapshot_summary
            else f"run {item.run_id}：暂未读取到最新快照。"
        )

    remaining_count = max(summary.affected_run_count - sample_count, 0)
    follow_up = _join_parts(
        [
            " ".join(sample_summaries) if sample_summaries else None,
            (
                f"其余 {remaining_count} 个 run 可继续到对应 run detail / inbox slice "
                "查看后续推进。"
                if remaining_count > 0
                else None
            ),
        ]
    )

    return SignalFollowUpExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )


def _serialize_operator_focus_artifact(
    artifact,
) -> OperatorRunFocusArtifactItem:
    return OperatorRunFocusArtifactItem(
        artifact_kind=artifact.artifact_kind,
        content_type=artifact.content_type,
        summary=artifact.summary,
        uri=artifact.uri,
    )


def _serialize_operator_focus_tool_call(
    tool_call,
) -> OperatorRunFocusToolCallItem:
    return OperatorRunFocusToolCallItem(
        id=tool_call.id,
        tool_id=tool_call.tool_id,
        tool_name=tool_call.tool_name,
        phase=tool_call.phase,
        status=tool_call.status,
        requested_execution_class=tool_call.requested_execution_class,
        requested_execution_source=tool_call.requested_execution_source,
        requested_execution_profile=tool_call.requested_execution_profile,
        requested_execution_timeout_ms=tool_call.requested_execution_timeout_ms,
        requested_execution_network_policy=tool_call.requested_execution_network_policy,
        requested_execution_filesystem_policy=tool_call.requested_execution_filesystem_policy,
        requested_execution_dependency_mode=(
            tool_call.requested_execution_dependency_mode
        ),
        requested_execution_builtin_package_set=(
            tool_call.requested_execution_builtin_package_set
        ),
        requested_execution_dependency_ref=tool_call.requested_execution_dependency_ref,
        requested_execution_backend_extensions=(
            dict(tool_call.requested_execution_backend_extensions)
            if tool_call.requested_execution_backend_extensions
            else None
        ),
        effective_execution_class=tool_call.effective_execution_class,
        execution_executor_ref=tool_call.execution_executor_ref,
        execution_sandbox_backend_id=tool_call.execution_sandbox_backend_id,
        execution_sandbox_backend_executor_ref=(
            tool_call.execution_sandbox_backend_executor_ref
        ),
        execution_sandbox_runner_kind=tool_call.execution_sandbox_runner_kind,
        execution_blocking_reason=tool_call.execution_blocking_reason,
        execution_fallback_reason=tool_call.execution_fallback_reason,
        response_summary=tool_call.response_summary,
        response_content_type=tool_call.response_content_type,
        raw_ref=tool_call.raw_ref,
    )


def _serialize_operator_focus_skill_loads(loads) -> list[OperatorRunFocusSkillLoadItem]:
    serialized: list[OperatorRunFocusSkillLoadItem] = []
    for load in loads or []:
        serialized.append(
            OperatorRunFocusSkillLoadItem(
                phase=load.phase,
                references=[
                    OperatorRunFocusSkillReferenceItem(
                        skill_id=reference.skill_id,
                        skill_name=reference.skill_name,
                        reference_id=reference.reference_id,
                        reference_name=reference.reference_name,
                        load_source=reference.load_source,
                        fetch_reason=reference.fetch_reason,
                        fetch_request_index=reference.fetch_request_index,
                        fetch_request_total=reference.fetch_request_total,
                        retrieval_http_path=reference.retrieval_http_path,
                        retrieval_mcp_method=reference.retrieval_mcp_method,
                        retrieval_mcp_params=dict(reference.retrieval_mcp_params),
                    )
                    for reference in load.references
                ],
            )
        )
    return serialized


def build_waiting_reason_lookup(
    runs: list[Run],
    node_runs: list[NodeRun],
) -> dict[str, str | None]:
    node_runs_by_run: dict[str, list[NodeRun]] = {}
    for node_run in node_runs:
        node_runs_by_run.setdefault(node_run.run_id, []).append(node_run)

    waiting_reason_lookup: dict[str, str | None] = {run.id: None for run in runs}
    for run in runs:
        candidates = node_runs_by_run.get(run.id, [])
        current_node_id = str(run.current_node_id or "").strip()
        if current_node_id:
            current_node_run = next(
                (
                    item
                    for item in candidates
                    if item.node_id == current_node_id and item.finished_at is None
                ),
                None,
            )
            if current_node_run is not None and current_node_run.waiting_reason:
                waiting_reason_lookup[run.id] = current_node_run.waiting_reason
                continue

        waiting_node_run = next(
            (
                item
                for item in candidates
                if item.waiting_reason is not None and item.finished_at is None
            ),
            None,
        )
        waiting_reason_lookup[run.id] = (
            waiting_node_run.waiting_reason if waiting_node_run is not None else None
        )

    return waiting_reason_lookup


def build_operator_run_snapshot(
    run: Run | None,
    *,
    waiting_reason: str | None = None,
    execution_view: RunExecutionView | None = None,
    execution_focus_reason: str | None = None,
    execution_focus_node: RunExecutionNodeItem | None = None,
    execution_focus_explanation: SignalFollowUpExplanation | None = None,
    skill_trace: RunExecutionSkillTrace | None = None,
) -> OperatorRunSnapshot | None:
    if run is None:
        return None

    if execution_view is not None:
        if execution_focus_reason is None:
            execution_focus_reason = execution_view.execution_focus_reason
        if execution_focus_node is None:
            execution_focus_node = execution_view.execution_focus_node
        if execution_focus_explanation is None:
            execution_focus_explanation = execution_view.execution_focus_explanation
        if skill_trace is None:
            skill_trace = execution_view.skill_trace

    focus_artifact_refs = (
        list(execution_focus_node.artifact_refs or []) if execution_focus_node else []
    )
    focus_artifacts = (
        list(execution_focus_node.artifacts or []) if execution_focus_node else []
    )
    focus_tool_calls = (
        list(execution_focus_node.tool_calls or []) if execution_focus_node else []
    )
    focus_skill_trace = None
    if skill_trace is not None and skill_trace.scope == "execution_focus_node":
        focus_trace_node = next(iter(skill_trace.nodes), None)
        focus_skill_trace = OperatorRunFocusSkillTrace(
            reference_count=skill_trace.reference_count,
            phase_counts=dict(skill_trace.phase_counts),
            source_counts=dict(skill_trace.source_counts),
            loads=(
                _serialize_operator_focus_skill_loads(focus_trace_node.loads)
                if focus_trace_node is not None
                else []
            ),
        )

    return OperatorRunSnapshot(
        workflow_id=run.workflow_id,
        status=run.status,
        current_node_id=run.current_node_id,
        waiting_reason=waiting_reason,
        execution_focus_reason=execution_focus_reason,
        execution_focus_node_id=(
            execution_focus_node.node_id if execution_focus_node is not None else None
        ),
        execution_focus_node_run_id=(
            execution_focus_node.node_run_id if execution_focus_node is not None else None
        ),
        execution_focus_node_name=(
            execution_focus_node.node_name if execution_focus_node is not None else None
        ),
        execution_focus_node_type=(
            execution_focus_node.node_type if execution_focus_node is not None else None
        ),
        execution_focus_explanation=execution_focus_explanation,
        callback_waiting_explanation=(
            execution_focus_node.callback_waiting_explanation
            if execution_focus_node is not None
            else None
        ),
        callback_waiting_lifecycle=(
            execution_focus_node.callback_waiting_lifecycle.model_dump()
            if execution_focus_node is not None
            and execution_focus_node.callback_waiting_lifecycle is not None
            else None
        ),
        scheduled_resume_delay_seconds=(
            execution_focus_node.scheduled_resume_delay_seconds
            if execution_focus_node is not None
            else None
        ),
        scheduled_resume_reason=(
            execution_focus_node.scheduled_resume_reason
            if execution_focus_node is not None
            else None
        ),
        scheduled_resume_source=(
            execution_focus_node.scheduled_resume_source
            if execution_focus_node is not None
            else None
        ),
        scheduled_waiting_status=(
            execution_focus_node.scheduled_waiting_status
            if execution_focus_node is not None
            else None
        ),
        scheduled_resume_scheduled_at=(
            execution_focus_node.scheduled_resume_scheduled_at
            if execution_focus_node is not None
            else None
        ),
        scheduled_resume_due_at=(
            execution_focus_node.scheduled_resume_due_at
            if execution_focus_node is not None
            else None
        ),
        scheduled_resume_requeued_at=(
            execution_focus_node.scheduled_resume_requeued_at
            if execution_focus_node is not None
            else None
        ),
        scheduled_resume_requeue_source=(
            execution_focus_node.scheduled_resume_requeue_source
            if execution_focus_node is not None
            else None
        ),
        execution_focus_artifact_count=len(focus_artifacts),
        execution_focus_artifact_ref_count=len(focus_artifact_refs),
        execution_focus_tool_call_count=len(focus_tool_calls),
        execution_focus_raw_ref_count=sum(
            1 for item in focus_tool_calls if getattr(item, "raw_ref", None)
        ),
        execution_focus_artifact_refs=focus_artifact_refs[
            :MAX_OPERATOR_FOCUS_ARTIFACT_SAMPLES
        ],
        execution_focus_artifacts=[
            _serialize_operator_focus_artifact(item)
            for item in focus_artifacts[:MAX_OPERATOR_FOCUS_ARTIFACT_SAMPLES]
        ],
        execution_focus_tool_calls=[
            _serialize_operator_focus_tool_call(item)
            for item in focus_tool_calls[:MAX_OPERATOR_FOCUS_TOOL_CALL_SAMPLES]
        ],
        execution_focus_skill_trace=focus_skill_trace,
    )


def build_single_run_follow_up_summary(
    run_id: str,
    snapshot: OperatorRunSnapshot | None,
    *,
    callback_tickets: list[dict] | None = None,
    sensitive_access_entries: list[dict] | None = None,
) -> OperatorRunFollowUpSummary:
    summary = OperatorRunFollowUpSummary(
        affected_run_count=1 if run_id else 0,
        sampled_run_count=1 if run_id else 0,
        sampled_runs=(
            [
                OperatorRunSnapshotSample(
                    run_id=run_id,
                    snapshot=snapshot,
                    callback_tickets=list(callback_tickets or []),
                    sensitive_access_entries=list(sensitive_access_entries or []),
                )
            ]
            if run_id
            else []
        ),
    )

    status = str(snapshot.status or "").strip() if snapshot is not None else ""
    if status == "waiting":
        summary.waiting_run_count += 1
    elif status == "running":
        summary.running_run_count += 1
    elif status == "succeeded":
        summary.succeeded_run_count += 1
    elif status == "failed":
        summary.failed_run_count += 1
    elif run_id:
        summary.unknown_run_count += 1

    summary.explanation = build_operator_run_follow_up_explanation(summary)
    return summary
