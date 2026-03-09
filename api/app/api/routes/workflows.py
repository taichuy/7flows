from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowDetail, WorkflowListItem

router = APIRouter(prefix="/workflows", tags=["workflows"])


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


@router.post("", response_model=WorkflowListItem, status_code=status.HTTP_201_CREATED)
def create_workflow(payload: WorkflowCreate, db: Session = Depends(get_db)) -> WorkflowListItem:
    workflow = Workflow(
        id=str(uuid4()),
        name=payload.name,
        version="0.1.0",
        status="draft",
        definition=payload.definition,
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return WorkflowListItem(
        id=workflow.id,
        name=workflow.name,
        version=workflow.version,
        status=workflow.status,
    )


@router.get("/{workflow_id}", response_model=WorkflowDetail)
def get_workflow(workflow_id: str, db: Session = Depends(get_db)) -> WorkflowDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    return WorkflowDetail(
        id=workflow.id,
        name=workflow.name,
        version=workflow.version,
        status=workflow.status,
        definition=workflow.definition,
    )
