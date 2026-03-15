from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow, WorkflowCompiledBlueprint, WorkflowVersion
from app.schemas.run import WorkflowRunListItem
from app.schemas.workflow import WorkflowDetail, WorkflowVersionItem


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
) -> WorkflowDetail:
    compiled_blueprints = compiled_blueprints or {}
    return WorkflowDetail(
        id=workflow.id,
        name=workflow.name,
        version=workflow.version,
        status=workflow.status,
        definition=workflow.definition,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        versions=[
            serialize_workflow_version_item(
                version,
                compiled_blueprint=compiled_blueprints.get(version.id),
            )
            for version in versions
        ],
    )


def build_workflow_detail(db: Session, workflow: Workflow) -> WorkflowDetail:
    versions = db.scalars(
        select(WorkflowVersion).where(WorkflowVersion.workflow_id == workflow.id)
    ).all()
    return serialize_workflow_detail(
        workflow,
        sort_workflow_versions(versions),
        load_compiled_blueprint_lookup(db, workflow.id),
    )


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
        )
        for run, node_run_count, event_count, last_event_at in rows
    ]
