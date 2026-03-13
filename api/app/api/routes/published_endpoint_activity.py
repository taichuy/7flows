from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.run import NodeRun, Run, RunCallbackTicket
from app.models.workflow import Workflow, WorkflowPublishedEndpoint
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationApiKeyBucketFacetItem,
    PublishedEndpointInvocationBucketFacetItem,
    PublishedEndpointInvocationApiKeyUsageItem,
    PublishedEndpointInvocationCacheStatus,
    PublishedEndpointInvocationFacetItem,
    PublishedEndpointInvocationFacets,
    PublishedEndpointInvocationFailureReasonItem,
    PublishedEndpointInvocationFilters,
    PublishedEndpointInvocationItem,
    PublishedEndpointInvocationReasonCode,
    PublishedEndpointInvocationListResponse,
    PublishedEndpointInvocationRequestSurface,
    PublishedEndpointInvocationRequestSource,
    PublishedEndpointInvocationStatus,
    PublishedEndpointInvocationSummary,
    PublishedEndpointInvocationTimeBucketItem,
    PublishedEndpointInvocationWaitingLifecycle,
)
from app.services.published_invocations import (
    PublishedInvocationService,
    classify_invocation_reason,
)

router = APIRouter(prefix="/workflows", tags=["published-endpoint-activity"])
published_invocation_service = PublishedInvocationService()


def _serialize_published_invocation_summary(summary) -> PublishedEndpointInvocationSummary:
    return PublishedEndpointInvocationSummary(
        total_count=summary.total_count,
        succeeded_count=summary.succeeded_count,
        failed_count=summary.failed_count,
        rejected_count=summary.rejected_count,
        cache_hit_count=summary.cache_hit_count,
        cache_miss_count=summary.cache_miss_count,
        cache_bypass_count=summary.cache_bypass_count,
        last_invoked_at=summary.last_invoked_at,
        last_status=summary.last_status,
        last_cache_status=summary.last_cache_status,
        last_run_id=summary.last_run_id,
        last_run_status=summary.last_run_status,
        last_reason_code=summary.last_reason_code,
    )


