from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def _normalize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def normalize_blocked_execution_trace_facts(
    trace_payload: Mapping[str, Any] | None,
) -> dict[str, Any]:
    normalized = dict(trace_payload or {})
    if _normalize_optional_string(normalized.get("blocked_reason")) is None:
        return normalized

    normalized["effective_execution_class"] = None
    normalized["executor_ref"] = None
    return normalized
