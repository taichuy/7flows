from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.routes.auth import require_console_route_access
from app.core.database import get_db
from app.models.sensitive_access import ApprovalTicketRecord, NotificationDispatchRecord
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
    NotificationChannelDispatchSummaryItem,
    NotificationDispatchBulkRetriedItem,
    NotificationDispatchBulkRetryRequest,
    NotificationDispatchBulkRetryResult,
    NotificationDispatchBulkSkippedItem,
    NotificationDispatchBulkSkippedSummary,
    NotificationDispatchItem,
    NotificationDispatchRetryRequest,
    NotificationDispatchRetryResponse,
    SensitiveAccessInboxBlockerSummary,
    SensitiveAccessInboxEntryItem,
    SensitiveAccessInboxResponse,
    SensitiveAccessInboxSummary,
    SensitiveAccessRequestCreateRequest,
    SensitiveAccessRequestItem,
    SensitiveAccessRequestResponse,
    SensitiveResourceCreateRequest,
    SensitiveResourceItem,
)
from app.schemas.workflow_legacy_auth_governance import (
    WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
)
from app.services.callback_blocker_deltas import (
    CallbackBlockerScopedSnapshot,
    build_bulk_callback_blocker_delta_summary,
    build_callback_blocker_delta_summary,
    capture_callback_blocker_snapshot,
)
from app.services.notification_channel_diagnostics import (
    list_notification_channel_diagnostics,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    build_operator_run_follow_up_summary_map,
    load_operator_run_snapshot,
    resolve_operator_run_snapshot_from_follow_up,
)
from app.services.sensitive_access_action_explanations import (
    build_approval_decision_outcome_explanation,
    build_bulk_approval_decision_outcome_explanation,
    build_bulk_notification_retry_outcome_explanation,
    build_notification_retry_outcome_explanation,
)
from app.services.sensitive_access_control import (
    ApprovalDecisionBundle,
    NotificationDispatchRetryBundle,
    SensitiveAccessControlError,
    SensitiveAccessControlService,
    SensitiveAccessRequestBundle,
    SensitiveAccessTicketExpiredError,
)
from app.services.sensitive_access_presenters import (
    serialize_approval_ticket,
    serialize_notification_dispatch,
    serialize_sensitive_access_request,
    serialize_sensitive_access_timeline_entry,
    serialize_sensitive_resource,
)
from app.services.sensitive_access_run_resolution import (
    collect_sensitive_access_run_ids,
    load_run_ids_by_node_run_id,
    resolve_sensitive_access_run_id,
)
from app.services.workflow_publish import WorkflowPublishBindingService

router = APIRouter(prefix="/sensitive-access", tags=["sensitive-access"])
service = SensitiveAccessControlService()
workflow_publish_service = WorkflowPublishBindingService()
LEGACY_AUTH_CHECKLIST_ORDER = (
    "draft_cleanup",
    "published_follow_up",
    "offline_inventory",
)


def _resolve_single_run_follow_up(
    db: Session,
    *,
    run_id: str | None,
    node_run_id: str | None = None,
):
    run_ids_by_node_run_id = load_run_ids_by_node_run_id(db, [node_run_id])
    resolved_run_id = resolve_sensitive_access_run_id(
        run_id=run_id,
        node_run_id=node_run_id,
        run_ids_by_node_run_id=run_ids_by_node_run_id,
    )
    run_follow_up = build_operator_run_follow_up_summary(db, [resolved_run_id])
    run_snapshot = resolve_operator_run_snapshot_from_follow_up(
        run_follow_up,
        run_id=resolved_run_id,
    )
    if run_snapshot is None:
        run_snapshot = load_operator_run_snapshot(db, resolved_run_id)
    return run_follow_up, run_snapshot


def _serialize_access_bundle(
    bundle: SensitiveAccessRequestBundle,
    *,
    db: Session,
) -> SensitiveAccessRequestResponse:
    run_follow_up = None
    run_snapshot = None
    legacy_auth_governance = None
    run_id = resolve_sensitive_access_run_id(
        run_id=bundle.access_request.run_id,
        node_run_id=bundle.access_request.node_run_id,
        run_ids_by_node_run_id=load_run_ids_by_node_run_id(db, [bundle.access_request.node_run_id]),
    )
    if run_id:
        run_follow_up, run_snapshot = _resolve_single_run_follow_up(
            db,
            run_id=run_id,
            node_run_id=bundle.access_request.node_run_id,
        )
        legacy_auth_governance = _build_sensitive_access_legacy_auth_governance_snapshot(
            db,
            workflow_ids=[run_snapshot.workflow_id if run_snapshot is not None else None],
        )
    timeline_entry = serialize_sensitive_access_timeline_entry(
        bundle,
        run_snapshot=run_snapshot,
        run_follow_up=run_follow_up,
        legacy_auth_governance=legacy_auth_governance,
    )
    return SensitiveAccessRequestResponse(**timeline_entry.model_dump())


