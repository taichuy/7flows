from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow, WorkflowCompiledBlueprint, WorkflowVersion
from app.schemas.plugin import PluginToolItem
from app.schemas.run import WorkflowRunListItem
from app.schemas.workflow import (
    WorkflowDefinitionPreflightIssue,
    WorkflowDetail,
    WorkflowLegacyAuthGovernanceSummary,
    WorkflowListItem,
    WorkflowToolGovernanceSummary,
    WorkflowVersionItem,
)
from app.services.workflow_definition_governance import (
    count_workflow_nodes,
    summarize_workflow_definition_tool_governance,
)
from app.services.workflow_definitions import (
    CompatibilityAdapterRegistration,
    WorkflowDefinitionValidationError,
    WorkflowDefinitionValidationIssue,
    build_workflow_adapter_reference_list,
    build_workflow_skill_reference_ids_index,
    build_workflow_skill_reference_index,
    build_workflow_tool_reference_index,
    validate_persistable_workflow_definition,
)
from app.services.workflow_library import get_workflow_library_service
from app.services.workflow_publish import WorkflowPublishBindingService
from app.services.workflow_publish_version_references import (
    build_allowed_publish_workflow_versions,
)

WorkflowListDefinitionIssueFilter = Literal["legacy_publish_auth", "missing_tool"]
_WORKFLOW_PUBLISH_SERVICE = WorkflowPublishBindingService()


