from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.auth import require_console_route_access
from app.core.database import get_db
from app.schemas.run import (
    CallbackTicketCleanupItem,
    CallbackTicketCleanupRequest,
    CallbackTicketCleanupResponse,
)
from app.services.callback_blocker_deltas import (
    build_callback_blocker_delta_summary,
    capture_callback_blocker_snapshot,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    load_operator_run_snapshot,
)
from app.services.run_action_explanations import (
    build_callback_cleanup_outcome_explanation,
)
from app.services.run_callback_ticket_cleanup import (
    CallbackTicketCleanupResult,
    RunCallbackTicketCleanupService,
)

router = APIRouter(prefix="/runs/callback-tickets", tags=["run-callback-tickets"])
cleanup_service = RunCallbackTicketCleanupService()


def _serialize_cleanup_result(
    result: CallbackTicketCleanupResult,
    *,
    outcome_explanation=None,
    callback_blocker_delta=None,
    run_snapshot=None,
    run_follow_up=None,
) -> CallbackTicketCleanupResponse:
    return CallbackTicketCleanupResponse(
        source=result.source,
        dry_run=result.dry_run,
        limit=result.limit,
        matched_count=result.matched_count,
        expired_count=result.expired_count,
        scheduled_resume_count=result.scheduled_resume_count,
        terminated_count=result.terminated_count,
        run_ids=result.run_ids,
        scheduled_resume_run_ids=result.scheduled_resume_run_ids,
        terminated_run_ids=result.terminated_run_ids,
        items=[
            CallbackTicketCleanupItem(
                ticket=item.ticket,
                run_id=item.run_id,
                node_run_id=item.node_run_id,
                node_id=item.node_id,
                tool_call_id=item.tool_call_id,
                tool_id=item.tool_id,
                tool_call_index=item.tool_call_index,
                waiting_status=item.waiting_status,
                status=item.status,
                reason=item.reason,
                created_at=item.created_at,
                expires_at=item.expires_at,
                expired_at=item.expired_at,
            )
            for item in result.items
        ],
        outcome_explanation=outcome_explanation,
        callback_blocker_delta=callback_blocker_delta,
        run_snapshot=run_snapshot,
        run_follow_up=run_follow_up,
    )


def _resolve_primary_run_id(
    *,
    requested_run_id: str | None,
    affected_run_ids: list[str],
) -> str | None:
    if requested_run_id:
        return requested_run_id
    if len(affected_run_ids) == 1:
        return affected_run_ids[0]
    return None


@router.post("/cleanup", response_model=CallbackTicketCleanupResponse)
def cleanup_stale_run_callback_tickets(
    payload: CallbackTicketCleanupRequest,
    _access_context=Depends(
        require_console_route_access("/api/runs/callback-tickets/cleanup", method="POST")
    ),
    db: Session = Depends(get_db),
) -> CallbackTicketCleanupResponse:
    scoped_run_id = (payload.run_id or "").strip() or None
    scoped_node_run_id = (payload.node_run_id or "").strip() or None
    before_blocker = (
        capture_callback_blocker_snapshot(
            db,
            run_id=scoped_run_id,
            node_run_id=scoped_node_run_id,
        )
        if scoped_run_id is not None
        else None
    )
    result = cleanup_service.cleanup_stale_tickets(
        db,
        source=payload.source,
        schedule_resumes=payload.schedule_resumes and not payload.dry_run,
        resume_source=payload.source,
        limit=payload.limit,
        dry_run=payload.dry_run,
        run_id=payload.run_id,
        node_run_id=payload.node_run_id,
    )
    if not payload.dry_run:
        db.commit()
    run_follow_up = build_operator_run_follow_up_summary(db, result.run_ids)
    outcome_explanation = build_callback_cleanup_outcome_explanation(
        result,
        run_follow_up,
    )
    primary_run_id = _resolve_primary_run_id(
        requested_run_id=payload.run_id,
        affected_run_ids=result.run_ids,
    )
    after_blocker = (
        capture_callback_blocker_snapshot(
            db,
            run_id=primary_run_id,
            node_run_id=scoped_node_run_id,
        )
        if before_blocker is not None and primary_run_id is not None
        else None
    )
    return _serialize_cleanup_result(
        result,
        outcome_explanation=outcome_explanation,
        callback_blocker_delta=build_callback_blocker_delta_summary(
            before=before_blocker,
            after=after_blocker,
        )
        if before_blocker is not None
        else None,
        run_snapshot=load_operator_run_snapshot(db, primary_run_id),
        run_follow_up=run_follow_up,
    )
