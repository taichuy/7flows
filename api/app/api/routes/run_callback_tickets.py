from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.run import (
    CallbackTicketCleanupItem,
    CallbackTicketCleanupRequest,
    CallbackTicketCleanupResponse,
)
from app.services.operator_run_follow_up import build_operator_run_follow_up_summary
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
        run_follow_up=run_follow_up,
    )


@router.post("/cleanup", response_model=CallbackTicketCleanupResponse)
def cleanup_stale_run_callback_tickets(
    payload: CallbackTicketCleanupRequest,
    db: Session = Depends(get_db),
) -> CallbackTicketCleanupResponse:
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
    return _serialize_cleanup_result(
        result,
        outcome_explanation=outcome_explanation,
        run_follow_up=run_follow_up,
    )
