from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.api.routes.sensitive_access_http import (
    build_sensitive_access_blocking_response,
)
from app.core.database import get_db
from app.models.run import Run
from app.models.workflow import Workflow
from app.schemas.run import (
    RunCallbackRequest,
    RunCallbackResponse,
    RunCreate,
    RunDetail,
    RunEventItem,
    RunOverview,
    RunResumeRequest,
    RunResumeResponse,
    RunTrace,
)
from app.services.callback_blocker_deltas import (
    build_callback_blocker_delta_summary,
    capture_callback_blocker_snapshot,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    load_operator_run_snapshot,
)
from app.services.run_action_explanations import build_manual_resume_outcome_explanation
from app.services.run_trace_export_access import RunTraceExportAccessService
from app.services.run_trace_views import (
    build_trace_export_filename,
    load_run_trace,
    serialize_trace_export_jsonl,
)
from app.services.run_views import (
    build_run_execution_view_for_artifacts,
    load_run_legacy_auth_governance_summary,
    load_run_tool_governance_summary,
    load_run_tool_governance_summary_for_run,
    serialize_run_detail,
    serialize_run_event,
    serialize_run_overview,
    serialize_run_overview_from_artifacts,
)
from app.services.runtime import RuntimeService, WorkflowExecutionError

router = APIRouter(tags=["runs"])
runtime_service = RuntimeService()
run_trace_export_access_service = RunTraceExportAccessService()


def _enforce_trace_export_sensitive_access(
    *,
    db: Session,
    run_id: str,
    requester_id: str,
    purpose_text: str | None,
) -> JSONResponse | None:
    bundle = run_trace_export_access_service.ensure_access(
        db,
        run_id=run_id,
        requester_id=requester_id,
        purpose_text=purpose_text,
    )
    return build_sensitive_access_blocking_response(
        bundle,
        db=db,
        approval_detail="Run trace export requires approval before the payload can be exported.",
        deny_detail="Run trace export is denied by the sensitive access policy.",
    )


@router.post(
    "/workflows/{workflow_id}/runs",
    response_model=RunOverview,
    status_code=status.HTTP_201_CREATED,
)
def execute_workflow(
    workflow_id: str,
    payload: RunCreate,
    db: Session = Depends(get_db),
) -> RunOverview:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    try:
        artifacts = runtime_service.execute_workflow(db, workflow, payload.input_payload)
    except WorkflowExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return serialize_run_overview_from_artifacts(
        artifacts,
        tool_governance=load_run_tool_governance_summary(db, artifacts),
    )


@router.get("/runs/{run_id}", response_model=RunOverview)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
) -> RunOverview:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")

    event_summary = runtime_service.load_run_event_summary(db, run_id)
    return serialize_run_overview(
        run=run,
        event_count=int(event_summary["event_count"]),
        event_type_counts=dict(event_summary["event_type_counts"]),
        first_event_at=event_summary["first_event_at"],
        last_event_at=event_summary["last_event_at"],
        tool_governance=load_run_tool_governance_summary_for_run(
            db,
            workflow_id=run.workflow_id,
            workflow_version=run.workflow_version,
        ),
        legacy_auth_governance=load_run_legacy_auth_governance_summary(
            db,
            run.workflow_id,
        ),
    )


