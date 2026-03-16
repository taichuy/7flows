from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import Run, RunEvent
from app.schemas.run import RunTrace
from app.services.run_trace_builder import create_run_trace
from app.services.run_trace_cursor import decode_trace_cursor
from app.services.run_trace_filters import (
    normalize_filter_datetime,
    normalize_payload_key,
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
        before_event_id, after_event_id, order = decode_trace_cursor(cursor)

    created_after = normalize_filter_datetime(created_after)
    created_before = normalize_filter_datetime(created_before)
    payload_key = normalize_payload_key(payload_key)
    if created_after is not None and created_before is not None and created_after > created_before:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="created_after must be earlier than or equal to created_before.",
        )

    run_events = db.scalars(
        select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.id.asc())
    ).all()
    return create_run_trace(
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
