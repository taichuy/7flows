from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.run import Run, RunEvent
from app.models.workflow import Workflow
from app.schemas.run import (
    RunCreate,
    RunDetail,
    RunEventItem,
    RunTrace,
    RunTraceEventItem,
    RunTraceFilters,
    RunTraceSummary,
)
from app.services.runtime import ExecutionArtifacts, RuntimeService, WorkflowExecutionError

router = APIRouter(tags=["runs"])
runtime_service = RuntimeService()


def _normalize_filter_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _collect_payload_keys(payload: object, prefix: str = "") -> set[str]:
    payload_keys: set[str] = set()
    if isinstance(payload, dict):
        for raw_key, value in payload.items():
            key = str(raw_key)
            path = f"{prefix}.{key}" if prefix else key
            payload_keys.add(key)
            payload_keys.add(path)
            payload_keys.update(_collect_payload_keys(value, path))
    elif isinstance(payload, list):
        for item in payload:
            payload_keys.update(_collect_payload_keys(item, prefix))
    return payload_keys


def _payload_matches_key(payload: dict, payload_key: str | None) -> bool:
    if payload_key is None:
        return True
    normalized_key = payload_key.strip().casefold()
    if not normalized_key:
        return True
    return any(normalized_key in key.casefold() for key in _collect_payload_keys(payload))


def _serialize_run(artifacts: ExecutionArtifacts) -> RunDetail:
    return RunDetail(
        id=artifacts.run.id,
        workflow_id=artifacts.run.workflow_id,
        workflow_version=artifacts.run.workflow_version,
        status=artifacts.run.status,
        input_payload=artifacts.run.input_payload,
        output_payload=artifacts.run.output_payload,
        error_message=artifacts.run.error_message,
        started_at=artifacts.run.started_at,
        finished_at=artifacts.run.finished_at,
        created_at=artifacts.run.created_at,
        node_runs=[
            {
                "id": node_run.id,
                "node_id": node_run.node_id,
                "node_name": node_run.node_name,
                "node_type": node_run.node_type,
                "status": node_run.status,
                "input_payload": node_run.input_payload,
                "output_payload": node_run.output_payload,
                "error_message": node_run.error_message,
                "started_at": node_run.started_at,
                "finished_at": node_run.finished_at,
            }
            for node_run in artifacts.node_runs
        ],
        events=[
            _serialize_run_event(event) for event in artifacts.events
        ],
    )


def _serialize_run_event(event: RunEvent) -> RunEventItem:
    return RunEventItem(
        id=event.id,
        run_id=event.run_id,
        node_run_id=event.node_run_id,
        event_type=event.event_type,
        payload=event.payload,
        created_at=event.created_at,
    )


def _event_matches_trace_filters(
    event: RunEvent,
    *,
    event_type: str | None,
    node_run_id: str | None,
    created_after: datetime | None,
    created_before: datetime | None,
    payload_key: str | None,
    before_event_id: int | None,
    after_event_id: int | None,
) -> bool:
    event_created_at = _normalize_filter_datetime(event.created_at)
    if event_type is not None and event.event_type != event_type:
        return False
    if node_run_id is not None and event.node_run_id != node_run_id:
        return False
    if created_after is not None and event_created_at < created_after:
        return False
    if created_before is not None and event_created_at > created_before:
        return False
    if before_event_id is not None and event.id >= before_event_id:
        return False
    if after_event_id is not None and event.id <= after_event_id:
        return False
    if not _payload_matches_key(event.payload, payload_key):
        return False
    return True


def _serialize_trace_event(
    event: RunEvent,
    *,
    sequence: int,
    trace_started_at: datetime | None,
) -> RunTraceEventItem:
    event_created_at = _normalize_filter_datetime(event.created_at)
    normalized_trace_started_at = _normalize_filter_datetime(trace_started_at)
    replay_offset_ms = 0
    if normalized_trace_started_at is not None:
        replay_offset_ms = max(
            0,
            int((event_created_at - normalized_trace_started_at).total_seconds() * 1000),
        )

    return RunTraceEventItem(
        id=event.id,
        run_id=event.run_id,
        node_run_id=event.node_run_id,
        event_type=event.event_type,
        payload=event.payload,
        created_at=event_created_at,
        sequence=sequence,
        replay_offset_ms=replay_offset_ms,
    )


