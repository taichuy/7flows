from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import Run, RunEvent
from app.schemas.run import (
    RunTrace,
    RunTraceEventItem,
    RunTraceFilters,
    RunTraceSummary,
)


def load_run_trace(
    db: Session,
    *,
    run_id: str,
    cursor: str | None,
    event_type: str | None,
    node_run_id: str | None,
    created_after: datetime | None,
    created_before: datetime | None,
    payload_key: str | None,
    before_event_id: int | None,
    after_event_id: int | None,
    limit: int,
    order: Literal["asc", "desc"],
) -> RunTrace:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")

    if cursor is not None:
        before_event_id, after_event_id, order = _decode_trace_cursor(cursor)

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
    return _create_run_trace(
        run_id=run_id,
        cursor=cursor,
        event_type=event_type,
        node_run_id=node_run_id,
        created_after=created_after,
        created_before=created_before,
        payload_key=payload_key,
        before_event_id=before_event_id,
        after_event_id=after_event_id,
        limit=limit,
        order=order,
        run_events=run_events,
    )


def build_trace_export_filename(
    run_id: str,
    export_format: Literal["json", "jsonl"],
) -> str:
    suffix = "json" if export_format == "json" else "jsonl"
    return f"run-{run_id}-trace.{suffix}"


def serialize_trace_export_jsonl(trace: RunTrace) -> str:
    exported_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    lines = [
        json.dumps(
            {
                "record_type": "trace",
                "run_id": trace.run_id,
                "exported_at": exported_at,
                "filters": trace.filters.model_dump(mode="json"),
                "summary": trace.summary.model_dump(mode="json"),
            },
            ensure_ascii=False,
        )
    ]
    lines.extend(
        json.dumps(
            {
                "record_type": "event",
                **event.model_dump(mode="json"),
            },
            ensure_ascii=False,
        )
        for event in trace.events
    )
    return "\n".join(lines) + "\n"


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


def _encode_trace_cursor(
    *,
    before_event_id: int | None = None,
    after_event_id: int | None = None,
    order: Literal["asc", "desc"],
) -> str:
    payload = {
        "v": 1,
        "before_event_id": before_event_id,
        "after_event_id": after_event_id,
        "order": order,
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_trace_cursor(cursor: str) -> tuple[int | None, int | None, Literal["asc", "desc"]]:
    normalized_cursor = cursor.strip()
    if not normalized_cursor:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cursor must not be empty.",
        )

    padding = "=" * (-len(normalized_cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(f"{normalized_cursor}{padding}".encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cursor is invalid.",
        ) from exc

    version = payload.get("v")
    before_event_id = payload.get("before_event_id")
    after_event_id = payload.get("after_event_id")
    order = payload.get("order")

    if version != 1 or order not in {"asc", "desc"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cursor is invalid.",
        )
    if before_event_id is not None and not isinstance(before_event_id, int):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cursor is invalid.",
        )
    if after_event_id is not None and not isinstance(after_event_id, int):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cursor is invalid.",
        )
    if (before_event_id is None) == (after_event_id is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cursor is invalid.",
        )

    return before_event_id, after_event_id, order


def _build_trace_cursor(
    *,
    before_event_id: int | None = None,
    after_event_id: int | None = None,
    order: Literal["asc", "desc"],
) -> str:
    return _encode_trace_cursor(
        before_event_id=before_event_id,
        after_event_id=after_event_id,
        order=order,
    )


def _create_run_trace(
    *,
    run_id: str,
    cursor: str | None,
    event_type: str | None,
    node_run_id: str | None,
    created_after: datetime | None,
    created_before: datetime | None,
    payload_key: str | None,
    before_event_id: int | None,
    after_event_id: int | None,
    limit: int,
    order: Literal["asc", "desc"],
    run_events: list[RunEvent],
) -> RunTrace:
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
    trace_started_at = (
        _normalize_filter_datetime(run_events[0].created_at) if run_events else None
    )
    trace_finished_at = (
        _normalize_filter_datetime(run_events[-1].created_at) if run_events else None
    )
    sequence_by_event_id = {event.id: index + 1 for index, event in enumerate(run_events)}
    base_filtered_events = [
        event
        for event in run_events
        if _event_matches_trace_filters(
            event,
            event_type=event_type,
            node_run_id=node_run_id,
            created_after=created_after,
            created_before=created_before,
            payload_key=payload_key,
            before_event_id=None,
            after_event_id=None,
        )
    ]
    matched_events = [
        event
        for event in base_filtered_events
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
        _normalize_filter_datetime(matched_events[0].created_at)
        if matched_events
        else None
    )
    matched_finished_at = (
        _normalize_filter_datetime(matched_events[-1].created_at)
        if matched_events
        else None
    )

    ordered_matched_events = matched_events if order == "asc" else list(reversed(matched_events))
    events = ordered_matched_events[: limit + 1]

    has_more = len(events) > limit
    if has_more:
        events = events[:limit]

    normalized_returned_datetimes = [
        _normalize_filter_datetime(event.created_at) for event in events
    ]
    returned_started_at = (
        min(normalized_returned_datetimes) if normalized_returned_datetimes else None
    )
    returned_finished_at = (
        max(normalized_returned_datetimes) if normalized_returned_datetimes else None
    )
    returned_duration_ms = 0
    if returned_started_at is not None and returned_finished_at is not None:
        returned_duration_ms = max(
            0,
            int((returned_finished_at - returned_started_at).total_seconds() * 1000),
        )

    prev_cursor: str | None = None
    next_cursor: str | None = None
    if events:
        first_returned_event = events[0]
        last_returned_event = events[-1]
        has_earlier_base_events = any(
            event.id < first_returned_event.id for event in base_filtered_events
        )
        has_later_base_events = any(
            event.id > last_returned_event.id for event in base_filtered_events
        )

        if order == "asc":
            if has_more:
                next_cursor = _build_trace_cursor(
                    after_event_id=last_returned_event.id,
                    order="asc",
                )
            if has_earlier_base_events:
                prev_cursor = _build_trace_cursor(
                    before_event_id=first_returned_event.id,
                    order="desc",
                )
        else:
            if has_more:
                next_cursor = _build_trace_cursor(
                    before_event_id=last_returned_event.id,
                    order="desc",
                )
            if has_later_base_events:
                prev_cursor = _build_trace_cursor(
                    after_event_id=first_returned_event.id,
                    order="asc",
                )

    return RunTrace(
        run_id=run_id,
        filters=RunTraceFilters(
            cursor=cursor,
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
            returned_started_at=returned_started_at,
            returned_finished_at=returned_finished_at,
            returned_duration_ms=returned_duration_ms,
            next_cursor=next_cursor,
            prev_cursor=prev_cursor,
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
