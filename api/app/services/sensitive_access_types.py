from __future__ import annotations

from dataclasses import dataclass, field

from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)


class SensitiveAccessControlError(RuntimeError):
    pass


@dataclass(frozen=True)
class AccessDecisionResult:
    decision: str
    reason_code: str


@dataclass(frozen=True)
class SensitiveAccessRequestBundle:
    resource: SensitiveResourceRecord
    access_request: SensitiveAccessRequestRecord
    approval_ticket: ApprovalTicketRecord | None = None
    notifications: list[NotificationDispatchRecord] = field(default_factory=list)


@dataclass(frozen=True)
class ApprovalDecisionBundle:
    access_request: SensitiveAccessRequestRecord
    approval_ticket: ApprovalTicketRecord
    notifications: list[NotificationDispatchRecord] = field(default_factory=list)


@dataclass(frozen=True)
class NotificationDispatchRetryBundle:
    approval_ticket: ApprovalTicketRecord
    notification: NotificationDispatchRecord
