from collections import Counter
from datetime import UTC, datetime

from app.models.run import NodeRun, Run, RunCallbackTicket
from app.schemas.operator_follow_up import OperatorRunFollowUpSummary, OperatorRunSnapshot
from app.schemas.run_views import RunCallbackTicketItem
from app.schemas.workflow_publish import (
    PublishedEndpointCacheInventoryItem,
    PublishedEndpointInvocationApiKeyUsageItem,
    PublishedEndpointInvocationItem,
    PublishedEndpointInvocationRequestSurface,
    PublishedEndpointInvocationSensitiveAccessSummary,
    PublishedEndpointInvocationWaitingLifecycle,
)
from app.services.callback_waiting_explanations import (
    build_callback_waiting_explanation,
)
from app.services.operator_run_follow_up import (
    resolve_operator_run_snapshot_from_follow_up,
)
from app.services.published_invocations import classify_invocation_reason
from app.services.run_view_serializers import (
    serialize_callback_waiting_lifecycle_summary,
    serialize_callback_waiting_scheduled_resume,
)
from app.services.sensitive_access_bundle_summary import summarize_sensitive_access_bundles
from app.services.sensitive_access_timeline import SensitiveAccessTimelineSnapshot
from app.services.sensitive_access_types import SensitiveAccessRequestBundle


def _resolve_callback_waiting_lifecycle(node_run: NodeRun):
    return serialize_callback_waiting_lifecycle_summary(node_run.checkpoint_payload)


def _is_active_waiting_node(node_run: NodeRun) -> bool:
    lifecycle = _resolve_callback_waiting_lifecycle(node_run)
    if lifecycle is not None and lifecycle.terminated:
        return False

    status = str(node_run.status or "").strip()
    if status == "waiting" or status.startswith("waiting_"):
        return True

    return node_run.waiting_reason is not None and node_run.finished_at is None


def _is_terminated_callback_waiting_node(node_run: NodeRun) -> bool:
    lifecycle = _resolve_callback_waiting_lifecycle(node_run)
    return bool(lifecycle is not None and lifecycle.terminated)


def _node_run_recency_key(node_run: NodeRun) -> tuple[datetime, int, str]:
    return (
        node_run.finished_at
        or node_run.phase_started_at
        or node_run.started_at
        or node_run.created_at
        or datetime.min.replace(tzinfo=UTC),
        node_run.retry_count,
        node_run.id,
    )


def _pick_latest_node_run(node_runs: list[NodeRun]) -> NodeRun | None:
    if not node_runs:
        return None
    return max(node_runs, key=_node_run_recency_key)


def _resolve_run_snapshot(
    *,
    record_run_id: str | None,
    run_snapshot_lookup: dict[str, OperatorRunSnapshot] | None,
    run_follow_up: OperatorRunFollowUpSummary | None,
) -> OperatorRunSnapshot | None:
    if run_snapshot_lookup and record_run_id:
        snapshot = run_snapshot_lookup.get(record_run_id)
        if snapshot is not None:
            return snapshot
    return resolve_operator_run_snapshot_from_follow_up(
        run_follow_up,
        run_id=record_run_id,
    )


