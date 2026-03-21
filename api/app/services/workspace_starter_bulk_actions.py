from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.schemas.workspace_starter import (
    WorkspaceStarterBulkActionPreview,
    WorkspaceStarterBulkActionRequest,
    WorkspaceStarterBulkActionResult,
    WorkspaceStarterBulkDeletedItem,
    WorkspaceStarterBulkPreview,
    WorkspaceStarterBulkPreviewBlockedItem,
    WorkspaceStarterBulkPreviewCandidateItem,
    WorkspaceStarterBulkPreviewReason,
    WorkspaceStarterBulkPreviewReasonSummary,
    WorkspaceStarterBulkPreviewRequest,
    WorkspaceStarterBulkPreviewSet,
    WorkspaceStarterBulkReceiptItem,
    WorkspaceStarterBulkSandboxDependencyItem,
    WorkspaceStarterBulkSkippedItem,
    WorkspaceStarterBulkSkippedSummary,
    WorkspaceStarterSourceDiff,
    WorkspaceStarterSourceDiffSummary,
    WorkspaceStarterTemplateItem,
)
from app.services.workflow_definitions import WorkflowDefinitionValidationError
from app.services.workspace_starter_bulk_result_explanations import (
    build_workspace_starter_bulk_follow_up_template_ids,
    build_workspace_starter_bulk_outcome_explanation,
)
from app.services.workspace_starter_template_validation import (
    validate_workspace_starter_definition,
)
from app.services.workspace_starter_templates import (
    WorkspaceStarterTemplateService,
    get_workspace_starter_template_service,
)


@dataclass
class WorkspaceStarterBulkActionAccumulator:
    updated_items: list[WorkspaceStarterTemplateItem] = field(default_factory=list)
    deleted_items: list[WorkspaceStarterBulkDeletedItem] = field(default_factory=list)
    skipped_items: list[WorkspaceStarterBulkSkippedItem] = field(default_factory=list)
    receipt_items: list[WorkspaceStarterBulkReceiptItem] = field(default_factory=list)
    sandbox_dependency_items: list[WorkspaceStarterBulkSandboxDependencyItem] = field(
        default_factory=list
    )

    def build_result(
        self,
        payload: WorkspaceStarterBulkActionRequest,
    ) -> WorkspaceStarterBulkActionResult:
        processed_count = len(self.updated_items) + len(self.deleted_items)
        skipped_reason_summary = summarize_bulk_skips(self.skipped_items)
        sandbox_dependency_changes = summarize_bulk_sandbox_dependency_items(
            self.sandbox_dependency_items
        )
        return WorkspaceStarterBulkActionResult(
            workspace_id=payload.workspace_id,
            action=payload.action,
            requested_count=len(payload.template_ids),
            updated_count=processed_count,
            skipped_count=len(self.skipped_items),
            updated_items=self.updated_items,
            deleted_items=self.deleted_items,
            skipped_items=self.skipped_items,
            skipped_reason_summary=skipped_reason_summary,
            sandbox_dependency_changes=sandbox_dependency_changes,
            sandbox_dependency_items=self.sandbox_dependency_items,
            receipt_items=self.receipt_items,
            outcome_explanation=build_workspace_starter_bulk_outcome_explanation(
                action=payload.action,
                requested_count=len(payload.template_ids),
                processed_count=processed_count,
                deleted_count=len(self.deleted_items),
                skipped_reason_summary=skipped_reason_summary,
                sandbox_dependency_changes=sandbox_dependency_changes,
                sandbox_dependency_item_count=len(self.sandbox_dependency_items),
            ),
            follow_up_template_ids=build_workspace_starter_bulk_follow_up_template_ids(
                action=payload.action,
                receipt_items=self.receipt_items,
            ),
        )


