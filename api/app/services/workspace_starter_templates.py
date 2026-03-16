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
    WorkspaceStarterSourceDiffEntry,
    WorkspaceStarterSourceDiffSummary,
    WorkspaceStarterTemplateCreate,
    WorkspaceStarterTemplateItem,
    WorkspaceStarterTemplateUpdate,
)
from app.services.workflow_definitions import (
    build_workflow_adapter_reference_list,
    build_workflow_tool_reference_index,
    bump_workflow_version,
    validate_persistable_workflow_definition,
    validate_workflow_definition,
)
from app.services.workflow_publish_version_references import (
    build_allowed_publish_workflow_versions,
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
            record.tags = self._normalize_tags(payload.tags)
        if payload.definition is not None:
            record.definition = validate_persistable_workflow_definition(
                payload.definition,
                tool_index=build_workflow_tool_reference_index(
                    db,
                    workspace_id=record.workspace_id,
                ),
                adapters=build_workflow_adapter_reference_list(
                    db,
                    workspace_id=record.workspace_id,
                ),
                allowed_publish_versions=self._build_allowed_publish_versions_for_template(
                    db,
                    workflow_id=record.created_from_workflow_id,
                    workflow_version=record.created_from_workflow_version,
                    allow_next_version=True,
                ),
            )
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
        template_definition = deepcopy(record.definition or {})
        source_definition = validate_workflow_definition(workflow.definition)

        node_entries = self._build_diff_entries(
            template_items=template_definition.get("nodes"),
            source_items=source_definition.get("nodes"),
            label_builder=self._build_node_label,
        )
        edge_entries = self._build_diff_entries(
            template_items=template_definition.get("edges"),
            source_items=source_definition.get("edges"),
            label_builder=self._build_edge_label,
        )

        rebase_fields: list[str] = []
        if (
            record.created_from_workflow_version != workflow.version
            or template_definition != source_definition
        ):
            rebase_fields.extend(["definition", "created_from_workflow_version"])
        if record.default_workflow_name != workflow.name:
            rebase_fields.append("default_workflow_name")

        return WorkspaceStarterSourceDiff(
            template_id=record.id,
            workspace_id=record.workspace_id,
            source_workflow_id=workflow.id,
            source_workflow_name=workflow.name,
            template_version=record.created_from_workflow_version,
            source_version=workflow.version,
            template_default_workflow_name=record.default_workflow_name,
            source_default_workflow_name=workflow.name,
            workflow_name_changed=record.default_workflow_name != workflow.name,
            changed=bool(node_entries or edge_entries or rebase_fields),
            rebase_fields=rebase_fields,
            node_summary=self._build_diff_summary(
                template_items=template_definition.get("nodes"),
                source_items=source_definition.get("nodes"),
                entries=node_entries,
            ),
            edge_summary=self._build_diff_summary(
                template_items=template_definition.get("edges"),
                source_items=source_definition.get("edges"),
                entries=edge_entries,
            ),
            node_entries=node_entries,
            edge_entries=edge_entries,
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
        validated_definition = validate_persistable_workflow_definition(
            workflow.definition,
            tool_index=build_workflow_tool_reference_index(
                db,
                workspace_id=record.workspace_id,
            ),
            adapters=build_workflow_adapter_reference_list(
                db,
                workspace_id=record.workspace_id,
            ),
            allowed_publish_versions=build_allowed_publish_workflow_versions(
                db,
                workflow_id=workflow.id,
            ),
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
    ) -> WorkspaceStarterSourceDiff:
        diff = self.build_source_diff(record, workflow)
        if "definition" in diff.rebase_fields:
            record.definition = validate_persistable_workflow_definition(
                workflow.definition,
                tool_index=build_workflow_tool_reference_index(
                    db,
                    workspace_id=record.workspace_id,
                ),
                adapters=build_workflow_adapter_reference_list(
                    db,
                    workspace_id=record.workspace_id,
                ),
                allowed_publish_versions=build_allowed_publish_workflow_versions(
                    db,
                    workflow_id=workflow.id,
                ),
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
        record.tags = self._normalize_tags(payload.tags)
        record.definition = validate_persistable_workflow_definition(
            payload.definition,
            tool_index=build_workflow_tool_reference_index(
                db,
                workspace_id=payload.workspace_id,
            ),
            adapters=build_workflow_adapter_reference_list(
                db,
                workspace_id=payload.workspace_id,
            ),
            allowed_publish_versions=self._build_allowed_publish_versions_for_template(
                db,
                workflow_id=payload.created_from_workflow_id,
                workflow_version=payload.created_from_workflow_version,
                allow_next_version=True,
            ),
        )
        record.created_from_workflow_id = payload.created_from_workflow_id
        record.created_from_workflow_version = payload.created_from_workflow_version

    def _build_allowed_publish_versions_for_template(
        self,
        db: Session,
        *,
        workflow_id: str | None,
        workflow_version: str | None,
        allow_next_version: bool,
    ) -> set[str] | None:
        normalized_workflow_version = workflow_version.strip() if workflow_version else None
        if workflow_id is None and not normalized_workflow_version:
            return None

        allowed_versions = build_allowed_publish_workflow_versions(
            db,
            workflow_id=workflow_id,
            current_version=normalized_workflow_version,
        )
        if allow_next_version and normalized_workflow_version:
            try:
                allowed_versions.add(bump_workflow_version(normalized_workflow_version))
            except ValueError:
                pass
        return allowed_versions

    def _normalize_tags(self, tags: list[str]) -> list[str]:
        normalized_tags: list[str] = []
        for tag in tags:
            normalized = tag.strip()
            if normalized and normalized not in normalized_tags:
                normalized_tags.append(normalized)
        return normalized_tags

    def _build_diff_entries(
        self,
        *,
        template_items: object,
        source_items: object,
        label_builder,
    ) -> list[WorkspaceStarterSourceDiffEntry]:
        template_map = self._index_items(template_items)
        source_map = self._index_items(source_items)
        entries: list[WorkspaceStarterSourceDiffEntry] = []

        for item_id in sorted(set(source_map) - set(template_map)):
            entries.append(
                WorkspaceStarterSourceDiffEntry(
                    id=item_id,
                    label=label_builder(source_map[item_id]),
                    status="added",
                )
            )

        for item_id in sorted(set(template_map) - set(source_map)):
            entries.append(
                WorkspaceStarterSourceDiffEntry(
                    id=item_id,
                    label=label_builder(template_map[item_id]),
                    status="removed",
                )
            )

        for item_id in sorted(set(template_map) & set(source_map)):
            if template_map[item_id] != source_map[item_id]:
                entries.append(
                    WorkspaceStarterSourceDiffEntry(
                        id=item_id,
                        label=label_builder(source_map[item_id]),
                        status="changed",
                        changed_fields=self._collect_changed_fields(
                            template_map[item_id],
                            source_map[item_id],
                        ),
                    )
                )

        return entries

    def _build_diff_summary(
        self,
        *,
        template_items: object,
        source_items: object,
        entries: list[WorkspaceStarterSourceDiffEntry],
    ) -> WorkspaceStarterSourceDiffSummary:
        return WorkspaceStarterSourceDiffSummary(
            template_count=len(self._index_items(template_items)),
            source_count=len(self._index_items(source_items)),
            added_count=sum(1 for entry in entries if entry.status == "added"),
            removed_count=sum(1 for entry in entries if entry.status == "removed"),
            changed_count=sum(1 for entry in entries if entry.status == "changed"),
        )

    def _index_items(self, value: object) -> dict[str, dict]:
        if not isinstance(value, list):
            return {}

        indexed: dict[str, dict] = {}
        for item in value:
            if not isinstance(item, dict):
                continue
            item_id = item.get("id")
            if isinstance(item_id, str) and item_id.strip():
                indexed[item_id] = deepcopy(item)
        return indexed

    def _build_node_label(self, item: dict) -> str:
        item_id = str(item.get("id", "unknown"))
        node_name = str(item.get("name", item_id))
        node_type = str(item.get("type", "node"))
        return f"{node_name} ({node_type})"

    def _build_edge_label(self, item: dict) -> str:
        source_node_id = str(item.get("sourceNodeId", "?"))
        target_node_id = str(item.get("targetNodeId", "?"))
        condition = item.get("condition")
        if isinstance(condition, str) and condition.strip():
            return f"{source_node_id} -> {target_node_id} [{condition.strip()}]"
        return f"{source_node_id} -> {target_node_id}"

    def _collect_changed_fields(
        self,
        template_item: object,
        source_item: object,
    ) -> list[str]:
        changed_fields: list[str] = []
        self._append_changed_fields(
            changed_fields,
            path="",
            template_value=template_item,
            source_value=source_item,
        )
        return changed_fields

    def _append_changed_fields(
        self,
        changed_fields: list[str],
        *,
        path: str,
        template_value: object,
        source_value: object,
    ) -> None:
        if template_value == source_value:
            return

        if isinstance(template_value, dict) and isinstance(source_value, dict):
            keys = sorted(set(template_value) | set(source_value))
            for key in keys:
                next_path = f"{path}.{key}" if path else str(key)
                if key not in template_value or key not in source_value:
                    changed_fields.append(next_path)
                    continue
                self._append_changed_fields(
                    changed_fields,
                    path=next_path,
                    template_value=template_value[key],
                    source_value=source_value[key],
                )
            return

        if isinstance(template_value, list) and isinstance(source_value, list):
            if len(template_value) != len(source_value):
                changed_fields.append(path or "items")
                return

            for index, (template_item, source_item) in enumerate(
                zip(template_value, source_value, strict=False)
            ):
                self._append_changed_fields(
                    changed_fields,
                    path=f"{path}[{index}]" if path else f"[{index}]",
                    template_value=template_item,
                    source_value=source_item,
                )
            return

        changed_fields.append(path or "value")


@lru_cache(maxsize=1)
def get_workspace_starter_template_service() -> WorkspaceStarterTemplateService:
    return WorkspaceStarterTemplateService()
