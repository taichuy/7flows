from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow, WorkflowPublishedEndpoint
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationItem,
    PublishedEndpointInvocationListResponse,
    PublishedEndpointInvocationSummary,
)
from app.services.published_invocations import PublishedInvocationService

router = APIRouter(prefix="/workflows", tags=["published-endpoint-activity"])
published_invocation_service = PublishedInvocationService()


def _serialize_published_invocation_summary(summary) -> PublishedEndpointInvocationSummary:
    return PublishedEndpointInvocationSummary(
        total_count=summary.total_count,
        succeeded_count=summary.succeeded_count,
        failed_count=summary.failed_count,
        rejected_count=summary.rejected_count,
        last_invoked_at=summary.last_invoked_at,
        last_status=summary.last_status,
        last_run_id=summary.last_run_id,
        last_run_status=summary.last_run_status,
    )


def _serialize_published_invocation_item(record) -> PublishedEndpointInvocationItem:
    return PublishedEndpointInvocationItem(
        id=record.id,
        workflow_id=record.workflow_id,
        binding_id=record.binding_id,
        endpoint_id=record.endpoint_id,
        endpoint_alias=record.endpoint_alias,
        route_path=record.route_path,
        protocol=record.protocol,
        auth_mode=record.auth_mode,
        request_source=record.request_source,
        status=record.status,
        api_key_id=record.api_key_id,
        run_id=record.run_id,
        run_status=record.run_status,
        error_message=record.error_message,
        request_preview=record.request_preview or {},
        response_preview=record.response_preview,
        duration_ms=record.duration_ms,
        created_at=record.created_at,
        finished_at=record.finished_at,
    )


@router.get(
    "/{workflow_id}/published-endpoints/{binding_id}/invocations",
    response_model=PublishedEndpointInvocationListResponse,
)
def list_published_endpoint_invocations(
    workflow_id: str,
    binding_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PublishedEndpointInvocationListResponse:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    binding = db.get(WorkflowPublishedEndpoint, binding_id)
    if binding is None or binding.workflow_id != workflow_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published endpoint binding not found.",
        )

    records = published_invocation_service.list_for_binding(
        db,
        workflow_id=workflow_id,
        binding_id=binding_id,
        limit=limit,
    )
    summary = published_invocation_service.summarize_for_bindings(
        db,
        workflow_id=workflow_id,
        binding_ids=[binding_id],
    ).get(binding_id, PublishedEndpointInvocationSummary())
    return PublishedEndpointInvocationListResponse(
        summary=_serialize_published_invocation_summary(summary),
        items=[_serialize_published_invocation_item(record) for record in records],
    )