def _normalize_datetime(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _workflow_version_semver_key(version: str) -> tuple[int, int, int]:
    parts = version.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        return (0, 0, 0)
    major, minor, patch = (int(part) for part in parts)
    return (major, minor, patch)


def sort_workflow_versions(versions: list[WorkflowVersion]) -> list[WorkflowVersion]:
    return sorted(
        versions,
        key=lambda item: (
            _workflow_version_semver_key(item.version),
            _normalize_datetime(item.created_at),
            item.id,
        ),
        reverse=True,
    )


def summarize_workflow_definition_node_types(definition: dict[str, Any]) -> list[str]:
    seen: set[str] = set()
    node_types: list[str] = []
    for node in definition.get("nodes", []):
        if not isinstance(node, dict):
            continue
        node_type = node.get("type")
        if not isinstance(node_type, str) or not node_type or node_type in seen:
            continue
        seen.add(node_type)
        node_types.append(node_type)
    return node_types


def count_workflow_publish_endpoints(definition: dict[str, Any]) -> int:
    publish_entries = definition.get("publish")
    return len(publish_entries) if isinstance(publish_entries, list) else 0


def load_compiled_blueprint_lookup(
    db: Session,
    workflow_id: str,
) -> dict[str, WorkflowCompiledBlueprint]:
    records = db.scalars(
        select(WorkflowCompiledBlueprint).where(
            WorkflowCompiledBlueprint.workflow_id == workflow_id
        )
    ).all()
    return {record.workflow_version_id: record for record in records}


def serialize_workflow_version_item(
    version: WorkflowVersion,
    compiled_blueprint: WorkflowCompiledBlueprint | None = None,
) -> WorkflowVersionItem:
    return WorkflowVersionItem(
        id=version.id,
        workflow_id=version.workflow_id,
        version=version.version,
        created_at=version.created_at,
        compiled_blueprint_id=compiled_blueprint.id if compiled_blueprint is not None else None,
        compiled_blueprint_compiler_version=(
            compiled_blueprint.compiler_version if compiled_blueprint is not None else None
        ),
        compiled_blueprint_updated_at=(
            compiled_blueprint.updated_at if compiled_blueprint is not None else None
        ),
    )


def serialize_workflow_detail(
    workflow: Workflow,
    versions: list[WorkflowVersion],
    compiled_blueprints: dict[str, WorkflowCompiledBlueprint] | None = None,
    tool_index: dict[str, PluginToolItem] | None = None,
    definition_issues: list[WorkflowDefinitionPreflightIssue] | None = None,
    legacy_auth_governance: WorkflowLegacyAuthGovernanceSummary | None = None,
) -> WorkflowDetail:
    compiled_blueprints = compiled_blueprints or {}
    tool_index = tool_index or {}
    node_types = summarize_workflow_definition_node_types(workflow.definition)
    publish_count = count_workflow_publish_endpoints(workflow.definition)
    return WorkflowDetail(
        id=workflow.id,
        name=workflow.name,
        version=workflow.version,
        status=workflow.status,
        updated_at=workflow.updated_at,
        node_count=count_workflow_nodes(workflow.definition),
        node_types=node_types,
        publish_count=publish_count,
        tool_governance=summarize_workflow_definition_tool_governance(
            workflow.definition,
            tool_index=tool_index,
        ),
        legacy_auth_governance=legacy_auth_governance,
        definition=workflow.definition,
        definition_issues=definition_issues or [],
        created_at=workflow.created_at,
        versions=[
            serialize_workflow_version_item(
                version,
                compiled_blueprint=compiled_blueprints.get(version.id),
            )
            for version in versions
        ],
    )


def serialize_workflow_list_item(
    workflow: Workflow,
    *,
    tool_index: dict[str, PluginToolItem] | None = None,
    tool_governance: WorkflowToolGovernanceSummary | None = None,
    definition_issues: list[WorkflowDefinitionPreflightIssue] | None = None,
    legacy_auth_governance: WorkflowLegacyAuthGovernanceSummary | None = None,
) -> WorkflowListItem:
    tool_index = tool_index or {}
    tool_governance = tool_governance or summarize_workflow_definition_tool_governance(
        workflow.definition,
        tool_index=tool_index,
    )
    node_types = summarize_workflow_definition_node_types(workflow.definition)
    publish_count = count_workflow_publish_endpoints(workflow.definition)
    return WorkflowListItem(
        id=workflow.id,
        name=workflow.name,
        version=workflow.version,
        status=workflow.status,
        updated_at=workflow.updated_at,
        node_count=count_workflow_nodes(workflow.definition),
        node_types=node_types,
        publish_count=publish_count,
        tool_governance=tool_governance,
        legacy_auth_governance=legacy_auth_governance,
        definition_issues=definition_issues or [],
    )


def _serialize_workflow_legacy_auth_governance_summary(
    *,
    binding_count: int,
    draft_candidate_count: int,
    published_blocker_count: int,
    offline_inventory_count: int,
) -> WorkflowLegacyAuthGovernanceSummary:
    return WorkflowLegacyAuthGovernanceSummary(
        binding_count=binding_count,
        draft_candidate_count=draft_candidate_count,
        published_blocker_count=published_blocker_count,
        offline_inventory_count=offline_inventory_count,
    )


def load_workflow_legacy_auth_governance_lookup(
    db: Session,
    *,
    workflow_id: str | None = None,
) -> dict[str, WorkflowLegacyAuthGovernanceSummary]:
    snapshot = _WORKFLOW_PUBLISH_SERVICE.build_legacy_auth_governance_snapshot(
        db,
        workflow_id=workflow_id,
    )
    return {
        item.workflow_id: _serialize_workflow_legacy_auth_governance_summary(
            binding_count=item.binding_count,
            draft_candidate_count=item.draft_candidate_count,
            published_blocker_count=item.published_blocker_count,
            offline_inventory_count=item.offline_inventory_count,
        )
        for item in snapshot.workflows
        if item.binding_count > 0
    }


def load_workflow_view_tool_index(
    db: Session,
    *,
    workspace_id: str = "default",
) -> dict[str, PluginToolItem]:
    return {
        tool.id: tool
        for tool in get_workflow_library_service().list_tool_items(db, workspace_id=workspace_id)
    }


def load_workflow_run_tool_governance_lookup(
    db: Session,
    workflow_id: str,
    *,
    tool_index: dict[str, PluginToolItem] | None = None,
) -> dict[str, WorkflowToolGovernanceSummary]:
    tool_index = tool_index or load_workflow_view_tool_index(db)
    workflow = db.get(Workflow, workflow_id)
    versions = db.scalars(
        select(WorkflowVersion).where(WorkflowVersion.workflow_id == workflow_id)
    ).all()

    summaries = {
        version.version: summarize_workflow_definition_tool_governance(
            version.definition,
            tool_index=tool_index,
        )
        for version in versions
    }
    if workflow is not None and workflow.version not in summaries:
        summaries[workflow.version] = summarize_workflow_definition_tool_governance(
            workflow.definition,
            tool_index=tool_index,
        )

    return summaries


def load_workflow_run_tool_governance_summary(
    db: Session,
    workflow_id: str,
    workflow_version: str,
    *,
    tool_index: dict[str, PluginToolItem] | None = None,
) -> WorkflowToolGovernanceSummary | None:
    return load_workflow_run_tool_governance_lookup(
        db,
        workflow_id,
        tool_index=tool_index,
    ).get(workflow_version)


def build_workflow_detail(db: Session, workflow: Workflow) -> WorkflowDetail:
    versions = db.scalars(
        select(WorkflowVersion).where(WorkflowVersion.workflow_id == workflow.id)
    ).all()
    legacy_auth_governance = load_workflow_legacy_auth_governance_lookup(
        db,
        workflow_id=workflow.id,
    ).get(workflow.id)
    return serialize_workflow_detail(
        workflow,
        sort_workflow_versions(versions),
        load_compiled_blueprint_lookup(db, workflow.id),
        load_workflow_view_tool_index(db),
        build_workflow_definition_issues(db, workflow),
        legacy_auth_governance=legacy_auth_governance,
    )


def _serialize_definition_issue(
    issue: WorkflowDefinitionValidationIssue,
) -> WorkflowDefinitionPreflightIssue:
    return WorkflowDefinitionPreflightIssue(
        category=issue.category,
        message=issue.message,
        path=issue.path,
        field=issue.field,
    )


def build_workflow_definition_issues(
    db: Session,
    workflow: Workflow,
    *,
    tool_index: dict[str, PluginToolItem] | None = None,
    adapters: list[CompatibilityAdapterRegistration] | None = None,
    skill_index: dict[str, Any] | None = None,
    skill_reference_ids_index: dict[str, Any] | None = None,
) -> list[WorkflowDefinitionPreflightIssue]:
    try:
        validate_persistable_workflow_definition(
            workflow.definition,
            tool_index=tool_index or build_workflow_tool_reference_index(db),
            adapters=adapters or build_workflow_adapter_reference_list(db),
            skill_index=skill_index or build_workflow_skill_reference_index(db),
            skill_reference_ids_index=(
                skill_reference_ids_index or build_workflow_skill_reference_ids_index(db)
            ),
            allowed_publish_versions=build_allowed_publish_workflow_versions(
                db,
                workflow_id=workflow.id,
                current_version=workflow.version,
            ),
        )
    except WorkflowDefinitionValidationError as exc:
        return [_serialize_definition_issue(issue) for issue in exc.issues]
    return []


def _matches_workflow_definition_issue_filter(
    definition_issues: list[WorkflowDefinitionPreflightIssue],
    tool_governance: WorkflowToolGovernanceSummary,
    legacy_auth_governance: WorkflowLegacyAuthGovernanceSummary | None,
    *,
    definition_issue: WorkflowListDefinitionIssueFilter | None,
) -> bool:
    if definition_issue == "legacy_publish_auth":
        return any(
            issue.category == "publish_draft" and issue.field == "authMode"
            for issue in definition_issues
        ) or (
            legacy_auth_governance is not None
            and legacy_auth_governance.binding_count > 0
        )

    if definition_issue == "missing_tool":
        return len(tool_governance.missing_tool_ids) > 0

    return True


def list_workflow_items(
    db: Session,
    *,
    definition_issue: WorkflowListDefinitionIssueFilter | None = None,
) -> list[WorkflowListItem]:
    workflows = db.scalars(select(Workflow).order_by(Workflow.name.asc())).all()
    if not workflows:
        return []

    tool_index = load_workflow_view_tool_index(db)
    adapters = build_workflow_adapter_reference_list(db)
    skill_index = build_workflow_skill_reference_index(db)
    skill_reference_ids_index = build_workflow_skill_reference_ids_index(db)
    legacy_auth_governance_by_workflow_id = load_workflow_legacy_auth_governance_lookup(db)

    items: list[WorkflowListItem] = []
    for workflow in workflows:
        tool_governance = summarize_workflow_definition_tool_governance(
            workflow.definition,
            tool_index=tool_index,
        )
        legacy_auth_governance = legacy_auth_governance_by_workflow_id.get(workflow.id)
        definition_issues = build_workflow_definition_issues(
            db,
            workflow,
            tool_index=tool_index,
            adapters=adapters,
            skill_index=skill_index,
            skill_reference_ids_index=skill_reference_ids_index,
        )

        if not _matches_workflow_definition_issue_filter(
            definition_issues,
            tool_governance,
            legacy_auth_governance,
            definition_issue=definition_issue,
        ):
            continue

        items.append(
            serialize_workflow_list_item(
                workflow,
                tool_index=tool_index,
                tool_governance=tool_governance,
                definition_issues=definition_issues,
                legacy_auth_governance=legacy_auth_governance,
            )
        )

    return items


def list_workflow_version_items(db: Session, workflow_id: str) -> list[WorkflowVersionItem]:
    versions = db.scalars(
        select(WorkflowVersion).where(WorkflowVersion.workflow_id == workflow_id)
    ).all()
    compiled_blueprints = load_compiled_blueprint_lookup(db, workflow_id)
    return [
        serialize_workflow_version_item(
            version,
            compiled_blueprint=compiled_blueprints.get(version.id),
        )
        for version in sort_workflow_versions(versions)
    ]


def list_workflow_run_items(
    db: Session,
    workflow_id: str,
    *,
    limit: int,
) -> list[WorkflowRunListItem]:
    tool_index = load_workflow_view_tool_index(db)
    tool_governance_by_version = load_workflow_run_tool_governance_lookup(
        db,
        workflow_id,
        tool_index=tool_index,
    )
    node_run_stats = (
        select(
            NodeRun.run_id.label("run_id"),
            func.count(NodeRun.id).label("node_run_count"),
        )
        .group_by(NodeRun.run_id)
        .subquery()
    )
    run_event_stats = (
        select(
            RunEvent.run_id.label("run_id"),
            func.count(RunEvent.id).label("event_count"),
            func.max(RunEvent.created_at).label("last_event_at"),
        )
        .group_by(RunEvent.run_id)
        .subquery()
    )

    rows = db.execute(
        select(
            Run,
            node_run_stats.c.node_run_count,
            run_event_stats.c.event_count,
            run_event_stats.c.last_event_at,
        )
        .outerjoin(node_run_stats, node_run_stats.c.run_id == Run.id)
        .outerjoin(run_event_stats, run_event_stats.c.run_id == Run.id)
        .where(Run.workflow_id == workflow_id)
        .order_by(Run.created_at.desc())
        .limit(limit)
    ).all()

    return [
        WorkflowRunListItem(
            id=run.id,
            workflow_id=run.workflow_id,
            workflow_version=run.workflow_version,
            status=run.status,
            error_message=run.error_message,
            created_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
            node_run_count=node_run_count or 0,
            event_count=event_count or 0,
            last_event_at=last_event_at,
            tool_governance=tool_governance_by_version.get(run.workflow_version),
        )
        for run, node_run_count, event_count, last_event_at in rows
    ]
