from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.models.run import RunEvent
from app.schemas.run import (
    RunTrace,
    RunTraceEventItem,
    RunTraceFilters,
    RunTraceSummary,
)
from app.services.run_trace_cursor import build_trace_cursor
from app.services.run_trace_filters import (
    collect_payload_keys,
    event_matches_trace_filters,
    normalize_filter_datetime,
)


def serialize_trace_event(
    event: RunEvent,
    *,
    sequence: int,
    trace_started_at: datetime | None,
) -> RunTraceEventItem:
    event_created_at = normalize_filter_datetime(event.created_at)
    normalized_trace_started_at = normalize_filter_datetime(trace_started_at)
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


def create_run_trace(
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
            for payload_key_name in collect_payload_keys(event.payload)
        }
    )
    trace_started_at = normalize_filter_datetime(run_events[0].created_at) if run_events else None
    trace_finished_at = normalize_filter_datetime(run_events[-1].created_at) if run_events else None
    sequence_by_event_id = {event.id: index + 1 for index, event in enumerate(run_events)}
    base_filtered_events = [
        event
        for event in run_events
        if event_matches_trace_filters(
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
        if event_matches_trace_filters(
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
        normalize_filter_datetime(matched_events[0].created_at) if matched_events else None
    )
    matched_finished_at = (
        normalize_filter_datetime(matched_events[-1].created_at) if matched_events else None
    )

    ordered_matched_events = matched_events if order == "asc" else list(reversed(matched_events))
    events = ordered_matched_events[: limit + 1]

    has_more = len(events) > limit
    if has_more:
        events = events[:limit]

    normalized_returned_datetimes = [
        normalize_filter_datetime(event.created_at) for event in events
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
                next_cursor = build_trace_cursor(
                    after_event_id=last_returned_event.id,
                    order="asc",
                )
            if has_earlier_base_events:
                prev_cursor = build_trace_cursor(
                    before_event_id=first_returned_event.id,
                    order="desc",
                )
        else:
            if has_more:
                next_cursor = build_trace_cursor(
                    before_event_id=last_returned_event.id,
                    order="desc",
                )
            if has_later_base_events:
                prev_cursor = build_trace_cursor(
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
            serialize_trace_event(
                event,
                sequence=sequence_by_event_id[event.id],
                trace_started_at=trace_started_at,
            )
            for event in events
        ],
    )
