from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.schemas.workspace_starter import (
    WorkspaceStarterBulkActionRequest,
    WorkspaceStarterBulkActionResult,
    WorkspaceStarterBulkDeletedItem,
    WorkspaceStarterBulkSandboxDependencyItem,
    WorkspaceStarterBulkSkippedItem,
    WorkspaceStarterBulkSkippedSummary,
    WorkspaceStarterSourceDiffSummary,
    WorkspaceStarterTemplateItem,
)
from app.services.workflow_definitions import WorkflowDefinitionValidationError
from app.services.workspace_starter_templates import (
    WorkspaceStarterTemplateService,
    get_workspace_starter_template_service,
)


@dataclass
class WorkspaceStarterBulkActionAccumulator:
    updated_items: list[WorkspaceStarterTemplateItem] = field(default_factory=list)
    deleted_items: list[WorkspaceStarterBulkDeletedItem] = field(default_factory=list)
    skipped_items: list[WorkspaceStarterBulkSkippedItem] = field(default_factory=list)
    sandbox_dependency_items: list[WorkspaceStarterBulkSandboxDependencyItem] = field(
        default_factory=list
    )

    def build_result(
        self,
        payload: WorkspaceStarterBulkActionRequest,
    ) -> WorkspaceStarterBulkActionResult:
        processed_count = len(self.updated_items) + len(self.deleted_items)
        return WorkspaceStarterBulkActionResult(
            workspace_id=payload.workspace_id,
            action=payload.action,
            requested_count=len(payload.template_ids),
            updated_count=processed_count,
            skipped_count=len(self.skipped_items),
            updated_items=self.updated_items,
            deleted_items=self.deleted_items,
            skipped_items=self.skipped_items,
            skipped_reason_summary=summarize_bulk_skips(self.skipped_items),
            sandbox_dependency_changes=summarize_bulk_sandbox_dependency_items(
                self.sandbox_dependency_items
            ),
            sandbox_dependency_items=self.sandbox_dependency_items,
        )


def execute_workspace_starter_bulk_action(
    db: Session,
    payload: WorkspaceStarterBulkActionRequest,
    *,
    service: WorkspaceStarterTemplateService | None = None,
) -> WorkspaceStarterBulkActionResult:
    starter_service = service or get_workspace_starter_template_service()
    records = starter_service.list_templates_by_ids(
        db,
        payload.template_ids,
        workspace_id=payload.workspace_id,
    )
    record_map = {record.id: record for record in records}
    accumulator = WorkspaceStarterBulkActionAccumulator()

    for template_id in payload.template_ids:
        record = record_map.get(template_id)
        if record is None:
            accumulator.skipped_items.append(
                WorkspaceStarterBulkSkippedItem(
                    template_id=template_id,
                    reason="not_found",
                    detail="Workspace starter template not found.",
                )
            )
            continue

        if payload.action == "archive":
            _archive_template(db, starter_service, record, accumulator)
            continue
        if payload.action == "restore":
            _restore_template(db, starter_service, record, accumulator)
            continue
        if payload.action == "delete":
            _delete_template(db, starter_service, record, accumulator)
            continue

        _sync_template_from_source(
            db,
            starter_service,
            record,
            action=payload.action,
            accumulator=accumulator,
        )

    db.commit()
    return accumulator.build_result(payload)


def summarize_bulk_skips(
    skipped_items: list[WorkspaceStarterBulkSkippedItem],
) -> list[WorkspaceStarterBulkSkippedSummary]:
    summary_by_reason: dict[str, WorkspaceStarterBulkSkippedSummary] = {}
    for item in skipped_items:
        summary = summary_by_reason.get(item.reason)
        if summary is None:
            summary = WorkspaceStarterBulkSkippedSummary(
                reason=item.reason,
                count=0,
                detail=item.detail,
            )
            summary_by_reason[item.reason] = summary
        summary.count += 1
    return sorted(summary_by_reason.values(), key=lambda item: item.reason)


def summarize_bulk_sandbox_dependency_items(
    items: list[WorkspaceStarterBulkSandboxDependencyItem],
) -> WorkspaceStarterSourceDiffSummary | None:
    if not items:
        return None

    return WorkspaceStarterSourceDiffSummary(
        template_count=sum(
            item.sandbox_dependency_changes.template_count for item in items
        ),
        source_count=sum(item.sandbox_dependency_changes.source_count for item in items),
        added_count=sum(item.sandbox_dependency_changes.added_count for item in items),
        removed_count=sum(
            item.sandbox_dependency_changes.removed_count for item in items
        ),
        changed_count=sum(
            item.sandbox_dependency_changes.changed_count for item in items
        ),
    )


def _archive_template(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.archived_at is not None:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="already_archived",
                detail="Workspace starter is already archived.",
            )
        )
        return

    service.archive_template(record)
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="archived",
        summary=f"批量归档了 workspace starter「{record.name}」。",
        payload={"bulk": True},
    )
    db.add(record)
    db.flush()
    accumulator.updated_items.append(service.serialize(record))


