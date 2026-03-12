from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.workflow import (
    WorkflowPublishedApiKey,
    WorkflowPublishedEndpoint,
    WorkflowPublishedInvocation,
)

PublishedInvocationRequestSource = Literal["workflow", "alias", "path"]
PublishedInvocationStatus = Literal["succeeded", "failed", "rejected"]
PublishedInvocationCacheStatus = Literal["hit", "miss", "bypass"]
PublishedInvocationRequestSurface = Literal[
    "native.workflow",
    "native.workflow.async",
    "native.alias",
    "native.alias.async",
    "native.path",
    "native.path.async",
    "openai.chat.completions",
    "openai.chat.completions.async",
    "openai.responses",
    "openai.responses.async",
    "openai.unknown",
    "anthropic.messages",
    "anthropic.messages.async",
    "unknown",
]
PublishedInvocationReasonCode = Literal[
    "api_key_invalid",
    "api_key_required",
    "auth_mode_unsupported",
    "binding_inactive",
    "compiled_blueprint_missing",
    "protocol_mismatch",
    "rate_limit_exceeded",
    "rejected_other",
    "run_status_unsupported",
    "runtime_failed",
    "streaming_unsupported",
    "sync_waiting_unsupported",
    "target_version_missing",
    "unknown",
    "workflow_missing",
]
REQUEST_SURFACE_ORDER: tuple[PublishedInvocationRequestSurface, ...] = (
    "native.workflow",
    "native.workflow.async",
    "native.alias",
    "native.alias.async",
    "native.path",
    "native.path.async",
    "openai.chat.completions",
    "openai.chat.completions.async",
    "openai.responses",
    "openai.responses.async",
    "openai.unknown",
    "anthropic.messages",
    "anthropic.messages.async",
    "unknown",
)
CACHE_STATUS_ORDER: tuple[PublishedInvocationCacheStatus, ...] = (
    "hit",
    "miss",
    "bypass",
)
RUN_STATUS_ORDER: tuple[str, ...] = (
    "queued",
    "running",
    "waiting",
    "waiting_input",
    "waiting_callback",
    "succeeded",
    "failed",
    "canceled",
    "timed_out",
)


def classify_invocation_reason(
    *,
    status: PublishedInvocationStatus,
    error_message: str | None,
    run_status: str | None = None,
) -> str | None:
    if status == "succeeded":
        return None

    message = (error_message or "").strip().lower()
    if "rate limit exceeded" in message:
        return "rate_limit_exceeded"
    if "api key is invalid" in message:
        return "api_key_invalid"
    if "api key is required" in message:
        return "api_key_required"
    if "entered waiting state" in message:
        return "sync_waiting_unsupported"
    if "stream" in message and "not supported yet" in message:
        return "streaming_unsupported"
    if "auth mode" in message and "is not supported yet" in message:
        return "auth_mode_unsupported"
    if "uses protocol" in message and "not" in message:
        return "protocol_mismatch"
    if "not currently active" in message:
        return "binding_inactive"
    if "workflow not found" in message:
        return "workflow_missing"
    if "target workflow version is missing" in message:
        return "target_version_missing"
    if "compiled blueprint is missing" in message:
        return "compiled_blueprint_missing"
    if "unsupported run status" in message:
        return "run_status_unsupported"
    if run_status == "failed" or status == "failed":
        return "runtime_failed"
    if status == "rejected":
        return "rejected_other"
    return "unknown"


@dataclass(frozen=True)
class PublishedInvocationSummary:
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    cache_hit_count: int = 0
    cache_miss_count: int = 0
    cache_bypass_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedInvocationStatus | None = None
    last_cache_status: PublishedInvocationCacheStatus | None = None
    last_run_id: str | None = None
    last_run_status: str | None = None
    last_reason_code: str | None = None


@dataclass(frozen=True)
class PublishedInvocationFacet:
    value: str
    count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedInvocationStatus | None = None


@dataclass(frozen=True)
class PublishedInvocationApiKeyUsage:
    api_key_id: str
    name: str | None = None
    key_prefix: str | None = None
    status: str | None = None
    invocation_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedInvocationStatus | None = None


@dataclass(frozen=True)
class PublishedInvocationFailureReason:
    message: str
    count: int = 0
    last_invoked_at: datetime | None = None


@dataclass(frozen=True)
class PublishedInvocationBucketFacet:
    value: str
    count: int = 0