def _build_result_receipt_item(
    template_id: str,
    *,
    outcome: str,
    record=None,
    source_workflow: Workflow | None = None,
    diff: WorkspaceStarterSourceDiff | None = None,
    reason: str | None = None,
    detail: str | None = None,
    changed: bool | None = None,
    rebase_fields: list[str] | None = None,
) -> WorkspaceStarterBulkReceiptItem:
    return WorkspaceStarterBulkReceiptItem(
        template_id=template_id,
        name=getattr(record, "name", None),
        outcome=outcome,
        archived=bool(getattr(record, "archived_at", None)),
        reason=reason,
        detail=detail,
        source_workflow_id=(
            source_workflow.id
            if source_workflow is not None
            else getattr(record, "created_from_workflow_id", None)
        ),
        source_workflow_version=(
            source_workflow.version
            if source_workflow is not None
            else getattr(record, "created_from_workflow_version", None)
        ),
        action_decision=diff.action_decision if diff is not None else None,
        sandbox_dependency_changes=(
            diff.sandbox_dependency_summary
            if diff is not None and diff.sandbox_dependency_entries
            else None
        ),
        sandbox_dependency_nodes=(
            [entry.id for entry in diff.sandbox_dependency_entries]
            if diff is not None and diff.sandbox_dependency_entries
            else []
        ),
        changed=changed,
        rebase_fields=list(rebase_fields or []),
    )


def _append_skipped_item(
    accumulator: WorkspaceStarterBulkActionAccumulator,
    template_id: str,
    *,
    reason: str,
    detail: str,
    record=None,
    source_workflow: Workflow | None = None,
    diff: WorkspaceStarterSourceDiff | None = None,
) -> None:
    accumulator.skipped_items.append(
        WorkspaceStarterBulkSkippedItem(
            template_id=template_id,
            name=getattr(record, "name", None),
            archived=bool(getattr(record, "archived_at", None)),
            reason=reason,
            detail=detail,
            source_workflow_id=(
                source_workflow.id
                if source_workflow is not None
                else getattr(record, "created_from_workflow_id", None)
            ),
            source_workflow_version=(
                source_workflow.version
                if source_workflow is not None
                else getattr(record, "created_from_workflow_version", None)
            ),
            action_decision=diff.action_decision if diff is not None else None,
            sandbox_dependency_changes=(
                diff.sandbox_dependency_summary
                if diff is not None and diff.sandbox_dependency_entries
                else None
            ),
            sandbox_dependency_nodes=(
                [entry.id for entry in diff.sandbox_dependency_entries]
                if diff is not None and diff.sandbox_dependency_entries
                else []
            ),
        )
    )
    accumulator.receipt_items.append(
        _build_result_receipt_item(
            template_id,
            outcome="skipped",
            record=record,
            source_workflow=source_workflow,
            diff=diff,
            reason=reason,
            detail=detail,
            changed=False,
        )
    )


def _append_updated_receipt_item(
    accumulator: WorkspaceStarterBulkActionAccumulator,
    template_id: str,
    *,
    record,
    source_workflow: Workflow | None = None,
    diff: WorkspaceStarterSourceDiff | None = None,
    detail: str | None = None,
    changed: bool | None = None,
    rebase_fields: list[str] | None = None,
) -> None:
    accumulator.receipt_items.append(
        _build_result_receipt_item(
            template_id,
            outcome="updated",
            record=record,
            source_workflow=source_workflow,
            diff=diff,
            detail=detail,
            changed=changed,
            rebase_fields=rebase_fields,
        )
    )


def _append_deleted_receipt_item(
    accumulator: WorkspaceStarterBulkActionAccumulator,
    template_id: str,
    *,
    record,
    detail: str | None = None,
) -> None:
    accumulator.receipt_items.append(
        _build_result_receipt_item(
            template_id,
            outcome="deleted",
            record=record,
            detail=detail,
            changed=True,
        )
    )


@dataclass
class WorkspaceStarterBulkSourcePreviewContext:
    source_workflow: Workflow | None = None
    diff: WorkspaceStarterSourceDiff | None = None
    blocked_reason: WorkspaceStarterBulkPreviewReason | None = None
    blocked_detail: str | None = None


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
    source_context_map = (
        {
            record.id: _build_source_preview_context(db, starter_service, record)
            for record in records
        }
        if payload.action in {"refresh", "rebase"}
        else {}
    )

    for template_id in payload.template_ids:
        record = record_map.get(template_id)
        if record is None:
            _append_skipped_item(
                accumulator,
                template_id,
                reason="not_found",
                detail="Workspace starter template not found.",
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
            source_context=source_context_map.get(record.id),
        )

    db.commit()
    return accumulator.build_result(payload)


