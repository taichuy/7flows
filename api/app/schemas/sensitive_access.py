from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
)

SensitivityLevel = Literal["L0", "L1", "L2", "L3"]
AccessDecision = Literal["allow", "deny", "require_approval", "allow_masked"]
AccessRequesterType = Literal["human", "ai", "workflow", "tool"]
AccessActionType = Literal["read", "use", "export", "write", "invoke"]
SensitiveResourceSource = Literal[
    "credential",
    "workflow_context",
    "workspace_resource",
    "local_capability",
    "published_secret",
]
ApprovalTicketStatus = Literal["pending", "approved", "rejected", "expired"]
ApprovalTicketWaitingStatus = Literal["waiting", "resumed", "failed"]
NotificationChannel = Literal["in_app", "webhook", "feishu", "slack", "email"]
NotificationStatus = Literal["pending", "delivered", "failed"]
NotificationChannelDeliveryMode = Literal["inline", "worker"]
NotificationChannelHealthStatus = Literal["ready", "degraded"]
NotificationChannelTargetKind = Literal["in_app", "http_url", "email_list"]
NotificationChannelConfigFactStatus = Literal["configured", "missing", "info"]
ApprovalTicketBulkSkipReason = Literal["not_found", "not_pending", "invalid_state"]
NotificationDispatchBulkSkipReason = Literal[
    "not_found",
    "not_waiting",
    "not_latest",
    "already_delivered",
    "invalid_state",
]


class SensitiveResourceCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=256)
    description: str | None = None
    sensitivity_level: SensitivityLevel
    source: SensitiveResourceSource
    metadata: dict = Field(default_factory=dict)


class SensitiveResourceItem(BaseModel):
    id: str
    label: str
    description: str | None = None
    sensitivity_level: SensitivityLevel
    source: SensitiveResourceSource
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SensitiveAccessRequestCreateRequest(BaseModel):
    run_id: str | None = None
    node_run_id: str | None = None
    requester_type: AccessRequesterType
    requester_id: str = Field(min_length=1, max_length=128)
    resource_id: str = Field(min_length=1, max_length=36)
    action_type: AccessActionType
    purpose_text: str | None = None
    notification_channel: NotificationChannel = "in_app"
    notification_target: str | None = Field(default=None, max_length=256)

    @model_validator(mode="after")
    def normalize_notification_target(self) -> "SensitiveAccessRequestCreateRequest":
        if self.notification_target is not None:
            normalized = self.notification_target.strip()
            self.notification_target = normalized or None
        return self


class SensitiveAccessRequestItem(BaseModel):
    id: str
    run_id: str | None = None
    node_run_id: str | None = None
    requester_type: AccessRequesterType
    requester_id: str
    resource_id: str
    action_type: AccessActionType
    purpose_text: str | None = None
    decision: AccessDecision | None = None
    decision_label: str | None = None
    reason_code: str | None = None
    reason_label: str | None = None
    policy_summary: str | None = None
    created_at: datetime
    decided_at: datetime | None = None


class ApprovalTicketItem(BaseModel):
    id: str
    access_request_id: str
    run_id: str | None = None
    node_run_id: str | None = None
    status: ApprovalTicketStatus
    waiting_status: ApprovalTicketWaitingStatus
    approved_by: str | None = None
    decided_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime


class NotificationDispatchItem(BaseModel):
    id: str
    approval_ticket_id: str
    channel: NotificationChannel
    target: str
    status: NotificationStatus
    delivered_at: datetime | None = None
    error: str | None = None
    created_at: datetime


class NotificationChannelConfigFactItem(BaseModel):
    key: str
    label: str
    status: NotificationChannelConfigFactStatus
    value: str


class NotificationChannelDispatchSummaryItem(BaseModel):
    pending_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    latest_dispatch_at: datetime | None = None
    latest_delivered_at: datetime | None = None
    latest_failure_at: datetime | None = None
    latest_failure_error: str | None = None
    latest_failure_target: str | None = None


class NotificationChannelCapabilityItem(BaseModel):
    channel: NotificationChannel
    delivery_mode: NotificationChannelDeliveryMode
    target_kind: NotificationChannelTargetKind
    configured: bool
    health_status: NotificationChannelHealthStatus
    summary: str
    target_hint: str
    target_example: str
    health_reason: str
    config_facts: list[NotificationChannelConfigFactItem] = Field(default_factory=list)
    dispatch_summary: NotificationChannelDispatchSummaryItem


class CallbackBlockerDeltaSummary(BaseModel):
    sampled_scope_count: int = 0
    changed_scope_count: int = 0
    cleared_scope_count: int = 0
    fully_cleared_scope_count: int = 0
    still_blocked_scope_count: int = 0
    summary: str | None = None


class NotificationDispatchRetryResponse(BaseModel):
    approval_ticket: ApprovalTicketItem
    notification: NotificationDispatchItem
    outcome_explanation: SignalFollowUpExplanation | None = None
    callback_blocker_delta: CallbackBlockerDeltaSummary | None = None
    run_snapshot: OperatorRunSnapshot | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None


class NotificationDispatchRetryRequest(BaseModel):
    target: str | None = Field(default=None, max_length=256)

    @model_validator(mode="after")
    def normalize_target(self) -> "NotificationDispatchRetryRequest":
        if self.target is not None:
            normalized = self.target.strip()
            self.target = normalized or None
        return self


