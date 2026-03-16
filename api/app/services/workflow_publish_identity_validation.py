from __future__ import annotations

from typing import Any

from app.schemas.workflow_published_endpoint import (
    normalize_published_endpoint_alias,
    normalize_published_endpoint_path,
)


def collect_invalid_workflow_publish_identities(
    definition: dict[str, Any] | None,
) -> list[dict[str, str]]:
    if not isinstance(definition, dict):
        return []

    publish = definition.get("publish")
    if not isinstance(publish, list):
        return []

    issues: list[dict[str, str]] = []
    seen_endpoint_ids: dict[str, list[int]] = {}
    seen_aliases: dict[str, list[int]] = {}
    seen_paths: dict[str, list[int]] = {}

    for index, raw_endpoint in enumerate(publish):
        if not isinstance(raw_endpoint, dict):
            continue

        endpoint_id = _normalize_optional_string(raw_endpoint.get("id"))
        if endpoint_id:
            seen_endpoint_ids.setdefault(endpoint_id, []).append(index)

        try:
            alias = normalize_published_endpoint_alias(
                _normalize_optional_string(raw_endpoint.get("alias")) or endpoint_id or ""
            )
        except ValueError:
            alias = None
        if alias:
            seen_aliases.setdefault(alias, []).append(index)

        try:
            path = normalize_published_endpoint_path(
                _normalize_optional_string(raw_endpoint.get("path")) or f"/{alias or endpoint_id or ''}"
            )
        except ValueError:
            path = None
        if path:
            seen_paths.setdefault(path, []).append(index)

    issues.extend(
        _build_duplicate_identity_issues(
            seen_values=seen_endpoint_ids,
            scope_label="Published endpoint id",
            message_template="Published endpoint id '{value}' is duplicated in the workflow definition.",
            path_suffix="id",
            field="id",
        )
    )
    issues.extend(
        _build_duplicate_identity_issues(
            seen_values=seen_aliases,
            scope_label="Published endpoint alias",
            message_template=(
                "Published endpoint alias '{value}' resolves to the same published alias in the workflow definition."
            ),
            path_suffix="alias",
            field="alias",
        )
    )
    issues.extend(
        _build_duplicate_identity_issues(
            seen_values=seen_paths,
            scope_label="Published endpoint path",
            message_template=(
                "Published endpoint path '{value}' resolves to the same published route path in the workflow definition."
            ),
            path_suffix="path",
            field="path",
        )
    )

    return issues


def _build_duplicate_identity_issues(
    *,
    seen_values: dict[str, list[int]],
    scope_label: str,
    message_template: str,
    path_suffix: str,
    field: str,
) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for value, indexes in seen_values.items():
        if len(indexes) <= 1:
            continue
        for index in indexes:
            issues.append(
                {
                    "message": message_template.format(value=value),
                    "path": f"publish.{index}.{path_suffix}",
                    "field": field,
                    "scope": scope_label,
                }
            )
    return issues


def _normalize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