def _restore_template(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.archived_at is None:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="not_archived",
                detail="Workspace starter is not archived.",
            )
        )
        return

    service.restore_template(record)
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="restored",
        summary=f"批量恢复了 workspace starter「{record.name}」。",
        payload={"bulk": True},
    )
    db.add(record)
    db.flush()
    accumulator.updated_items.append(service.serialize(record))


def _delete_template(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.archived_at is None:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="delete_requires_archive",
                detail="Archive the workspace starter before deleting it.",
            )
        )
        return

    service.delete_template(db, record)
    accumulator.deleted_items.append(
        WorkspaceStarterBulkDeletedItem(
            template_id=record.id,
            name=record.name,
        )
    )


def _sync_template_from_source(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    *,
    action: str,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.created_from_workflow_id is None:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="no_source_workflow",
                detail="Workspace starter has no source workflow.",
            )
        )
        return

    source_workflow = db.get(Workflow, record.created_from_workflow_id)
    if source_workflow is None:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="source_workflow_missing",
                detail="Source workflow not found.",
            )
        )
        return

    if action == "refresh":
        _refresh_template_from_workflow(
            db,
            service,
            record,
            source_workflow,
            accumulator,
        )
        return

    _rebase_template_from_workflow(
        db,
        service,
        record,
        source_workflow,
        accumulator,
    )


def _refresh_template_from_workflow(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    source_workflow: Workflow,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    try:
        previous_version = record.created_from_workflow_version
        diff = service.build_source_diff(record, source_workflow)
        changed = service.refresh_from_workflow(db, record, source_workflow)
    except WorkflowDefinitionValidationError as exc:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="source_workflow_invalid",
                detail=str(exc),
            )
        )
        return

    payload = {
        "bulk": True,
        "source_workflow_id": source_workflow.id,
        "previous_workflow_version": previous_version,
        "source_workflow_version": source_workflow.version,
        "changed": changed,
    }
    if diff.sandbox_dependency_entries:
        payload["sandbox_dependency_changes"] = (
            diff.sandbox_dependency_summary.model_dump()
        )
        payload["sandbox_dependency_nodes"] = [
            entry.id for entry in diff.sandbox_dependency_entries
        ]
        accumulator.sandbox_dependency_items.append(
            WorkspaceStarterBulkSandboxDependencyItem(
                template_id=record.id,
                name=record.name,
                source_workflow_id=source_workflow.id,
                source_workflow_version=source_workflow.version,
                sandbox_dependency_changes=diff.sandbox_dependency_summary,
                sandbox_dependency_nodes=[
                    entry.id for entry in diff.sandbox_dependency_entries
                ],
            )
        )

    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="refreshed",
        summary=(
            f"批量从源 workflow「{source_workflow.name}」刷新了模板快照。"
            if changed
            else f"批量检查了源 workflow「{source_workflow.name}」，模板快照已是最新。"
        ),
        payload=payload,
    )
    db.add(record)
    db.flush()
    accumulator.updated_items.append(service.serialize(record))


def _rebase_template_from_workflow(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    source_workflow: Workflow,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    try:
        diff = service.rebase_from_workflow(db, record, source_workflow)
    except WorkflowDefinitionValidationError as exc:
        accumulator.skipped_items.append(
            WorkspaceStarterBulkSkippedItem(
                template_id=record.id,
                name=record.name,
                reason="source_workflow_invalid",
                detail=str(exc),
            )
        )
        return

    payload = {
        "bulk": True,
        "source_workflow_id": source_workflow.id,
        "source_workflow_version": source_workflow.version,
        "changed": diff.changed,
        "rebase_fields": diff.rebase_fields,
        "node_changes": diff.node_summary.model_dump(),
        "edge_changes": diff.edge_summary.model_dump(),
    }
    if diff.sandbox_dependency_entries:
        payload["sandbox_dependency_changes"] = (
            diff.sandbox_dependency_summary.model_dump()
        )
        payload["sandbox_dependency_nodes"] = [
            entry.id for entry in diff.sandbox_dependency_entries
        ]
        accumulator.sandbox_dependency_items.append(
            WorkspaceStarterBulkSandboxDependencyItem(
                template_id=record.id,
                name=record.name,
                source_workflow_id=source_workflow.id,
                source_workflow_version=source_workflow.version,
                sandbox_dependency_changes=diff.sandbox_dependency_summary,
                sandbox_dependency_nodes=[
                    entry.id for entry in diff.sandbox_dependency_entries
                ],
            )
        )

    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="rebased",
        summary=(
            f"批量从源 workflow「{source_workflow.name}」同步了 rebase 所需字段。"
            if diff.changed
            else f"批量检查了源 workflow「{source_workflow.name}」，当前已对齐。"
        ),
        payload=payload,
    )
    db.add(record)
    db.flush()
    accumulator.updated_items.append(service.serialize(record))