class SensitiveAccessTimelineEntryItem(BaseModel):
    request: SensitiveAccessRequestItem
    resource: SensitiveResourceItem
    approval_ticket: ApprovalTicketItem | None = None
    notifications: list[NotificationDispatchItem] = Field(default_factory=list)
    outcome_explanation: SignalFollowUpExplanation | None = None


class SensitiveAccessInboxEntryItem(BaseModel):
    ticket: ApprovalTicketItem
    request: SensitiveAccessRequestItem | None = None
    resource: SensitiveResourceItem | None = None
    notifications: list[NotificationDispatchItem] = Field(default_factory=list)


class SensitiveAccessInboxSummary(BaseModel):
    ticket_count: int = 0
    pending_ticket_count: int = 0
    approved_ticket_count: int = 0
    rejected_ticket_count: int = 0
    expired_ticket_count: int = 0
    waiting_ticket_count: int = 0
    resumed_ticket_count: int = 0
    failed_ticket_count: int = 0
    pending_notification_count: int = 0
    delivered_notification_count: int = 0
    failed_notification_count: int = 0


class SensitiveAccessInboxResponse(BaseModel):
    entries: list[SensitiveAccessInboxEntryItem] = Field(default_factory=list)
    channels: list[NotificationChannelCapabilityItem] = Field(default_factory=list)
    resources: list[SensitiveResourceItem] = Field(default_factory=list)
    requests: list[SensitiveAccessRequestItem] = Field(default_factory=list)
    notifications: list[NotificationDispatchItem] = Field(default_factory=list)
    execution_views: list[dict[str, Any]] = Field(default_factory=list)
    summary: SensitiveAccessInboxSummary = Field(default_factory=SensitiveAccessInboxSummary)


class SensitiveAccessRequestResponse(SensitiveAccessTimelineEntryItem):
    run_snapshot: OperatorRunSnapshot | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None


class ApprovalTicketDecisionRequest(BaseModel):
    status: Literal["approved", "rejected"]
    approved_by: str = Field(min_length=1, max_length=128)


class ApprovalTicketDecisionResponse(BaseModel):
    request: SensitiveAccessRequestItem
    approval_ticket: ApprovalTicketItem
    notifications: list[NotificationDispatchItem] = Field(default_factory=list)
    outcome_explanation: SignalFollowUpExplanation | None = None
    callback_blocker_delta: CallbackBlockerDeltaSummary | None = None
    run_snapshot: OperatorRunSnapshot | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None


class ApprovalTicketBulkDecisionRequest(BaseModel):
    status: Literal["approved", "rejected"]
    approved_by: str = Field(min_length=1, max_length=128)
    ticket_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize_ticket_ids(self) -> "ApprovalTicketBulkDecisionRequest":
        normalized_ids: list[str] = []
        for ticket_id in self.ticket_ids:
            normalized = ticket_id.strip()
            if normalized and normalized not in normalized_ids:
                normalized_ids.append(normalized)

        if not normalized_ids:
            raise ValueError("At least one ticket_id must be provided.")

        self.ticket_ids = normalized_ids
        self.approved_by = self.approved_by.strip()
        if not self.approved_by:
            raise ValueError("approved_by must not be blank.")
        return self


class ApprovalTicketBulkSkippedItem(BaseModel):
    ticket_id: str
    reason: ApprovalTicketBulkSkipReason
    detail: str


class ApprovalTicketBulkSkippedSummary(BaseModel):
    reason: ApprovalTicketBulkSkipReason
    count: int
    detail: str


class ApprovalTicketBulkDecisionResult(BaseModel):
    status: Literal["approved", "rejected"]
    requested_count: int
    decided_count: int
    skipped_count: int
    decided_items: list[ApprovalTicketItem] = Field(default_factory=list)
    skipped_items: list[ApprovalTicketBulkSkippedItem] = Field(default_factory=list)
    skipped_reason_summary: list[ApprovalTicketBulkSkippedSummary] = Field(
        default_factory=list
    )
    outcome_explanation: SignalFollowUpExplanation | None = None
    callback_blocker_delta: CallbackBlockerDeltaSummary | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None


class NotificationDispatchBulkRetryRequest(BaseModel):
    dispatch_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize_dispatch_ids(self) -> "NotificationDispatchBulkRetryRequest":
        normalized_ids: list[str] = []
        for dispatch_id in self.dispatch_ids:
            normalized = dispatch_id.strip()
            if normalized and normalized not in normalized_ids:
                normalized_ids.append(normalized)

        if not normalized_ids:
            raise ValueError("At least one dispatch_id must be provided.")

        self.dispatch_ids = normalized_ids
        return self


class NotificationDispatchBulkSkippedItem(BaseModel):
    dispatch_id: str
    reason: NotificationDispatchBulkSkipReason
    detail: str


class NotificationDispatchBulkSkippedSummary(BaseModel):
    reason: NotificationDispatchBulkSkipReason
    count: int
    detail: str


class NotificationDispatchBulkRetriedItem(BaseModel):
    approval_ticket: ApprovalTicketItem
    notification: NotificationDispatchItem


class NotificationDispatchBulkRetryResult(BaseModel):
    requested_count: int
    retried_count: int
    skipped_count: int
    retried_items: list[NotificationDispatchBulkRetriedItem] = Field(default_factory=list)
    skipped_items: list[NotificationDispatchBulkSkippedItem] = Field(default_factory=list)
    skipped_reason_summary: list[NotificationDispatchBulkSkippedSummary] = Field(
        default_factory=list
    )
    outcome_explanation: SignalFollowUpExplanation | None = None
    callback_blocker_delta: CallbackBlockerDeltaSummary | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None
