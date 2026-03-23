"""Published invocation type definitions, constants and classifiers.

Extracted from ``published_invocations.py`` to keep the main service file
focused on query, record and audit orchestration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Ordered constants
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


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
    approval_ticket_count: int = 0
    pending_approval_count: int = 0
    approved_approval_count: int = 0
    rejected_approval_count: int = 0
    expired_approval_count: int = 0
    pending_notification_count: int = 0
    delivered_notification_count: int = 0
    failed_notification_count: int = 0


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
    last_reason_code: str | None = None


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


# ---------------------------------------------------------------------------
# Reason classifier
# ---------------------------------------------------------------------------


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
    if "stream" in message and "not supported" in message:
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
