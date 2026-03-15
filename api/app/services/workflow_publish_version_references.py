from __future__ import annotations

from collections.abc import Collection
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workflow import WorkflowVersion


def build_allowed_publish_workflow_versions(
    db: Session,
    *,
    workflow_id: str | None = None,
    current_version: str | None = None,
) -> set[str]:
    allowed_versions: set[str] = set()
    if workflow_id:
        allowed_versions.update(
            version
            for version in db.scalars(
                select(WorkflowVersion.version).where(WorkflowVersion.workflow_id == workflow_id)
            ).all()
            if isinstance(version, str) and version.strip()
        )
    normalized_current_version = _normalize_optional_string(current_version)
    if normalized_current_version is not None:
        allowed_versions.add(normalized_current_version)
    return allowed_versions


def collect_invalid_workflow_publish_version_references(
    definition: dict[str, Any] | None,
    *,
    allowed_versions: Collection[str] | None,
) -> list[str]:
    if allowed_versions is None or not isinstance(definition, dict):
        return []

    normalized_allowed_versions = sorted(
        {
            normalized_version
            for version in allowed_versions
            if (normalized_version := _normalize_optional_string(version)) is not None
        }
    )
    if not normalized_allowed_versions:
        return []

    publish = definition.get("publish")
    if not isinstance(publish, list):
        return []

    allowed_version_set = set(normalized_allowed_versions)
    issues: list[str] = []
    for index, endpoint in enumerate(publish):
        if not isinstance(endpoint, dict):
            continue
        workflow_version = _normalize_optional_string(endpoint.get("workflowVersion"))
        if workflow_version is None or workflow_version in allowed_version_set:
            continue

        endpoint_id = _normalize_optional_string(endpoint.get("id")) or f"endpoint_{index + 1}"
        endpoint_name = _normalize_optional_string(endpoint.get("name"))
        endpoint_label = (
            f"{endpoint_id}:{endpoint_name}"
            if endpoint_name is not None and endpoint_name != endpoint_id
            else endpoint_id
        )
        issues.append(
            f"Published endpoint '{endpoint_label}' references unknown workflow version "
            f"'{workflow_version}'. Allowed versions: {', '.join(normalized_allowed_versions)}. "
            "Leave workflowVersion empty to track the current saved version."
        )

    deduped_issues: list[str] = []
    for issue in issues:
        if issue not in deduped_issues:
            deduped_issues.append(issue)
    return deduped_issues


def _normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