def preview_workspace_starter_bulk_actions(
    db: Session,
    payload: WorkspaceStarterBulkPreviewRequest,
    *,
    service: WorkspaceStarterTemplateService | None = None,
) -> WorkspaceStarterBulkPreview:
    starter_service = service or get_workspace_starter_template_service()
    records = starter_service.list_templates_by_ids(
        db,
        payload.template_ids,
        workspace_id=payload.workspace_id,
    )
    record_map = {record.id: record for record in records}
    source_context_map = {
        record.id: _build_source_preview_context(db, starter_service, record)
        for record in records
    }

    return WorkspaceStarterBulkPreview(
        workspace_id=payload.workspace_id,
        requested_count=len(payload.template_ids),
        previews=WorkspaceStarterBulkPreviewSet(
            archive=_build_archive_action_preview(payload.template_ids, record_map),
            restore=_build_restore_action_preview(payload.template_ids, record_map),
            refresh=_build_source_action_preview(
                db,
                starter_service,
                payload.template_ids,
                record_map,
                source_context_map,
                action="refresh",
            ),
            rebase=_build_source_action_preview(
                db,
                starter_service,
                payload.template_ids,
                record_map,
                source_context_map,
                action="rebase",
            ),
            delete=_build_delete_action_preview(payload.template_ids, record_map),
        ),
    )


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


def summarize_bulk_preview_blocked_items(
    items: list[WorkspaceStarterBulkPreviewBlockedItem],
) -> list[WorkspaceStarterBulkPreviewReasonSummary]:
    summary_by_reason: dict[str, WorkspaceStarterBulkPreviewReasonSummary] = {}
    for item in items:
        summary = summary_by_reason.get(item.reason)
        if summary is None:
            summary = WorkspaceStarterBulkPreviewReasonSummary(
                reason=item.reason,
                count=0,
                detail=item.detail,
            )
            summary_by_reason[item.reason] = summary
        summary.count += 1
    return sorted(summary_by_reason.values(), key=lambda item: item.reason)


def _build_archive_action_preview(
    template_ids: list[str],
    record_map: dict[str, object],
) -> WorkspaceStarterBulkActionPreview:
    candidate_items: list[WorkspaceStarterBulkPreviewCandidateItem] = []
    blocked_items: list[WorkspaceStarterBulkPreviewBlockedItem] = []

    for template_id in template_ids:
        record = record_map.get(template_id)
        if record is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    reason="not_found",
                    detail="Workspace starter template not found.",
                )
            )
            continue

        if record.archived_at is not None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    reason="already_archived",
                    detail="Workspace starter is already archived.",
                )
            )
            continue

        candidate_items.append(_build_preview_candidate_item(template_id, record=record))

    return _build_action_preview_response(
        action="archive",
        candidate_items=candidate_items,
        blocked_items=blocked_items,
    )


def _build_restore_action_preview(
    template_ids: list[str],
    record_map: dict[str, object],
) -> WorkspaceStarterBulkActionPreview:
    candidate_items: list[WorkspaceStarterBulkPreviewCandidateItem] = []
    blocked_items: list[WorkspaceStarterBulkPreviewBlockedItem] = []

    for template_id in template_ids:
        record = record_map.get(template_id)
        if record is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    reason="not_found",
                    detail="Workspace starter template not found.",
                )
            )
            continue

        if record.archived_at is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    reason="not_archived",
                    detail="Workspace starter is not archived.",
                )
            )
            continue

        candidate_items.append(_build_preview_candidate_item(template_id, record=record))

    return _build_action_preview_response(
        action="restore",
        candidate_items=candidate_items,
        blocked_items=blocked_items,
    )


def _build_delete_action_preview(
    template_ids: list[str],
    record_map: dict[str, object],
) -> WorkspaceStarterBulkActionPreview:
    candidate_items: list[WorkspaceStarterBulkPreviewCandidateItem] = []
    blocked_items: list[WorkspaceStarterBulkPreviewBlockedItem] = []

    for template_id in template_ids:
        record = record_map.get(template_id)
        if record is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    reason="not_found",
                    detail="Workspace starter template not found.",
                )
            )
            continue

        if record.archived_at is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    reason="delete_requires_archive",
                    detail="Archive the workspace starter before deleting it.",
                )
            )
            continue

        candidate_items.append(_build_preview_candidate_item(template_id, record=record))

    return _build_action_preview_response(
        action="delete",
        candidate_items=candidate_items,
        blocked_items=blocked_items,
    )


