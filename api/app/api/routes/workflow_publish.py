from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow
from app.schemas.workflow_publish import (
    PublishedEndpointLifecycleStatus,
    WorkflowPublishedEndpointItem,
    WorkflowPublishedEndpointLifecycleUpdate,
)
from app.services.workflow_publish import (
    WorkflowPublishBindingError,
    WorkflowPublishBindingService,
)

router = APIRouter(prefix="/workflows", tags=["workflow-publish"])
workflow_publish_service = WorkflowPublishBindingService()


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
    return [
        WorkflowPublishedEndpointItem(
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
            published_at=record.published_at,
            unpublished_at=record.unpublished_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
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
        published_at=record.published_at,
        unpublished_at=record.unpublished_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
