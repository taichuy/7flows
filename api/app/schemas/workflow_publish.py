from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.operator_follow_up import OperatorRunFollowUpSummary, OperatorRunSnapshot
from app.schemas.run import RunDetail
from app.schemas.run_views import (
    CallbackWaitingLifecycleSummary,
    RunCallbackTicketItem,
    RunExecutionFocusExplanation,
    RunExecutionNodeItem,
    SkillReferenceLoadItem,
)
from app.schemas.sensitive_access import SensitiveAccessTimelineEntryItem
from app.schemas.workflow_published_endpoint import (
    WorkflowPublishedEndpointCachePolicy,
    WorkflowPublishedEndpointRateLimitPolicy,
)

PublishedEndpointLifecycleStatus = Literal["draft", "published", "offline"]
PublishedEndpointApiKeyStatus = Literal["active", "revoked"]
PublishedEndpointInvocationStatus = Literal["succeeded", "failed", "rejected"]
PublishedEndpointInvocationRequestSource = Literal["workflow", "alias", "path"]
PublishedEndpointInvocationCacheStatus = Literal["hit", "miss", "bypass"]
PublishedEndpointInvocationRequestSurface = Literal[
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
PublishedEndpointInvocationReasonCode = Literal[
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
PublishedEndpointInvocationTimeBucketGranularity = Literal["hour", "day"]
PublishedEndpointIssueCategory = Literal["unsupported_auth_mode"]
WorkflowPublishedEndpointLegacyAuthCleanupSkipReason = Literal[
    "binding_not_found",
    "binding_not_legacy_auth",
    "binding_not_draft",
    "binding_already_offline",
]


class WorkflowPublishedEndpointLifecycleUpdate(BaseModel):
    status: Literal["published", "offline"]


class WorkflowPublishedEndpointLegacyAuthCleanupRequest(BaseModel):
    binding_ids: list[str] = Field(default_factory=list, min_length=1)


class WorkflowPublishedEndpointLegacyAuthCleanupSkipItem(BaseModel):
    binding_id: str
    endpoint_id: str | None = None
    endpoint_name: str | None = None
    workflow_version: str | None = None
    lifecycle_status: PublishedEndpointLifecycleStatus | None = None
    reason: WorkflowPublishedEndpointLegacyAuthCleanupSkipReason
    detail: str


class WorkflowPublishedEndpointLegacyAuthCleanupResult(BaseModel):
    requested_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    updated_binding_ids: list[str] = Field(default_factory=list)
    skipped_items: list[WorkflowPublishedEndpointLegacyAuthCleanupSkipItem] = Field(
        default_factory=list
    )


class WorkflowPublishedEndpointIssue(BaseModel):
    category: PublishedEndpointIssueCategory
    message: str
    field: str | None = None
    remediation: str | None = None
    blocks_lifecycle_publish: bool = False


class WorkflowPublishedEndpointItem(BaseModel):
    id: str
    workflow_id: str
    workflow_version_id: str
    workflow_version: str
    target_workflow_version_id: str
    target_workflow_version: str
    compiled_blueprint_id: str
    endpoint_id: str
    endpoint_name: str
    endpoint_alias: str
    route_path: str
    protocol: str
    auth_mode: str
    streaming: bool
    lifecycle_status: PublishedEndpointLifecycleStatus
    input_schema: dict
    output_schema: dict | None = None
    rate_limit_policy: WorkflowPublishedEndpointRateLimitPolicy | None = None
    cache_policy: WorkflowPublishedEndpointCachePolicy | None = None
    published_at: datetime | None = None
    unpublished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    activity: PublishedEndpointInvocationSummary | None = None
    cache_inventory: PublishedEndpointCacheInventorySummary | None = None
    issues: list[WorkflowPublishedEndpointIssue] = Field(default_factory=list)


class PublishedNativeRunRequest(BaseModel):
    input_payload: dict = Field(default_factory=dict)
    stream: bool = False


class PublishedNativeRunResponse(BaseModel):
    binding_id: str
    endpoint_id: str
    endpoint_name: str
    endpoint_alias: str
    route_path: str
    workflow_id: str
    workflow_version: str
    compiled_blueprint_id: str
    run: RunDetail


class PublishedProtocolAsyncRunResponse(BaseModel):
    binding_id: str
    endpoint_id: str
    endpoint_name: str
    endpoint_alias: str
    route_path: str
    protocol: Literal["openai", "anthropic"]
    request_surface: PublishedEndpointInvocationRequestSurface
    model: str
    workflow_id: str
    workflow_version: str
    compiled_blueprint_id: str
    run: RunDetail
    response_payload: dict[str, Any] | None = None


class OpenAIChatCompletionRequest(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    messages: list[dict[str, Any]] = Field(default_factory=list)
    stream: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    temperature: float | None = None


class OpenAIChatCompletionChoiceMessage(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class OpenAIChatCompletionChoice(BaseModel):
    index: int
    message: OpenAIChatCompletionChoiceMessage
    finish_reason: Literal["stop"] = "stop"


class OpenAIChatCompletionUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class OpenAIChatCompletionResponse(BaseModel):
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: list[OpenAIChatCompletionChoice]
    usage: OpenAIChatCompletionUsage = Field(
        default_factory=OpenAIChatCompletionUsage
    )


class OpenAIResponseRequest(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    input: Any
    stream: bool = False
    instructions: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OpenAIResponseOutputContent(BaseModel):
    type: Literal["output_text"] = "output_text"
    text: str
    annotations: list[dict[str, Any]] = Field(default_factory=list)


class OpenAIResponseMessage(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class OpenAIResponseOutputItem(BaseModel):
    id: str
    type: Literal["message"] = "message"
    status: Literal["completed"] = "completed"
    role: Literal["assistant"] = "assistant"
    content: list[OpenAIResponseOutputContent]
    message: OpenAIResponseMessage


class OpenAIResponseUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class OpenAIResponseResponse(BaseModel):
    id: str
    object: Literal["response"] = "response"
    created_at: int
    status: Literal["completed"] = "completed"
    model: str
    output: list[OpenAIResponseOutputItem]
    output_text: str
    usage: OpenAIResponseUsage = Field(default_factory=OpenAIResponseUsage)


class AnthropicMessageRequest(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    messages: list[dict[str, Any]] = Field(default_factory=list)
    max_tokens: int | None = Field(default=None, ge=1)
    stream: bool = False
    system: str | list[dict[str, Any]] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnthropicMessageResponseContentBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str


class AnthropicMessageResponseUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class AnthropicMessageResponse(BaseModel):
    id: str
    type: Literal["message"] = "message"
    role: Literal["assistant"] = "assistant"
    model: str
    content: list[AnthropicMessageResponseContentBlock]
    stop_reason: Literal["end_turn"] = "end_turn"
    stop_sequence: str | None = None
    usage: AnthropicMessageResponseUsage = Field(
        default_factory=AnthropicMessageResponseUsage
    )


class PublishedEndpointApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class PublishedEndpointApiKeyItem(BaseModel):
    id: str
    workflow_id: str
    endpoint_id: str
    name: str
    key_prefix: str
    status: PublishedEndpointApiKeyStatus
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PublishedEndpointApiKeyCreateResponse(PublishedEndpointApiKeyItem):
    secret_key: str


class PublishedEndpointInvocationSummary(BaseModel):
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    cache_hit_count: int = 0
    cache_miss_count: int = 0
    cache_bypass_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedEndpointInvocationStatus | None = None
    last_cache_status: PublishedEndpointInvocationCacheStatus | None = None
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


class PublishedEndpointInvocationWaitingLifecycle(BaseModel):
    node_run_id: str
    node_status: str
    waiting_reason: str | None = None
    callback_ticket_count: int = 0
    callback_ticket_status_counts: dict[str, int] = Field(default_factory=dict)
    callback_waiting_lifecycle: CallbackWaitingLifecycleSummary | None = None
    callback_waiting_explanation: RunExecutionFocusExplanation | None = None
    sensitive_access_summary: PublishedEndpointInvocationSensitiveAccessSummary | None = None
    scheduled_resume_delay_seconds: float | None = None
    scheduled_resume_reason: str | None = None
    scheduled_resume_source: str | None = None
    scheduled_waiting_status: str | None = None
    scheduled_resume_scheduled_at: datetime | None = None
    scheduled_resume_due_at: datetime | None = None
    scheduled_resume_requeued_at: datetime | None = None
    scheduled_resume_requeue_source: str | None = None


class PublishedEndpointInvocationSensitiveAccessSummary(BaseModel):
    request_count: int = 0
    approval_ticket_count: int = 0
    pending_approval_count: int = 0
    approved_approval_count: int = 0
    rejected_approval_count: int = 0
    expired_approval_count: int = 0
    pending_notification_count: int = 0
    delivered_notification_count: int = 0
    failed_notification_count: int = 0


class PublishedEndpointInvocationItem(BaseModel):
    id: str
    workflow_id: str
    binding_id: str
    endpoint_id: str
    endpoint_alias: str
    route_path: str
    protocol: str
    auth_mode: str
    request_source: PublishedEndpointInvocationRequestSource
    request_surface: PublishedEndpointInvocationRequestSurface
    status: PublishedEndpointInvocationStatus
    cache_status: PublishedEndpointInvocationCacheStatus = "bypass"
    api_key_id: str | None = None
    api_key_name: str | None = None
    api_key_prefix: str | None = None
    api_key_status: PublishedEndpointApiKeyStatus | None = None
    run_id: str | None = None
    run_status: str | None = None
    run_current_node_id: str | None = None
    run_waiting_reason: str | None = None
    run_waiting_lifecycle: PublishedEndpointInvocationWaitingLifecycle | None = None
    run_snapshot: OperatorRunSnapshot | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None
    execution_focus_explanation: RunExecutionFocusExplanation | None = None
    callback_waiting_explanation: RunExecutionFocusExplanation | None = None
    reason_code: str | None = None
    error_message: str | None = None
    request_preview: dict
    response_preview: dict | None = None
    duration_ms: int | None = None
    created_at: datetime
    finished_at: datetime | None = None


class PublishedEndpointInvocationFilters(BaseModel):
    status: PublishedEndpointInvocationStatus | None = None
    request_source: PublishedEndpointInvocationRequestSource | None = None
    request_surface: PublishedEndpointInvocationRequestSurface | None = None
    cache_status: PublishedEndpointInvocationCacheStatus | None = None
    run_status: str | None = None
    api_key_id: str | None = None
    reason_code: PublishedEndpointInvocationReasonCode | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None


class PublishedEndpointInvocationFacetItem(BaseModel):
    value: str
    count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedEndpointInvocationStatus | None = None


class PublishedEndpointInvocationApiKeyUsageItem(BaseModel):
    api_key_id: str
    name: str | None = None
    key_prefix: str | None = None
    status: PublishedEndpointApiKeyStatus | None = None
    invocation_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedEndpointInvocationStatus | None = None
    last_reason_code: str | None = None


class PublishedEndpointInvocationFailureReasonItem(BaseModel):
    message: str
    count: int = 0
    last_invoked_at: datetime | None = None


class PublishedEndpointInvocationBucketFacetItem(BaseModel):
    value: str
    count: int = 0


class PublishedEndpointInvocationApiKeyBucketFacetItem(BaseModel):
    api_key_id: str
    name: str | None = None
    key_prefix: str | None = None
    count: int = 0


class PublishedEndpointInvocationTimeBucketItem(BaseModel):
    bucket_start: datetime
    bucket_end: datetime
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    api_key_counts: list[PublishedEndpointInvocationApiKeyBucketFacetItem] = Field(
        default_factory=list
    )
    cache_status_counts: list[PublishedEndpointInvocationBucketFacetItem] = Field(
        default_factory=list
    )
    run_status_counts: list[PublishedEndpointInvocationBucketFacetItem] = Field(
        default_factory=list
    )
    request_surface_counts: list[PublishedEndpointInvocationBucketFacetItem] = Field(
        default_factory=list
    )
    reason_counts: list[PublishedEndpointInvocationBucketFacetItem] = Field(
        default_factory=list
    )


class PublishedEndpointInvocationFacets(BaseModel):
    status_counts: list[PublishedEndpointInvocationFacetItem] = Field(default_factory=list)
    request_source_counts: list[PublishedEndpointInvocationFacetItem] = Field(default_factory=list)
    request_surface_counts: list[PublishedEndpointInvocationFacetItem] = Field(
        default_factory=list
    )
    cache_status_counts: list[PublishedEndpointInvocationFacetItem] = Field(
        default_factory=list
    )
    run_status_counts: list[PublishedEndpointInvocationFacetItem] = Field(
        default_factory=list
    )
    reason_counts: list[PublishedEndpointInvocationFacetItem] = Field(default_factory=list)
    api_key_usage: list[PublishedEndpointInvocationApiKeyUsageItem] = Field(default_factory=list)
    recent_failure_reasons: list[PublishedEndpointInvocationFailureReasonItem] = Field(
        default_factory=list
    )
    timeline_granularity: PublishedEndpointInvocationTimeBucketGranularity = "day"
    timeline: list[PublishedEndpointInvocationTimeBucketItem] = Field(default_factory=list)


class PublishedEndpointInvocationListResponse(BaseModel):
    filters: PublishedEndpointInvocationFilters
    summary: PublishedEndpointInvocationSummary
    facets: PublishedEndpointInvocationFacets
    items: list[PublishedEndpointInvocationItem]


class PublishedEndpointCacheInventorySummary(BaseModel):
    enabled: bool = False
    ttl: int | None = None
    max_entries: int | None = None
    vary_by: list[str] = Field(default_factory=list)
    active_entry_count: int = 0
    total_hit_count: int = 0
    last_hit_at: datetime | None = None
    nearest_expires_at: datetime | None = None
    latest_created_at: datetime | None = None


class PublishedEndpointCacheInventoryItem(BaseModel):
    id: str
    binding_id: str
    cache_key: str
    response_preview: dict
    hit_count: int = 0
    last_hit_at: datetime | None = None
    expires_at: datetime
    created_at: datetime
    updated_at: datetime


class PublishedEndpointCacheInventoryResponse(BaseModel):
    summary: PublishedEndpointCacheInventorySummary
    items: list[PublishedEndpointCacheInventoryItem] = Field(default_factory=list)


class PublishedEndpointInvocationRunReference(BaseModel):
    id: str
    status: str
    current_node_id: str | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class PublishedEndpointInvocationCacheReference(BaseModel):
    cache_status: PublishedEndpointInvocationCacheStatus = "bypass"
    cache_key: str | None = None
    cache_entry_id: str | None = None
    inventory_entry: PublishedEndpointCacheInventoryItem | None = None


class PublishedEndpointInvocationSkillTraceNodeItem(BaseModel):
    node_run_id: str
    node_id: str | None = None
    node_name: str | None = None
    reference_count: int = 0
    loads: list[SkillReferenceLoadItem] = Field(default_factory=list)


class PublishedEndpointInvocationSkillTrace(BaseModel):
    scope: Literal["execution_focus_node", "run"]
    reference_count: int = 0
    phase_counts: dict[str, int] = Field(default_factory=dict)
    source_counts: dict[str, int] = Field(default_factory=dict)
    nodes: list[PublishedEndpointInvocationSkillTraceNodeItem] = Field(default_factory=list)


PublishedEndpointInvocationExecutionFocusReason = Literal[
    "blocking_node_run",
    "blocked_execution",
    "current_node",
    "fallback_node",
]


class PublishedEndpointInvocationDetailResponse(BaseModel):
    invocation: PublishedEndpointInvocationItem
    run: PublishedEndpointInvocationRunReference | None = None
    run_snapshot: OperatorRunSnapshot | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None
    callback_tickets: list[RunCallbackTicketItem] = Field(default_factory=list)
    blocking_node_run_id: str | None = None
    execution_focus_reason: PublishedEndpointInvocationExecutionFocusReason | None = None
    execution_focus_node: RunExecutionNodeItem | None = None
    execution_focus_explanation: RunExecutionFocusExplanation | None = None
    callback_waiting_explanation: RunExecutionFocusExplanation | None = None
    skill_trace: PublishedEndpointInvocationSkillTrace | None = None
    blocking_sensitive_access_entries: list[SensitiveAccessTimelineEntryItem] = Field(
        default_factory=list
    )
    sensitive_access_entries: list[SensitiveAccessTimelineEntryItem] = Field(
        default_factory=list
    )
    cache: PublishedEndpointInvocationCacheReference = Field(
        default_factory=PublishedEndpointInvocationCacheReference
    )