def serialize_published_invocation_item(
    record,
    *,
    request_surface: PublishedEndpointInvocationRequestSurface,
    api_key_lookup: dict[str, PublishedEndpointInvocationApiKeyUsageItem] | None = None,
    run_lookup: dict[str, Run] | None = None,
    waiting_reason_lookup: dict[str, str | None] | None = None,
    waiting_lifecycle_lookup: dict[
        str, PublishedEndpointInvocationWaitingLifecycle | None
    ]
    | None = None,
    run_snapshot_lookup: dict[str, OperatorRunSnapshot] | None = None,
    run_follow_up_lookup: dict[str, OperatorRunFollowUpSummary] | None = None,
) -> PublishedEndpointInvocationItem:
    api_key_metadata = api_key_lookup.get(record.api_key_id) if api_key_lookup else None
    run = run_lookup.get(record.run_id) if run_lookup and record.run_id else None
    waiting_reason = (
        waiting_reason_lookup.get(record.run_id)
        if waiting_reason_lookup and record.run_id
        else None
    )
    waiting_lifecycle = (
        waiting_lifecycle_lookup.get(record.run_id)
        if waiting_lifecycle_lookup and record.run_id
        else None
    )
    run_follow_up = (
        run_follow_up_lookup.get(record.run_id)
        if run_follow_up_lookup and record.run_id
        else None
    )
    run_snapshot = _resolve_run_snapshot(
        record_run_id=record.run_id,
        run_snapshot_lookup=run_snapshot_lookup,
        run_follow_up=run_follow_up,
    )
    return PublishedEndpointInvocationItem(
        id=record.id,
        workflow_id=record.workflow_id,
        binding_id=record.binding_id,
        endpoint_id=record.endpoint_id,
        endpoint_alias=record.endpoint_alias,
        route_path=record.route_path,
        protocol=record.protocol,
        auth_mode=record.auth_mode,
        request_source=record.request_source,
        request_surface=request_surface,
        status=record.status,
        cache_status=record.cache_status or "bypass",
        api_key_id=record.api_key_id,
        api_key_name=api_key_metadata.name if api_key_metadata else None,
        api_key_prefix=api_key_metadata.key_prefix if api_key_metadata else None,
        api_key_status=api_key_metadata.status if api_key_metadata else None,
        run_id=record.run_id,
        run_status=record.run_status,
        run_current_node_id=run.current_node_id if run else None,
        run_waiting_reason=waiting_reason,
        run_waiting_lifecycle=waiting_lifecycle,
        run_snapshot=run_snapshot,
        run_follow_up=run_follow_up,
        execution_focus_explanation=(
            run_snapshot.execution_focus_explanation
            if run_snapshot is not None
            else None
        ),
        callback_waiting_explanation=(
            waiting_lifecycle.callback_waiting_explanation
            if waiting_lifecycle is not None
            else (
                run_snapshot.callback_waiting_explanation
                if run_snapshot is not None
                else None
            )
        ),
        reason_code=classify_invocation_reason(
            status=record.status,
            error_message=record.error_message,
            run_status=record.run_status,
        ),
        error_message=record.error_message,
        request_preview=record.request_preview or {},
        response_preview=record.response_preview,
        duration_ms=record.duration_ms,
        created_at=record.created_at,
        finished_at=record.finished_at,
    )


def resolve_waiting_node_run(run: Run, node_runs: list[NodeRun]) -> NodeRun | None:
    current_waiting_node_runs = [
        node_run
        for node_run in node_runs
        if node_run.node_id == run.current_node_id and _is_active_waiting_node(node_run)
    ]
    current_node_run = _pick_latest_node_run(current_waiting_node_runs)
    if current_node_run is not None:
        return current_node_run

    waiting_node_run = _pick_latest_node_run(
        [node_run for node_run in node_runs if _is_active_waiting_node(node_run)]
    )
    if waiting_node_run is not None:
        return waiting_node_run

    return _pick_latest_node_run(
        [node_run for node_run in node_runs if _is_terminated_callback_waiting_node(node_run)]
    )


def serialize_waiting_lifecycle(
    node_run: NodeRun,
    callback_tickets: list[RunCallbackTicket],
    sensitive_access_summary: PublishedEndpointInvocationSensitiveAccessSummary | None = None,
) -> PublishedEndpointInvocationWaitingLifecycle:
    lifecycle = _resolve_callback_waiting_lifecycle(node_run)
    scheduled_resume = serialize_callback_waiting_scheduled_resume(
        node_run.checkpoint_payload
    )
    pending_approval_count = (
        sensitive_access_summary.pending_approval_count
        if sensitive_access_summary is not None
        else 0
    )
    failed_notification_count = (
        sensitive_access_summary.failed_notification_count
        if sensitive_access_summary is not None
        else 0
    )
    return PublishedEndpointInvocationWaitingLifecycle(
        node_run_id=node_run.id,
        node_status=node_run.status,
        waiting_reason=(
            None
            if lifecycle is not None and lifecycle.terminated
            else node_run.waiting_reason
        ),
        callback_ticket_count=len(callback_tickets),
        callback_ticket_status_counts=dict(
            sorted(Counter(ticket.status for ticket in callback_tickets).items())
        ),
        callback_waiting_lifecycle=lifecycle,
        callback_waiting_explanation=build_callback_waiting_explanation(
            lifecycle=lifecycle,
            pending_callback_ticket_count=sum(
                1 for ticket in callback_tickets if ticket.status == "pending"
            ),
            pending_approval_count=pending_approval_count,
            failed_notification_count=failed_notification_count,
            scheduled_resume_delay_seconds=scheduled_resume[
                "scheduled_resume_delay_seconds"
            ],
            scheduled_resume_due_at=scheduled_resume["scheduled_resume_due_at"],
            scheduled_resume_requeued_at=scheduled_resume[
                "scheduled_resume_requeued_at"
            ],
            scheduled_resume_requeue_source=scheduled_resume[
                "scheduled_resume_requeue_source"
            ],
        ),
        sensitive_access_summary=sensitive_access_summary,
        scheduled_resume_delay_seconds=scheduled_resume[
            "scheduled_resume_delay_seconds"
        ],
        scheduled_resume_reason=scheduled_resume["scheduled_resume_reason"],
        scheduled_resume_source=scheduled_resume["scheduled_resume_source"],
        scheduled_waiting_status=scheduled_resume["scheduled_waiting_status"],
        scheduled_resume_scheduled_at=scheduled_resume[
            "scheduled_resume_scheduled_at"
        ],
        scheduled_resume_due_at=scheduled_resume["scheduled_resume_due_at"],
        scheduled_resume_requeued_at=scheduled_resume[
            "scheduled_resume_requeued_at"
        ],
        scheduled_resume_requeue_source=scheduled_resume[
            "scheduled_resume_requeue_source"
        ],
    )