def _serialize_approval_bundle(
    bundle: ApprovalDecisionBundle,
    *,
    db: Session,
    callback_blocker_delta=None,
) -> ApprovalTicketDecisionResponse:
    run_follow_up, run_snapshot = _resolve_single_run_follow_up(
        db,
        run_id=bundle.approval_ticket.run_id,
        node_run_id=bundle.approval_ticket.node_run_id,
    )
    legacy_auth_governance = _build_sensitive_access_legacy_auth_governance_snapshot(
        db,
        workflow_ids=[run_snapshot.workflow_id if run_snapshot is not None else None],
    )
    return ApprovalTicketDecisionResponse(
        request=serialize_sensitive_access_request(bundle.access_request),
        approval_ticket=serialize_approval_ticket(bundle.approval_ticket),
        notifications=[serialize_notification_dispatch(item) for item in bundle.notifications],
        outcome_explanation=build_approval_decision_outcome_explanation(bundle),
        callback_blocker_delta=callback_blocker_delta,
        run_snapshot=run_snapshot,
        run_follow_up=run_follow_up,
        legacy_auth_governance=legacy_auth_governance,
    )


def _serialize_notification_retry_bundle(
    bundle: NotificationDispatchRetryBundle,
    *,
    db: Session,
    callback_blocker_delta=None,
) -> NotificationDispatchRetryResponse:
    run_follow_up, run_snapshot = _resolve_single_run_follow_up(
        db,
        run_id=bundle.approval_ticket.run_id,
        node_run_id=bundle.approval_ticket.node_run_id,
    )
    legacy_auth_governance = _build_sensitive_access_legacy_auth_governance_snapshot(
        db,
        workflow_ids=[run_snapshot.workflow_id if run_snapshot is not None else None],
    )
    return NotificationDispatchRetryResponse(
        approval_ticket=serialize_approval_ticket(bundle.approval_ticket),
        notification=serialize_notification_dispatch(bundle.notification),
        outcome_explanation=build_notification_retry_outcome_explanation(bundle),
        callback_blocker_delta=callback_blocker_delta,
        run_snapshot=run_snapshot,
        run_follow_up=run_follow_up,
        legacy_auth_governance=legacy_auth_governance,
    )


def _raise_sensitive_access_error(exc: SensitiveAccessControlError) -> None:
    detail = str(exc)
    status_code = (
        status.HTTP_404_NOT_FOUND
        if "not found" in detail.lower()
        else status.HTTP_422_UNPROCESSABLE_CONTENT
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
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/resources", method="POST")
    ),
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
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/resources", method="GET")
    ),
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
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/requests", method="POST")
    ),
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
            notification_target=payload.notification_target or "",
        )
    except SensitiveAccessControlError as exc:
        _raise_sensitive_access_error(exc)
    db.commit()
    return _serialize_access_bundle(bundle, db=db)


