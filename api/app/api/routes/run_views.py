from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.run_views import RunEvidenceView, RunExecutionView
from app.services.run_views import RunViewService

router = APIRouter(tags=["runs"])
run_view_service = RunViewService()


@router.get("/runs/{run_id}/execution-view", response_model=RunExecutionView)
def get_run_execution_view(run_id: str, db: Session = Depends(get_db)) -> RunExecutionView:
    view = run_view_service.get_execution_view(db, run_id)
    if view is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found.",
        )
    return view


@router.get("/runs/{run_id}/evidence-view", response_model=RunEvidenceView)
def get_run_evidence_view(run_id: str, db: Session = Depends(get_db)) -> RunEvidenceView:
    view = run_view_service.get_evidence_view(db, run_id)
    if view is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found.",
        )
    return view
