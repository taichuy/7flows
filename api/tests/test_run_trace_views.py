from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.models.run import RunEvent
from app.services.run_trace_builder import create_run_trace
from app.services.run_trace_cursor import build_trace_cursor, decode_trace_cursor
from app.services.run_trace_filters import collect_payload_keys, normalize_payload_key


def _event(
    event_id: int,
    *,
    event_type: str,
    node_run_id: str | None,
    payload: dict,
    created_at: datetime,
) -> RunEvent:
    return RunEvent(
        id=event_id,
        run_id="run-trace-unit",
        node_run_id=node_run_id,
        event_type=event_type,
        payload=payload,
        created_at=created_at,
    )


def test_decode_trace_cursor_round_trip() -> None:
    cursor = build_trace_cursor(after_event_id=42, order="asc")

    before_event_id, after_event_id, order = decode_trace_cursor(cursor)

    assert before_event_id is None
    assert after_event_id == 42
    assert order == "asc"


def test_decode_trace_cursor_rejects_invalid_shape() -> None:
    with pytest.raises(HTTPException) as exc_info:
        decode_trace_cursor("not-a-valid-cursor")

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "cursor is invalid."


def test_collect_payload_keys_and_normalize_payload_key() -> None:
    payload = {
        "result": {
            "documents": [{"title": "A"}],
            "meta": {"nextCursor": "abc"},
        }
    }

    assert normalize_payload_key("  result.meta ") == "result.meta"
    assert normalize_payload_key("   ") is None
    assert collect_payload_keys(payload) >= {
        "result",
        "result.documents",
        "result.meta",
        "result.meta.nextCursor",
    }


def test_create_run_trace_builds_descending_page_cursors() -> None:
    events = [
        _event(
            1,
            event_type="run.started",
            node_run_id=None,
            payload={"status": "started"},
            created_at=datetime(2026, 3, 16, 9, 0, tzinfo=UTC),
        ),
        _event(
            2,
            event_type="tool.completed",
            node_run_id="node-1",
            payload={"result": {"documents": [{"title": "A"}]}, "status": "done"},
            created_at=datetime(2026, 3, 16, 9, 1, tzinfo=UTC),
        ),
        _event(
            3,
            event_type="run.completed",
            node_run_id=None,
            payload={"status": "completed"},
            created_at=datetime(2026, 3, 16, 9, 2, tzinfo=UTC),
        ),
    ]

    trace = create_run_trace(
        run_id="run-trace-unit",
        cursor=None,
        event_type=None,
        node_run_id=None,
        created_after=None,
        created_before=None,
        payload_key="documents",
        before_event_id=None,
        after_event_id=None,
        limit=1,
        order="desc",
        run_events=events,
    )

    assert [event.id for event in trace.events] == [2]
    assert trace.summary.total_event_count == 3
    assert trace.summary.matched_event_count == 1
    assert trace.summary.available_payload_keys == [
        "documents",
        "result",
        "result.documents",
        "result.documents.title",
        "status",
        "title",
    ]
    assert trace.summary.next_cursor is None
    assert trace.summary.prev_cursor is None
    assert trace.events[0].replay_offset_ms == 60000
