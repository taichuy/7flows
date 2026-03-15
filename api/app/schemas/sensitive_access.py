from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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
    notification_target: str = Field(default="sensitive-access-inbox", min_length=1, max_length=256)


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
    reason_code: str | None = None
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


class NotificationDispatchRetryResponse(BaseModel):
    approval_ticket: ApprovalTicketItem
    notification: NotificationDispatchItem


class SensitiveAccessRequestResponse(BaseModel):
    request: SensitiveAccessRequestItem
    resource: SensitiveResourceItem
    approval_ticket: ApprovalTicketItem | None = None
    notifications: list[NotificationDispatchItem] = Field(default_factory=list)


class ApprovalTicketDecisionRequest(BaseModel):
    status: Literal["approved", "rejected"]
    approved_by: str = Field(min_length=1, max_length=128)


class ApprovalTicketDecisionResponse(BaseModel):
    request: SensitiveAccessRequestItem
    approval_ticket: ApprovalTicketItem
    notifications: list[NotificationDispatchItem] = Field(default_factory=list)
