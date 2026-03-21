from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import uuid4

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.models.workspace_starter import (
    WorkspaceStarterHistoryRecord,
    WorkspaceStarterTemplateRecord,
)
from app.schemas.workspace_starter import (
    WorkflowBusinessTrack,
    WorkspaceStarterHistoryAction,
    WorkspaceStarterHistoryItem,
    WorkspaceStarterSourceDiff,
    WorkspaceStarterSourceGovernance,
    WorkspaceStarterTemplateCreate,
    WorkspaceStarterTemplateItem,
    WorkspaceStarterTemplateUpdate,
)
from app.services.workspace_starter_source_governance import (
    build_workspace_starter_source_governance,
)
from app.services.workspace_starter_template_diff import (
    build_workspace_starter_source_diff,
)
from app.services.workspace_starter_template_validation import (
    normalize_workspace_starter_tags,
    validate_workspace_starter_definition,
)


class WorkspaceStarterTemplateService:
    def _normalize_datetime(self, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _next_history_timestamp(
        self,
        db: Session,
        *,
        template_id: str,
        workspace_id: str,
    ) -> datetime:
        timestamp = datetime.now(UTC)
        latest_created_at = db.scalar(
            select(WorkspaceStarterHistoryRecord.created_at)
            .where(WorkspaceStarterHistoryRecord.template_id == template_id)
            .where(WorkspaceStarterHistoryRecord.workspace_id == workspace_id)
            .order_by(WorkspaceStarterHistoryRecord.created_at.desc())
            .limit(1)
        )
        normalized_latest = self._normalize_datetime(latest_created_at)
        if normalized_latest is not None and normalized_latest >= timestamp:
            return normalized_latest + timedelta(microseconds=1)
        return timestamp

    def list_history(
        self,
        db: Session,
        template_id: str,
        *,
        workspace_id: str = "default",
        limit: int = 20,
    ) -> list[WorkspaceStarterHistoryRecord]:
        return db.scalars(
            select(WorkspaceStarterHistoryRecord)
            .where(WorkspaceStarterHistoryRecord.template_id == template_id)
            .where(WorkspaceStarterHistoryRecord.workspace_id == workspace_id)
            .order_by(
                WorkspaceStarterHistoryRecord.created_at.desc(),
                WorkspaceStarterHistoryRecord.id.desc(),
            )
            .limit(limit)
        ).all()

    def list_templates(
        self,
        db: Session,
        *,
        workspace_id: str = "default",
        business_track: WorkflowBusinessTrack | None = None,
        search: str | None = None,
        include_archived: bool = False,
        archived_only: bool = False,
    ) -> list[WorkspaceStarterTemplateRecord]:
        query = select(WorkspaceStarterTemplateRecord).where(
            WorkspaceStarterTemplateRecord.workspace_id == workspace_id
        )

        if archived_only:
            query = query.where(WorkspaceStarterTemplateRecord.archived_at.is_not(None))
        elif not include_archived:
            query = query.where(WorkspaceStarterTemplateRecord.archived_at.is_(None))

        if business_track is not None:
            query = query.where(
                WorkspaceStarterTemplateRecord.business_track == business_track
            )

        normalized_search = search.strip() if search else ""
        if normalized_search:
            pattern = f"%{normalized_search}%"
            query = query.where(
                or_(
                    WorkspaceStarterTemplateRecord.name.ilike(pattern),
                    WorkspaceStarterTemplateRecord.description.ilike(pattern),
                    WorkspaceStarterTemplateRecord.default_workflow_name.ilike(pattern),
                    WorkspaceStarterTemplateRecord.workflow_focus.ilike(pattern),
                    WorkspaceStarterTemplateRecord.recommended_next_step.ilike(pattern),
                )
            )

        return db.scalars(
            query.order_by(WorkspaceStarterTemplateRecord.updated_at.desc())
        ).all()

    def get_template(
        self,
        db: Session,
        template_id: str,
        *,
        workspace_id: str = "default",
    ) -> WorkspaceStarterTemplateRecord | None:
        return db.scalars(
            select(WorkspaceStarterTemplateRecord)
            .where(WorkspaceStarterTemplateRecord.id == template_id)
            .where(WorkspaceStarterTemplateRecord.workspace_id == workspace_id)
            .limit(1)
        ).first()

    def load_source_workflows(
        self,
        db: Session,
        records: list[WorkspaceStarterTemplateRecord],
    ) -> dict[str, Workflow]:
        source_workflow_ids = sorted(
            {
                record.created_from_workflow_id
                for record in records
                if record.created_from_workflow_id
            }
        )
        if not source_workflow_ids:
            return {}

        return {
            workflow.id: workflow
            for workflow in db.scalars(
                select(Workflow).where(Workflow.id.in_(source_workflow_ids))
            ).all()
        }

    def list_templates_by_ids(
        self,
        db: Session,
        template_ids: list[str],
        *,
        workspace_id: str = "default",
    ) -> list[WorkspaceStarterTemplateRecord]:
        if not template_ids:
            return []

        return db.scalars(
            select(WorkspaceStarterTemplateRecord)
            .where(WorkspaceStarterTemplateRecord.workspace_id == workspace_id)
            .where(WorkspaceStarterTemplateRecord.id.in_(template_ids))
        ).all()

    def create_template(
        self,
        db: Session,
        payload: WorkspaceStarterTemplateCreate,
    ) -> WorkspaceStarterTemplateRecord:
        record = WorkspaceStarterTemplateRecord(id=str(uuid4()))
        db.add(record)
        self._apply_create_payload(db, record, payload)
        db.flush()
        return record

    def update_template(
        self,
        db: Session,
        record: WorkspaceStarterTemplateRecord,
        payload: WorkspaceStarterTemplateUpdate,
    ) -> WorkspaceStarterTemplateRecord:
        if payload.name is not None:
            record.name = payload.name
        if payload.description is not None:
            record.description = payload.description
        if payload.business_track is not None:
            record.business_track = payload.business_track
        if payload.default_workflow_name is not None:
            record.default_workflow_name = payload.default_workflow_name
        if payload.workflow_focus is not None:
            record.workflow_focus = payload.workflow_focus
        if payload.recommended_next_step is not None:
            record.recommended_next_step = payload.recommended_next_step
        if payload.tags is not None:
            record.tags = normalize_workspace_starter_tags(payload.tags)
        if payload.definition is not None:
            record.definition = validate_workspace_starter_definition(
                db,
                workspace_id=record.workspace_id,
                definition=payload.definition,
                workflow_id=record.created_from_workflow_id,
                workflow_version=record.created_from_workflow_version,
                allow_next_version=True,
            )
        return record

    def serialize(
        self,
        record: WorkspaceStarterTemplateRecord,
        *,
        source_governance: WorkspaceStarterSourceGovernance | None = None,
    ) -> WorkspaceStarterTemplateItem:
        return WorkspaceStarterTemplateItem(
            id=record.id,
            workspace_id=record.workspace_id,
            name=record.name,
            description=record.description,
            business_track=record.business_track,
            default_workflow_name=record.default_workflow_name,
            workflow_focus=record.workflow_focus,
            recommended_next_step=record.recommended_next_step,
            tags=list(record.tags or []),
            definition=dict(record.definition or {}),
            created_from_workflow_id=record.created_from_workflow_id,
            created_from_workflow_version=record.created_from_workflow_version,
            archived=record.archived_at is not None,
            archived_at=record.archived_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
            source_governance=source_governance,
        )

    def serialize_with_source_governance(
        self,
        db: Session,
        record: WorkspaceStarterTemplateRecord,
        *,
        source_workflow: Workflow | None | object = ...,
    ) -> WorkspaceStarterTemplateItem:
        if source_workflow is ...:
            source_workflow = self.load_source_workflows(db, [record]).get(
                record.created_from_workflow_id or ""
            )

        return self.serialize(
            record,
            source_governance=build_workspace_starter_source_governance(
                record,
                source_workflow if isinstance(source_workflow, Workflow) else None,
            ),
        )

    def serialize_many_with_source_governance(
        self,
        db: Session,
        records: list[WorkspaceStarterTemplateRecord],
    ) -> list[WorkspaceStarterTemplateItem]:
        source_workflows_by_id = self.load_source_workflows(db, records)
        return [
            self.serialize(
                record,
                source_governance=build_workspace_starter_source_governance(
                    record,
                    source_workflows_by_id.get(record.created_from_workflow_id)
                    if record.created_from_workflow_id
                    else None,
                ),
            )
            for record in records
        ]

    def serialize_history(
        self,
        record: WorkspaceStarterHistoryRecord,
    ) -> WorkspaceStarterHistoryItem:
        return WorkspaceStarterHistoryItem(
            id=record.id,
            template_id=record.template_id,
            workspace_id=record.workspace_id,
            action=record.action,
            summary=record.summary,
            payload=deepcopy(record.payload or {}),
            created_at=record.created_at,
        )

    def build_source_diff(
        self,
        record: WorkspaceStarterTemplateRecord,
        workflow: Workflow,
    ) -> WorkspaceStarterSourceDiff:
        return build_workspace_starter_source_diff(record, workflow)

    def archive_template(
        self,
        record: WorkspaceStarterTemplateRecord,
    ) -> WorkspaceStarterTemplateRecord:
        if record.archived_at is None:
            record.archived_at = datetime.now(UTC)
        return record

    def restore_template(
        self,
        record: WorkspaceStarterTemplateRecord,
    ) -> WorkspaceStarterTemplateRecord:
        record.archived_at = None
        return record

    def delete_template(
        self,
        db: Session,
        record: WorkspaceStarterTemplateRecord,
    ) -> None:
        db.execute(
            delete(WorkspaceStarterHistoryRecord).where(
                WorkspaceStarterHistoryRecord.template_id == record.id
            )
        )
        db.delete(record)

    def refresh_from_workflow(
        self,
        db: Session,
        record: WorkspaceStarterTemplateRecord,
        workflow: Workflow,
    ) -> bool:
        validated_definition = validate_workspace_starter_definition(
            db,
            workspace_id=record.workspace_id,
            definition=workflow.definition,
            workflow_id=workflow.id,
            workflow_version=workflow.version,
            allow_next_version=False,
        )
        changed = (
            record.created_from_workflow_version != workflow.version
            or record.definition != validated_definition
        )
        if changed:
            record.definition = deepcopy(validated_definition)
            record.created_from_workflow_version = workflow.version
        return changed

    def rebase_from_workflow(
        self,
        db: Session,
        record: WorkspaceStarterTemplateRecord,
        workflow: Workflow,
        *,
        diff: WorkspaceStarterSourceDiff | None = None,
    ) -> WorkspaceStarterSourceDiff:
        diff = diff or self.build_source_diff(record, workflow)
        if "definition" in diff.rebase_fields:
            record.definition = validate_workspace_starter_definition(
                db,
                workspace_id=record.workspace_id,
                definition=workflow.definition,
                workflow_id=workflow.id,
                workflow_version=workflow.version,
                allow_next_version=False,
            )
        if "created_from_workflow_version" in diff.rebase_fields:
            record.created_from_workflow_version = workflow.version
        if "default_workflow_name" in diff.rebase_fields:
            record.default_workflow_name = workflow.name
        return diff

    def record_history(
        self,
        db: Session,
        *,
        template_id: str,
        workspace_id: str,
        action: WorkspaceStarterHistoryAction,
        summary: str,
        payload: dict | None = None,
    ) -> WorkspaceStarterHistoryRecord:
        history = WorkspaceStarterHistoryRecord(
            id=str(uuid4()),
            template_id=template_id,
            workspace_id=workspace_id,
            action=action,
            summary=summary,
            payload=deepcopy(payload or {}),
            created_at=self._next_history_timestamp(
                db,
                template_id=template_id,
                workspace_id=workspace_id,
            ),
        )
        db.add(history)
        db.flush()
        return history

    def _apply_create_payload(
        self,
        db: Session,
        record: WorkspaceStarterTemplateRecord,
        payload: WorkspaceStarterTemplateCreate,
    ) -> None:
        record.workspace_id = payload.workspace_id
        record.name = payload.name
        record.description = payload.description
        record.business_track = payload.business_track
        record.default_workflow_name = payload.default_workflow_name
        record.workflow_focus = payload.workflow_focus
        record.recommended_next_step = payload.recommended_next_step
        record.tags = normalize_workspace_starter_tags(payload.tags)
        record.definition = validate_workspace_starter_definition(
            db,
            workspace_id=payload.workspace_id,
            definition=payload.definition,
            workflow_id=payload.created_from_workflow_id,
            workflow_version=payload.created_from_workflow_version,
            allow_next_version=True,
        )
        record.created_from_workflow_id = payload.created_from_workflow_id
        record.created_from_workflow_version = payload.created_from_workflow_version

@lru_cache(maxsize=1)
def get_workspace_starter_template_service() -> WorkspaceStarterTemplateService:
    return WorkspaceStarterTemplateService()