def _build_source_preview_context(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
) -> WorkspaceStarterBulkSourcePreviewContext:
    if record.created_from_workflow_id is None:
        return WorkspaceStarterBulkSourcePreviewContext(
            blocked_reason="no_source_workflow",
            blocked_detail="Workspace starter has no source workflow.",
        )

    source_workflow = db.get(Workflow, record.created_from_workflow_id)
    if source_workflow is None:
        return WorkspaceStarterBulkSourcePreviewContext(
            blocked_reason="source_workflow_missing",
            blocked_detail="Source workflow not found.",
        )

    try:
        diff = service.build_source_diff(record, source_workflow)
    except WorkflowDefinitionValidationError as exc:
        return WorkspaceStarterBulkSourcePreviewContext(
            source_workflow=source_workflow,
            blocked_reason="source_workflow_invalid",
            blocked_detail=str(exc),
        )

    return WorkspaceStarterBulkSourcePreviewContext(
        source_workflow=source_workflow,
        diff=diff,
    )


def _build_source_action_preview(
    db: Session,
    service: WorkspaceStarterTemplateService,
    template_ids: list[str],
    record_map: dict[str, object],
    source_context_map: dict[str, WorkspaceStarterBulkSourcePreviewContext],
    *,
    action: str,
) -> WorkspaceStarterBulkActionPreview:
    candidate_items: list[WorkspaceStarterBulkPreviewCandidateItem] = []
    blocked_items: list[WorkspaceStarterBulkPreviewBlockedItem] = []

    for template_id in template_ids:
        record = record_map.get(template_id)
        if record is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    reason="not_found",
                    detail="Workspace starter template not found.",
                )
            )
            continue

        context = source_context_map.get(record.id)
        if context is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    reason="no_source_workflow",
                    detail="Workspace starter has no source workflow.",
                )
            )
            continue

        if context.blocked_reason is not None or context.blocked_detail is not None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    source_workflow=context.source_workflow,
                    reason=context.blocked_reason or "source_workflow_invalid",
                    detail=context.blocked_detail or "Source workflow is not valid.",
                )
            )
            continue

        diff = context.diff
        source_workflow = context.source_workflow
        if diff is None or source_workflow is None:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    reason="source_workflow_missing",
                    detail="Source workflow not found.",
                )
            )
            continue

        if action == "refresh" and not diff.action_decision.can_refresh:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    source_workflow=source_workflow,
                    reason=_resolve_source_action_block_reason(diff, action=action),
                    detail=diff.action_decision.summary,
                    diff=diff,
                )
            )
            continue

        if action == "rebase" and not diff.action_decision.can_rebase:
            blocked_items.append(
                _build_preview_blocked_item(
                    template_id,
                    record=record,
                    source_workflow=source_workflow,
                    reason=_resolve_source_action_block_reason(diff, action=action),
                    detail=diff.action_decision.summary,
                    diff=diff,
                )
            )
            continue

        validation_required = action == "refresh" or "definition" in diff.rebase_fields
        if validation_required:
            try:
                validate_workspace_starter_definition(
                    db,
                    workspace_id=record.workspace_id,
                    definition=source_workflow.definition,
                    workflow_id=source_workflow.id,
                    workflow_version=source_workflow.version,
                    allow_next_version=False,
                )
            except WorkflowDefinitionValidationError as exc:
                blocked_items.append(
                    _build_preview_blocked_item(
                        template_id,
                        record=record,
                        source_workflow=source_workflow,
                        reason="source_workflow_invalid",
                        detail=str(exc),
                        diff=diff,
                    )
                )
                continue

        candidate_items.append(
            _build_preview_candidate_item(
                template_id,
                record=record,
                source_workflow=source_workflow,
                diff=diff,
            )
        )

    return _build_action_preview_response(
        action=action,
        candidate_items=candidate_items,
        blocked_items=blocked_items,
    )


def _build_action_preview_response(
    *,
    action: str,
    candidate_items: list[WorkspaceStarterBulkPreviewCandidateItem],
    blocked_items: list[WorkspaceStarterBulkPreviewBlockedItem],
) -> WorkspaceStarterBulkActionPreview:
    return WorkspaceStarterBulkActionPreview(
        action=action,
        candidate_count=len(candidate_items),
        blocked_count=len(blocked_items),
        candidate_items=candidate_items,
        blocked_items=blocked_items,
        blocked_reason_summary=summarize_bulk_preview_blocked_items(blocked_items),
    )