@dataclass(frozen=True)
class PublishedInvocationApiKeyBucketFacet:
    api_key_id: str
    name: str | None = None
    key_prefix: str | None = None
    count: int = 0


@dataclass(frozen=True)
class PublishedInvocationTimeBucket:
    bucket_start: datetime
    bucket_end: datetime
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    api_key_counts: list[PublishedInvocationApiKeyBucketFacet] = field(
        default_factory=list
    )
    cache_status_counts: list[PublishedInvocationBucketFacet] = field(default_factory=list)
    run_status_counts: list[PublishedInvocationBucketFacet] = field(default_factory=list)
    request_surface_counts: list[PublishedInvocationBucketFacet] = field(
        default_factory=list
    )
    reason_counts: list[PublishedInvocationBucketFacet] = field(default_factory=list)


@dataclass(frozen=True)
class PublishedInvocationAudit:
    summary: PublishedInvocationSummary
    status_counts: list[PublishedInvocationFacet]
    request_source_counts: list[PublishedInvocationFacet]
    request_surface_counts: list[PublishedInvocationFacet]
    cache_status_counts: list[PublishedInvocationFacet]
    run_status_counts: list[PublishedInvocationFacet]
    reason_counts: list[PublishedInvocationFacet]
    api_key_usage: list[PublishedInvocationApiKeyUsage]
    recent_failure_reasons: list[PublishedInvocationFailureReason]
    timeline_granularity: Literal["hour", "day"]
    timeline: list[PublishedInvocationTimeBucket]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _build_payload_preview(payload: dict) -> dict:
    keys = sorted(payload.keys())
    preview: dict[str, object] = {
        "key_count": len(keys),
        "keys": keys[:10],
    }

    scalar_preview: dict[str, object] = {}
    for key in keys[:5]:
        value = payload.get(key)
        if value is None or isinstance(value, (bool, int, float)):
            scalar_preview[key] = value
            continue
        if isinstance(value, str):
            scalar_preview[key] = value[:120]
            continue
        if isinstance(value, list):
            scalar_preview[key] = {
                "type": "list",
                "length": len(value),
            }
            continue
        if isinstance(value, dict):
            nested_keys = sorted(value.keys())
            scalar_preview[key] = {
                "type": "object",
                "key_count": len(nested_keys),
                "keys": nested_keys[:5],
            }
            continue
        scalar_preview[key] = {"type": type(value).__name__}

    if scalar_preview:
        preview["sample"] = scalar_preview
    return preview


def _resolve_record_reason_code(
    record: WorkflowPublishedInvocation,
) -> PublishedInvocationReasonCode | None:
    return classify_invocation_reason(
        status=record.status,
        error_message=record.error_message,
        run_status=record.run_status,
    )


def _resolve_request_surface(
    record: WorkflowPublishedInvocation,
) -> PublishedInvocationRequestSurface:
    surface_hint = record.request_preview.get("surface_hint")
    if isinstance(surface_hint, str) and surface_hint in REQUEST_SURFACE_ORDER:
        return surface_hint

    if record.protocol == "native":
        if record.request_source == "workflow":
            return "native.workflow"
        if record.request_source == "alias":
            return "native.alias"
        if record.request_source == "path":
            return "native.path"
        return "unknown"

    request_keys = set(record.request_preview.get("keys") or [])
    if record.protocol == "openai":
        if "messages" in request_keys:
            return "openai.chat.completions"
        if "input" in request_keys:
            return "openai.responses"
        return "openai.unknown"

    if record.protocol == "anthropic":
        return "anthropic.messages"

    return "unknown"


def _summarize_records(
    records: list[WorkflowPublishedInvocation],
) -> PublishedInvocationSummary:
    if not records:
        return PublishedInvocationSummary()

    counts = {
        "total_count": 0,
        "succeeded_count": 0,
        "failed_count": 0,
        "rejected_count": 0,
        "cache_hit_count": 0,
        "cache_miss_count": 0,
        "cache_bypass_count": 0,
    }
    last_record = records[0]
    for record in records:
        counts["total_count"] += 1
        counts[f"{record.status}_count"] += 1
        cache_status = record.cache_status or "bypass"
        counts[f"cache_{cache_status}_count"] += 1

    return PublishedInvocationSummary(
        total_count=counts["total_count"],
        succeeded_count=counts["succeeded_count"],
        failed_count=counts["failed_count"],
        rejected_count=counts["rejected_count"],
        cache_hit_count=counts["cache_hit_count"],
        cache_miss_count=counts["cache_miss_count"],
        cache_bypass_count=counts["cache_bypass_count"],
        last_invoked_at=last_record.created_at,
        last_status=last_record.status,
        last_cache_status=last_record.cache_status or "bypass",
        last_run_id=last_record.run_id,
        last_run_status=last_record.run_status,
        last_reason_code=classify_invocation_reason(
            status=last_record.status,
            error_message=last_record.error_message,
            run_status=last_record.run_status,
        ),
    )