def _serialize_notification_channels(
    db: Session,
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


def _build_sensitive_access_inbox_summary(
    entries: list[SensitiveAccessInboxEntryItem],
    *,
    entry_run_ids: dict[str, str] | None = None,
) -> SensitiveAccessInboxSummary:
    entry_run_id_lookup = entry_run_ids or {}
    notifications = [item for entry in entries for item in entry.notifications]

    def resolve_entry_run_id(entry: SensitiveAccessInboxEntryItem) -> str | None:
        for candidate in (
            entry_run_id_lookup.get(entry.ticket.id),
            entry.ticket.run_id,
            entry.request.run_id if entry.request is not None else None,
        ):
            normalized = str(candidate or "").strip()
            if normalized:
                return normalized
        return None

    def resolve_entry_workflow_id(entry: SensitiveAccessInboxEntryItem) -> str | None:
        normalized = str(
            entry.run_snapshot.workflow_id if entry.run_snapshot is not None else ""
        ).strip()
        return normalized or None

    def collect_impacted_scope(
        scoped_entries: list[SensitiveAccessInboxEntryItem],
    ) -> tuple[set[str], set[str]]:
        run_ids: set[str] = set()
        workflow_ids: set[str] = set()
        for entry in scoped_entries:
            run_id = resolve_entry_run_id(entry)
            if run_id is not None:
                run_ids.add(run_id)
            workflow_id = resolve_entry_workflow_id(entry)
            if workflow_id is not None:
                workflow_ids.add(workflow_id)
        return run_ids, workflow_ids

    def has_pending_waiting_approval(entry: SensitiveAccessInboxEntryItem) -> bool:
        return entry.ticket.status == "pending" and entry.ticket.waiting_status == "waiting"

    def count_failed_notifications(entry: SensitiveAccessInboxEntryItem) -> int:
        return sum(1 for item in entry.notifications if item.status == "failed")

    def has_retriable_notification(entry: SensitiveAccessInboxEntryItem) -> bool:
        return any(item.status != "delivered" for item in entry.notifications)

    def resolve_activity_at(entry: SensitiveAccessInboxEntryItem):
        timestamps = [entry.ticket.created_at]
        if entry.request is not None:
            timestamps.append(entry.request.created_at)
        timestamps.extend(
            item.created_at for item in entry.notifications if item.created_at is not None
        )
        return max(timestamps)

    primary_entry = max(
        (entry for entry in entries if entry.resource is not None),
        key=lambda entry: (
            1 if has_pending_waiting_approval(entry) else 0,
            count_failed_notifications(entry),
            1 if has_retriable_notification(entry) else 0,
            resolve_activity_at(entry),
        ),
        default=None,
    )

    affected_run_ids, affected_workflow_ids = collect_impacted_scope(entries)
    blocker_specs = (
        (
            "pending_approval",
            "blocked",
            lambda entry: entry.ticket.status == "pending",
            lambda entry: 1 if entry.ticket.status == "pending" else 0,
        ),
        (
            "waiting_resume",
            "blocked",
            lambda entry: entry.ticket.waiting_status == "waiting",
            lambda entry: 1 if entry.ticket.waiting_status == "waiting" else 0,
        ),
        (
            "failed_notification",
            "blocked",
            lambda entry: any(item.status == "failed" for item in entry.notifications),
            lambda entry: sum(1 for item in entry.notifications if item.status == "failed"),
        ),
        (
            "pending_notification",
            "degraded",
            lambda entry: any(item.status == "pending" for item in entry.notifications),
            lambda entry: sum(1 for item in entry.notifications if item.status == "pending"),
        ),
    )
    blockers: list[SensitiveAccessInboxBlockerSummary] = []
    for kind, tone, entry_matcher, item_counter in blocker_specs:
        item_count = sum(item_counter(entry) for entry in entries)
        if item_count <= 0:
            continue
        matched_entries = [entry for entry in entries if entry_matcher(entry)]
        blocker_run_ids, blocker_workflow_ids = collect_impacted_scope(matched_entries)
        blockers.append(
            SensitiveAccessInboxBlockerSummary(
                kind=kind,
                tone=tone,
                item_count=item_count,
                affected_run_count=len(blocker_run_ids),
                affected_workflow_count=len(blocker_workflow_ids),
            )
        )

    return SensitiveAccessInboxSummary(
        ticket_count=len(entries),
        pending_ticket_count=sum(1 for entry in entries if entry.ticket.status == "pending"),
        approved_ticket_count=sum(1 for entry in entries if entry.ticket.status == "approved"),
        rejected_ticket_count=sum(1 for entry in entries if entry.ticket.status == "rejected"),
        expired_ticket_count=sum(1 for entry in entries if entry.ticket.status == "expired"),
        waiting_ticket_count=sum(
            1 for entry in entries if entry.ticket.waiting_status == "waiting"
        ),
        resumed_ticket_count=sum(
            1 for entry in entries if entry.ticket.waiting_status == "resumed"
        ),
        failed_ticket_count=sum(1 for entry in entries if entry.ticket.waiting_status == "failed"),
        pending_notification_count=sum(1 for item in notifications if item.status == "pending"),
        delivered_notification_count=sum(1 for item in notifications if item.status == "delivered"),
        failed_notification_count=sum(1 for item in notifications if item.status == "failed"),
        affected_run_count=len(affected_run_ids),
        affected_workflow_count=len(affected_workflow_ids),
        primary_resource=primary_entry.resource if primary_entry is not None else None,
        primary_blocker_kind=blockers[0].kind if blockers else None,
        blockers=blockers,
    )


def _resolve_inbox_entry_run_id(
    db: Session,
    entry: SensitiveAccessInboxEntryItem,
) -> str | None:
    return resolve_sensitive_access_run_id(
        run_id=entry.ticket.run_id or (entry.request.run_id if entry.request else None),
        node_run_id=entry.ticket.node_run_id
        or (entry.request.node_run_id if entry.request else None),
        run_ids_by_node_run_id=load_run_ids_by_node_run_id(
            db, [entry.ticket.node_run_id or (entry.request.node_run_id if entry.request else None)]
        ),
    )


def _resolve_inbox_run_ids(
    db: Session,
    entries: list[SensitiveAccessInboxEntryItem],
) -> list[str]:
    return collect_sensitive_access_run_ids(
        db,
        scopes=[
            (
                entry.ticket.run_id or (entry.request.run_id if entry.request else None),
                entry.ticket.node_run_id or (entry.request.node_run_id if entry.request else None),
            )
            for entry in entries
        ],
    )


def _load_inbox_entry_legacy_auth_governance(
    db: Session,
    *,
    workflow_id: str | None,
    snapshot_cache: dict[str, object | None],
):
    if not workflow_id:
        return None

    if workflow_id not in snapshot_cache:
        snapshot = workflow_publish_service.build_legacy_auth_governance_snapshot(
            db,
            workflow_id=workflow_id,
        )
        snapshot_cache[workflow_id] = snapshot if snapshot.binding_count > 0 else None

    return snapshot_cache[workflow_id]


def _resolve_legacy_auth_workflow_ids_for_run_ids(
    db: Session,
    *,
    run_ids: list[str],
) -> list[str]:
    resolved_workflow_ids: list[str] = []
    seen_workflow_ids: set[str] = set()
    for run_id in run_ids:
        normalized_run_id = str(run_id or "").strip()
        if not normalized_run_id:
            continue
        run_snapshot = load_operator_run_snapshot(db, normalized_run_id)
        workflow_id = str(run_snapshot.workflow_id if run_snapshot is not None else "").strip()
        if workflow_id and workflow_id not in seen_workflow_ids:
            seen_workflow_ids.add(workflow_id)
            resolved_workflow_ids.append(workflow_id)
    return resolved_workflow_ids


def _build_sensitive_access_legacy_auth_governance_snapshot(
    db: Session,
    *,
    workflow_ids: list[str | None],
    snapshot_cache: dict[str, object | None] | None = None,
) -> WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | None:
    cache = snapshot_cache if snapshot_cache is not None else {}
    normalized_workflow_ids: list[str] = []
    seen_workflow_ids: set[str] = set()
    for workflow_id in workflow_ids:
        normalized = str(workflow_id or "").strip()
        if normalized and normalized not in seen_workflow_ids:
            seen_workflow_ids.add(normalized)
            normalized_workflow_ids.append(normalized)

    snapshots = [
        snapshot
        for workflow_id in normalized_workflow_ids
        for snapshot in [
            _load_inbox_entry_legacy_auth_governance(
                db,
                workflow_id=workflow_id,
                snapshot_cache=cache,
            )
        ]
        if snapshot is not None
    ]
    if not snapshots:
        return None

    checklist_by_key = {}
    workflows = []
    draft_candidates = []
    published_blockers = []
    offline_inventory = []
    binding_count = 0
    draft_candidate_count = 0
    published_blocker_count = 0
    offline_inventory_count = 0
    generated_at = snapshots[0].generated_at

    for snapshot in snapshots:
        binding_count += snapshot.binding_count
        draft_candidate_count += snapshot.summary.draft_candidate_count
        published_blocker_count += snapshot.summary.published_blocker_count
        offline_inventory_count += snapshot.summary.offline_inventory_count
        workflows.extend(workflow.model_copy(deep=True) for workflow in snapshot.workflows)
        draft_candidates.extend(
            item.model_copy(deep=True) for item in snapshot.buckets.draft_candidates
        )
        published_blockers.extend(
            item.model_copy(deep=True) for item in snapshot.buckets.published_blockers
        )
        offline_inventory.extend(
            item.model_copy(deep=True) for item in snapshot.buckets.offline_inventory
        )
        if snapshot.generated_at > generated_at:
            generated_at = snapshot.generated_at

        for item in snapshot.checklist:
            existing = checklist_by_key.get(item.key)
            if existing is None:
                checklist_by_key[item.key] = item.model_copy(deep=True)
                continue
            checklist_by_key[item.key] = existing.model_copy(
                update={"count": existing.count + item.count}
            )

    workflows.sort(key=lambda item: item.workflow_name)
    return WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot(
        generated_at=generated_at,
        workflow_count=len(workflows),
        binding_count=binding_count,
        summary={
            "draft_candidate_count": draft_candidate_count,
            "published_blocker_count": published_blocker_count,
            "offline_inventory_count": offline_inventory_count,
        },
        checklist=[
            checklist_by_key[key] for key in LEGACY_AUTH_CHECKLIST_ORDER if key in checklist_by_key
        ],
        workflows=workflows,
        buckets={
            "draft_candidates": draft_candidates,
            "published_blockers": published_blockers,
            "offline_inventory": offline_inventory,
        },
    )


@router.get("/inbox", response_model=SensitiveAccessInboxResponse)
def get_sensitive_access_inbox(
    status: str | None = Query(default=None),
    waiting_status: str | None = Query(default=None),
    decision: str | None = Query(default=None),
    requester_type: str | None = Query(default=None),
    notification_status: str | None = Query(default=None),
    notification_channel: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    node_run_id: str | None = Query(default=None),
    access_request_id: str | None = Query(default=None),
    approval_ticket_id: str | None = Query(default=None),
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/inbox", method="GET")
    ),
    db: Session = Depends(get_db),
) -> SensitiveAccessInboxResponse:
    resources = [serialize_sensitive_resource(record) for record in service.list_resources(db)]
    requests = [
        serialize_sensitive_access_request(record)
        for record in service.list_access_requests(
            db,
            decision=decision,
            requester_type=requester_type,
            run_id=run_id,
            node_run_id=node_run_id,
            access_request_id=access_request_id,
        )
    ]
    tickets = [
        serialize_approval_ticket(record)
        for record in service.list_approval_tickets(
            db,
            status=status,
            waiting_status=waiting_status,
            run_id=run_id,
            node_run_id=node_run_id,
            access_request_id=access_request_id,
            approval_ticket_id=approval_ticket_id,
        )
    ]
    notifications = [
        serialize_notification_dispatch(record)
        for record in service.list_notification_dispatches(
            db,
            approval_ticket_id=approval_ticket_id,
            run_id=run_id,
            node_run_id=node_run_id,
            access_request_id=access_request_id,
            status=notification_status,
            channel=notification_channel,
        )
    ]
    channels = _serialize_notification_channels(db)

    requests_by_id = {item.id: item for item in requests}
    resources_by_id = {item.id: item for item in resources}
    notifications_by_ticket_id: dict[str, list[NotificationDispatchItem]] = defaultdict(list)
    for item in notifications:
        notifications_by_ticket_id[item.approval_ticket_id].append(item)

    entries: list[SensitiveAccessInboxEntryItem] = []
    entry_run_ids: dict[str, str] = {}
    for ticket in tickets:
        request = requests_by_id.get(ticket.access_request_id)
        if (decision or requester_type) and request is None:
            continue

        ticket_notifications = notifications_by_ticket_id.get(ticket.id, [])
        if (notification_status or notification_channel) and not ticket_notifications:
            continue

        entry = SensitiveAccessInboxEntryItem(
            ticket=ticket,
            request=request,
            resource=(resources_by_id.get(request.resource_id) if request is not None else None),
            notifications=ticket_notifications,
        )
        entries.append(entry)
        resolved_run_id = _resolve_inbox_entry_run_id(db, entry)
        if resolved_run_id:
            entry_run_ids[entry.ticket.id] = resolved_run_id

    entries.sort(key=lambda item: item.ticket.created_at, reverse=True)

    run_follow_up_by_run_id = build_operator_run_follow_up_summary_map(
        db,
        _resolve_inbox_run_ids(db, entries),
        sample_limit=1,
    )
    hydrated_entries: list[SensitiveAccessInboxEntryItem] = []
    legacy_auth_snapshot_by_workflow_id: dict[str, object | None] = {}
    for entry in entries:
        resolved_run_id = entry_run_ids.get(entry.ticket.id)
        run_follow_up = run_follow_up_by_run_id.get(resolved_run_id) if resolved_run_id else None
        run_snapshot = resolve_operator_run_snapshot_from_follow_up(
            run_follow_up,
            run_id=resolved_run_id,
        )
        legacy_auth_governance = _load_inbox_entry_legacy_auth_governance(
            db,
            workflow_id=(run_snapshot.workflow_id if run_snapshot is not None else None),
            snapshot_cache=legacy_auth_snapshot_by_workflow_id,
        )
        hydrated_entries.append(
            entry.model_copy(
                update={
                    "run_snapshot": run_snapshot,
                    "run_follow_up": run_follow_up,
                    "legacy_auth_governance": legacy_auth_governance,
                }
            )
        )

    return SensitiveAccessInboxResponse(
        entries=hydrated_entries,
        channels=channels,
        resources=resources,
        requests=requests,
        notifications=notifications,
        execution_views=[],
        summary=_build_sensitive_access_inbox_summary(
            hydrated_entries,
            entry_run_ids=entry_run_ids,
        ),
    )