def _build_preview_candidate_item(
    template_id: str,
    *,
    record=None,
    source_workflow: Workflow | None = None,
    diff: WorkspaceStarterSourceDiff | None = None,
) -> WorkspaceStarterBulkPreviewCandidateItem:
    return WorkspaceStarterBulkPreviewCandidateItem(
        template_id=template_id,
        name=getattr(record, "name", None),
        archived=bool(getattr(record, "archived_at", None)),
        source_workflow_id=(
            source_workflow.id
            if source_workflow is not None
            else getattr(record, "created_from_workflow_id", None)
        ),
        source_workflow_version=(
            source_workflow.version
            if source_workflow is not None
            else getattr(record, "created_from_workflow_version", None)
        ),
        action_decision=diff.action_decision if diff is not None else None,
        sandbox_dependency_changes=(
            diff.sandbox_dependency_summary
            if diff is not None and diff.sandbox_dependency_entries
            else None
        ),
        sandbox_dependency_nodes=(
            [entry.id for entry in diff.sandbox_dependency_entries]
            if diff is not None and diff.sandbox_dependency_entries
            else []
        ),
    )


def _build_preview_blocked_item(
    template_id: str,
    *,
    reason: WorkspaceStarterBulkPreviewReason,
    detail: str,
    record=None,
    source_workflow: Workflow | None = None,
    diff: WorkspaceStarterSourceDiff | None = None,
) -> WorkspaceStarterBulkPreviewBlockedItem:
    return WorkspaceStarterBulkPreviewBlockedItem(
        template_id=template_id,
        name=getattr(record, "name", None),
        archived=bool(getattr(record, "archived_at", None)),
        reason=reason,
        detail=detail,
        source_workflow_id=(
            source_workflow.id
            if source_workflow is not None
            else getattr(record, "created_from_workflow_id", None)
        ),
        source_workflow_version=(
            source_workflow.version
            if source_workflow is not None
            else getattr(record, "created_from_workflow_version", None)
        ),
        action_decision=diff.action_decision if diff is not None else None,
        sandbox_dependency_changes=(
            diff.sandbox_dependency_summary
            if diff is not None and diff.sandbox_dependency_entries
            else None
        ),
        sandbox_dependency_nodes=(
            [entry.id for entry in diff.sandbox_dependency_entries]
            if diff is not None and diff.sandbox_dependency_entries
            else []
        ),
    )


def _resolve_source_action_block_reason(
    diff: WorkspaceStarterSourceDiff,
    *,
    action: str,
) -> WorkspaceStarterBulkPreviewReason:
    if not diff.changed:
        return "already_aligned"
    if (
        action == "refresh"
        and diff.workflow_name_changed
        and diff.rebase_fields == ["default_workflow_name"]
    ):
        return "name_drift_only"
    return "already_aligned"


def _archive_template(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.archived_at is not None:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            reason="already_archived",
            detail="Workspace starter is already archived.",
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
    accumulator.updated_items.append(service.serialize_with_source_governance(db, record))
    _append_updated_receipt_item(
        accumulator,
        record.id,
        record=record,
        detail="已批量归档 workspace starter。",
        changed=True,
    )


def _restore_template(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.archived_at is None:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            reason="not_archived",
            detail="Workspace starter is not archived.",
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
    accumulator.updated_items.append(service.serialize_with_source_governance(db, record))
    _append_updated_receipt_item(
        accumulator,
        record.id,
        record=record,
        detail="已批量恢复 workspace starter。",
        changed=True,
    )


def _delete_template(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    accumulator: WorkspaceStarterBulkActionAccumulator,
) -> None:
    if record.archived_at is None:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            reason="delete_requires_archive",
            detail="Archive the workspace starter before deleting it.",
        )
        return

    service.delete_template(db, record)
    accumulator.deleted_items.append(
        WorkspaceStarterBulkDeletedItem(
            template_id=record.id,
            name=record.name,
        )
    )
    _append_deleted_receipt_item(
        accumulator,
        record.id,
        record=record,
        detail="已批量删除 workspace starter。",
    )


def _sync_template_from_source(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    *,
    action: str,
    accumulator: WorkspaceStarterBulkActionAccumulator,
    source_context: WorkspaceStarterBulkSourcePreviewContext | None = None,
) -> None:
    context = source_context or _build_source_preview_context(db, service, record)
    if context.blocked_reason is not None or context.blocked_detail is not None:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            source_workflow=context.source_workflow,
            reason=context.blocked_reason or "source_workflow_invalid",
            detail=context.blocked_detail or "Source workflow is not valid.",
            diff=context.diff,
        )
        return

    diff = context.diff
    source_workflow = context.source_workflow
    if diff is None or source_workflow is None:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            reason="source_workflow_missing",
            detail="Source workflow not found.",
        )
        return

    if action == "refresh" and not diff.action_decision.can_refresh:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            source_workflow=source_workflow,
            reason=_resolve_source_action_block_reason(diff, action=action),
            detail=diff.action_decision.summary,
            diff=diff,
        )
        return

    if action == "rebase" and not diff.action_decision.can_rebase:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            source_workflow=source_workflow,
            reason=_resolve_source_action_block_reason(diff, action=action),
            detail=diff.action_decision.summary,
            diff=diff,
        )
        return

    validation_required = action == "refresh" or "definition" in diff.rebase_fields
    if validation_required:
        try:
            validate_workspace_starter_definition(
                db,
                workspace_id=record.workspace_id,
                definition=source_workflow.definition,
                workflow_id=source_workflow.id,
                workflow_version=source_workflow.version,
                allow_next_version=False,
            )
        except WorkflowDefinitionValidationError as exc:
            _append_skipped_item(
                accumulator,
                record.id,
                record=record,
                source_workflow=source_workflow,
                reason="source_workflow_invalid",
                detail=str(exc),
                diff=diff,
            )
            return

    if action == "refresh":
        _refresh_template_from_workflow(
            db,
            service,
            record,
            source_workflow,
            accumulator,
            diff=diff,
        )
        return

    _rebase_template_from_workflow(
        db,
        service,
        record,
        source_workflow,
        accumulator,
        diff=diff,
    )


