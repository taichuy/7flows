from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.published_endpoint_invocation_support import (
    build_waiting_lifecycle_lookup,
    serialize_published_invocation_item,
)
from app.api.routes.sensitive_access_http import build_sensitive_access_blocking_response
from app.core.database import get_db
from app.models.run import NodeRun, Run, RunCallbackTicket
from app.models.workflow import (
    Workflow,
    WorkflowPublishedEndpoint,
    WorkflowPublishedInvocation,
)
from app.schemas.workflow_publish import (
    PublishedEndpointInvocationApiKeyBucketFacetItem,
    PublishedEndpointInvocationApiKeyUsageItem,
    PublishedEndpointInvocationBucketFacetItem,
    PublishedEndpointInvocationCacheStatus,
    PublishedEndpointInvocationFacetItem,
    PublishedEndpointInvocationFacets,
    PublishedEndpointInvocationFailureReasonItem,
    PublishedEndpointInvocationFilters,
    PublishedEndpointInvocationListResponse,
    PublishedEndpointInvocationReasonCode,
    PublishedEndpointInvocationRequestSource,
    PublishedEndpointInvocationRequestSurface,
    PublishedEndpointInvocationStatus,
    PublishedEndpointInvocationSummary,
    PublishedEndpointInvocationTimeBucketItem,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary_map,
    build_operator_run_snapshot_map,
)
from app.services.published_invocation_export_access import (
    PublishedInvocationExportAccessService,
)
from app.services.published_invocation_exports import (
    build_published_invocation_export_filename,
    build_published_invocation_export_payload,
    serialize_published_invocation_export_jsonl,
)
from app.services.published_invocations import (
    PublishedInvocationService,
)
from app.services.sensitive_access_timeline import load_sensitive_access_timelines
from app.services.workflow_publish import WorkflowPublishBindingService

router = APIRouter(prefix="/workflows", tags=["published-endpoint-activity"])
published_invocation_service = PublishedInvocationService()
published_invocation_export_access_service = PublishedInvocationExportAccessService()
workflow_publish_service = WorkflowPublishBindingService()


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
        approval_ticket_count=summary.approval_ticket_count,
        pending_approval_count=summary.pending_approval_count,
        approved_approval_count=summary.approved_approval_count,
        rejected_approval_count=summary.rejected_approval_count,
        expired_approval_count=summary.expired_approval_count,
        pending_notification_count=summary.pending_notification_count,
        delivered_notification_count=summary.delivered_notification_count,
        failed_notification_count=summary.failed_notification_count,
        primary_sensitive_resource=summary.primary_sensitive_resource,
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
        last_reason_code=item.last_reason_code,
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


def _validate_created_range(
    created_from: datetime | None,
    created_to: datetime | None,
) -> None:
    if created_from is not None and created_to is not None and created_from > created_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="'created_from' must be earlier than or equal to 'created_to'.",
        )


