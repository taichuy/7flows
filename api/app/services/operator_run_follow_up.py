from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.schemas.run_views import RunExecutionView
from app.services.operator_follow_up_snapshots import (
    build_operator_run_follow_up_explanation,
    build_operator_run_snapshot,
    build_waiting_reason_lookup,
)
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
    waiting_reason_lookup = build_waiting_reason_lookup([run], node_runs)
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
    waiting_reason_lookup = build_waiting_reason_lookup(runs, node_runs)
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
    waiting_reason_lookup = build_waiting_reason_lookup(runs, node_runs)
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

    summary.explanation = build_operator_run_follow_up_explanation(summary)
    return summary