def _resolve_timeline_granularity(
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
    extras = sorted(value for value, count in counts.items() if count > 0 and value not in RUN_STATUS_ORDER)
    return _build_bucket_facets(
        counts,
        ordered_values=tuple([*ordered_values, *extras]) if ordered_values or extras else None,
    )


def _build_timeline(
    records: list[WorkflowPublishedInvocation],
    *,
    granularity: Literal["hour", "day"],
    api_key_lookup: dict[str, WorkflowPublishedApiKey],
) -> list[PublishedInvocationTimeBucket]:
    if not records:
        return []

    bucket_size = timedelta(hours=1 if granularity == "hour" else 24)
    buckets: dict[datetime, dict[str, object]] = {}

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
        bucket["request_surface_counts"][_resolve_request_surface(record)] += 1

        reason_code = _resolve_record_reason_code(record)
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


class PublishedInvocationService:
    def resolve_request_surface(
        self,
        record: WorkflowPublishedInvocation,
    ) -> PublishedInvocationRequestSurface:
        return _resolve_request_surface(record)

    def count_recent_for_binding(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        created_from: datetime,
        statuses: tuple[PublishedInvocationStatus, ...] = ("succeeded", "failed"),
    ) -> int:
        return (
            db.scalar(
                select(func.count())
                .select_from(WorkflowPublishedInvocation)
                .where(
                    WorkflowPublishedInvocation.workflow_id == workflow_id,
                    WorkflowPublishedInvocation.binding_id == binding_id,
                    WorkflowPublishedInvocation.created_at >= _as_utc(created_from),
                    WorkflowPublishedInvocation.status.in_(statuses),
                )
            )
            or 0
        )

    def _build_binding_statement(
        self,
        *,
        workflow_id: str,
        binding_id: str,
        status: PublishedInvocationStatus | None = None,
        request_source: PublishedInvocationRequestSource | None = None,
        cache_status: PublishedInvocationCacheStatus | None = None,
        run_status: str | None = None,
        api_key_id: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ):
        statement = select(WorkflowPublishedInvocation).where(
            WorkflowPublishedInvocation.workflow_id == workflow_id,
            WorkflowPublishedInvocation.binding_id == binding_id,
        )
        if status is not None:
            statement = statement.where(WorkflowPublishedInvocation.status == status)
        if request_source is not None:
            statement = statement.where(
                WorkflowPublishedInvocation.request_source == request_source
            )
        if cache_status is not None:
            statement = statement.where(
                WorkflowPublishedInvocation.cache_status == cache_status
            )
        if run_status is not None:
            statement = statement.where(WorkflowPublishedInvocation.run_status == run_status)
        if api_key_id is not None:
            statement = statement.where(WorkflowPublishedInvocation.api_key_id == api_key_id)
        if created_from is not None:
            statement = statement.where(
                WorkflowPublishedInvocation.created_at >= _as_utc(created_from)
            )
        if created_to is not None:
            statement = statement.where(
                WorkflowPublishedInvocation.created_at <= _as_utc(created_to)
            )
        return statement

    def _list_binding_records(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        status: PublishedInvocationStatus | None = None,
        request_source: PublishedInvocationRequestSource | None = None,
        request_surface: PublishedInvocationRequestSurface | None = None,
        cache_status: PublishedInvocationCacheStatus | None = None,
        run_status: str | None = None,
        api_key_id: str | None = None,
        reason_code: PublishedInvocationReasonCode | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        limit: int | None = None,
    ) -> list[WorkflowPublishedInvocation]:
        statement = self._build_binding_statement(
            workflow_id=workflow_id,
            binding_id=binding_id,
            status=status,
            request_source=request_source,
            cache_status=cache_status,
            run_status=run_status,
            api_key_id=api_key_id,
            created_from=created_from,
            created_to=created_to,
        ).order_by(
            WorkflowPublishedInvocation.created_at.desc(),
            WorkflowPublishedInvocation.id.desc(),
        )

        if reason_code is None and request_surface is None and limit is not None:
            return db.scalars(statement.limit(limit)).all()

        records = db.scalars(statement).all()
        if request_surface is not None:
            records = [
                record
                for record in records
                if _resolve_request_surface(record) == request_surface
            ]
        if reason_code is not None:
            records = [
                record
                for record in records
                if _resolve_record_reason_code(record) == reason_code
            ]
        if limit is not None:
            return records[:limit]
        return records

    def record_invocation(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
        request_source: PublishedInvocationRequestSource,
        input_payload: dict,
        status: PublishedInvocationStatus,
        cache_status: PublishedInvocationCacheStatus = "bypass",
        request_surface_override: PublishedInvocationRequestSurface | None = None,
        api_key_id: str | None = None,
        run_id: str | None = None,
        run_status: str | None = None,
        response_payload: dict | None = None,
        error_message: str | None = None,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
    ) -> WorkflowPublishedInvocation:
        effective_started_at = started_at or _utcnow()
        effective_finished_at = finished_at or _utcnow()
        duration_ms = max(
            int((effective_finished_at - effective_started_at).total_seconds() * 1000),
            0,
        )
        request_preview = _build_payload_preview(input_payload)
        if request_surface_override is not None:
            request_preview["surface_hint"] = request_surface_override

        record = WorkflowPublishedInvocation(
            id=str(uuid4()),
            workflow_id=binding.workflow_id,
            binding_id=binding.id,
            endpoint_id=binding.endpoint_id,
            endpoint_alias=binding.endpoint_alias,
            route_path=binding.route_path,
            protocol=binding.protocol,
            auth_mode=binding.auth_mode,
            request_source=request_source,
            status=status,
            cache_status=cache_status,
            api_key_id=api_key_id,
            run_id=run_id,
            run_status=run_status,
            error_message=error_message[:512] if error_message else None,
            request_preview=request_preview,
            response_preview=(
                _build_payload_preview(response_payload)
                if isinstance(response_payload, dict)
                else response_payload
            ),
            duration_ms=duration_ms,
            created_at=effective_started_at,
            finished_at=effective_finished_at,
        )
        db.add(record)
        db.flush()
        return record

    def list_for_binding(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        status: PublishedInvocationStatus | None = None,
        request_source: PublishedInvocationRequestSource | None = None,
        request_surface: PublishedInvocationRequestSurface | None = None,
        cache_status: PublishedInvocationCacheStatus | None = None,
        run_status: str | None = None,
        api_key_id: str | None = None,
        reason_code: PublishedInvocationReasonCode | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        limit: int = 20,
    ) -> list[WorkflowPublishedInvocation]:
        return self._list_binding_records(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
            status=status,
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

    def build_binding_audit(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        status: PublishedInvocationStatus | None = None,
        request_source: PublishedInvocationRequestSource | None = None,
        request_surface: PublishedInvocationRequestSurface | None = None,
        cache_status: PublishedInvocationCacheStatus | None = None,
        run_status: str | None = None,
        api_key_id: str | None = None,
        reason_code: PublishedInvocationReasonCode | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> PublishedInvocationAudit:
        records = self._list_binding_records(
            db,
            workflow_id=workflow_id,
            binding_id=binding_id,
            status=status,
            request_source=request_source,
            request_surface=request_surface,
            cache_status=cache_status,
            run_status=run_status,
            api_key_id=api_key_id,
            reason_code=reason_code,
            created_from=created_from,
            created_to=created_to,
        )
        summary = _summarize_records(records)

        status_buckets: dict[str, dict[str, object]] = {
            "succeeded": {"count": 0, "last_invoked_at": None, "last_status": None},
            "failed": {"count": 0, "last_invoked_at": None, "last_status": None},
            "rejected": {"count": 0, "last_invoked_at": None, "last_status": None},
        }
        request_source_buckets: dict[str, dict[str, object]] = {
            "workflow": {"count": 0, "last_invoked_at": None, "last_status": None},
            "alias": {"count": 0, "last_invoked_at": None, "last_status": None},
            "path": {"count": 0, "last_invoked_at": None, "last_status": None},
        }
        request_surface_buckets: dict[str, dict[str, object]] = {
            "native.workflow": {"count": 0, "last_invoked_at": None, "last_status": None},
            "native.workflow.async": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "native.alias": {"count": 0, "last_invoked_at": None, "last_status": None},
            "native.alias.async": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "native.path": {"count": 0, "last_invoked_at": None, "last_status": None},
            "native.path.async": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "openai.chat.completions": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "openai.chat.completions.async": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "openai.responses": {"count": 0, "last_invoked_at": None, "last_status": None},
            "openai.responses.async": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "openai.unknown": {"count": 0, "last_invoked_at": None, "last_status": None},
            "anthropic.messages": {"count": 0, "last_invoked_at": None, "last_status": None},
            "anthropic.messages.async": {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            },
            "unknown": {"count": 0, "last_invoked_at": None, "last_status": None},
        }
        cache_status_buckets: dict[str, dict[str, object]] = {
            "hit": {"count": 0, "last_invoked_at": None, "last_status": None},
            "miss": {"count": 0, "last_invoked_at": None, "last_status": None},
            "bypass": {"count": 0, "last_invoked_at": None, "last_status": None},
        }
        run_status_buckets: dict[str, dict[str, object]] = {
            value: {"count": 0, "last_invoked_at": None, "last_status": None}
            for value in RUN_STATUS_ORDER
        }
        api_key_buckets: dict[str, dict[str, object]] = defaultdict(
            lambda: {
                "count": 0,
                "succeeded_count": 0,
                "failed_count": 0,
                "rejected_count": 0,
                "last_invoked_at": None,
                "last_status": None,
            }
        )
        failure_reason_buckets: dict[str, dict[str, object]] = defaultdict(
            lambda: {
                "count": 0,
                "last_invoked_at": None,
            }
        )
        reason_buckets: dict[str, dict[str, object]] = defaultdict(
            lambda: {
                "count": 0,
                "last_invoked_at": None,
                "last_status": None,
            }
        )

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

            request_surface = _resolve_request_surface(record)
            surface_bucket = request_surface_buckets[request_surface]
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
                    {"count": 0, "last_invoked_at": None, "last_status": None},
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

            reason_code = _resolve_record_reason_code(record)
            if reason_code is not None:
                reason_bucket = reason_buckets[reason_code]
                reason_bucket["count"] += 1
                if reason_bucket["last_invoked_at"] is None:
                    reason_bucket["last_invoked_at"] = record.created_at
                    reason_bucket["last_status"] = record.status

        api_key_lookup: dict[str, WorkflowPublishedApiKey] = {}
        if api_key_buckets:
            api_key_records = db.scalars(
                select(WorkflowPublishedApiKey).where(
                    WorkflowPublishedApiKey.id.in_(list(api_key_buckets.keys()))
                )
            ).all()
            api_key_lookup = {record.id: record for record in api_key_records}

        status_counts = [
            PublishedInvocationFacet(
                value=value,
                count=int(bucket["count"]),
                last_invoked_at=bucket["last_invoked_at"],
                last_status=bucket["last_status"],
            )
            for value, bucket in status_buckets.items()
        ]
        request_source_counts = [
            PublishedInvocationFacet(
                value=value,
                count=int(bucket["count"]),
                last_invoked_at=bucket["last_invoked_at"],
                last_status=bucket["last_status"],
            )
            for value, bucket in request_source_buckets.items()
        ]
        request_surface_counts = [
            PublishedInvocationFacet(
                value=value,
                count=int(bucket["count"]),
                last_invoked_at=bucket["last_invoked_at"],
                last_status=bucket["last_status"],
            )
            for value, bucket in request_surface_buckets.items()
            if int(bucket["count"]) > 0
        ]
        cache_status_counts = [
            PublishedInvocationFacet(
                value=value,
                count=int(bucket["count"]),
                last_invoked_at=bucket["last_invoked_at"],
                last_status=bucket["last_status"],
            )
            for value, bucket in cache_status_buckets.items()
        ]
        run_status_counts = [
            PublishedInvocationFacet(
                value=value,
                count=int(bucket["count"]),
                last_invoked_at=bucket["last_invoked_at"],
                last_status=bucket["last_status"],
            )
            for value, bucket in run_status_buckets.items()
            if int(bucket["count"]) > 0
        ]
        reason_counts = sorted(
            (
                PublishedInvocationFacet(
                    value=value,
                    count=int(bucket["count"]),
                    last_invoked_at=bucket["last_invoked_at"],
                    last_status=bucket["last_status"],
                )
                for value, bucket in reason_buckets.items()
            ),
            key=lambda item: (
                -item.count,
                -(item.last_invoked_at.timestamp() if item.last_invoked_at else 0),
                item.value,
            ),
        )
        api_key_usage: list[PublishedInvocationApiKeyUsage] = []
        for key_id, bucket in api_key_buckets.items():
            key_record = api_key_lookup.get(key_id)
            api_key_usage.append(
                PublishedInvocationApiKeyUsage(
                    api_key_id=key_id,
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
        timeline_granularity = _resolve_timeline_granularity(
            created_from=created_from,
            created_to=created_to,
            records=records,
        )

        return PublishedInvocationAudit(
            summary=summary,
            status_counts=status_counts,
            request_source_counts=request_source_counts,
            request_surface_counts=request_surface_counts,
            cache_status_counts=cache_status_counts,
            run_status_counts=run_status_counts,
            reason_counts=reason_counts,
            api_key_usage=api_key_usage,
            recent_failure_reasons=recent_failure_reasons,
            timeline_granularity=timeline_granularity,
            timeline=_build_timeline(
                records,
                granularity=timeline_granularity,
                api_key_lookup=api_key_lookup,
            ),
        )

    def summarize_for_bindings(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_ids: list[str],
    ) -> dict[str, PublishedInvocationSummary]:
        if not binding_ids:
            return {}

        records = db.scalars(
            select(WorkflowPublishedInvocation)
            .where(
                WorkflowPublishedInvocation.workflow_id == workflow_id,
                WorkflowPublishedInvocation.binding_id.in_(binding_ids),
            )
            .order_by(
                WorkflowPublishedInvocation.created_at.desc(),
                WorkflowPublishedInvocation.id.desc(),
            )
        ).all()

        summaries: dict[str, PublishedInvocationSummary] = {}
        counts: dict[str, dict[str, int]] = {}
        last_seen: set[str] = set()

        for record in records:
            bucket = counts.setdefault(
                record.binding_id,
                {
                    "total_count": 0,
                    "succeeded_count": 0,
                    "failed_count": 0,
                    "rejected_count": 0,
                    "cache_hit_count": 0,
                    "cache_miss_count": 0,
                    "cache_bypass_count": 0,
                },
            )
            bucket["total_count"] += 1
            bucket[f"{record.status}_count"] += 1
            cache_status = record.cache_status or "bypass"
            bucket[f"cache_{cache_status}_count"] += 1

            if record.binding_id in last_seen:
                continue

            summaries[record.binding_id] = PublishedInvocationSummary(
                total_count=bucket["total_count"],
                succeeded_count=bucket["succeeded_count"],
                failed_count=bucket["failed_count"],
                rejected_count=bucket["rejected_count"],
                cache_hit_count=bucket["cache_hit_count"],
                cache_miss_count=bucket["cache_miss_count"],
                cache_bypass_count=bucket["cache_bypass_count"],
                last_invoked_at=record.created_at,
                last_status=record.status,
                last_cache_status=record.cache_status or "bypass",
                last_run_id=record.run_id,
                last_run_status=record.run_status,
                last_reason_code=classify_invocation_reason(
                    status=record.status,
                    error_message=record.error_message,
                    run_status=record.run_status,
                ),
            )
            last_seen.add(record.binding_id)

        for binding_id, bucket in counts.items():
            existing = summaries.get(binding_id)
            if existing is None:
                summaries[binding_id] = PublishedInvocationSummary(
                    total_count=bucket["total_count"],
                    succeeded_count=bucket["succeeded_count"],
                    failed_count=bucket["failed_count"],
                    rejected_count=bucket["rejected_count"],
                    cache_hit_count=bucket["cache_hit_count"],
                    cache_miss_count=bucket["cache_miss_count"],
                    cache_bypass_count=bucket["cache_bypass_count"],
                )
                continue
            summaries[binding_id] = PublishedInvocationSummary(
                total_count=bucket["total_count"],
                succeeded_count=bucket["succeeded_count"],
                failed_count=bucket["failed_count"],
                rejected_count=bucket["rejected_count"],
                cache_hit_count=bucket["cache_hit_count"],
                cache_miss_count=bucket["cache_miss_count"],
                cache_bypass_count=bucket["cache_bypass_count"],
                last_invoked_at=existing.last_invoked_at,
                last_status=existing.last_status,
                last_cache_status=existing.last_cache_status,
                last_run_id=existing.last_run_id,
                last_run_status=existing.last_run_status,
                last_reason_code=existing.last_reason_code,
            )

        return summaries