def build_waiting_lifecycle_lookup(
    run_lookup: dict[str, Run],
    node_runs: list[NodeRun],
    callback_tickets: list[RunCallbackTicket],
    sensitive_access_timeline_by_run: dict[str, SensitiveAccessTimelineSnapshot] | None = None,
) -> tuple[
    dict[str, str | None],
    dict[str, PublishedEndpointInvocationWaitingLifecycle | None],
]:
    node_runs_by_run: dict[str, list[NodeRun]] = {}
    for node_run in node_runs:
        node_runs_by_run.setdefault(node_run.run_id, []).append(node_run)

    callback_tickets_by_node_run: dict[str, list[RunCallbackTicket]] = {}
    for ticket in callback_tickets:
        callback_tickets_by_node_run.setdefault(ticket.node_run_id, []).append(ticket)

    waiting_reason_lookup: dict[str, str | None] = {run_id: None for run_id in run_lookup}
    waiting_lifecycle_lookup: dict[str, PublishedEndpointInvocationWaitingLifecycle | None] = {}
    for run_id, run in run_lookup.items():
        selected_node_run = resolve_waiting_node_run(run, node_runs_by_run.get(run_id, []))
        if selected_node_run is None:
            continue
        sensitive_access_summary = _summarize_sensitive_access_bundles(
            sensitive_access_timeline_by_run.get(run_id).by_node_run.get(selected_node_run.id, [])
            if sensitive_access_timeline_by_run is not None
            and sensitive_access_timeline_by_run.get(run_id) is not None
            else []
        )
        waiting_lifecycle = serialize_waiting_lifecycle(
            selected_node_run,
            callback_tickets_by_node_run.get(selected_node_run.id, []),
            sensitive_access_summary,
        )
        waiting_reason_lookup[run_id] = waiting_lifecycle.waiting_reason
        waiting_lifecycle_lookup[run_id] = waiting_lifecycle
    return waiting_reason_lookup, waiting_lifecycle_lookup


def _summarize_sensitive_access_bundles(
    bundles: list[SensitiveAccessRequestBundle],
) -> PublishedEndpointInvocationSensitiveAccessSummary | None:
    summary = summarize_sensitive_access_bundles(bundles)
    if summary is None:
        return None

    return PublishedEndpointInvocationSensitiveAccessSummary(
        request_count=summary.request_count,
        approval_ticket_count=summary.approval_ticket_count,
        pending_approval_count=summary.pending_approval_count,
        approved_approval_count=summary.approved_approval_count,
        rejected_approval_count=summary.rejected_approval_count,
        expired_approval_count=summary.expired_approval_count,
        pending_notification_count=summary.pending_notification_count,
        delivered_notification_count=summary.delivered_notification_count,
        failed_notification_count=summary.failed_notification_count,
        primary_resource=summary.primary_resource,
    )


def serialize_callback_ticket_item(ticket: RunCallbackTicket) -> RunCallbackTicketItem:
    return RunCallbackTicketItem(
        ticket=ticket.id,
        run_id=ticket.run_id,
        node_run_id=ticket.node_run_id,
        tool_call_id=ticket.tool_call_id,
        tool_id=ticket.tool_id,
        tool_call_index=ticket.tool_call_index,
        waiting_status=ticket.waiting_status,
        status=ticket.status,
        reason=ticket.reason,
        callback_payload=ticket.callback_payload,
        created_at=ticket.created_at,
        expires_at=ticket.expires_at,
        consumed_at=ticket.consumed_at,
        canceled_at=ticket.canceled_at,
        expired_at=ticket.expired_at,
    )


def serialize_cache_inventory_item(item) -> PublishedEndpointCacheInventoryItem:
    return PublishedEndpointCacheInventoryItem(
        id=item.id,
        binding_id=item.binding_id,
        cache_key=item.cache_key,
        response_preview=item.response_preview,
        hit_count=item.hit_count,
        last_hit_at=item.last_hit_at,
        expires_at=item.expires_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )
