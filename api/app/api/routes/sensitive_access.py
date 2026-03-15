from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.sensitive_access import (
    ApprovalTicketDecisionRequest,
    ApprovalTicketDecisionResponse,
    ApprovalTicketItem,
    NotificationDispatchItem,
    NotificationDispatchRetryResponse,
    SensitiveAccessRequestCreateRequest,
    SensitiveAccessRequestItem,
    SensitiveAccessRequestResponse,
    SensitiveResourceCreateRequest,
    SensitiveResourceItem,
)
from app.services.sensitive_access_control import (
    ApprovalDecisionBundle,
    NotificationDispatchRetryBundle,
    SensitiveAccessControlError,
    SensitiveAccessControlService,
    SensitiveAccessRequestBundle,
)

router = APIRouter(prefix="/sensitive-access", tags=["sensitive-access"])
service = SensitiveAccessControlService()


def _serialize_resource(record) -> SensitiveResourceItem:
    return SensitiveResourceItem(
        id=record.id,
        label=record.label,
        description=record.description,
        sensitivity_level=record.sensitivity_level,
        source=record.source,
        metadata=record.metadata_payload or {},
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _serialize_access_request(record) -> SensitiveAccessRequestItem:
    return SensitiveAccessRequestItem(
        id=record.id,
        run_id=record.run_id,
        node_run_id=record.node_run_id,
        requester_type=record.requester_type,
        requester_id=record.requester_id,
        resource_id=record.resource_id,
        action_type=record.action_type,
        purpose_text=record.purpose_text,
        decision=record.decision,
        reason_code=record.reason_code,
        created_at=record.created_at,
        decided_at=record.decided_at,
    )


def _serialize_approval_ticket(record) -> ApprovalTicketItem:
    return ApprovalTicketItem(
        id=record.id,
        access_request_id=record.access_request_id,
        run_id=record.run_id,
        node_run_id=record.node_run_id,
        status=record.status,
        waiting_status=record.waiting_status,
        approved_by=record.approved_by,
        decided_at=record.decided_at,
        expires_at=record.expires_at,
        created_at=record.created_at,
    )


def _serialize_notification(record) -> NotificationDispatchItem:
    return NotificationDispatchItem(
        id=record.id,
        approval_ticket_id=record.approval_ticket_id,
        channel=record.channel,
        target=record.target,
        status=record.status,
        delivered_at=record.delivered_at,
        error=record.error,
        created_at=record.created_at,
    )


def _serialize_access_bundle(
    bundle: SensitiveAccessRequestBundle,
) -> SensitiveAccessRequestResponse:
    return SensitiveAccessRequestResponse(
        request=_serialize_access_request(bundle.access_request),
        resource=_serialize_resource(bundle.resource),
        approval_ticket=(
            _serialize_approval_ticket(bundle.approval_ticket)
            if bundle.approval_ticket is not None
            else None
        ),
        notifications=[_serialize_notification(item) for item in bundle.notifications],
    )


def _serialize_approval_bundle(bundle: ApprovalDecisionBundle) -> ApprovalTicketDecisionResponse:
    return ApprovalTicketDecisionResponse(
        request=_serialize_access_request(bundle.access_request),
        approval_ticket=_serialize_approval_ticket(bundle.approval_ticket),
        notifications=[_serialize_notification(item) for item in bundle.notifications],
    )


def _serialize_notification_retry_bundle(
    bundle: NotificationDispatchRetryBundle,
) -> NotificationDispatchRetryResponse:
    return NotificationDispatchRetryResponse(
        approval_ticket=_serialize_approval_ticket(bundle.approval_ticket),
        notification=_serialize_notification(bundle.notification),
    )


def _raise_sensitive_access_error(exc: SensitiveAccessControlError) -> None:
    detail = str(exc)
    status_code = (
        status.HTTP_404_NOT_FOUND
        if "not found" in detail.lower()
        else status.HTTP_422_UNPROCESSABLE_ENTITY
    )
    raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post(
    "/resources",
    response_model=SensitiveResourceItem,
    status_code=status.HTTP_201_CREATED,
)
def create_sensitive_resource(
    payload: SensitiveResourceCreateRequest,
    db: Session = Depends(get_db),
) -> SensitiveResourceItem:
    record = service.create_resource(
        db,
        label=payload.label,
        description=payload.description,
        sensitivity_level=payload.sensitivity_level,
        source=payload.source,
        metadata=payload.metadata,
    )
    db.commit()
    return _serialize_resource(record)


@router.get("/resources", response_model=list[SensitiveResourceItem])
def list_sensitive_resources(
    sensitivity_level: str | None = Query(default=None),
    source: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[SensitiveResourceItem]:
    records = service.list_resources(
        db,
        sensitivity_level=sensitivity_level,
        source=source,
    )
    return [_serialize_resource(record) for record in records]


@router.post(
    "/requests",
    response_model=SensitiveAccessRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_sensitive_access_request(
    payload: SensitiveAccessRequestCreateRequest,
    db: Session = Depends(get_db),
) -> SensitiveAccessRequestResponse:
    try:
        bundle = service.request_access(
            db,
            run_id=payload.run_id,
            node_run_id=payload.node_run_id,
            requester_type=payload.requester_type,
            requester_id=payload.requester_id,
            resource_id=payload.resource_id,
            action_type=payload.action_type,
            purpose_text=payload.purpose_text,
            notification_channel=payload.notification_channel,
            notification_target=payload.notification_target,
        )
    except SensitiveAccessControlError as exc:
        _raise_sensitive_access_error(exc)
    db.commit()
    return _serialize_access_bundle(bundle)


@router.get("/requests", response_model=list[SensitiveAccessRequestItem])
def list_sensitive_access_requests(
    decision: str | None = Query(default=None),
    requester_type: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[SensitiveAccessRequestItem]:
    records = service.list_access_requests(
        db,
        decision=decision,
        requester_type=requester_type,
        run_id=run_id,
    )
    return [_serialize_access_request(record) for record in records]


@router.get("/approval-tickets", response_model=list[ApprovalTicketItem])
def list_approval_tickets(
    status: str | None = Query(default=None),
    waiting_status: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ApprovalTicketItem]:
    records = service.list_approval_tickets(
        db,
        status=status,
        waiting_status=waiting_status,
        run_id=run_id,
    )
    return [_serialize_approval_ticket(record) for record in records]


@router.post(
    "/approval-tickets/{ticket_id}/decision",
    response_model=ApprovalTicketDecisionResponse,
)
def decide_approval_ticket(
    ticket_id: str,
    payload: ApprovalTicketDecisionRequest,
    db: Session = Depends(get_db),
) -> ApprovalTicketDecisionResponse:
    try:
        bundle = service.decide_ticket(
            db,
            ticket_id=ticket_id,
            status=payload.status,
            approved_by=payload.approved_by,
        )
    except SensitiveAccessControlError as exc:
        _raise_sensitive_access_error(exc)
    db.commit()
    return _serialize_approval_bundle(bundle)


@router.get("/notification-dispatches", response_model=list[NotificationDispatchItem])
def list_notification_dispatches(
    approval_ticket_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[NotificationDispatchItem]:
    records = service.list_notification_dispatches(
        db,
        approval_ticket_id=approval_ticket_id,
        status=status,
    )
    return [_serialize_notification(record) for record in records]


@router.post(
    "/notification-dispatches/{dispatch_id}/retry",
    response_model=NotificationDispatchRetryResponse,
)
def retry_notification_dispatch(
    dispatch_id: str,
    db: Session = Depends(get_db),
) -> NotificationDispatchRetryResponse:
    try:
        bundle = service.retry_notification_dispatch(
            db,
            dispatch_id=dispatch_id,
        )
    except SensitiveAccessControlError as exc:
        _raise_sensitive_access_error(exc)
    db.commit()
    return _serialize_notification_retry_bundle(bundle)
