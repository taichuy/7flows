from __future__ import annotations

from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.schemas.sensitive_access import (
    ApprovalTicketItem,
    NotificationDispatchItem,
    SensitiveAccessRequestItem,
    SensitiveAccessTimelineEntryItem,
    SensitiveResourceItem,
)
from app.services.credential_governance import (
    build_credential_governance_summary_from_sensitive_resource,
)
from app.services.sensitive_access_action_explanations import (
    build_sensitive_access_timeline_outcome_explanation,
)
from app.services.sensitive_access_reasoning import describe_sensitive_access_reasoning
from app.services.sensitive_access_types import SensitiveAccessRequestBundle


def serialize_sensitive_resource(record: SensitiveResourceRecord) -> SensitiveResourceItem:
    return SensitiveResourceItem(
        id=record.id,
        label=record.label,
        description=record.description,
        sensitivity_level=record.sensitivity_level,
        source=record.source,
        metadata=record.metadata_payload or {},
        credential_governance=build_credential_governance_summary_from_sensitive_resource(
            record
        ),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def serialize_sensitive_access_request(
    record: SensitiveAccessRequestRecord,
) -> SensitiveAccessRequestItem:
    reasoning = describe_sensitive_access_reasoning(
        decision=record.decision,
        reason_code=record.reason_code,
    )
    return SensitiveAccessRequestItem(
        id=record.id,
        run_id=record.run_id,
        node_run_id=record.node_run_id,
        requester_type=record.requester_type,
        requester_id=record.requester_id,
        resource_id=record.resource_id,
        action_type=record.action_type,
        purpose_text=record.purpose_text,
        decision=record.decision,
        decision_label=reasoning.decision_label,
        reason_code=record.reason_code,
        reason_label=reasoning.reason_label,
        policy_summary=reasoning.policy_summary,
        created_at=record.created_at,
        decided_at=record.decided_at,
    )


def serialize_approval_ticket(record: ApprovalTicketRecord) -> ApprovalTicketItem:
    return ApprovalTicketItem(
        id=record.id,
        access_request_id=record.access_request_id,
        run_id=record.run_id,
        node_run_id=record.node_run_id,
        status=record.status,
        waiting_status=record.waiting_status,
        approved_by=record.approved_by,
        decided_at=record.decided_at,
        expires_at=record.expires_at,
        created_at=record.created_at,
    )


def serialize_notification_dispatch(
    record: NotificationDispatchRecord,
) -> NotificationDispatchItem:
    return NotificationDispatchItem(
        id=record.id,
        approval_ticket_id=record.approval_ticket_id,
        channel=record.channel,
        target=record.target,
        status=record.status,
        delivered_at=record.delivered_at,
        error=record.error,
        created_at=record.created_at,
    )


def serialize_sensitive_access_timeline_entry(
    bundle: SensitiveAccessRequestBundle,
    *,
    run_snapshot=None,
    run_follow_up=None,
) -> SensitiveAccessTimelineEntryItem:
    return SensitiveAccessTimelineEntryItem(
        request=serialize_sensitive_access_request(bundle.access_request),
        resource=serialize_sensitive_resource(bundle.resource),
        approval_ticket=(
            serialize_approval_ticket(bundle.approval_ticket)
            if bundle.approval_ticket is not None
            else None
        ),
        notifications=[
            serialize_notification_dispatch(notification)
            for notification in bundle.notifications
        ],
        outcome_explanation=build_sensitive_access_timeline_outcome_explanation(bundle),
        run_snapshot=run_snapshot,
        run_follow_up=run_follow_up,
    )
