from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.schemas.run_views import RunExecutionView
from app.services.run_views import RunViewService


run_view_service = RunViewService()


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

    sampled_run_ids = normalized_run_ids[: max(sample_limit, 0)]
    runs = db.query(Run).filter(Run.id.in_(normalized_run_ids)).all()
    run_lookup = {run.id: run for run in runs}
    existing_run_ids = list(run_lookup)
    node_runs = (
        db.query(NodeRun).filter(NodeRun.run_id.in_(existing_run_ids)).all()
        if existing_run_ids
        else []
    )
    waiting_reason_lookup = _build_waiting_reason_lookup(runs, node_runs)
    execution_view_map = _load_execution_view_map(db, sampled_run_ids)

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

    return summary
