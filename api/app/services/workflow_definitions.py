from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
import re
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.schemas.plugin import PluginToolItem
from app.schemas.workflow import WorkflowDefinitionDocument
from app.services.plugin_registry_store import get_plugin_registry_store
from app.services.plugin_runtime import CompatibilityAdapterRegistration, get_plugin_registry
from app.services.workflow_tool_execution_validation import (
    collect_invalid_workflow_tool_execution_references,
)
from app.services.workflow_library_catalog import build_node_catalog_items
from app.services.workflow_publish_version_references import (
    collect_invalid_workflow_publish_version_references,
)
from app.services.workflow_publish_identity_validation import (
    collect_invalid_workflow_publish_identities,
)
from app.services.workflow_variable_validation import collect_invalid_workflow_variables


@dataclass(frozen=True)
class WorkflowDefinitionValidationIssue:
    category: str
    message: str
    path: str | None = None
    field: str | None = None


class WorkflowDefinitionValidationError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        issues: list[WorkflowDefinitionValidationIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.issues = list(issues or [])


def validate_workflow_definition(definition: dict[str, Any] | None) -> dict[str, Any]:
    invalid_publish_identities = collect_invalid_workflow_publish_identities(definition)
    if invalid_publish_identities:
        raise WorkflowDefinitionValidationError(
            "Workflow definition contains publish endpoint identities that are not valid for persistence: "
            + "; ".join(issue["message"] for issue in invalid_publish_identities),
            issues=[
                WorkflowDefinitionValidationIssue(
                    category="publish_identity",
                    message=issue["message"],
                    path=issue.get("path"),
                    field=issue.get("field"),
                )
                for issue in invalid_publish_identities
            ],
        )

    try:
        document = WorkflowDefinitionDocument.model_validate(definition or {})
    except ValidationError as exc:
        messages = []
        issues: list[WorkflowDefinitionValidationIssue] = []
        for error in exc.errors():
            raw_message = str(error["msg"])
            location = _format_issue_path(error.get("loc"))
            path = _derive_issue_path(location, raw_message)
            if location:
                message = f"{location}: {raw_message}"
            else:
                message = raw_message
            messages.append(message)
            issues.append(
                WorkflowDefinitionValidationIssue(
                    category="schema",
                    message=message,
                    path=path or location or None,
                    field=_extract_issue_field_from_path(path)
                    or _extract_issue_field(error.get("loc")),
                )
            )
        raise WorkflowDefinitionValidationError("; ".join(messages), issues=issues) from exc

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


def build_workflow_adapter_reference_list(
    db: Session,
    *,
    workspace_id: str = "default",
) -> list[CompatibilityAdapterRegistration]:
    registry = get_plugin_registry()
    get_plugin_registry_store().hydrate_registry(db, registry)

    visible_adapters: list[CompatibilityAdapterRegistration] = []
    for adapter in registry.list_adapters():
        workspace_ids = tuple(adapter.workspace_ids or ())
        if workspace_ids and workspace_id not in workspace_ids:
            continue
        visible_adapters.append(adapter)
    return visible_adapters


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
    for index, node in enumerate(nodes):
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
                "path": f"nodes.{index}.type",
                "field": "type",
            }
        )
    return issues


def collect_invalid_workflow_tool_references(
    definition: dict[str, Any] | None,
    *,
    tool_index: Mapping[str, PluginToolItem] | None,
) -> list[WorkflowDefinitionValidationIssue]:
    if tool_index is None or not isinstance(definition, dict):
        return []

    nodes = definition.get("nodes")
    if not isinstance(nodes, list):
        return []

    issues: list[WorkflowDefinitionValidationIssue] = []
    for node_index, node in enumerate(nodes):
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
                    node_index=node_index,
                    config=config,
                    tool_index=tool_index,
                )
            )
            continue

        if node_type == "llm_agent":
            issues.extend(
                _collect_agent_tool_policy_issues(
                    node_label=node_label,
                    node_index=node_index,
                    config=config,
                    tool_index=tool_index,
                )
            )

    deduped_issues: list[WorkflowDefinitionValidationIssue] = []
    for issue in issues:
        if issue not in deduped_issues:
            deduped_issues.append(issue)
    return deduped_issues


def _collect_tool_node_binding_issues(
    *,
    node_label: str,
    node_index: int,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
) -> list[WorkflowDefinitionValidationIssue]:
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
            WorkflowDefinitionValidationIssue(
                category="tool_reference",
                message=f"Tool node '{node_label}' references missing catalog tool '{tool_id}'.",
                path=_resolve_tool_binding_path(config, node_index=node_index, suffix="toolId"),
                field="toolId",
            )
        ]

    if ecosystem is not None and ecosystem != tool.ecosystem:
        return [
            WorkflowDefinitionValidationIssue(
                category="tool_reference",
                message=(
                    f"Tool node '{node_label}' declares ecosystem '{ecosystem}' for catalog tool "
                    f"'{tool_id}', but the current catalog reports '{tool.ecosystem}'."
                ),
                path=_resolve_tool_binding_path(config, node_index=node_index, suffix="ecosystem"),
                field="ecosystem",
            )
        ]

    return []


