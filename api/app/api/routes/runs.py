from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow import Workflow
from app.schemas.run import RunCreate, RunDetail, RunEventItem
from app.services.runtime import ExecutionArtifacts, RuntimeService, WorkflowExecutionError

router = APIRouter(tags=["runs"])
runtime_service = RuntimeService()


def _serialize_run(artifacts: ExecutionArtifacts) -> RunDetail:
    return RunDetail(
        id=artifacts.run.id,
        workflow_id=artifacts.run.workflow_id,
        status=artifacts.run.status,
        input_payload=artifacts.run.input_payload,
        output_payload=artifacts.run.output_payload,
        error_message=artifacts.run.error_message,
        started_at=artifacts.run.started_at,
        finished_at=artifacts.run.finished_at,
        created_at=artifacts.run.created_at,
        node_runs=[
            {
                "id": node_run.id,
                "node_id": node_run.node_id,
                "node_name": node_run.node_name,
                "node_type": node_run.node_type,
                "status": node_run.status,
                "input_payload": node_run.input_payload,
                "output_payload": node_run.output_payload,
                "error_message": node_run.error_message,
                "started_at": node_run.started_at,
                "finished_at": node_run.finished_at,
            }
            for node_run in artifacts.node_runs
        ],
        events=[
            RunEventItem(
                id=event.id,
                run_id=event.run_id,
                node_run_id=event.node_run_id,
                event_type=event.event_type,
                payload=event.payload,
                created_at=event.created_at,
            )
            for event in artifacts.events
        ],
    )


@router.post(
    "/workflows/{workflow_id}/runs",
    response_model=RunDetail,
    status_code=status.HTTP_201_CREATED,
)
def execute_workflow(
    workflow_id: str,
    payload: RunCreate,
    db: Session = Depends(get_db),
) -> RunDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    try:
        artifacts = runtime_service.execute_workflow(db, workflow, payload.input_payload)
    except WorkflowExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return _serialize_run(artifacts)


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunDetail:
    artifacts = runtime_service.load_run(db, run_id)
    if artifacts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return _serialize_run(artifacts)


@router.get("/runs/{run_id}/events", response_model=list[RunEventItem])
def get_run_events(run_id: str, db: Session = Depends(get_db)) -> list[RunEventItem]:
    artifacts = runtime_service.load_run(db, run_id)
    if artifacts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return [
        RunEventItem(
            id=event.id,
            run_id=event.run_id,
            node_run_id=event.node_run_id,
            event_type=event.event_type,
            payload=event.payload,
            created_at=event.created_at,
        )
        for event in artifacts.events
    ]
