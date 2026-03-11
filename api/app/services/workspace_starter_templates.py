from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.workspace_starter import WorkspaceStarterTemplateRecord
from app.schemas.workspace_starter import (
    WorkflowBusinessTrack,
    WorkspaceStarterTemplateCreate,
    WorkspaceStarterTemplateItem,
    WorkspaceStarterTemplateUpdate,
)
from app.services.workflow_definitions import validate_workflow_definition


class WorkspaceStarterTemplateService:
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

    def create_template(
        self,
        db: Session,
        payload: WorkspaceStarterTemplateCreate,
    ) -> WorkspaceStarterTemplateRecord:
        record = WorkspaceStarterTemplateRecord(id=str(uuid4()))
        db.add(record)
        self._apply_create_payload(record, payload)
        db.flush()
        return record

    def update_template(
        self,
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
            record.tags = self._normalize_tags(payload.tags)
        if payload.definition is not None:
            record.definition = validate_workflow_definition(payload.definition)
        return record

    def serialize(
        self,
        record: WorkspaceStarterTemplateRecord,
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
        )

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
        db.delete(record)

    def _apply_create_payload(
        self,
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
        record.tags = self._normalize_tags(payload.tags)
        record.definition = validate_workflow_definition(payload.definition)
        record.created_from_workflow_id = payload.created_from_workflow_id
        record.created_from_workflow_version = payload.created_from_workflow_version

    def _normalize_tags(self, tags: list[str]) -> list[str]:
        normalized_tags: list[str] = []
        for tag in tags:
            normalized = tag.strip()
            if normalized and normalized not in normalized_tags:
                normalized_tags.append(normalized)
        return normalized_tags


@lru_cache(maxsize=1)
def get_workspace_starter_template_service() -> WorkspaceStarterTemplateService:
    return WorkspaceStarterTemplateService()