@router.post(
    "/workflows/{workflow_id}/runs",
    response_model=RunDetail,
    status_code=status.HTTP_201_CREATED,
)
def execute_workflow(
    workflow_id: str,
    payload: RunCreate,
    db: Session = Depends(get_db),
) -> RunDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    try:
        artifacts = runtime_service.execute_workflow(db, workflow, payload.input_payload)
    except WorkflowExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return _serialize_run(artifacts)


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunDetail:
    artifacts = runtime_service.load_run(db, run_id)
    if artifacts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return _serialize_run(artifacts)


@router.get("/runs/{run_id}/events", response_model=list[RunEventItem])
def get_run_events(run_id: str, db: Session = Depends(get_db)) -> list[RunEventItem]:
    artifacts = runtime_service.load_run(db, run_id)
    if artifacts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return [_serialize_run_event(event) for event in artifacts.events]


@router.get("/runs/{run_id}/trace", response_model=RunTrace)
def get_run_trace(
    run_id: str,
    event_type: str | None = None,
    node_run_id: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    payload_key: str | None = None,
    before_event_id: int | None = None,
    after_event_id: int | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
) -> RunTrace:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")

    created_after = _normalize_filter_datetime(created_after)
    created_before = _normalize_filter_datetime(created_before)
    payload_key = payload_key.strip() if payload_key is not None else None
    if payload_key == "":
        payload_key = None
    if created_after is not None and created_before is not None and created_after > created_before:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="created_after must be earlier than or equal to created_before.",
        )

    run_events = db.scalars(
        select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.id.asc())
    ).all()
    total_event_count = len(run_events)
    available_event_types = sorted({event.event_type for event in run_events})
    available_node_run_ids = sorted(
        {event.node_run_id for event in run_events if event.node_run_id is not None}
    )
    available_payload_keys = sorted(
        {
            payload_key_name
            for event in run_events
            for payload_key_name in _collect_payload_keys(event.payload)
        }
    )
    trace_started_at = _normalize_filter_datetime(run_events[0].created_at) if run_events else None
    trace_finished_at = _normalize_filter_datetime(run_events[-1].created_at) if run_events else None
    sequence_by_event_id = {
        event.id: index + 1 for index, event in enumerate(run_events)
    }
    matched_events = [
        event
        for event in run_events
        if _event_matches_trace_filters(
            event,
            event_type=event_type,
            node_run_id=node_run_id,
            created_after=created_after,
            created_before=created_before,
            payload_key=payload_key,
            before_event_id=before_event_id,
            after_event_id=after_event_id,
        )
    ]
    matched_event_count = len(matched_events)
    matched_started_at = (
        _normalize_filter_datetime(matched_events[0].created_at) if matched_events else None
    )
    matched_finished_at = (
        _normalize_filter_datetime(matched_events[-1].created_at) if matched_events else None
    )

    ordered_matched_events = matched_events if order == "asc" else list(reversed(matched_events))
    events = ordered_matched_events[: limit + 1]

    has_more = len(events) > limit
    if has_more:
        events = events[:limit]

    return RunTrace(
        run_id=run_id,
        filters=RunTraceFilters(
            event_type=event_type,
            node_run_id=node_run_id,
            created_after=created_after,
            created_before=created_before,
            payload_key=payload_key,
            before_event_id=before_event_id,
            after_event_id=after_event_id,
            limit=limit,
            order=order,
        ),
        summary=RunTraceSummary(
            total_event_count=total_event_count,
            matched_event_count=matched_event_count,
            returned_event_count=len(events),
            available_event_types=available_event_types,
            available_node_run_ids=[item for item in available_node_run_ids if item is not None],
            available_payload_keys=available_payload_keys,
            trace_started_at=trace_started_at,
            trace_finished_at=trace_finished_at,
            matched_started_at=matched_started_at,
            matched_finished_at=matched_finished_at,
            first_event_id=events[0].id if events else None,
            last_event_id=events[-1].id if events else None,
            has_more=has_more,
        ),
        events=[
            _serialize_trace_event(
                event,
                sequence=sequence_by_event_id[event.id],
                trace_started_at=trace_started_at,
            )
            for event in events
        ],
    )