@router.get("/runs/{run_id}/detail", response_model=RunDetail)
def get_run_detail(
    run_id: str,
    include_events: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> RunDetail:
    artifacts = runtime_service.load_run(db, run_id)
    if artifacts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    execution_view = build_run_execution_view_for_artifacts(db, artifacts)
    return serialize_run_detail(
        artifacts,
        include_events=include_events,
        execution_view=execution_view,
        tool_governance=load_run_tool_governance_summary(db, artifacts),
    )


@router.post("/runs/{run_id}/resume", response_model=RunResumeResponse)
def resume_run(
    run_id: str,
    payload: RunResumeRequest | None = None,
    db: Session = Depends(get_db),
) -> RunResumeResponse:
    before_blocker = capture_callback_blocker_snapshot(db, run_id=run_id)
    try:
        request = payload or RunResumeRequest()
        artifacts = runtime_service.resume_run(
            db,
            run_id,
            source=request.source,
            reason=request.reason,
        )
    except WorkflowExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    after_blocker = capture_callback_blocker_snapshot(db, run_id=artifacts.run.id)
    run_follow_up = build_operator_run_follow_up_summary(db, [run_id])
    execution_view = build_run_execution_view_for_artifacts(db, artifacts)
    return RunResumeResponse(
        run=serialize_run_detail(
            artifacts,
            execution_view=execution_view,
            tool_governance=load_run_tool_governance_summary(db, artifacts),
        ),
        outcome_explanation=build_manual_resume_outcome_explanation(run_follow_up),
        callback_blocker_delta=build_callback_blocker_delta_summary(
            before=before_blocker,
            after=after_blocker,
        ),
        run_snapshot=load_operator_run_snapshot(db, artifacts.run.id),
        run_follow_up=run_follow_up,
    )


@router.post("/runs/callbacks/{ticket}", response_model=RunCallbackResponse)
def receive_run_callback(
    ticket: str,
    payload: RunCallbackRequest,
    db: Session = Depends(get_db),
) -> RunCallbackResponse:
    result_payload = payload.result.model_dump(mode="python")
    error_message = result_payload.pop("error_message", None)
    if error_message:
        result_payload.setdefault("meta", {})
        result_payload["meta"]["error_message"] = error_message
    try:
        callback = runtime_service.receive_callback(
            db,
            ticket,
            payload=result_payload,
            source=payload.source,
        )
    except WorkflowExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    execution_view = build_run_execution_view_for_artifacts(db, callback.artifacts)
    return RunCallbackResponse(
        callback_status=callback.callback_status,
        ticket=callback.ticket,
        run_id=callback.run_id,
        node_run_id=callback.node_run_id,
        run=serialize_run_detail(
            callback.artifacts,
            execution_view=execution_view,
            tool_governance=load_run_tool_governance_summary(db, callback.artifacts),
        ),
    )


@router.get("/runs/{run_id}/events", response_model=list[RunEventItem])
def get_run_events(run_id: str, db: Session = Depends(get_db)) -> list[RunEventItem]:
    artifacts = runtime_service.load_run(db, run_id)
    if artifacts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return [serialize_run_event(event) for event in artifacts.events]


@router.get("/runs/{run_id}/trace", response_model=RunTrace)
def get_run_trace(
    run_id: str,
    cursor: str | None = None,
    event_type: str | None = None,
    node_run_id: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    payload_key: str | None = None,
    before_event_id: int | None = None,
    after_event_id: int | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
) -> RunTrace:
    return load_run_trace(
        run_id=run_id,
        cursor=cursor,
        event_type=event_type,
        node_run_id=node_run_id,
        created_after=created_after,
        created_before=created_before,
        payload_key=payload_key,
        before_event_id=before_event_id,
        after_event_id=after_event_id,
        limit=limit,
        order=order,
        db=db,
    )


@router.get("/runs/{run_id}/trace/export", response_model=None)
def export_run_trace(
    run_id: str,
    cursor: str | None = None,
    event_type: str | None = None,
    node_run_id: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    payload_key: str | None = None,
    before_event_id: int | None = None,
    after_event_id: int | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    order: Literal["asc", "desc"] = "asc",
    format: Literal["json", "jsonl"] = "json",
    requester_id: str = Query(default="run-diagnostics-export", min_length=1, max_length=128),
    purpose_text: str | None = Query(default=None, max_length=512),
    db: Session = Depends(get_db),
):
    sensitive_access_response = _enforce_trace_export_sensitive_access(
        db=db,
        run_id=run_id,
        requester_id=requester_id,
        purpose_text=purpose_text,
    )
    if sensitive_access_response is not None:
        return sensitive_access_response

    trace = load_run_trace(
        run_id=run_id,
        cursor=cursor,
        event_type=event_type,
        node_run_id=node_run_id,
        created_after=created_after,
        created_before=created_before,
        payload_key=payload_key,
        before_event_id=before_event_id,
        after_event_id=after_event_id,
        limit=limit,
        order=order,
        db=db,
    )
    filename = build_trace_export_filename(run_id, format)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }

    if format == "jsonl":
        return PlainTextResponse(
            content=serialize_trace_export_jsonl(trace),
            media_type="application/x-ndjson",
            headers=headers,
        )

    return JSONResponse(
        content=trace.model_dump(mode="json"),
        headers=headers,
    )
