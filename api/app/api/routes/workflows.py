from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow
from app.schemas.run import WorkflowRunListItem
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowDetail,
    WorkflowListItem,
    WorkflowUpdate,
    WorkflowVersionItem,
)
from app.services.compiled_blueprints import CompiledBlueprintService
from app.services.workflow_definitions import (
    WorkflowDefinitionValidationError,
    validate_workflow_definition,
)
from app.services.workflow_mutations import (
    WorkflowMutationError,
    WorkflowMutationService,
)
from app.services.workflow_views import (
    build_workflow_detail,
    list_workflow_run_items,
    list_workflow_version_items,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])
workflow_mutation_service = WorkflowMutationService(CompiledBlueprintService())


@router.get("", response_model=list[WorkflowListItem])
def list_workflows(db: Session = Depends(get_db)) -> list[WorkflowListItem]:
    items = db.scalars(select(Workflow).order_by(Workflow.name.asc())).all()
    return [
        WorkflowListItem(
            id=item.id,
            name=item.name,
            version=item.version,
            status=item.status,
        )
        for item in items
    ]


@router.post("", response_model=WorkflowDetail, status_code=status.HTTP_201_CREATED)
def create_workflow(payload: WorkflowCreate, db: Session = Depends(get_db)) -> WorkflowDetail:
    try:
        definition = validate_workflow_definition(payload.definition)
    except WorkflowDefinitionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    try:
        workflow = workflow_mutation_service.create_workflow(
            db,
            name=payload.name,
            definition=definition,
        )
    except WorkflowMutationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    db.commit()
    db.refresh(workflow)
    return build_workflow_detail(db, workflow)


@router.get("/{workflow_id}", response_model=WorkflowDetail)
def get_workflow(workflow_id: str, db: Session = Depends(get_db)) -> WorkflowDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    return build_workflow_detail(db, workflow)


@router.put("/{workflow_id}", response_model=WorkflowDetail)
def update_workflow(
    workflow_id: str,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
) -> WorkflowDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    definition = None
    if payload.definition is not None:
        try:
            definition = validate_workflow_definition(payload.definition)
        except WorkflowDefinitionValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc

    try:
        workflow_mutation_service.update_workflow(
            db,
            workflow=workflow,
            name=payload.name,
            definition=definition,
        )
    except WorkflowMutationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    db.commit()
    db.refresh(workflow)
    return build_workflow_detail(db, workflow)


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionItem])
def list_workflow_versions(
    workflow_id: str,
    db: Session = Depends(get_db),
) -> list[WorkflowVersionItem]:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    return list_workflow_version_items(db, workflow_id)


@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunListItem])
def list_workflow_runs(
    workflow_id: str,
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[WorkflowRunListItem]:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    return list_workflow_run_items(db, workflow_id, limit=limit)
