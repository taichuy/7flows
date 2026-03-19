from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.run_views import RunExecutionView
from app.services.run_views import RunViewService


run_view_service = RunViewService()


def _join_parts(parts: Iterable[str | None]) -> str | None:
    normalized = [part.strip() for part in parts if isinstance(part, str) and part.strip()]
    if not normalized:
        return None
    return " ".join(normalized)


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


def _build_operator_run_follow_up_explanation(
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
        primary_signal = f"本次影响 {summary.affected_run_count} 个 run；当前还未读取到可用的 run 快照。"

    sample_summaries = []
    for item in summary.sampled_runs:
        snapshot_summary = _format_run_snapshot_summary(item.snapshot)
        sample_summaries.append(
            (
                f"run {item.run_id}：{snapshot_summary}"
                if snapshot_summary
                else f"run {item.run_id}：暂未读取到最新快照。"
            )
        )

    remaining_count = max(summary.affected_run_count - sample_count, 0)
    follow_up = _join_parts(
        [
            " ".join(sample_summaries) if sample_summaries else None,
            (
                f"其余 {remaining_count} 个 run 可继续到对应 run detail / inbox slice 查看后续推进。"
                if remaining_count > 0
                else None
            ),
        ]
    )

    return SignalFollowUpExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )


def _normalize_run_ids(run_ids: Iterable[str | None], *, limit: int | None = None) -> list[str]:
    normalized: list[str] = []
    for run_id in run_ids:
        candidate = str(run_id or "").strip()
        if not candidate or candidate in normalized:
            continue
        normalized.append(candidate)
        if limit is not None and len(normalized) >= limit:
            break
    return normalized


def _build_waiting_reason_lookup(
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
) -> OperatorRunSnapshot | None:
    if run is None:
        return None
    execution_focus_node = (
        execution_view.execution_focus_node if execution_view is not None else None
    )
    return OperatorRunSnapshot(
        workflow_id=run.workflow_id,
        status=run.status,
        current_node_id=run.current_node_id,
        waiting_reason=waiting_reason,
        execution_focus_reason=(
            execution_view.execution_focus_reason if execution_view is not None else None
        ),
        execution_focus_node_id=(
            execution_focus_node.node_id if execution_focus_node is not None else None
        ),
        execution_focus_node_run_id=(
            execution_focus_node.node_run_id if execution_focus_node is not None else None
        ),
        execution_focus_explanation=(
            execution_view.execution_focus_explanation
            if execution_view is not None
            else None
        ),
        callback_waiting_explanation=(
            execution_focus_node.callback_waiting_explanation
            if execution_focus_node is not None
            else None
        ),
    )


def _load_execution_view_map(
    db: Session,
    run_ids: list[str],
) -> dict[str, RunExecutionView]:
    execution_view_map: dict[str, RunExecutionView] = {}
    for run_id in run_ids:
        execution_view = run_view_service.get_execution_view(db, run_id)
        if execution_view is not None:
            execution_view_map[run_id] = execution_view
    return execution_view_map


def load_operator_run_snapshot(
    db: Session,
    run_id: str | None,
) -> OperatorRunSnapshot | None:
    normalized_run_ids = _normalize_run_ids([run_id], limit=1)
    if not normalized_run_ids:
        return None

    run = db.get(Run, normalized_run_ids[0])
    if run is None:
        return None

    node_runs = (
        db.query(NodeRun)
        .filter(NodeRun.run_id == run.id)
        .all()
    )
    waiting_reason_lookup = _build_waiting_reason_lookup([run], node_runs)
    execution_view_map = _load_execution_view_map(db, [run.id])
    return build_operator_run_snapshot(
        run,
        waiting_reason=waiting_reason_lookup.get(run.id),
        execution_view=execution_view_map.get(run.id),
    )


def build_operator_run_follow_up_summary(
    db: Session,
    run_ids: Iterable[str | None],
    *,
    sample_limit: int = 3,
) -> OperatorRunFollowUpSummary:
    normalized_run_ids = _normalize_run_ids(run_ids)
    if not normalized_run_ids:
        return OperatorRunFollowUpSummary()

    runs = db.query(Run).filter(Run.id.in_(normalized_run_ids)).all()
    run_lookup = {run.id: run for run in runs}
    existing_run_ids = list(run_lookup)
    node_runs = (
        db.query(NodeRun).filter(NodeRun.run_id.in_(existing_run_ids)).all()
        if existing_run_ids
        else []
    )
    waiting_reason_lookup = _build_waiting_reason_lookup(runs, node_runs)
    execution_view_map = _load_execution_view_map(
        db, normalized_run_ids[: max(sample_limit, 0)]
    )

    return _build_operator_run_follow_up_summary(
        normalized_run_ids,
        run_lookup=run_lookup,
        waiting_reason_lookup=waiting_reason_lookup,
        execution_view_map=execution_view_map,
        sample_limit=sample_limit,
    )


def build_operator_run_follow_up_summary_map(
    db: Session,
    run_ids: Iterable[str | None],
    *,
    sample_limit: int = 1,
) -> dict[str, OperatorRunFollowUpSummary]:
    normalized_run_ids = _normalize_run_ids(run_ids)
    if not normalized_run_ids:
        return {}

    runs = db.query(Run).filter(Run.id.in_(normalized_run_ids)).all()
    run_lookup = {run.id: run for run in runs}
    existing_run_ids = list(run_lookup)
    node_runs = (
        db.query(NodeRun).filter(NodeRun.run_id.in_(existing_run_ids)).all()
        if existing_run_ids
        else []
    )
    waiting_reason_lookup = _build_waiting_reason_lookup(runs, node_runs)
    execution_view_map = _load_execution_view_map(db, existing_run_ids)

    return {
        run_id: _build_operator_run_follow_up_summary(
            [run_id],
            run_lookup=run_lookup,
            waiting_reason_lookup=waiting_reason_lookup,
            execution_view_map=execution_view_map,
            sample_limit=sample_limit,
        )
        for run_id in existing_run_ids
    }


def _build_operator_run_follow_up_summary(
    normalized_run_ids: list[str],
    *,
    run_lookup: dict[str, Run],
    waiting_reason_lookup: dict[str, str | None],
    execution_view_map: dict[str, RunExecutionView],
    sample_limit: int,
) -> OperatorRunFollowUpSummary:
    sampled_run_ids = normalized_run_ids[: max(sample_limit, 0)]

    summary = OperatorRunFollowUpSummary(
        affected_run_count=len(normalized_run_ids),
        sampled_run_count=len(sampled_run_ids),
    )

    for run_id in normalized_run_ids:
        snapshot = build_operator_run_snapshot(
            run_lookup.get(run_id),
            waiting_reason=waiting_reason_lookup.get(run_id),
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
        else:
            summary.unknown_run_count += 1

    for run_id in sampled_run_ids:
        snapshot = build_operator_run_snapshot(
            run_lookup.get(run_id),
            waiting_reason=waiting_reason_lookup.get(run_id),
            execution_view=execution_view_map.get(run_id),
        )
        summary.sampled_runs.append(
            OperatorRunSnapshotSample(
                run_id=run_id,
                snapshot=snapshot,
            )
        )

    summary.explanation = _build_operator_run_follow_up_explanation(summary)
    return summary
