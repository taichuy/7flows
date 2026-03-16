from __future__ import annotations

from datetime import UTC, datetime

from app.models.run import RunEvent


def normalize_filter_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def normalize_payload_key(value: str | None) -> str | None:
    normalized = value.strip() if value is not None else None
    return normalized or None


def collect_payload_keys(payload: object, prefix: str = "") -> set[str]:
    payload_keys: set[str] = set()
    if isinstance(payload, dict):
        for raw_key, value in payload.items():
            key = str(raw_key)
            path = f"{prefix}.{key}" if prefix else key
            payload_keys.add(key)
            payload_keys.add(path)
            payload_keys.update(collect_payload_keys(value, path))
    elif isinstance(payload, list):
        for item in payload:
            payload_keys.update(collect_payload_keys(item, prefix))
    return payload_keys


def payload_matches_key(payload: dict, payload_key: str | None) -> bool:
    if payload_key is None:
        return True
    normalized_key = payload_key.strip().casefold()
    if not normalized_key:
        return True
    return any(normalized_key in key.casefold() for key in collect_payload_keys(payload))


def event_matches_trace_filters(
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
    event_created_at = normalize_filter_datetime(event.created_at)
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
    if not payload_matches_key(event.payload, payload_key):
        return False
    return True