@router.get("/requests", response_model=list[SensitiveAccessRequestItem])
def list_sensitive_access_requests(
    decision: str | None = Query(default=None),
    requester_type: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    node_run_id: str | None = Query(default=None),
    access_request_id: str | None = Query(default=None),
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/requests", method="GET")
    ),
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
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/approval-tickets", method="GET")
    ),
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
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/notification-channels", method="GET")
    ),
    db: Session = Depends(get_db),
) -> list[NotificationChannelCapabilityItem]:
    return _serialize_notification_channels(db)


@router.post(
    "/approval-tickets/{ticket_id}/decision",
    response_model=ApprovalTicketDecisionResponse,
)
def decide_approval_ticket(
    ticket_id: str,
    payload: ApprovalTicketDecisionRequest,
    _access_context=Depends(
        require_console_route_access(
            "/api/sensitive-access/approval-tickets/{ticket_id}/decision", method="POST"
        )
    ),
    db: Session = Depends(get_db),
) -> ApprovalTicketDecisionResponse:
    approval_ticket = db.get(ApprovalTicketRecord, ticket_id)
    approval_ticket_run_id = resolve_sensitive_access_run_id(
        run_id=approval_ticket.run_id if approval_ticket is not None else None,
        node_run_id=approval_ticket.node_run_id if approval_ticket is not None else None,
        run_ids_by_node_run_id=load_run_ids_by_node_run_id(
            db, [approval_ticket.node_run_id if approval_ticket is not None else None]
        ),
    )
    before_blocker = capture_callback_blocker_snapshot(
        db,
        run_id=approval_ticket_run_id,
        node_run_id=approval_ticket.node_run_id if approval_ticket is not None else None,
    )
    try:
        bundle = service.decide_ticket(
            db,
            ticket_id=ticket_id,
            status=payload.status,
            approved_by=payload.approved_by,
        )
    except SensitiveAccessTicketExpiredError as exc:
        db.commit()
        _raise_sensitive_access_error(exc)
    except SensitiveAccessControlError as exc:
        _raise_sensitive_access_error(exc)
    db.commit()
    after_run_id = resolve_sensitive_access_run_id(
        run_id=bundle.approval_ticket.run_id,
        node_run_id=bundle.approval_ticket.node_run_id,
        run_ids_by_node_run_id=load_run_ids_by_node_run_id(
            db, [bundle.approval_ticket.node_run_id]
        ),
    )
    after_blocker = capture_callback_blocker_snapshot(
        db,
        run_id=after_run_id,
        node_run_id=bundle.approval_ticket.node_run_id,
    )
    return _serialize_approval_bundle(
        bundle,
        db=db,
        callback_blocker_delta=build_callback_blocker_delta_summary(
            before=before_blocker,
            after=after_blocker,
        ),
    )


