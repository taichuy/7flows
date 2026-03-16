from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow
from app.schemas.workspace_starter import (
    WorkflowBusinessTrack,
    WorkspaceStarterBulkActionRequest,
    WorkspaceStarterBulkActionResult,
    WorkspaceStarterBulkDeletedItem,
    WorkspaceStarterBulkSkippedItem,
    WorkspaceStarterBulkSkippedSummary,
    WorkspaceStarterHistoryItem,
    WorkspaceStarterSourceDiff,
    WorkspaceStarterTemplateCreate,
    WorkspaceStarterTemplateItem,
    WorkspaceStarterTemplateUpdate,
)
from app.services.workflow_definitions import (
    WorkflowDefinitionValidationError,
    WorkflowDefinitionValidationIssue,
)
from app.services.workspace_starter_templates import (
    get_workspace_starter_template_service,
)

router = APIRouter(prefix="/workspace-starters", tags=["workspace-starters"])


def _render_validation_issues(
    issues: list[WorkflowDefinitionValidationIssue],
) -> list[dict[str, str]]:
    return [
        {
            key: value
            for key, value in {
                "category": issue.category,
                "message": issue.message,
                "path": issue.path,
                "field": issue.field,
            }.items()
            if value is not None
        }
        for issue in issues
    ]


def _raise_definition_validation_error(exc: WorkflowDefinitionValidationError) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={
            "message": str(exc),
            "issues": _render_validation_issues(exc.issues),
        },
    ) from exc


@router.post("/bulk", response_model=WorkspaceStarterBulkActionResult)
def bulk_update_workspace_starters(
    payload: WorkspaceStarterBulkActionRequest,
    db: Session = Depends(get_db),
) -> WorkspaceStarterBulkActionResult:
    service = get_workspace_starter_template_service()
    records = service.list_templates_by_ids(
        db,
        payload.template_ids,
        workspace_id=payload.workspace_id,
    )
    record_map = {record.id: record for record in records}
    updated_items: list[WorkspaceStarterTemplateItem] = []
    deleted_items: list[WorkspaceStarterBulkDeletedItem] = []
    skipped_items: list[WorkspaceStarterBulkSkippedItem] = []

    for template_id in payload.template_ids:
        record = record_map.get(template_id)
        if record is None:
            skipped_items.append(
                WorkspaceStarterBulkSkippedItem(
                    template_id=template_id,
                    reason="not_found",
                    detail="Workspace starter template not found.",
                )
            )
            continue

        if payload.action == "archive":
            if record.archived_at is not None:
                skipped_items.append(
                    WorkspaceStarterBulkSkippedItem(
                        template_id=record.id,
                        name=record.name,
                        reason="already_archived",
                        detail="Workspace starter is already archived.",
                    )
                )
                continue

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
            updated_items.append(service.serialize(record))
        elif payload.action == "restore":
            if record.archived_at is None:
                skipped_items.append(
                    WorkspaceStarterBulkSkippedItem(
                        template_id=record.id,
                        name=record.name,
                        reason="not_archived",
                        detail="Workspace starter is not archived.",
                    )
                )
                continue

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
            updated_items.append(service.serialize(record))
        elif payload.action == "delete":
            if record.archived_at is None:
                skipped_items.append(
                    WorkspaceStarterBulkSkippedItem(
                        template_id=record.id,
                        name=record.name,
                        reason="delete_requires_archive",
                        detail="Archive the workspace starter before deleting it.",
                    )
                )
                continue

            deleted_items.append(
                WorkspaceStarterBulkDeletedItem(
                    template_id=record.id,
                    name=record.name,
                )
            )
            service.delete_template(db, record)
        else:
            if record.created_from_workflow_id is None:
                skipped_items.append(
                    WorkspaceStarterBulkSkippedItem(
                        template_id=record.id,
                        name=record.name,
                        reason="no_source_workflow",
                        detail="Workspace starter has no source workflow.",
                    )
                )
                continue

            source_workflow = db.get(Workflow, record.created_from_workflow_id)
            if source_workflow is None:
                skipped_items.append(
                    WorkspaceStarterBulkSkippedItem(
                        template_id=record.id,
                        name=record.name,
                        reason="source_workflow_missing",
                        detail="Source workflow not found.",
                    )
                )
                continue

            if payload.action == "refresh":
                try:
                    previous_version = record.created_from_workflow_version
                    changed = service.refresh_from_workflow(db, record, source_workflow)
                except WorkflowDefinitionValidationError as exc:
                    skipped_items.append(
                        WorkspaceStarterBulkSkippedItem(
                            template_id=record.id,
                            name=record.name,
                            reason="source_workflow_invalid",
                            detail=str(exc),
                        )
                    )
                    continue
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
                    payload={
                        "bulk": True,
                        "source_workflow_id": source_workflow.id,
                        "previous_workflow_version": previous_version,
                        "source_workflow_version": source_workflow.version,
                        "changed": changed,
                    },
                )
            else:
                try:
                    diff = service.rebase_from_workflow(db, record, source_workflow)
                except WorkflowDefinitionValidationError as exc:
                    skipped_items.append(
                        WorkspaceStarterBulkSkippedItem(
                            template_id=record.id,
                            name=record.name,
                            reason="source_workflow_invalid",
                            detail=str(exc),
                        )
                    )
                    continue
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
                    payload={
                        "bulk": True,
                        "source_workflow_id": source_workflow.id,
                        "source_workflow_version": source_workflow.version,
                        "changed": diff.changed,
                        "rebase_fields": diff.rebase_fields,
                        "node_changes": diff.node_summary.model_dump(),
                        "edge_changes": diff.edge_summary.model_dump(),
                    },
                )
            db.add(record)
            db.flush()
            updated_items.append(service.serialize(record))

    db.commit()
    processed_count = len(updated_items) + len(deleted_items)
    return WorkspaceStarterBulkActionResult(
        workspace_id=payload.workspace_id,
        action=payload.action,
        requested_count=len(payload.template_ids),
        updated_count=processed_count,
        skipped_count=len(skipped_items),
        updated_items=updated_items,
        deleted_items=deleted_items,
        skipped_items=skipped_items,
        skipped_reason_summary=_summarize_bulk_skips(skipped_items),
    )


