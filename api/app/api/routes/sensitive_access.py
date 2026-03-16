from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.sensitive_access import (
    ApprovalTicketBulkDecisionRequest,
    ApprovalTicketBulkDecisionResult,
    ApprovalTicketBulkSkippedItem,
    ApprovalTicketBulkSkippedSummary,
    ApprovalTicketDecisionRequest,
    ApprovalTicketDecisionResponse,
    ApprovalTicketItem,
    NotificationChannelCapabilityItem,
    NotificationChannelConfigFactItem,
    NotificationDispatchBulkRetriedItem,
    NotificationDispatchBulkRetryRequest,
    NotificationDispatchBulkRetryResult,
    NotificationDispatchBulkSkippedItem,
    NotificationDispatchBulkSkippedSummary,
    NotificationChannelDispatchSummaryItem,
    NotificationDispatchItem,
    NotificationDispatchRetryResponse,
    SensitiveAccessRequestCreateRequest,
    SensitiveAccessRequestItem,
    SensitiveAccessRequestResponse,
    SensitiveResourceCreateRequest,
    SensitiveResourceItem,
)
from app.services.notification_channel_diagnostics import (
    list_notification_channel_diagnostics,
)
from app.services.sensitive_access_control import (
    ApprovalDecisionBundle,
    NotificationDispatchRetryBundle,
    SensitiveAccessControlError,
    SensitiveAccessControlService,
    SensitiveAccessRequestBundle,
)
from app.services.sensitive_access_presenters import (
    serialize_approval_ticket,
    serialize_notification_dispatch,
    serialize_sensitive_access_request,
    serialize_sensitive_access_timeline_entry,
    serialize_sensitive_resource,
)

router = APIRouter(prefix="/sensitive-access", tags=["sensitive-access"])
service = SensitiveAccessControlService()


def _serialize_access_bundle(
    bundle: SensitiveAccessRequestBundle,
) -> SensitiveAccessRequestResponse:
    timeline_entry = serialize_sensitive_access_timeline_entry(bundle)
    return SensitiveAccessRequestResponse(
        request=timeline_entry.request,
        resource=timeline_entry.resource,
        approval_ticket=timeline_entry.approval_ticket,
        notifications=timeline_entry.notifications,
    )


def _serialize_approval_bundle(bundle: ApprovalDecisionBundle) -> ApprovalTicketDecisionResponse:
    return ApprovalTicketDecisionResponse(
        request=serialize_sensitive_access_request(bundle.access_request),
        approval_ticket=serialize_approval_ticket(bundle.approval_ticket),
        notifications=[
            serialize_notification_dispatch(item) for item in bundle.notifications
        ],
    )


def _serialize_notification_retry_bundle(
    bundle: NotificationDispatchRetryBundle,
) -> NotificationDispatchRetryResponse:
    return NotificationDispatchRetryResponse(
        approval_ticket=serialize_approval_ticket(bundle.approval_ticket),
        notification=serialize_notification_dispatch(bundle.notification),
    )


def _raise_sensitive_access_error(exc: SensitiveAccessControlError) -> None:
    detail = str(exc)
    status_code = (
        status.HTTP_404_NOT_FOUND
        if "not found" in detail.lower()
        else status.HTTP_422_UNPROCESSABLE_ENTITY
    )
    raise HTTPException(status_code=status_code, detail=detail) from exc


def _classify_approval_ticket_bulk_skip(detail: str) -> str:
    lowered = detail.lower()
    if "not found" in lowered:
        return "not_found"
    if "pending" in lowered:
        return "not_pending"
    return "invalid_state"


def _classify_notification_dispatch_bulk_skip(detail: str) -> str:
    lowered = detail.lower()
    if "not found" in lowered:
        return "not_found"
    if "latest" in lowered:
        return "not_latest"
    if "delivered" in lowered:
        return "already_delivered"
    if "waiting approval tickets" in lowered:
        return "not_waiting"
    return "invalid_state"


def _summarize_approval_ticket_bulk_skips(
    skipped_items: list[ApprovalTicketBulkSkippedItem],
) -> list[ApprovalTicketBulkSkippedSummary]:
    summary_by_reason: dict[str, ApprovalTicketBulkSkippedSummary] = {}
    for item in skipped_items:
        if item.reason not in summary_by_reason:
            summary_by_reason[item.reason] = ApprovalTicketBulkSkippedSummary(
                reason=item.reason,
                count=0,
                detail=item.detail,
            )
        summary_by_reason[item.reason].count += 1
    return list(summary_by_reason.values())


def _summarize_notification_dispatch_bulk_skips(
    skipped_items: list[NotificationDispatchBulkSkippedItem],
) -> list[NotificationDispatchBulkSkippedSummary]:
    summary_by_reason: dict[str, NotificationDispatchBulkSkippedSummary] = {}
    for item in skipped_items:
        if item.reason not in summary_by_reason:
            summary_by_reason[item.reason] = NotificationDispatchBulkSkippedSummary(
                reason=item.reason,
                count=0,
                detail=item.detail,
            )
        summary_by_reason[item.reason].count += 1
    return list(summary_by_reason.values())


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
    return serialize_sensitive_resource(record)


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
    return [serialize_sensitive_resource(record) for record in records]


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
    node_run_id: str | None = Query(default=None),
    access_request_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[SensitiveAccessRequestItem]:
    records = service.list_access_requests(
        db,
        decision=decision,
        requester_type=requester_type,
        run_id=run_id,
        node_run_id=node_run_id,
        access_request_id=access_request_id,
    )
    return [serialize_sensitive_access_request(record) for record in records]


