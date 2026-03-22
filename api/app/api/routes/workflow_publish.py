from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow, WorkflowPublishedEndpoint
from app.schemas.workflow_publish import (
    PublishedEndpointCacheInventorySummary,
    PublishedEndpointInvocationSummary,
    PublishedEndpointLifecycleStatus,
    WorkflowPublishedEndpointItem,
    WorkflowPublishedEndpointLifecycleUpdate,
)
from app.services.published_cache import PublishedEndpointCacheService
from app.services.published_invocations import PublishedInvocationService
from app.services.workflow_publish import (
    WorkflowPublishBindingError,
    WorkflowPublishBindingService,
)

router = APIRouter(prefix="/workflows", tags=["workflow-publish"])
workflow_publish_service = WorkflowPublishBindingService()
published_invocation_service = PublishedInvocationService()
published_cache_service = PublishedEndpointCacheService()


def _serialize_published_invocation_summary(
    summary,
) -> PublishedEndpointInvocationSummary | None:
    if summary is None:
        return None
    return PublishedEndpointInvocationSummary(
        total_count=summary.total_count,
        succeeded_count=summary.succeeded_count,
        failed_count=summary.failed_count,
        rejected_count=summary.rejected_count,
        cache_hit_count=summary.cache_hit_count,
        cache_miss_count=summary.cache_miss_count,
        cache_bypass_count=summary.cache_bypass_count,
        last_invoked_at=summary.last_invoked_at,
        last_status=summary.last_status,
        last_cache_status=summary.last_cache_status,
        last_run_id=summary.last_run_id,
        last_run_status=summary.last_run_status,
        last_reason_code=summary.last_reason_code,
        approval_ticket_count=summary.approval_ticket_count,
        pending_approval_count=summary.pending_approval_count,
        approved_approval_count=summary.approved_approval_count,
        rejected_approval_count=summary.rejected_approval_count,
        expired_approval_count=summary.expired_approval_count,
        pending_notification_count=summary.pending_notification_count,
        delivered_notification_count=summary.delivered_notification_count,
        failed_notification_count=summary.failed_notification_count,
    )


def _serialize_published_cache_inventory_summary(
    summary,
) -> PublishedEndpointCacheInventorySummary | None:
    if summary is None:
        return None
    return PublishedEndpointCacheInventorySummary(
        enabled=summary.enabled,
        ttl=summary.ttl,
        max_entries=summary.max_entries,
        vary_by=list(summary.vary_by),
        active_entry_count=summary.active_entry_count,
        total_hit_count=summary.total_hit_count,
        last_hit_at=summary.last_hit_at,
        nearest_expires_at=summary.nearest_expires_at,
        latest_created_at=summary.latest_created_at,
    )


def _serialize_workflow_published_endpoint_item(
    record: WorkflowPublishedEndpoint,
    *,
    activity: PublishedEndpointInvocationSummary | None = None,
    cache_inventory=None,
) -> WorkflowPublishedEndpointItem:
    return WorkflowPublishedEndpointItem(
        id=record.id,
        workflow_id=record.workflow_id,
        workflow_version_id=record.workflow_version_id,
        workflow_version=record.workflow_version,
        target_workflow_version_id=record.target_workflow_version_id,
        target_workflow_version=record.target_workflow_version,
        compiled_blueprint_id=record.compiled_blueprint_id,
        endpoint_id=record.endpoint_id,
        endpoint_name=record.endpoint_name,
        endpoint_alias=record.endpoint_alias,
        route_path=record.route_path,
        protocol=record.protocol,
        auth_mode=record.auth_mode,
        streaming=record.streaming,
        lifecycle_status=record.lifecycle_status,
        input_schema=record.input_schema,
        output_schema=record.output_schema,
        rate_limit_policy=record.rate_limit_policy,
        cache_policy=record.cache_policy,
        published_at=record.published_at,
        unpublished_at=record.unpublished_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
        activity=_serialize_published_invocation_summary(activity),
        cache_inventory=_serialize_published_cache_inventory_summary(cache_inventory),
    )


@router.get(
    "/{workflow_id}/published-endpoints",
    response_model=list[WorkflowPublishedEndpointItem],
)
def list_workflow_published_endpoints(
    workflow_id: str,
    workflow_version: str | None = Query(default=None, min_length=1, max_length=32),
    include_all_versions: bool = Query(default=False),
    lifecycle_status: PublishedEndpointLifecycleStatus | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[WorkflowPublishedEndpointItem]:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    effective_version = workflow_version
    if effective_version is None and not include_all_versions:
        effective_version = workflow.version

    records = workflow_publish_service.list_for_workflow(
        db,
        workflow_id,
        workflow_version=effective_version,
        lifecycle_status=lifecycle_status,
    )
    summaries = published_invocation_service.summarize_for_bindings(
        db,
        workflow_id=workflow_id,
        binding_ids=[record.id for record in records],
    )
    cache_summaries = published_cache_service.summarize_for_bindings(db, bindings=records)
    return [
        _serialize_workflow_published_endpoint_item(
            record,
            activity=summaries.get(record.id),
            cache_inventory=cache_summaries.get(record.id),
        )
        for record in records
    ]


@router.patch(
    "/{workflow_id}/published-endpoints/{binding_id}/lifecycle",
    response_model=WorkflowPublishedEndpointItem,
)
def update_workflow_published_endpoint_lifecycle(
    workflow_id: str,
    binding_id: str,
    payload: WorkflowPublishedEndpointLifecycleUpdate,
    db: Session = Depends(get_db),
) -> WorkflowPublishedEndpointItem:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    try:
        record = workflow_publish_service.update_lifecycle_status(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
            lifecycle_status=payload.status,
        )
    except WorkflowPublishBindingError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if detail == "Published endpoint binding not found."
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc

    db.commit()
    db.refresh(record)
    summary = published_invocation_service.summarize_for_bindings(
        db,
        workflow_id=workflow_id,
        binding_ids=[record.id],
    ).get(record.id)
    cache_summary = published_cache_service.summarize_for_bindings(
        db,
        bindings=[record],
    ).get(record.id)
    return _serialize_workflow_published_endpoint_item(
        record,
        activity=summary,
        cache_inventory=cache_summary,
    )