@router.get("", response_model=list[WorkspaceStarterTemplateItem])
def list_workspace_starters(
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    business_track: WorkflowBusinessTrack | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=128),
    include_archived: bool = Query(default=False),
    archived_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[WorkspaceStarterTemplateItem]:
    service = get_workspace_starter_template_service()
    records = service.list_templates(
        db,
        workspace_id=workspace_id,
        business_track=business_track,
        search=search,
        include_archived=include_archived,
        archived_only=archived_only,
    )
    return [service.serialize(record) for record in records]


@router.get("/{template_id}", response_model=WorkspaceStarterTemplateItem)
def get_workspace_starter(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )

    return service.serialize(record)


@router.get(
    "/{template_id}/history",
    response_model=list[WorkspaceStarterHistoryItem],
)
def list_workspace_starter_history(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[WorkspaceStarterHistoryItem]:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )

    return [
        service.serialize_history(item)
        for item in service.list_history(
            db,
            template_id,
            workspace_id=workspace_id,
            limit=limit,
        )
    ]


@router.post(
    "",
    response_model=WorkspaceStarterTemplateItem,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_starter(
    payload: WorkspaceStarterTemplateCreate,
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    try:
        record = service.create_template(db, payload)
    except WorkflowDefinitionValidationError as exc:
        _raise_definition_validation_error(exc)

    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="created",
        summary=f"创建了 workspace starter「{record.name}」。",
        payload={
            "business_track": record.business_track,
            "created_from_workflow_id": record.created_from_workflow_id,
            "created_from_workflow_version": record.created_from_workflow_version,
        },
    )
    db.commit()
    db.refresh(record)
    return service.serialize(record)


@router.put("/{template_id}", response_model=WorkspaceStarterTemplateItem)
def update_workspace_starter(
    template_id: str,
    payload: WorkspaceStarterTemplateUpdate,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )

    try:
        service.update_template(db, record, payload)
    except WorkflowDefinitionValidationError as exc:
        _raise_definition_validation_error(exc)

    changed_fields = sorted(payload.model_dump(exclude_none=True).keys())
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="updated",
        summary=f"更新了 workspace starter「{record.name}」的治理元数据。",
        payload={"fields": changed_fields},
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return service.serialize(record)


@router.get(
    "/{template_id}/source-diff",
    response_model=WorkspaceStarterSourceDiff,
)
def get_workspace_starter_source_diff(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterSourceDiff:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )
    if record.created_from_workflow_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This workspace starter has no source workflow to diff against.",
        )

    source_workflow = db.get(Workflow, record.created_from_workflow_id)
    if source_workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source workflow not found.",
        )

    return service.build_source_diff(record, source_workflow)