@router.get("/approval-tickets", response_model=list[ApprovalTicketItem])
def list_approval_tickets(
    status: str | None = Query(default=None),
    waiting_status: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    node_run_id: str | None = Query(default=None),
    access_request_id: str | None = Query(default=None),
    approval_ticket_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ApprovalTicketItem]:
    records = service.list_approval_tickets(
        db,
        status=status,
        waiting_status=waiting_status,
        run_id=run_id,
        node_run_id=node_run_id,
        access_request_id=access_request_id,
        approval_ticket_id=approval_ticket_id,
    )
    return [serialize_approval_ticket(record) for record in records]


@router.get(
    "/notification-channels",
    response_model=list[NotificationChannelCapabilityItem],
)
def list_notification_channels(
    db: Session = Depends(get_db),
) -> list[NotificationChannelCapabilityItem]:
    return [
        NotificationChannelCapabilityItem(
            channel=item.capability.channel,
            delivery_mode=item.capability.delivery_mode,
            target_kind=item.capability.target_kind,
            configured=item.capability.configured,
            health_status=item.capability.health_status,
            summary=item.capability.summary,
            target_hint=item.capability.target_hint,
            target_example=item.capability.target_example,
            health_reason=item.health_reason,
            config_facts=[
                NotificationChannelConfigFactItem(
                    key=fact.key,
                    label=fact.label,
                    status=fact.status,
                    value=fact.value,
                )
                for fact in item.config_facts
            ],
            dispatch_summary=NotificationChannelDispatchSummaryItem(
                pending_count=item.dispatch_summary.pending_count,
                delivered_count=item.dispatch_summary.delivered_count,
                failed_count=item.dispatch_summary.failed_count,
                latest_dispatch_at=item.dispatch_summary.latest_dispatch_at,
                latest_delivered_at=item.dispatch_summary.latest_delivered_at,
                latest_failure_at=item.dispatch_summary.latest_failure_at,
                latest_failure_error=item.dispatch_summary.latest_failure_error,
                latest_failure_target=item.dispatch_summary.latest_failure_target,
            ),
        )
        for item in list_notification_channel_diagnostics(db)
    ]


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


@router.post(
    "/approval-tickets/bulk-decision",
    response_model=ApprovalTicketBulkDecisionResult,
)
def bulk_decide_approval_tickets(
    payload: ApprovalTicketBulkDecisionRequest,
    db: Session = Depends(get_db),
) -> ApprovalTicketBulkDecisionResult:
    decided_items: list[ApprovalTicketItem] = []
    skipped_items: list[ApprovalTicketBulkSkippedItem] = []

    for ticket_id in payload.ticket_ids:
        try:
            bundle = service.decide_ticket(
                db,
                ticket_id=ticket_id,
                status=payload.status,
                approved_by=payload.approved_by,
            )
        except SensitiveAccessControlError as exc:
            detail = str(exc)
            skipped_items.append(
                ApprovalTicketBulkSkippedItem(
                    ticket_id=ticket_id,
                    reason=_classify_approval_ticket_bulk_skip(detail),
                    detail=detail,
                )
            )
            continue

        decided_items.append(serialize_approval_ticket(bundle.approval_ticket))

    db.commit()
    return ApprovalTicketBulkDecisionResult(
        status=payload.status,
        requested_count=len(payload.ticket_ids),
        decided_count=len(decided_items),
        skipped_count=len(skipped_items),
        decided_items=decided_items,
        skipped_items=skipped_items,
        skipped_reason_summary=_summarize_approval_ticket_bulk_skips(skipped_items),
    )


@router.get("/notification-dispatches", response_model=list[NotificationDispatchItem])
def list_notification_dispatches(
    approval_ticket_id: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    node_run_id: str | None = Query(default=None),
    access_request_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[NotificationDispatchItem]:
    records = service.list_notification_dispatches(
        db,
        approval_ticket_id=approval_ticket_id,
        run_id=run_id,
        node_run_id=node_run_id,
        access_request_id=access_request_id,
        status=status,
    )
    return [serialize_notification_dispatch(record) for record in records]


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


@router.post(
    "/notification-dispatches/bulk-retry",
    response_model=NotificationDispatchBulkRetryResult,
)
def bulk_retry_notification_dispatches(
    payload: NotificationDispatchBulkRetryRequest,
    db: Session = Depends(get_db),
) -> NotificationDispatchBulkRetryResult:
    retried_items: list[NotificationDispatchBulkRetriedItem] = []
    skipped_items: list[NotificationDispatchBulkSkippedItem] = []

    for dispatch_id in payload.dispatch_ids:
        try:
            bundle = service.retry_notification_dispatch(
                db,
                dispatch_id=dispatch_id,
            )
        except SensitiveAccessControlError as exc:
            detail = str(exc)
            skipped_items.append(
                NotificationDispatchBulkSkippedItem(
                    dispatch_id=dispatch_id,
                    reason=_classify_notification_dispatch_bulk_skip(detail),
                    detail=detail,
                )
            )
            continue

        retried_items.append(
            NotificationDispatchBulkRetriedItem(
                approval_ticket=serialize_approval_ticket(bundle.approval_ticket),
                notification=serialize_notification_dispatch(bundle.notification),
            )
        )

    db.commit()
    return NotificationDispatchBulkRetryResult(
        requested_count=len(payload.dispatch_ids),
        retried_count=len(retried_items),
        skipped_count=len(skipped_items),
        retried_items=retried_items,
        skipped_items=skipped_items,
        skipped_reason_summary=_summarize_notification_dispatch_bulk_skips(
            skipped_items
        ),
    )