def _refresh_template_from_workflow(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    source_workflow: Workflow,
    accumulator: WorkspaceStarterBulkActionAccumulator,
    *,
    diff: WorkspaceStarterSourceDiff,
) -> None:
    try:
        previous_version = record.created_from_workflow_version
        changed = service.refresh_from_workflow(db, record, source_workflow)
    except WorkflowDefinitionValidationError as exc:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            source_workflow=source_workflow,
            reason="source_workflow_invalid",
            detail=str(exc),
            diff=diff,
        )
        return

    payload = {
        "bulk": True,
        "source_workflow_id": source_workflow.id,
        "previous_workflow_version": previous_version,
        "source_workflow_version": source_workflow.version,
        "changed": changed,
        "action_decision": diff.action_decision.model_dump(),
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
    accumulator.updated_items.append(
        service.serialize_with_source_governance(
            db,
            record,
            source_workflow=source_workflow,
        )
    )
    _append_updated_receipt_item(
        accumulator,
        record.id,
        record=record,
        source_workflow=source_workflow,
        diff=diff,
        detail=(
            "已把 starter 快照应用到最新来源事实。"
            if changed
            else "已检查来源事实，当前 starter 快照已对齐。"
        ),
        changed=changed,
    )


def _rebase_template_from_workflow(
    db: Session,
    service: WorkspaceStarterTemplateService,
    record,
    source_workflow: Workflow,
    accumulator: WorkspaceStarterBulkActionAccumulator,
    *,
    diff: WorkspaceStarterSourceDiff,
) -> None:
    try:
        diff = service.rebase_from_workflow(
            db,
            record,
            source_workflow,
            diff=diff,
        )
    except WorkflowDefinitionValidationError as exc:
        _append_skipped_item(
            accumulator,
            record.id,
            record=record,
            source_workflow=source_workflow,
            reason="source_workflow_invalid",
            detail=str(exc),
            diff=diff,
        )
        return

    payload = {
        "bulk": True,
        "source_workflow_id": source_workflow.id,
        "source_workflow_version": source_workflow.version,
        "changed": diff.changed,
        "rebase_fields": diff.rebase_fields,
        "action_decision": diff.action_decision.model_dump(),
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
    accumulator.updated_items.append(
        service.serialize_with_source_governance(
            db,
            record,
            source_workflow=source_workflow,
        )
    )
    _append_updated_receipt_item(
        accumulator,
        record.id,
        record=record,
        source_workflow=source_workflow,
        diff=diff,
        detail=(
            "已同步 rebase 所需字段。"
            if diff.changed
            else "已检查来源事实，当前 starter 与来源已对齐。"
        ),
        changed=diff.changed,
        rebase_fields=diff.rebase_fields,
    )

