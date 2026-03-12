from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
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
) -> PublishedEndpointInvocationItem:
    api_key_metadata = api_key_lookup.get(record.api_key_id) if api_key_lookup else None
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
        request_surface_counts=[
            PublishedEndpointInvocationBucketFacetItem(value=facet.value, count=facet.count)
            for facet in item.request_surface_counts
        ],
        reason_counts=[
            PublishedEndpointInvocationBucketFacetItem(value=facet.value, count=facet.count)
            for facet in item.reason_counts
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
        api_key_id=api_key_id,
        reason_code=reason_code,
        created_from=created_from,
        created_to=created_to,
    )
    api_key_usage_items = [_serialize_api_key_usage_item(item) for item in audit.api_key_usage]
    api_key_lookup = {item.api_key_id: item for item in api_key_usage_items}

    return PublishedEndpointInvocationListResponse(
        filters=PublishedEndpointInvocationFilters(
            status=invocation_status,
            request_source=request_source,
            request_surface=request_surface,
            cache_status=cache_status,
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
            reason_counts=[_serialize_facet_item(item) for item in audit.reason_counts],
            api_key_usage=api_key_usage_items,
            recent_failure_reasons=[
                _serialize_failure_reason_item(item) for item in audit.recent_failure_reasons
            ],
            timeline_granularity=audit.timeline_granularity,
            timeline=[_serialize_timeline_item(item) for item in audit.timeline],
        ),
        items=[
            _serialize_published_invocation_item(record, api_key_lookup=api_key_lookup)
            for record in records
        ],
    )
