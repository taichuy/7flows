from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

CALLBACK_WAITING_LIFECYCLE_KEY = "callback_waiting_lifecycle"
_CALLBACK_WAITING_BACKOFF_SECONDS = (0.0, 5.0, 15.0, 30.0, 60.0)


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)
    return value.isoformat().replace("+00:00", "Z")


def _coerce_non_negative_int(value: object) -> int:
    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        return 0


def _optional_string(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def load_callback_waiting_lifecycle(checkpoint_payload: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(checkpoint_payload, dict):
        checkpoint_payload = {}
    raw = checkpoint_payload.get(CALLBACK_WAITING_LIFECYCLE_KEY)
    raw_lifecycle = raw if isinstance(raw, dict) else {}
    return {
        "wait_cycle_count": _coerce_non_negative_int(raw_lifecycle.get("wait_cycle_count")),
        "issued_ticket_count": _coerce_non_negative_int(raw_lifecycle.get("issued_ticket_count")),
        "expired_ticket_count": _coerce_non_negative_int(raw_lifecycle.get("expired_ticket_count")),
        "consumed_ticket_count": _coerce_non_negative_int(
            raw_lifecycle.get("consumed_ticket_count")
        ),
        "canceled_ticket_count": _coerce_non_negative_int(
            raw_lifecycle.get("canceled_ticket_count")
        ),
        "late_callback_count": _coerce_non_negative_int(raw_lifecycle.get("late_callback_count")),
        "resume_schedule_count": _coerce_non_negative_int(
            raw_lifecycle.get("resume_schedule_count")
        ),
        "last_ticket_status": _optional_string(raw_lifecycle.get("last_ticket_status")),
        "last_ticket_reason": _optional_string(raw_lifecycle.get("last_ticket_reason")),
        "last_ticket_updated_at": _optional_string(raw_lifecycle.get("last_ticket_updated_at")),
        "last_late_callback_status": _optional_string(
            raw_lifecycle.get("last_late_callback_status")
        ),
        "last_late_callback_reason": _optional_string(
            raw_lifecycle.get("last_late_callback_reason")
        ),
        "last_late_callback_at": _optional_string(raw_lifecycle.get("last_late_callback_at")),
        "last_resume_delay_seconds": raw_lifecycle.get("last_resume_delay_seconds"),
        "last_resume_reason": _optional_string(raw_lifecycle.get("last_resume_reason")),
        "last_resume_source": _optional_string(raw_lifecycle.get("last_resume_source")),
        "last_resume_backoff_attempt": _coerce_non_negative_int(
            raw_lifecycle.get("last_resume_backoff_attempt")
        ),
    }


def attach_callback_waiting_lifecycle(
    checkpoint_payload: dict[str, Any] | None,
    lifecycle: dict[str, Any],
) -> dict[str, Any]:
    payload = dict(checkpoint_payload or {})
    payload[CALLBACK_WAITING_LIFECYCLE_KEY] = deepcopy(lifecycle)
    return payload


def record_callback_ticket_issued(
    checkpoint_payload: dict[str, Any] | None,
    *,
    reason: str | None,
    issued_at: datetime | None,
) -> dict[str, Any]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    lifecycle["wait_cycle_count"] += 1
    lifecycle["issued_ticket_count"] += 1
    lifecycle["last_ticket_status"] = "pending"
    lifecycle["last_ticket_reason"] = _optional_string(reason)
    lifecycle["last_ticket_updated_at"] = _serialize_datetime(issued_at)
    return attach_callback_waiting_lifecycle(checkpoint_payload, lifecycle)


def record_callback_ticket_expired(
    checkpoint_payload: dict[str, Any] | None,
    *,
    reason: str | None,
    expired_at: datetime | None,
) -> dict[str, Any]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    lifecycle["expired_ticket_count"] += 1
    lifecycle["last_ticket_status"] = "expired"
    lifecycle["last_ticket_reason"] = _optional_string(reason)
    lifecycle["last_ticket_updated_at"] = _serialize_datetime(expired_at)
    return attach_callback_waiting_lifecycle(checkpoint_payload, lifecycle)


def record_callback_ticket_consumed(
    checkpoint_payload: dict[str, Any] | None,
    *,
    consumed_at: datetime | None,
) -> dict[str, Any]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    lifecycle["consumed_ticket_count"] += 1
    lifecycle["last_ticket_status"] = "consumed"
    lifecycle["last_ticket_reason"] = None
    lifecycle["last_ticket_updated_at"] = _serialize_datetime(consumed_at)
    return attach_callback_waiting_lifecycle(checkpoint_payload, lifecycle)


def record_callback_ticket_canceled(
    checkpoint_payload: dict[str, Any] | None,
    *,
    reason: str | None,
    canceled_at: datetime | None,
) -> dict[str, Any]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    lifecycle["canceled_ticket_count"] += 1
    lifecycle["last_ticket_status"] = "canceled"
    lifecycle["last_ticket_reason"] = _optional_string(reason)
    lifecycle["last_ticket_updated_at"] = _serialize_datetime(canceled_at)
    return attach_callback_waiting_lifecycle(checkpoint_payload, lifecycle)


def record_callback_resume_schedule(
    checkpoint_payload: dict[str, Any] | None,
    *,
    delay_seconds: float,
    reason: str,
    source: str,
    backoff_attempt: int,
) -> dict[str, Any]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    lifecycle["resume_schedule_count"] += 1
    lifecycle["last_resume_delay_seconds"] = max(float(delay_seconds), 0.0)
    lifecycle["last_resume_reason"] = _optional_string(reason)
    lifecycle["last_resume_source"] = _optional_string(source)
    lifecycle["last_resume_backoff_attempt"] = max(int(backoff_attempt), 0)
    return attach_callback_waiting_lifecycle(checkpoint_payload, lifecycle)


def record_late_callback_delivery(
    checkpoint_payload: dict[str, Any] | None,
    *,
    status: str,
    reason: str | None,
    received_at: datetime | None,
) -> dict[str, Any]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    lifecycle["late_callback_count"] += 1
    lifecycle["last_late_callback_status"] = _optional_string(status)
    lifecycle["last_late_callback_reason"] = _optional_string(reason)
    lifecycle["last_late_callback_at"] = _serialize_datetime(received_at)
    return attach_callback_waiting_lifecycle(checkpoint_payload, lifecycle)


def compute_callback_cleanup_backoff_delay_seconds(
    checkpoint_payload: dict[str, Any] | None,
) -> tuple[float, int]:
    lifecycle = load_callback_waiting_lifecycle(checkpoint_payload)
    backoff_attempt = max(lifecycle["expired_ticket_count"], 1)
    index = min(max(backoff_attempt - 1, 0), len(_CALLBACK_WAITING_BACKOFF_SECONDS) - 1)
    return _CALLBACK_WAITING_BACKOFF_SECONDS[index], backoff_attempt
