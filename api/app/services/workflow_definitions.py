from __future__ import annotations

from collections.abc import Mapping
from functools import lru_cache
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.schemas.plugin import PluginToolItem
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


def build_workflow_tool_reference_index(
    db: Session,
    *,
    workspace_id: str = "default",
) -> dict[str, PluginToolItem]:
    from app.services.workflow_library import WorkflowLibraryService

    service = WorkflowLibraryService()
    return {
        item.id: item
        for item in service.list_tool_items(
            db,
            workspace_id=workspace_id,
        )
    }


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


def collect_invalid_workflow_tool_references(
    definition: dict[str, Any] | None,
    *,
    tool_index: Mapping[str, PluginToolItem] | None,
) -> list[str]:
    if tool_index is None or not isinstance(definition, dict):
        return []

    nodes = definition.get("nodes")
    if not isinstance(nodes, list):
        return []

    issues: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue

        node_id = str(node.get("id") or "unknown-node")
        node_name = str(node.get("name") or node_id)
        node_label = f"{node_id}:{node_name}" if node_name != node_id else node_id
        node_type = node.get("type")
        config = node.get("config")
        if not isinstance(config, dict):
            continue

        if node_type == "tool":
            issues.extend(
                _collect_tool_node_binding_issues(
                    node_label=node_label,
                    config=config,
                    tool_index=tool_index,
                )
            )
            continue

        if node_type == "llm_agent":
            issues.extend(
                _collect_agent_tool_policy_issues(
                    node_label=node_label,
                    config=config,
                    tool_index=tool_index,
                )
            )

    deduped_issues: list[str] = []
    for issue in issues:
        if issue not in deduped_issues:
            deduped_issues.append(issue)
    return deduped_issues


def _collect_tool_node_binding_issues(
    *,
    node_label: str,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
) -> list[str]:
    binding = config.get("tool")
    tool_id: str | None = None
    ecosystem: str | None = None
    if isinstance(binding, dict):
        tool_id = _normalize_optional_string(binding.get("toolId"))
        ecosystem = _normalize_optional_string(binding.get("ecosystem"))
    else:
        tool_id = _normalize_optional_string(config.get("toolId"))

    if tool_id is None:
        return []

    tool = tool_index.get(tool_id)
    if tool is None:
        return [
            f"Tool node '{node_label}' references missing catalog tool '{tool_id}'."
        ]

    if ecosystem is not None and ecosystem != tool.ecosystem:
        return [
            f"Tool node '{node_label}' declares ecosystem '{ecosystem}' for catalog tool "
            f"'{tool_id}', but the current catalog reports '{tool.ecosystem}'."
        ]

    return []


def _collect_agent_tool_policy_issues(
    *,
    node_label: str,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
) -> list[str]:
    tool_policy = config.get("toolPolicy")
    if not isinstance(tool_policy, dict):
        return []

    allowed_tool_ids = tool_policy.get("allowedToolIds")
    if not isinstance(allowed_tool_ids, list):
        return []

    missing_tool_ids = sorted(
        {
            normalized_tool_id
            for item in allowed_tool_ids
            if (
                normalized_tool_id := _normalize_optional_string(item)
            ) is not None
            and normalized_tool_id not in tool_index
        }
    )
    if not missing_tool_ids:
        return []

    rendered_tool_ids = ", ".join(missing_tool_ids)
    return [
        f"LLM agent node '{node_label}' toolPolicy.allowedToolIds references missing "
        f"catalog tools: {rendered_tool_ids}."
    ]


def _normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def validate_persistable_workflow_definition(
    definition: dict[str, Any] | None,
    *,
    tool_index: Mapping[str, PluginToolItem] | None = None,
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

    invalid_tool_references = collect_invalid_workflow_tool_references(
        validated_definition,
        tool_index=tool_index,
    )
    if invalid_tool_references:
        raise WorkflowDefinitionValidationError(
            "Workflow definition references missing or drifted tool catalog entries: "
            + "; ".join(invalid_tool_references)
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