def _collect_agent_tool_policy_issues(
    *,
    node_label: str,
    node_index: int,
    config: dict[str, Any],
    tool_index: Mapping[str, PluginToolItem],
) -> list[WorkflowDefinitionValidationIssue]:
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
        WorkflowDefinitionValidationIssue(
            category="tool_reference",
            message=(
                f"LLM agent node '{node_label}' toolPolicy.allowedToolIds references missing "
                f"catalog tools: {rendered_tool_ids}."
            ),
            path=f"nodes.{node_index}.config.toolPolicy.allowedToolIds",
            field="allowedToolIds",
        )
    ]


def _normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _format_issue_path(location: Any) -> str:
    if not isinstance(location, tuple | list):
        return ""
    return ".".join(str(item) for item in location)


def _extract_issue_field(location: Any) -> str | None:
    if not isinstance(location, tuple | list):
        return None
    for item in reversed(location):
        if isinstance(item, str):
            return item
    return None


def _extract_issue_field_from_path(path: str) -> str | None:
    if not path:
        return None
    return path.rsplit(".", 1)[-1]


def _derive_issue_path(location: str, message: str) -> str:
    pattern = re.compile(
        r"(inputSchema(?:\.[\w]+)*|outputSchema(?:\.[\w]+)*|toolPolicy\.allowedToolIds|workflowVersion|conditionExpression|config(?:\.[\w]+)+|runtimePolicy(?:\.[\w]+)+)"
    )
    matched = pattern.search(message)
    if matched is None:
        return location
    relative_path = matched.group(1)
    if not location:
        return relative_path
    return f"{location}.{relative_path}"


def _resolve_tool_binding_path(
    config: Mapping[str, Any],
    *,
    node_index: int,
    suffix: str,
) -> str:
    if isinstance(config.get("tool"), dict):
        return f"nodes.{node_index}.config.tool.{suffix}"
    return f"nodes.{node_index}.config.{suffix}"


def validate_persistable_workflow_definition(
    definition: dict[str, Any] | None,
    *,
    tool_index: Mapping[str, PluginToolItem] | None = None,
    adapters: list[CompatibilityAdapterRegistration] | None = None,
    allowed_publish_versions: set[str] | None = None,
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
            f"{rendered_nodes}.",
            issues=[
                WorkflowDefinitionValidationIssue(
                    category="node_support",
                    message=(
                        f"Node '{item['id']}:{item['name']}' uses unavailable type "
                        f"'{item['type']}' ({item['support_status']}). {item['support_summary']}"
                    ).strip(),
                    path=item.get("path"),
                    field=item.get("field"),
                )
                for item in unavailable_nodes
            ],
        )

    invalid_tool_references = collect_invalid_workflow_tool_references(
        validated_definition,
        tool_index=tool_index,
    )
    if invalid_tool_references:
        raise WorkflowDefinitionValidationError(
            "Workflow definition references missing or drifted tool catalog entries: "
            + "; ".join(issue.message for issue in invalid_tool_references),
            issues=invalid_tool_references,
        )

    invalid_tool_execution_references = collect_invalid_workflow_tool_execution_references(
        validated_definition,
        tool_index=tool_index,
        adapters=adapters,
    )
    if invalid_tool_execution_references:
        raise WorkflowDefinitionValidationError(
            "Workflow definition requests tool execution capabilities that are not currently "
            "available: "
            + "; ".join(invalid_tool_execution_references),
            issues=[
                WorkflowDefinitionValidationIssue(
                    category="tool_execution",
                    message=issue,
                )
                for issue in invalid_tool_execution_references
            ],
        )

    invalid_publish_version_references = collect_invalid_workflow_publish_version_references(
        validated_definition,
        allowed_versions=allowed_publish_versions,
    )
    if invalid_publish_version_references:
        raise WorkflowDefinitionValidationError(
            "Workflow definition references unknown publish workflow versions: "
            + "; ".join(issue.message for issue in invalid_publish_version_references),
            issues=[
                WorkflowDefinitionValidationIssue(
                    category="publish_version",
                    message=issue.message,
                    path=issue.path,
                    field=issue.field,
                )
                for issue in invalid_publish_version_references
            ],
        )

    invalid_variables = collect_invalid_workflow_variables(validated_definition)
    if invalid_variables:
        raise WorkflowDefinitionValidationError(
            "Workflow definition contains workflow variables that are not valid for persistence: "
            + "; ".join(issue["message"] for issue in invalid_variables),
            issues=[
                WorkflowDefinitionValidationIssue(
                    category="variables",
                    message=issue["message"],
                    path=issue.get("path"),
                    field=issue.get("field"),
                )
                for issue in invalid_variables
            ],
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
