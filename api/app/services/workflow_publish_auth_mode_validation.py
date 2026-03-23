from __future__ import annotations

from typing import Any


_SUPPORTED_PERSISTED_PUBLISH_AUTH_MODES = frozenset({"api_key", "internal"})


def collect_invalid_workflow_publish_auth_modes(
    definition: dict[str, Any] | None,
) -> list[dict[str, str]]:
    if not isinstance(definition, dict):
        return []

    publish = definition.get("publish")
    if not isinstance(publish, list):
        return []

    issues: list[dict[str, str]] = []
    for index, raw_endpoint in enumerate(publish):
        if not isinstance(raw_endpoint, dict):
            continue

        auth_mode = _normalize_optional_string(raw_endpoint.get("authMode"))
        if auth_mode is None or auth_mode in _SUPPORTED_PERSISTED_PUBLISH_AUTH_MODES:
            continue

        endpoint_id = _normalize_optional_string(raw_endpoint.get("id"))
        endpoint_name = _normalize_optional_string(raw_endpoint.get("name"))
        endpoint_label = endpoint_name or endpoint_id or f"endpoint_{index + 1}"

        issues.append(
            {
                "message": (
                    f"Published endpoint '{endpoint_label}' requests auth mode '{auth_mode}', "
                    "but the current published gateway only supports durable bindings with "
                    "authMode 'internal' or 'api_key'."
                ),
                "path": f"publish.{index}.authMode",
                "field": "authMode",
            }
        )

    return issues


def _normalize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
