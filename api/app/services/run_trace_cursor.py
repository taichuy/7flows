from __future__ import annotations

import base64
import json
from typing import Literal

from fastapi import HTTPException, status


def encode_trace_cursor(
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


def decode_trace_cursor(
    cursor: str,
) -> tuple[int | None, int | None, Literal["asc", "desc"]]:
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


def build_trace_cursor(
    *,
    before_event_id: int | None = None,
    after_event_id: int | None = None,
    order: Literal["asc", "desc"],
) -> str:
    return encode_trace_cursor(
        before_event_id=before_event_id,
        after_event_id=after_event_id,
        order=order,
    )