def _serialize_published_invocation_item(
    record,
    *,
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
        request_surface=published_invocation_service.resolve_request_surface(record),
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


def _serialize_facet_item(item) -> PublishedEndpointInvocationFacetItem:
    return PublishedEndpointInvocationFacetItem(
        value=item.value,
        count=item.count,
        last_invoked_at=item.last_invoked_at,
        last_status=item.last_status,
    )


def _serialize_api_key_usage_item(item) -> PublishedEndpointInvocationApiKeyUsageItem:
    return PublishedEndpointInvocationApiKeyUsageItem(
        api_key_id=item.api_key_id,
        name=item.name,
        key_prefix=item.key_prefix,
        status=item.status,
        invocation_count=item.invocation_count,
        succeeded_count=item.succeeded_count,
        failed_count=item.failed_count,
        rejected_count=item.rejected_count,
        last_invoked_at=item.last_invoked_at,
        last_status=item.last_status,
    )


def _serialize_api_key_bucket_item(item) -> PublishedEndpointInvocationApiKeyBucketFacetItem:
    return PublishedEndpointInvocationApiKeyBucketFacetItem(
        api_key_id=item.api_key_id,
        name=item.name,
        key_prefix=item.key_prefix,
        count=item.count,
    )


def _serialize_failure_reason_item(item) -> PublishedEndpointInvocationFailureReasonItem:
    return PublishedEndpointInvocationFailureReasonItem(
        message=item.message,
        count=item.count,
        last_invoked_at=item.last_invoked_at,
    )


def _serialize_timeline_item(item) -> PublishedEndpointInvocationTimeBucketItem:
    return PublishedEndpointInvocationTimeBucketItem(
        bucket_start=item.bucket_start,
        bucket_end=item.bucket_end,
        total_count=item.total_count,
        succeeded_count=item.succeeded_count,
        failed_count=item.failed_count,
        rejected_count=item.rejected_count,
        api_key_counts=[_serialize_api_key_bucket_item(facet) for facet in item.api_key_counts],
        cache_status_counts=[
            PublishedEndpointInvocationBucketFacetItem(value=facet.value, count=facet.count)
            for facet in item.cache_status_counts
        ],
        run_status_counts=[
            PublishedEndpointInvocationBucketFacetItem(value=facet.value, count=facet.count)
            for facet in item.run_status_counts
        ],
        request_surface_counts=[
            PublishedEndpointInvocationBucketFacetItem(value=facet.value, count=facet.count)
            for facet in item.request_surface_counts
        ],
        reason_counts=[
            PublishedEndpointInvocationBucketFacetItem(value=facet.value, count=facet.count)
            for facet in item.reason_counts
        ],
    )


def _resolve_waiting_node_run(run: Run, node_runs: list[NodeRun]) -> NodeRun | None:
    current_node_run = next(
        (node_run for node_run in node_runs if node_run.node_id == run.current_node_id),
        None,
    )
    if current_node_run is not None and (
        current_node_run.status == "waiting" or current_node_run.waiting_reason is not None
    ):
        return current_node_run

    waiting_node_run = next(
        (node_run for node_run in node_runs if node_run.status == "waiting"),
        None,
    )
    if waiting_node_run is not None:
        return waiting_node_run

    return next(
        (node_run for node_run in node_runs if node_run.waiting_reason is not None),
        None,
    )


def _serialize_waiting_lifecycle(
    node_run: NodeRun,
    callback_tickets: list[RunCallbackTicket],
) -> PublishedEndpointInvocationWaitingLifecycle:
    checkpoint_payload = node_run.checkpoint_payload if isinstance(node_run.checkpoint_payload, dict) else {}
    raw_scheduled_resume = checkpoint_payload.get("scheduled_resume")
    scheduled_resume = raw_scheduled_resume if isinstance(raw_scheduled_resume, dict) else {}
    scheduled_delay = scheduled_resume.get("delay_seconds")
    return PublishedEndpointInvocationWaitingLifecycle(
        node_run_id=node_run.id,
        node_status=node_run.status,
        waiting_reason=node_run.waiting_reason,
        callback_ticket_count=len(callback_tickets),
        callback_ticket_status_counts=dict(
            sorted(Counter(ticket.status for ticket in callback_tickets).items())
        ),
        scheduled_resume_delay_seconds=(
            float(scheduled_delay)
            if isinstance(scheduled_delay, (int, float))
            else None
        ),
        scheduled_resume_reason=(
            str(scheduled_resume.get("reason"))
            if scheduled_resume.get("reason") is not None
            else None
        ),
        scheduled_resume_source=(
            str(scheduled_resume.get("source"))
            if scheduled_resume.get("source") is not None
            else None
        ),
        scheduled_waiting_status=(
            str(scheduled_resume.get("waiting_status"))
            if scheduled_resume.get("waiting_status") is not None
            else None
        ),
    )


def _build_waiting_lifecycle_lookup(
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
        selected_node_run = _resolve_waiting_node_run(run, node_runs_by_run.get(run_id, []))
        if selected_node_run is None:
            continue
        waiting_reason_lookup[run_id] = selected_node_run.waiting_reason
        waiting_lifecycle_lookup[run_id] = _serialize_waiting_lifecycle(
            selected_node_run,
            callback_tickets_by_node_run.get(selected_node_run.id, []),
        )
    return waiting_reason_lookup, waiting_lifecycle_lookup


@router.get(
    "/{workflow_id}/published-endpoints/{binding_id}/invocations",
    response_model=PublishedEndpointInvocationListResponse,
)
def list_published_endpoint_invocations(
    workflow_id: str,
    binding_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    invocation_status: PublishedEndpointInvocationStatus | None = Query(
        default=None,
        alias="status",
    ),
    request_source: PublishedEndpointInvocationRequestSource | None = Query(default=None),
    request_surface: PublishedEndpointInvocationRequestSurface | None = Query(default=None),
    cache_status: PublishedEndpointInvocationCacheStatus | None = Query(default=None),
    run_status: str | None = Query(default=None, min_length=1, max_length=32),
    api_key_id: str | None = Query(default=None, min_length=1, max_length=36),
    reason_code: PublishedEndpointInvocationReasonCode | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PublishedEndpointInvocationListResponse:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    binding = db.get(WorkflowPublishedEndpoint, binding_id)
    if binding is None or binding.workflow_id != workflow_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published endpoint binding not found.",
        )

    if created_from is not None and created_to is not None and created_from > created_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="'created_from' must be earlier than or equal to 'created_to'.",
        )

    records = published_invocation_service.list_for_binding(
        db,
        workflow_id=workflow_id,
        binding_id=binding_id,
        status=invocation_status,
        request_source=request_source,
        request_surface=request_surface,
        cache_status=cache_status,
        run_status=run_status,
        api_key_id=api_key_id,
        reason_code=reason_code,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
    )
    audit = published_invocation_service.build_binding_audit(
        db,
        workflow_id=workflow_id,
        binding_id=binding_id,
        status=invocation_status,
        request_source=request_source,
        request_surface=request_surface,
        cache_status=cache_status,
        run_status=run_status,
        api_key_id=api_key_id,
        reason_code=reason_code,
        created_from=created_from,
        created_to=created_to,
    )
    api_key_usage_items = [_serialize_api_key_usage_item(item) for item in audit.api_key_usage]
    api_key_lookup = {item.api_key_id: item for item in api_key_usage_items}
    run_ids = [record.run_id for record in records if record.run_id]
    run_lookup = (
        {item.id: item for item in db.scalars(select(Run).where(Run.id.in_(run_ids))).all()}
        if run_ids
        else {}
    )
    waiting_reason_lookup = {}
    waiting_lifecycle_lookup = {}
    if run_ids:
        node_runs = db.scalars(select(NodeRun).where(NodeRun.run_id.in_(run_ids))).all()
        callback_tickets = db.scalars(
            select(RunCallbackTicket).where(RunCallbackTicket.run_id.in_(run_ids))
        ).all()
        waiting_reason_lookup, waiting_lifecycle_lookup = _build_waiting_lifecycle_lookup(
            run_lookup,
            node_runs,
            callback_tickets,
        )

    return PublishedEndpointInvocationListResponse(
        filters=PublishedEndpointInvocationFilters(
            status=invocation_status,
            request_source=request_source,
            request_surface=request_surface,
            cache_status=cache_status,
            run_status=run_status,
            api_key_id=api_key_id,
            reason_code=reason_code,
            created_from=created_from,
            created_to=created_to,
        ),
        summary=_serialize_published_invocation_summary(audit.summary),
        facets=PublishedEndpointInvocationFacets(
            status_counts=[_serialize_facet_item(item) for item in audit.status_counts],
            request_source_counts=[
                _serialize_facet_item(item) for item in audit.request_source_counts
            ],
            request_surface_counts=[
                _serialize_facet_item(item) for item in audit.request_surface_counts
            ],
            cache_status_counts=[
                _serialize_facet_item(item) for item in audit.cache_status_counts
            ],
            run_status_counts=[_serialize_facet_item(item) for item in audit.run_status_counts],
            reason_counts=[_serialize_facet_item(item) for item in audit.reason_counts],
            api_key_usage=api_key_usage_items,
            recent_failure_reasons=[
                _serialize_failure_reason_item(item) for item in audit.recent_failure_reasons
            ],
            timeline_granularity=audit.timeline_granularity,
            timeline=[_serialize_timeline_item(item) for item in audit.timeline],
        ),
        items=[
            _serialize_published_invocation_item(
                record,
                api_key_lookup=api_key_lookup,
                run_lookup=run_lookup,
                waiting_reason_lookup=waiting_reason_lookup,
                waiting_lifecycle_lookup=waiting_lifecycle_lookup,
            )
            for record in records
        ],
    )