def _build_published_endpoint_invocation_list_response(
    db: Session,
    *,
    workflow_id: str,
    binding_id: str,
    invocation_status: PublishedEndpointInvocationStatus | None,
    request_source: PublishedEndpointInvocationRequestSource | None,
    request_surface: PublishedEndpointInvocationRequestSurface | None,
    cache_status: PublishedEndpointInvocationCacheStatus | None,
    run_status: str | None,
    api_key_id: str | None,
    reason_code: PublishedEndpointInvocationReasonCode | None,
    created_from: datetime | None,
    created_to: datetime | None,
    limit: int,
) -> tuple[list[WorkflowPublishedInvocation], PublishedEndpointInvocationListResponse]:
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
    run_snapshot_lookup = {}
    run_follow_up_lookup = {}
    if run_ids:
        node_runs = db.scalars(select(NodeRun).where(NodeRun.run_id.in_(run_ids))).all()
        callback_tickets = db.scalars(
            select(RunCallbackTicket).where(RunCallbackTicket.run_id.in_(run_ids))
        ).all()
        sensitive_access_timelines = load_sensitive_access_timelines(
            db,
            run_ids=run_ids,
        )
        waiting_reason_lookup, waiting_lifecycle_lookup = build_waiting_lifecycle_lookup(
            run_lookup,
            node_runs,
            callback_tickets,
            sensitive_access_timelines,
        )
        run_snapshot_lookup = build_operator_run_snapshot_map(db, run_ids)
        run_follow_up_lookup = build_operator_run_follow_up_summary_map(
            db,
            run_ids,
            sample_limit=1,
        )

    return records, PublishedEndpointInvocationListResponse(
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
            serialize_published_invocation_item(
                record,
                request_surface=published_invocation_service.resolve_request_surface(record),
                api_key_lookup=api_key_lookup,
                run_lookup=run_lookup,
                waiting_reason_lookup=waiting_reason_lookup,
                waiting_lifecycle_lookup=waiting_lifecycle_lookup,
                run_snapshot_lookup=run_snapshot_lookup,
                run_follow_up_lookup=run_follow_up_lookup,
            )
            for record in records
        ],
    )
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

    _validate_created_range(created_from, created_to)
    _, response = _build_published_endpoint_invocation_list_response(
        db,
        workflow_id=workflow_id,
        binding_id=binding_id,
        invocation_status=invocation_status,
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
    return response


@router.get(
    "/{workflow_id}/published-endpoints/{binding_id}/invocations/export",
    response_model=None,
)
def export_published_endpoint_invocations(
    workflow_id: str,
    binding_id: str,
    invocation_status: PublishedEndpointInvocationStatus | None = Query(
        default=None,
        alias="status",
    ),
    request_source: PublishedEndpointInvocationRequestSource | None = Query(default=None),
    request_surface: PublishedEndpointInvocationRequestSurface | None = Query(default=None),
    cache_status: PublishedEndpointInvocationCacheStatus | None = Query(default=None),
    run_status: str | None = Query(default=None, min_length=1, max_length=64),
    api_key_id: str | None = Query(default=None, min_length=1, max_length=64),
    reason_code: PublishedEndpointInvocationReasonCode | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    format: Literal["json", "jsonl"] = "json",
    requester_id: str = Query(default="publish-activity-export", min_length=1, max_length=128),
    purpose_text: str | None = Query(default=None, min_length=1, max_length=512),
    db: Session = Depends(get_db),
):
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    binding = db.get(WorkflowPublishedEndpoint, binding_id)
    if binding is None or binding.workflow_id != workflow_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published endpoint binding not found.",
        )

    _validate_created_range(created_from, created_to)
    records, response = _build_published_endpoint_invocation_list_response(
        db,
        workflow_id=workflow_id,
        binding_id=binding_id,
        invocation_status=invocation_status,
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

    sensitive_access_response = build_sensitive_access_blocking_response(
        published_invocation_export_access_service.ensure_access(
            db,
            binding=binding,
            records=records,
            requester_id=requester_id,
            purpose_text=purpose_text,
        ),
        db=db,
        approval_detail=(
            "Published invocation export requires approval before the payload can be exported."
        ),
        deny_detail="Published invocation export is denied by the sensitive access policy.",
    )
    if sensitive_access_response is not None:
        return sensitive_access_response

    payload = build_published_invocation_export_payload(
        binding=binding,
        export_format=format,
        limit=limit,
        response=response,
        legacy_auth_governance=workflow_publish_service.build_legacy_auth_governance_snapshot(
            db,
            workflow_id=workflow_id,
        ),
    )
    filename = build_published_invocation_export_filename(binding, format)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    if format == "jsonl":
        return PlainTextResponse(
            content=serialize_published_invocation_export_jsonl(payload),
            media_type="application/x-ndjson",
            headers=headers,
        )

    return JSONResponse(content=payload, headers=headers)
