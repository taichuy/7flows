from collections import Counter

from app.models.run import NodeRun, Run, RunCallbackTicket
from app.schemas.run_views import RunCallbackTicketItem
from app.schemas.workflow_publish import (
    PublishedEndpointCacheInventoryItem,
    PublishedEndpointInvocationApiKeyUsageItem,
    PublishedEndpointInvocationItem,
    PublishedEndpointInvocationRequestSurface,
    PublishedEndpointInvocationWaitingLifecycle,
)
from app.services.published_invocations import classify_invocation_reason
from app.services.run_view_serializers import (
    serialize_callback_waiting_lifecycle_summary,
    serialize_callback_waiting_scheduled_resume,
)


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
    current_node_run = next(
        (node_run for node_run in node_runs if node_run.node_id == run.current_node_id),
        None,
    )
    if current_node_run is not None and _is_active_waiting_node(current_node_run):
        return current_node_run

    waiting_node_run = next(
        (node_run for node_run in node_runs if _is_active_waiting_node(node_run)),
        None,
    )
    if waiting_node_run is not None:
        return waiting_node_run

    return next(
        (node_run for node_run in node_runs if _is_terminated_callback_waiting_node(node_run)),
        None,
    )


def serialize_waiting_lifecycle(
    node_run: NodeRun,
    callback_tickets: list[RunCallbackTicket],
) -> PublishedEndpointInvocationWaitingLifecycle:
    lifecycle = _resolve_callback_waiting_lifecycle(node_run)
    scheduled_resume = serialize_callback_waiting_scheduled_resume(
        node_run.checkpoint_payload
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
        scheduled_resume_delay_seconds=scheduled_resume[
            "scheduled_resume_delay_seconds"
        ],
        scheduled_resume_reason=scheduled_resume["scheduled_resume_reason"],
        scheduled_resume_source=scheduled_resume["scheduled_resume_source"],
        scheduled_waiting_status=scheduled_resume["scheduled_waiting_status"],
    )


def build_waiting_lifecycle_lookup(
    run_lookup: dict[str, Run],
    node_runs: list[NodeRun],
    callback_tickets: list[RunCallbackTicket],
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
        waiting_lifecycle = serialize_waiting_lifecycle(
            selected_node_run,
            callback_tickets_by_node_run.get(selected_node_run.id, []),
        )
        waiting_reason_lookup[run_id] = waiting_lifecycle.waiting_reason
        waiting_lifecycle_lookup[run_id] = waiting_lifecycle
    return waiting_reason_lookup, waiting_lifecycle_lookup


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