@router.post(
    "/approval-tickets/bulk-decision",
    response_model=ApprovalTicketBulkDecisionResult,
)
def bulk_decide_approval_tickets(
    payload: ApprovalTicketBulkDecisionRequest,
    _access_context=Depends(
        require_console_route_access(
            "/api/sensitive-access/approval-tickets/bulk-decision", method="POST"
        )
    ),
    db: Session = Depends(get_db),
) -> ApprovalTicketBulkDecisionResult:
    decided_items: list[ApprovalTicketItem] = []
    skipped_items: list[ApprovalTicketBulkSkippedItem] = []
    before_blockers_by_scope: dict[tuple[str, str | None], CallbackBlockerScopedSnapshot] = {}
    run_ids_by_node_run_id: dict[str, str] = {}

    for ticket_id in payload.ticket_ids:
        approval_ticket = db.get(ApprovalTicketRecord, ticket_id)
        run_ids_by_node_run_id.update(
            load_run_ids_by_node_run_id(
                db, [approval_ticket.node_run_id if approval_ticket is not None else None]
            )
        )
        resolved_run_id = resolve_sensitive_access_run_id(
            run_id=approval_ticket.run_id if approval_ticket is not None else None,
            node_run_id=approval_ticket.node_run_id if approval_ticket is not None else None,
            run_ids_by_node_run_id=run_ids_by_node_run_id,
        )
        if approval_ticket is not None and resolved_run_id:
            scope_key = (resolved_run_id, approval_ticket.node_run_id)
            if scope_key not in before_blockers_by_scope:
                before_blockers_by_scope[scope_key] = CallbackBlockerScopedSnapshot(
                    run_id=resolved_run_id,
                    node_run_id=approval_ticket.node_run_id,
                    snapshot=capture_callback_blocker_snapshot(
                        db,
                        run_id=resolved_run_id,
                        node_run_id=approval_ticket.node_run_id,
                    ),
                )
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
    run_ids_by_node_run_id.update(
        load_run_ids_by_node_run_id(db, [item.node_run_id for item in decided_items])
    )
    after_blockers = []
    for item in decided_items:
        resolved_run_id = resolve_sensitive_access_run_id(
            run_id=item.run_id,
            node_run_id=item.node_run_id,
            run_ids_by_node_run_id=run_ids_by_node_run_id,
        )
        if not resolved_run_id:
            continue
        after_blockers.append(
            CallbackBlockerScopedSnapshot(
                run_id=resolved_run_id,
                node_run_id=item.node_run_id,
                snapshot=capture_callback_blocker_snapshot(
                    db,
                    run_id=resolved_run_id,
                    node_run_id=item.node_run_id,
                ),
            )
        )
    before_blockers = [
        before_blockers_by_scope[(resolved_run_id, item.node_run_id)]
        for item in decided_items
        for resolved_run_id in [
            resolve_sensitive_access_run_id(
                run_id=item.run_id,
                node_run_id=item.node_run_id,
                run_ids_by_node_run_id=run_ids_by_node_run_id,
            )
        ]
        if resolved_run_id and (resolved_run_id, item.node_run_id) in before_blockers_by_scope
    ]
    affected_run_ids = collect_sensitive_access_run_ids(
        db,
        scopes=[(item.run_id, item.node_run_id) for item in decided_items],
    )
    return ApprovalTicketBulkDecisionResult(
        status=payload.status,
        requested_count=len(payload.ticket_ids),
        decided_count=len(decided_items),
        skipped_count=len(skipped_items),
        decided_items=decided_items,
        skipped_items=skipped_items,
        skipped_reason_summary=_summarize_approval_ticket_bulk_skips(skipped_items),
        outcome_explanation=build_bulk_approval_decision_outcome_explanation(
            status=payload.status,
            decided_count=len(decided_items),
            skipped_items=skipped_items,
        ),
        callback_blocker_delta=build_bulk_callback_blocker_delta_summary(
            before_blockers,
            after_blockers,
        ),
        run_follow_up=build_operator_run_follow_up_summary(db, affected_run_ids),
        legacy_auth_governance=_build_sensitive_access_legacy_auth_governance_snapshot(
            db,
            workflow_ids=_resolve_legacy_auth_workflow_ids_for_run_ids(
                db,
                run_ids=affected_run_ids,
            ),
        ),
    )


@router.get("/notification-dispatches", response_model=list[NotificationDispatchItem])
def list_notification_dispatches(
    approval_ticket_id: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    node_run_id: str | None = Query(default=None),
    access_request_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    _access_context=Depends(
        require_console_route_access("/api/sensitive-access/notification-dispatches", method="GET")
    ),
    db: Session = Depends(get_db),
) -> list[NotificationDispatchItem]:
    records = service.list_notification_dispatches(
        db,
        approval_ticket_id=approval_ticket_id,
        run_id=run_id,
        node_run_id=node_run_id,
        access_request_id=access_request_id,
        status=status,
        channel=channel,
    )
    return [serialize_notification_dispatch(record) for record in records]


@router.post(
    "/notification-dispatches/{dispatch_id}/retry",
    response_model=NotificationDispatchRetryResponse,
)
def retry_notification_dispatch(
    dispatch_id: str,
    payload: NotificationDispatchRetryRequest | None = None,
    _access_context=Depends(
        require_console_route_access(
            "/api/sensitive-access/notification-dispatches/{dispatch_id}/retry", method="POST"
        )
    ),
    db: Session = Depends(get_db),
) -> NotificationDispatchRetryResponse:
    notification = db.get(NotificationDispatchRecord, dispatch_id)
    approval_ticket = (
        db.get(ApprovalTicketRecord, notification.approval_ticket_id)
        if notification is not None
        else None
    )
    approval_ticket_run_id = resolve_sensitive_access_run_id(
        run_id=approval_ticket.run_id if approval_ticket is not None else None,
        node_run_id=approval_ticket.node_run_id if approval_ticket is not None else None,
        run_ids_by_node_run_id=load_run_ids_by_node_run_id(
            db, [approval_ticket.node_run_id if approval_ticket is not None else None]
        ),
    )
    before_blocker = capture_callback_blocker_snapshot(
        db,
        run_id=approval_ticket_run_id,
        node_run_id=approval_ticket.node_run_id if approval_ticket is not None else None,
    )
    try:
        bundle = service.retry_notification_dispatch(
            db,
            dispatch_id=dispatch_id,
            target_override=payload.target if payload is not None else None,
        )
    except SensitiveAccessControlError as exc:
        _raise_sensitive_access_error(exc)
    db.commit()
    after_run_id = resolve_sensitive_access_run_id(
        run_id=bundle.approval_ticket.run_id,
        node_run_id=bundle.approval_ticket.node_run_id,
        run_ids_by_node_run_id=load_run_ids_by_node_run_id(
            db, [bundle.approval_ticket.node_run_id]
        ),
    )
    after_blocker = capture_callback_blocker_snapshot(
        db,
        run_id=after_run_id,
        node_run_id=bundle.approval_ticket.node_run_id,
    )
    return _serialize_notification_retry_bundle(
        bundle,
        db=db,
        callback_blocker_delta=build_callback_blocker_delta_summary(
            before=before_blocker,
            after=after_blocker,
        ),
    )