@router.post("/{template_id}/archive", response_model=WorkspaceStarterTemplateItem)
def archive_workspace_starter(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )

    service.archive_template(record)
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="archived",
        summary=f"归档了 workspace starter「{record.name}」。",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return service.serialize(record)


@router.post("/{template_id}/restore", response_model=WorkspaceStarterTemplateItem)
def restore_workspace_starter(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )

    service.restore_template(record)
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="restored",
        summary=f"恢复了 workspace starter「{record.name}」。",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return service.serialize(record)


@router.post("/{template_id}/rebase", response_model=WorkspaceStarterTemplateItem)
def rebase_workspace_starter(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )
    if record.created_from_workflow_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This workspace starter has no source workflow to rebase from.",
        )

    source_workflow = db.get(Workflow, record.created_from_workflow_id)
    if source_workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source workflow not found.",
        )

    try:
        diff = service.rebase_from_workflow(db, record, source_workflow)
    except WorkflowDefinitionValidationError as exc:
        _raise_definition_validation_error(exc)
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="rebased",
        summary=(
            f"从源 workflow「{source_workflow.name}」rebase 了 starter 快照与默认工作流名。"
            if diff.changed
            else f"检查了源 workflow「{source_workflow.name}」，starter 与源 definition 已对齐。"
        ),
        payload={
            "source_workflow_id": source_workflow.id,
            "source_workflow_version": source_workflow.version,
            "changed": diff.changed,
            "rebase_fields": diff.rebase_fields,
            "node_changes": diff.node_summary.model_dump(),
            "edge_changes": diff.edge_summary.model_dump(),
        },
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return service.serialize(record)


@router.post("/{template_id}/refresh", response_model=WorkspaceStarterTemplateItem)
def refresh_workspace_starter(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> WorkspaceStarterTemplateItem:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )
    if record.created_from_workflow_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This workspace starter has no source workflow to refresh from.",
        )

    source_workflow = db.get(Workflow, record.created_from_workflow_id)
    if source_workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source workflow not found.",
        )

    previous_version = record.created_from_workflow_version
    try:
        changed = service.refresh_from_workflow(db, record, source_workflow)
    except WorkflowDefinitionValidationError as exc:
        _raise_definition_validation_error(exc)
    service.record_history(
        db,
        template_id=record.id,
        workspace_id=record.workspace_id,
        action="refreshed",
        summary=(
            f"从源 workflow「{source_workflow.name}」刷新了模板快照。"
            if changed
            else f"检查了源 workflow「{source_workflow.name}」，模板快照已是最新。"
        ),
        payload={
            "source_workflow_id": source_workflow.id,
            "previous_workflow_version": previous_version,
            "source_workflow_version": source_workflow.version,
            "changed": changed,
        },
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return service.serialize(record)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace_starter(
    template_id: str,
    workspace_id: str = Query(default="default", min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> None:
    service = get_workspace_starter_template_service()
    record = service.get_template(db, template_id, workspace_id=workspace_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace starter template not found.",
        )
    if record.archived_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archive the workspace starter before deleting it.",
        )

    service.delete_template(db, record)
    db.commit()


def _summarize_bulk_skips(
    skipped_items: list[WorkspaceStarterBulkSkippedItem],
) -> list[WorkspaceStarterBulkSkippedSummary]:
    summary_by_reason: dict[str, WorkspaceStarterBulkSkippedSummary] = {}
    for item in skipped_items:
        summary = summary_by_reason.get(item.reason)
        if summary is None:
            summary_by_reason[item.reason] = WorkspaceStarterBulkSkippedSummary(
                reason=item.reason,
                count=1,
                detail=item.detail,
            )
            continue

        summary.count += 1

    return sorted(summary_by_reason.values(), key=lambda item: item.reason)
