from __future__ import annotations

from functools import lru_cache
from typing import Any

from pydantic import ValidationError

from app.schemas.workflow import WorkflowDefinitionDocument
from app.services.workflow_library_catalog import build_node_catalog_items


class WorkflowDefinitionValidationError(ValueError):
    pass


def validate_workflow_definition(definition: dict[str, Any] | None) -> dict[str, Any]:
    try:
        document = WorkflowDefinitionDocument.model_validate(definition or {})
    except ValidationError as exc:
        messages = []
        for error in exc.errors():
            location = ".".join(str(item) for item in error["loc"])
            if location:
                messages.append(f"{location}: {error['msg']}")
            else:
                messages.append(error["msg"])
        raise WorkflowDefinitionValidationError("; ".join(messages)) from exc

    return document.model_dump(mode="python", exclude_none=True)


@lru_cache(maxsize=1)
def _node_support_index() -> dict[str, tuple[str, str]]:
    return {
        item.type: (item.support_status, item.support_summary)
        for item in build_node_catalog_items()
    }


def collect_unavailable_persisted_workflow_nodes(
    definition: dict[str, Any] | None,
) -> list[dict[str, str]]:
    if not isinstance(definition, dict):
        return []

    nodes = definition.get("nodes")
    if not isinstance(nodes, list):
        return []

    support_index = _node_support_index()
    issues: list[dict[str, str]] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = node.get("type")
        if not isinstance(node_type, str):
            continue
        support_status, support_summary = support_index.get(node_type, ("available", ""))
        if support_status == "available":
            continue
        node_id = str(node.get("id") or node_type)
        node_name = str(node.get("name") or node_id)
        issues.append(
            {
                "id": node_id,
                "name": node_name,
                "type": node_type,
                "support_status": support_status,
                "support_summary": support_summary,
            }
        )
    return issues


def validate_persistable_workflow_definition(
    definition: dict[str, Any] | None,
) -> dict[str, Any]:
    validated_definition = validate_workflow_definition(definition)
    unavailable_nodes = collect_unavailable_persisted_workflow_nodes(validated_definition)
    if unavailable_nodes:
        rendered_nodes = ", ".join(
            f"{item['id']}:{item['type']} ({item['support_status']})"
            for item in unavailable_nodes
        )
        raise WorkflowDefinitionValidationError(
            "Workflow definition contains node types that are not currently available "
            "for persistence: "
            f"{rendered_nodes}."
        )
    return validated_definition


def bump_workflow_version(version: str) -> str:
    parts = version.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise WorkflowDefinitionValidationError(
            "Workflow version must use semantic version format 'major.minor.patch'."
        )
    major, minor, patch = (int(part) for part in parts)
    return f"{major}.{minor}.{patch + 1}"