@router.post(
    "/notification-dispatches/bulk-retry",
    response_model=NotificationDispatchBulkRetryResult,
)
def bulk_retry_notification_dispatches(
    payload: NotificationDispatchBulkRetryRequest,
    _access_context=Depends(
        require_console_route_access(
            "/api/sensitive-access/notification-dispatches/bulk-retry", method="POST"
        )
    ),
    db: Session = Depends(get_db),
) -> NotificationDispatchBulkRetryResult:
    retried_items: list[NotificationDispatchBulkRetriedItem] = []
    skipped_items: list[NotificationDispatchBulkSkippedItem] = []
    before_blockers_by_scope: dict[tuple[str, str | None], CallbackBlockerScopedSnapshot] = {}
    run_ids_by_node_run_id: dict[str, str] = {}

    for dispatch_id in payload.dispatch_ids:
        notification = db.get(NotificationDispatchRecord, dispatch_id)
        approval_ticket = (
            db.get(ApprovalTicketRecord, notification.approval_ticket_id)
            if notification is not None
            else None
        )
        run_ids_by_node_run_id.update(
            load_run_ids_by_node_run_id(
                db, [approval_ticket.node_run_id if approval_ticket is not None else None]
            )
        )
        resolved_run_id = resolve_sensitive_access_run_id(
            run_id=approval_ticket.run_id if approval_ticket is not None else None,
            node_run_id=approval_ticket.node_run_id if approval_ticket is not None else None,
            run_ids_by_node_run_id=run_ids_by_node_run_id,
        )
        if approval_ticket is not None and resolved_run_id:
            scope_key = (resolved_run_id, approval_ticket.node_run_id)
            if scope_key not in before_blockers_by_scope:
                before_blockers_by_scope[scope_key] = CallbackBlockerScopedSnapshot(
                    run_id=resolved_run_id,
                    node_run_id=approval_ticket.node_run_id,
                    snapshot=capture_callback_blocker_snapshot(
                        db,
                        run_id=resolved_run_id,
                        node_run_id=approval_ticket.node_run_id,
                    ),
                )
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
    run_ids_by_node_run_id.update(
        load_run_ids_by_node_run_id(
            db, [item.approval_ticket.node_run_id for item in retried_items]
        )
    )
    after_blockers = []
    for item in retried_items:
        resolved_run_id = resolve_sensitive_access_run_id(
            run_id=item.approval_ticket.run_id,
            node_run_id=item.approval_ticket.node_run_id,
            run_ids_by_node_run_id=run_ids_by_node_run_id,
        )
        if not resolved_run_id:
            continue
        after_blockers.append(
            CallbackBlockerScopedSnapshot(
                run_id=resolved_run_id,
                node_run_id=item.approval_ticket.node_run_id,
                snapshot=capture_callback_blocker_snapshot(
                    db,
                    run_id=resolved_run_id,
                    node_run_id=item.approval_ticket.node_run_id,
                ),
            )
        )
    before_blockers = [
        before_blockers_by_scope[(resolved_run_id, item.approval_ticket.node_run_id)]
        for item in retried_items
        for resolved_run_id in [
            resolve_sensitive_access_run_id(
                run_id=item.approval_ticket.run_id,
                node_run_id=item.approval_ticket.node_run_id,
                run_ids_by_node_run_id=run_ids_by_node_run_id,
            )
        ]
        if resolved_run_id
        and (resolved_run_id, item.approval_ticket.node_run_id) in before_blockers_by_scope
    ]
    affected_run_ids = collect_sensitive_access_run_ids(
        db,
        scopes=[
            (item.approval_ticket.run_id, item.approval_ticket.node_run_id)
            for item in retried_items
        ],
    )
    return NotificationDispatchBulkRetryResult(
        requested_count=len(payload.dispatch_ids),
        retried_count=len(retried_items),
        skipped_count=len(skipped_items),
        retried_items=retried_items,
        skipped_items=skipped_items,
        skipped_reason_summary=_summarize_notification_dispatch_bulk_skips(skipped_items),
        outcome_explanation=build_bulk_notification_retry_outcome_explanation(
            retried_items=retried_items,
            skipped_items=skipped_items,
        ),
        callback_blocker_delta=build_bulk_callback_blocker_delta_summary(
            before_blockers,
            after_blockers,
        ),
        run_follow_up=build_operator_run_follow_up_summary(db, affected_run_ids),
        legacy_auth_governance=_build_sensitive_access_legacy_auth_governance_snapshot(
            db,
            workflow_ids=_resolve_legacy_auth_workflow_ids_for_run_ids(
                db,
                run_ids=affected_run_ids,
            ),
        ),
    )
