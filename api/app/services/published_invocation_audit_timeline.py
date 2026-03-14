"""Published invocation audit timeline helpers.

Keeps timeline bucket construction separate from the main audit mixin so
publish governance aggregation can continue to evolve in smaller modules.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from app.models.workflow import WorkflowPublishedApiKey, WorkflowPublishedInvocation
from app.services.published_invocation_types import (
    CACHE_STATUS_ORDER,
    REQUEST_SURFACE_ORDER,
    RUN_STATUS_ORDER,
    PublishedInvocationApiKeyBucketFacet,
    PublishedInvocationBucketFacet,
    PublishedInvocationRequestSurface,
    PublishedInvocationTimeBucket,
)

ResolveRequestSurface = Callable[
    [WorkflowPublishedInvocation],
    PublishedInvocationRequestSurface,
]
ResolveReasonCode = Callable[[WorkflowPublishedInvocation], str | None]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def resolve_timeline_granularity(
    *,
    created_from: datetime | None,
    created_to: datetime | None,
    records: list[WorkflowPublishedInvocation],
) -> Literal["hour", "day"]:
    normalized_from = _as_utc(created_from) if created_from is not None else None
    normalized_to = _as_utc(created_to) if created_to is not None else None

    if normalized_from is not None and normalized_to is not None:
        return "hour" if normalized_to - normalized_from <= timedelta(days=2) else "day"

    if records:
        last_record_at = _as_utc(records[0].created_at)
        first_record_at = _as_utc(records[-1].created_at)
        return "hour" if last_record_at - first_record_at <= timedelta(days=2) else "day"

    return "day"


def _truncate_bucket_start(
    value: datetime,
    *,
    granularity: Literal["hour", "day"],
) -> datetime:
    normalized = _as_utc(value)
    if granularity == "hour":
        return normalized.replace(minute=0, second=0, microsecond=0)
    return normalized.replace(hour=0, minute=0, second=0, microsecond=0)


def _build_bucket_facets(
    counts: dict[str, int],
    *,
    ordered_values: tuple[str, ...] | None = None,
    include_zero_values: bool = False,
) -> list[PublishedInvocationBucketFacet]:
    if ordered_values is not None:
        return [
            PublishedInvocationBucketFacet(value=value, count=counts[value])
            for value in ordered_values
            if include_zero_values or counts.get(value, 0) > 0
        ]

    return [
        PublishedInvocationBucketFacet(value=value, count=count)
        for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        if count > 0
    ]


def _build_api_key_bucket_facets(
    counts: dict[str, int],
    *,
    api_key_lookup: dict[str, WorkflowPublishedApiKey],
    limit: int = 3,
) -> list[PublishedInvocationApiKeyBucketFacet]:
    items = sorted(
        (
            (
                api_key_id,
                count,
                api_key_lookup.get(api_key_id),
            )
            for api_key_id, count in counts.items()
            if count > 0
        ),
        key=lambda item: (
            -item[1],
            item[2].name if item[2] and item[2].name else "",
            item[2].key_prefix if item[2] and item[2].key_prefix else "",
            item[0],
        ),
    )
    return [
        PublishedInvocationApiKeyBucketFacet(
            api_key_id=api_key_id,
            name=key_record.name if key_record else None,
            key_prefix=key_record.key_prefix if key_record else None,
            count=count,
        )
        for api_key_id, count, key_record in items[:limit]
    ]


def _build_run_status_bucket_facets(
    counts: dict[str, int],
) -> list[PublishedInvocationBucketFacet]:
    ordered_values = [value for value in RUN_STATUS_ORDER if counts.get(value, 0) > 0]
    extras = sorted(
        value
        for value, count in counts.items()
        if count > 0 and value not in RUN_STATUS_ORDER
    )
    return _build_bucket_facets(
        counts,
        ordered_values=tuple([*ordered_values, *extras]) if ordered_values or extras else None,
    )


def build_timeline(
    records: list[WorkflowPublishedInvocation],
    *,
    granularity: Literal["hour", "day"],
    api_key_lookup: dict[str, WorkflowPublishedApiKey],
    resolve_request_surface: ResolveRequestSurface,
    resolve_reason_code: ResolveReasonCode,
) -> list[PublishedInvocationTimeBucket]:
    if not records:
        return []

    bucket_size = timedelta(hours=1 if granularity == "hour" else 24)
    buckets: dict[datetime, dict[str, Any]] = {}

    for record in records:
        bucket_start = _truncate_bucket_start(record.created_at, granularity=granularity)
        bucket = buckets.setdefault(
            bucket_start,
            {
                "total_count": 0,
                "succeeded_count": 0,
                "failed_count": 0,
                "rejected_count": 0,
                "api_key_counts": defaultdict(int),
                "cache_status_counts": defaultdict(int),
                "run_status_counts": defaultdict(int),
                "request_surface_counts": defaultdict(int),
                "reason_counts": defaultdict(int),
            },
        )
        bucket["total_count"] += 1
        bucket[f"{record.status}_count"] += 1
        if record.api_key_id:
            bucket["api_key_counts"][record.api_key_id] += 1
        bucket["cache_status_counts"][record.cache_status or "bypass"] += 1
        if record.run_status:
            bucket["run_status_counts"][record.run_status] += 1
        bucket["request_surface_counts"][resolve_request_surface(record)] += 1

        reason_code = resolve_reason_code(record)
        if reason_code is not None:
            bucket["reason_counts"][reason_code] += 1

    return [
        PublishedInvocationTimeBucket(
            bucket_start=bucket_start,
            bucket_end=bucket_start + bucket_size,
            total_count=int(counts["total_count"]),
            succeeded_count=int(counts["succeeded_count"]),
            failed_count=int(counts["failed_count"]),
            rejected_count=int(counts["rejected_count"]),
            api_key_counts=_build_api_key_bucket_facets(
                counts["api_key_counts"],
                api_key_lookup=api_key_lookup,
            ),
            cache_status_counts=_build_bucket_facets(
                counts["cache_status_counts"],
                ordered_values=CACHE_STATUS_ORDER,
                include_zero_values=True,
            ),
            run_status_counts=_build_run_status_bucket_facets(counts["run_status_counts"]),
            request_surface_counts=_build_bucket_facets(
                counts["request_surface_counts"],
                ordered_values=REQUEST_SURFACE_ORDER,
            ),
            reason_counts=_build_bucket_facets(counts["reason_counts"]),
        )
        for bucket_start, counts in sorted(buckets.items(), reverse=True)
    ]
