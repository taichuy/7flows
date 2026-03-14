"""Published invocation audit facet and summary aggregation helpers.

Keeps facet counting, API key usage aggregation and binding summary
construction out of ``published_invocation_audit.py`` so the mixin can stay
focused on orchestration.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.models.workflow import WorkflowPublishedApiKey, WorkflowPublishedInvocation
from app.services.published_invocation_types import (
    CACHE_STATUS_ORDER,
    REQUEST_SURFACE_ORDER,
    RUN_STATUS_ORDER,
    PublishedInvocationApiKeyUsage,
    PublishedInvocationFacet,
    PublishedInvocationFailureReason,
    PublishedInvocationRequestSurface,
    PublishedInvocationSummary,
    classify_invocation_reason,
)

FacetBucket = dict[str, Any]
ResolveRequestSurface = Callable[
    [WorkflowPublishedInvocation],
    PublishedInvocationRequestSurface,
]
ResolveReasonCode = Callable[[WorkflowPublishedInvocation], str | None]


@dataclass(frozen=True)
class PublishedInvocationAuditFacets:
    status_counts: list[PublishedInvocationFacet]
    request_source_counts: list[PublishedInvocationFacet]
    request_surface_counts: list[PublishedInvocationFacet]
    cache_status_counts: list[PublishedInvocationFacet]
    run_status_counts: list[PublishedInvocationFacet]
    reason_counts: list[PublishedInvocationFacet]
    recent_failure_reasons: list[PublishedInvocationFailureReason]
    api_key_buckets: dict[str, FacetBucket]


def _build_facet_bucket() -> FacetBucket:
    return {
        "count": 0,
        "last_invoked_at": None,
        "last_status": None,
    }


def _build_api_key_bucket() -> FacetBucket:
    return {
        "count": 0,
        "succeeded_count": 0,
        "failed_count": 0,
        "rejected_count": 0,
        "last_invoked_at": None,
        "last_status": None,
    }


def _build_failure_reason_bucket() -> FacetBucket:
    return {
        "count": 0,
        "last_invoked_at": None,
    }


def _build_summary_counts() -> dict[str, int]:
    return {
        "total_count": 0,
        "succeeded_count": 0,
        "failed_count": 0,
        "rejected_count": 0,
        "cache_hit_count": 0,
        "cache_miss_count": 0,
        "cache_bypass_count": 0,
    }


def _increment_summary_counts(
    counts: dict[str, int],
    *,
    record: WorkflowPublishedInvocation,
) -> None:
    counts["total_count"] += 1
    counts[f"{record.status}_count"] += 1
    cache_status = record.cache_status or "bypass"
    counts[f"cache_{cache_status}_count"] += 1


def _build_summary(
    counts: dict[str, int],
    *,
    last_record: WorkflowPublishedInvocation | None,
) -> PublishedInvocationSummary:
    return PublishedInvocationSummary(
        total_count=counts["total_count"],
        succeeded_count=counts["succeeded_count"],
        failed_count=counts["failed_count"],
        rejected_count=counts["rejected_count"],
        cache_hit_count=counts["cache_hit_count"],
        cache_miss_count=counts["cache_miss_count"],
        cache_bypass_count=counts["cache_bypass_count"],
        last_invoked_at=last_record.created_at if last_record else None,
        last_status=last_record.status if last_record else None,
        last_cache_status=(last_record.cache_status or "bypass") if last_record else None,
        last_run_id=last_record.run_id if last_record else None,
        last_run_status=last_record.run_status if last_record else None,
        last_reason_code=(
            classify_invocation_reason(
                status=last_record.status,
                error_message=last_record.error_message,
                run_status=last_record.run_status,
            )
            if last_record
            else None
        ),
    )


def summarize_records(
    records: list[WorkflowPublishedInvocation],
) -> PublishedInvocationSummary:
    if not records:
        return PublishedInvocationSummary()

    counts = _build_summary_counts()
    for record in records:
        _increment_summary_counts(counts, record=record)
    return _build_summary(counts, last_record=records[0])


def _build_facets_from_buckets(
    buckets: dict[str, FacetBucket],
    *,
    include_zero_values: bool = False,
) -> list[PublishedInvocationFacet]:
    return [
        PublishedInvocationFacet(
            value=value,
            count=int(bucket["count"]),
            last_invoked_at=bucket["last_invoked_at"],
            last_status=bucket["last_status"],
        )
        for value, bucket in buckets.items()
        if include_zero_values or int(bucket["count"]) > 0
    ]


def build_binding_audit_facets(
    records: list[WorkflowPublishedInvocation],
    *,
    resolve_request_surface: ResolveRequestSurface,
    resolve_reason_code: ResolveReasonCode,
) -> PublishedInvocationAuditFacets:
    status_buckets: dict[str, FacetBucket] = {
        "succeeded": _build_facet_bucket(),
        "failed": _build_facet_bucket(),
        "rejected": _build_facet_bucket(),
    }
    request_source_buckets: dict[str, FacetBucket] = {
        "workflow": _build_facet_bucket(),
        "alias": _build_facet_bucket(),
        "path": _build_facet_bucket(),
    }
    request_surface_buckets: dict[str, FacetBucket] = {
        value: _build_facet_bucket() for value in REQUEST_SURFACE_ORDER
    }
    cache_status_buckets: dict[str, FacetBucket] = {
        value: _build_facet_bucket() for value in CACHE_STATUS_ORDER
    }
    run_status_buckets: dict[str, FacetBucket] = {
        value: _build_facet_bucket() for value in RUN_STATUS_ORDER
    }
    api_key_buckets: dict[str, FacetBucket] = defaultdict(_build_api_key_bucket)
    failure_reason_buckets: dict[str, FacetBucket] = defaultdict(
        _build_failure_reason_bucket
    )
    reason_buckets: dict[str, FacetBucket] = defaultdict(_build_facet_bucket)

    for record in records:
        status_bucket = status_buckets[record.status]
        status_bucket["count"] += 1
        if status_bucket["last_invoked_at"] is None:
            status_bucket["last_invoked_at"] = record.created_at
            status_bucket["last_status"] = record.status

        source_bucket = request_source_buckets[record.request_source]
        source_bucket["count"] += 1
        if source_bucket["last_invoked_at"] is None:
            source_bucket["last_invoked_at"] = record.created_at
            source_bucket["last_status"] = record.status

        resolved_surface = resolve_request_surface(record)
        surface_bucket = request_surface_buckets.setdefault(
            resolved_surface,
            _build_facet_bucket(),
        )
        surface_bucket["count"] += 1
        if surface_bucket["last_invoked_at"] is None:
            surface_bucket["last_invoked_at"] = record.created_at
            surface_bucket["last_status"] = record.status

        cache_bucket = cache_status_buckets[record.cache_status or "bypass"]
        cache_bucket["count"] += 1
        if cache_bucket["last_invoked_at"] is None:
            cache_bucket["last_invoked_at"] = record.created_at
            cache_bucket["last_status"] = record.status

        if record.run_status:
            run_status_bucket = run_status_buckets.setdefault(
                record.run_status,
                _build_facet_bucket(),
            )
            run_status_bucket["count"] += 1
            if run_status_bucket["last_invoked_at"] is None:
                run_status_bucket["last_invoked_at"] = record.created_at
                run_status_bucket["last_status"] = record.status

        if record.api_key_id:
            api_key_bucket = api_key_buckets[record.api_key_id]
            api_key_bucket["count"] += 1
            api_key_bucket[f"{record.status}_count"] += 1
            if api_key_bucket["last_invoked_at"] is None:
                api_key_bucket["last_invoked_at"] = record.created_at
                api_key_bucket["last_status"] = record.status

        if record.status != "succeeded" and record.error_message:
            failure_bucket = failure_reason_buckets[record.error_message]
            failure_bucket["count"] += 1
            if failure_bucket["last_invoked_at"] is None:
                failure_bucket["last_invoked_at"] = record.created_at

        reason_code = resolve_reason_code(record)
        if reason_code is not None:
            reason_bucket = reason_buckets[reason_code]
            reason_bucket["count"] += 1
            if reason_bucket["last_invoked_at"] is None:
                reason_bucket["last_invoked_at"] = record.created_at
                reason_bucket["last_status"] = record.status

    reason_counts = sorted(
        _build_facets_from_buckets(reason_buckets, include_zero_values=True),
        key=lambda item: (
            -item.count,
            -(item.last_invoked_at.timestamp() if item.last_invoked_at else 0),
            item.value,
        ),
    )
    recent_failure_reasons = sorted(
        (
            PublishedInvocationFailureReason(
                message=message,
                count=int(bucket["count"]),
                last_invoked_at=bucket["last_invoked_at"],
            )
            for message, bucket in failure_reason_buckets.items()
        ),
        key=lambda item: (
            -item.count,
            -(item.last_invoked_at.timestamp() if item.last_invoked_at else 0),
            item.message,
        ),
    )[:5]
    return PublishedInvocationAuditFacets(
        status_counts=_build_facets_from_buckets(
            status_buckets,
            include_zero_values=True,
        ),
        request_source_counts=_build_facets_from_buckets(
            request_source_buckets,
            include_zero_values=True,
        ),
        request_surface_counts=_build_facets_from_buckets(request_surface_buckets),
        cache_status_counts=_build_facets_from_buckets(
            cache_status_buckets,
            include_zero_values=True,
        ),
        run_status_counts=_build_facets_from_buckets(run_status_buckets),
        reason_counts=reason_counts,
        recent_failure_reasons=recent_failure_reasons,
        api_key_buckets=dict(api_key_buckets),
    )


def build_api_key_usage(
    api_key_buckets: dict[str, FacetBucket],
    *,
    api_key_lookup: dict[str, WorkflowPublishedApiKey],
) -> list[PublishedInvocationApiKeyUsage]:
    api_key_usage: list[PublishedInvocationApiKeyUsage] = []
    for api_key_id, bucket in api_key_buckets.items():
        key_record = api_key_lookup.get(api_key_id)
        api_key_usage.append(
            PublishedInvocationApiKeyUsage(
                api_key_id=api_key_id,
                name=key_record.name if key_record else None,
                key_prefix=key_record.key_prefix if key_record else None,
                status=key_record.status if key_record else None,
                invocation_count=int(bucket["count"]),
                succeeded_count=int(bucket["succeeded_count"]),
                failed_count=int(bucket["failed_count"]),
                rejected_count=int(bucket["rejected_count"]),
                last_invoked_at=bucket["last_invoked_at"],
                last_status=bucket["last_status"],
            )
        )
    api_key_usage.sort(
        key=lambda item: (
            -item.invocation_count,
            -(item.last_invoked_at.timestamp() if item.last_invoked_at else 0),
            item.api_key_id,
        ),
    )
    return api_key_usage


def summarize_records_for_bindings(
    records: list[WorkflowPublishedInvocation],
) -> dict[str, PublishedInvocationSummary]:
    counts_by_binding: dict[str, dict[str, int]] = defaultdict(_build_summary_counts)
    last_record_by_binding: dict[str, WorkflowPublishedInvocation] = {}

    for record in records:
        _increment_summary_counts(counts_by_binding[record.binding_id], record=record)
        last_record_by_binding.setdefault(record.binding_id, record)

    return {
        binding_id: _build_summary(
            counts,
            last_record=last_record_by_binding.get(binding_id),
        )
        for binding_id, counts in counts_by_binding.items()
    }
