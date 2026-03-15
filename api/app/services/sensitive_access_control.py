from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.services.run_resume_scheduler import (
    RunResumeScheduler,
    get_run_resume_scheduler,
)
from app.services.sensitive_access_policy import (
    evaluate_default_sensitive_access_policy,
)
from app.services.sensitive_access_queries import (
    find_credential_resource,
    find_existing_access_bundle,
    find_tool_resource,
    find_workflow_context_resource,
    list_access_requests,
    list_approval_tickets,
    list_notification_dispatches,
    list_resources,
    validate_runtime_scope,
)
from app.services.sensitive_access_types import (
    AccessDecisionResult,
    ApprovalDecisionBundle,
    NotificationDispatchRetryBundle,
    SensitiveAccessControlError,
    SensitiveAccessRequestBundle,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


__all__ = [
    "AccessDecisionResult",
    "ApprovalDecisionBundle",
    "NotificationDispatchRetryBundle",
    "SensitiveAccessControlError",
    "SensitiveAccessControlService",
    "SensitiveAccessRequestBundle",
]


class SensitiveAccessControlService:
    def __init__(
        self,
        *,
        resume_scheduler: RunResumeScheduler | None = None,
    ) -> None:
        self._resume_scheduler = resume_scheduler or get_run_resume_scheduler()

    def create_resource(
        self,
        db: Session,
        *,
        label: str,
        sensitivity_level: str,
        source: str,
        description: str | None = None,
        metadata: dict | None = None,
    ) -> SensitiveResourceRecord:
        record = SensitiveResourceRecord(
            id=str(uuid4()),
            label=label.strip(),
            description=(description or None),
            sensitivity_level=sensitivity_level,
            source=source,
            metadata_payload=dict(metadata or {}),
            created_at=_utcnow(),
            updated_at=_utcnow(),
        )
        db.add(record)
        db.flush()
        return record

    def list_resources(
        self,
        db: Session,
        *,
        sensitivity_level: str | None = None,
        source: str | None = None,
    ) -> list[SensitiveResourceRecord]:
        return list_resources(
            db,
            sensitivity_level=sensitivity_level,
            source=source,
        )

    def list_access_requests(
        self,
        db: Session,
        *,
        decision: str | None = None,
        requester_type: str | None = None,
        run_id: str | None = None,
    ) -> list[SensitiveAccessRequestRecord]:
        return list_access_requests(
            db,
            decision=decision,
            requester_type=requester_type,
            run_id=run_id,
        )

    def list_approval_tickets(
        self,
        db: Session,
        *,
        status: str | None = None,
        waiting_status: str | None = None,
        run_id: str | None = None,
    ) -> list[ApprovalTicketRecord]:
        return list_approval_tickets(
            db,
            status=status,
            waiting_status=waiting_status,
            run_id=run_id,
        )

    def list_notification_dispatches(
        self,
        db: Session,
        *,
        approval_ticket_id: str | None = None,
        status: str | None = None,
    ) -> list[NotificationDispatchRecord]:
        return list_notification_dispatches(
            db,
            approval_ticket_id=approval_ticket_id,
            status=status,
        )

    def _create_notification_dispatch(
        self,
        *,
        approval_ticket_id: str,
        channel: str,
        target: str,
    ) -> NotificationDispatchRecord:
        created_at = _utcnow()
        if channel == "in_app":
            return NotificationDispatchRecord(
                id=str(uuid4()),
                approval_ticket_id=approval_ticket_id,
                channel=channel,
                target=target,
                status="delivered",
                delivered_at=created_at,
                error=None,
                created_at=created_at,
            )

        return NotificationDispatchRecord(
            id=str(uuid4()),
            approval_ticket_id=approval_ticket_id,
            channel=channel,
            target=target,
            status="failed",
            delivered_at=None,
            error=(
                f"Notification channel '{channel}' is not implemented yet; "
                "worker/adapter delivery is still pending."
            ),
            created_at=created_at,
        )

    def find_credential_resource(
        self,
        db: Session,
        *,
        credential_id: str,
    ) -> SensitiveResourceRecord | None:
        return find_credential_resource(db, credential_id=credential_id)

    def find_workflow_context_resource(
        self,
        db: Session,
        *,
        run_id: str | None,
        source_node_id: str,
        artifact_type: str,
    ) -> SensitiveResourceRecord | None:
        return find_workflow_context_resource(
            db,
            run_id=run_id,
            source_node_id=source_node_id,
            artifact_type=artifact_type,
        )

    def find_tool_resource(
        self,
        db: Session,
        *,
        run_id: str | None,
        tool_id: str,
        ecosystem: str | None = None,
        adapter_id: str | None = None,
    ) -> SensitiveResourceRecord | None:
        return find_tool_resource(
            db,
            run_id=run_id,
            tool_id=tool_id,
            ecosystem=ecosystem,
            adapter_id=adapter_id,
        )

    def ensure_access(
        self,
        db: Session,
        *,
        run_id: str | None,
        node_run_id: str | None,
        requester_type: str,
        requester_id: str,
        resource_id: str,
        action_type: str,
        purpose_text: str | None = None,
        notification_channel: str = "in_app",
        notification_target: str = "sensitive-access-inbox",
        reuse_existing: bool = True,
    ) -> SensitiveAccessRequestBundle:
        if reuse_existing:
            existing_bundle = find_existing_access_bundle(
                db,
                run_id=run_id,
                node_run_id=node_run_id,
                requester_type=requester_type,
                requester_id=requester_id,
                resource_id=resource_id,
                action_type=action_type,
            )
            if existing_bundle is not None:
                return existing_bundle

        return self.request_access(
            db,
            run_id=run_id,
            node_run_id=node_run_id,
            requester_type=requester_type,
            requester_id=requester_id,
            resource_id=resource_id,
            action_type=action_type,
            purpose_text=purpose_text,
            notification_channel=notification_channel,
            notification_target=notification_target,
        )

    def request_access(
        self,
        db: Session,
        *,
        run_id: str | None,
        node_run_id: str | None,
        requester_type: str,
        requester_id: str,
        resource_id: str,
        action_type: str,
        purpose_text: str | None = None,
        notification_channel: str = "in_app",
        notification_target: str = "sensitive-access-inbox",
    ) -> SensitiveAccessRequestBundle:
        resource = db.get(SensitiveResourceRecord, resource_id)
        if resource is None:
            raise SensitiveAccessControlError("Sensitive resource not found.")

        validate_runtime_scope(
            db,
            run_id=run_id,
            node_run_id=node_run_id,
        )

        decision_result = evaluate_default_sensitive_access_policy(
            sensitivity_level=resource.sensitivity_level,
            requester_type=requester_type,
            action_type=action_type,
        )

        access_request = SensitiveAccessRequestRecord(
            id=str(uuid4()),
            run_id=run_id,
            node_run_id=node_run_id,
            requester_type=requester_type,
            requester_id=requester_id.strip(),
            resource_id=resource.id,
            action_type=action_type,
            purpose_text=purpose_text,
            decision=decision_result.decision,
            reason_code=decision_result.reason_code,
            created_at=_utcnow(),
            decided_at=_utcnow() if decision_result.decision != "require_approval" else None,
        )
        db.add(access_request)
        db.flush()

        approval_ticket = None
        notifications: list[NotificationDispatchRecord] = []
        if decision_result.decision == "require_approval":
            approval_ticket = ApprovalTicketRecord(
                id=str(uuid4()),
                access_request_id=access_request.id,
                run_id=run_id,
                node_run_id=node_run_id,
                status="pending",
                waiting_status="waiting",
                approved_by=None,
                decided_at=None,
                created_at=_utcnow(),
            )
            db.add(approval_ticket)
            db.flush()
            notifications.append(
                self._create_notification_dispatch(
                    approval_ticket_id=approval_ticket.id,
                    channel=notification_channel,
                    target=notification_target,
                )
            )
            db.add_all(notifications)
            db.flush()

        return SensitiveAccessRequestBundle(
            resource=resource,
            access_request=access_request,
            approval_ticket=approval_ticket,
            notifications=notifications,
        )

    def decide_ticket(
        self,
        db: Session,
        *,
        ticket_id: str,
        status: str,
        approved_by: str,
    ) -> ApprovalDecisionBundle:
        approval_ticket = db.get(ApprovalTicketRecord, ticket_id)
        if approval_ticket is None:
            raise SensitiveAccessControlError("Approval ticket not found.")
        if approval_ticket.status != "pending":
            raise SensitiveAccessControlError("Only pending approval tickets can be decided.")

        access_request = db.get(SensitiveAccessRequestRecord, approval_ticket.access_request_id)
        if access_request is None:
            raise SensitiveAccessControlError("Sensitive access request not found for ticket.")

        decided_at = _utcnow()
        approval_ticket.status = status
        approval_ticket.waiting_status = "resumed" if status == "approved" else "failed"
        approval_ticket.approved_by = approved_by.strip()
        approval_ticket.decided_at = decided_at

        access_request.decision = "allow" if status == "approved" else "deny"
        access_request.reason_code = (
            "approved_after_review" if status == "approved" else "rejected_after_review"
        )
        access_request.decided_at = decided_at

        notifications = self.list_notification_dispatches(
            db,
            approval_ticket_id=approval_ticket.id,
        )
        if approval_ticket.run_id:
            self._resume_scheduler.schedule(
                run_id=approval_ticket.run_id,
                reason=(
                    f"Sensitive access ticket {approval_ticket.id} {status}"
                ),
                source="sensitive_access_decision",
                db=db,
            )
        return ApprovalDecisionBundle(
            access_request=access_request,
            approval_ticket=approval_ticket,
            notifications=notifications,
        )

    def retry_notification_dispatch(
        self,
        db: Session,
        *,
        dispatch_id: str,
    ) -> NotificationDispatchRetryBundle:
        notification = db.get(NotificationDispatchRecord, dispatch_id)
        if notification is None:
            raise SensitiveAccessControlError("Notification dispatch not found.")

        approval_ticket = db.get(ApprovalTicketRecord, notification.approval_ticket_id)
        if approval_ticket is None:
            raise SensitiveAccessControlError("Approval ticket not found for notification dispatch.")
        if approval_ticket.status != "pending" or approval_ticket.waiting_status != "waiting":
            raise SensitiveAccessControlError(
                "Only waiting approval tickets can retry notifications."
            )

        notifications = self.list_notification_dispatches(
            db,
            approval_ticket_id=approval_ticket.id,
        )
        if not notifications or notifications[0].id != notification.id:
            raise SensitiveAccessControlError(
                "Only the latest notification dispatch can be retried."
            )
        if notification.status == "delivered":
            raise SensitiveAccessControlError(
                "Delivered notification dispatches do not need retry."
            )

        retried_notification = self._create_notification_dispatch(
            approval_ticket_id=approval_ticket.id,
            channel=notification.channel,
            target=notification.target,
        )
        if notification.status == "pending":
            notification.status = "failed"
            notification.error = f"Superseded by manual retry {retried_notification.id}."

        db.add(retried_notification)
        db.flush()
        return NotificationDispatchRetryBundle(
            approval_ticket=approval_ticket,
            notification=retried_notification,
        )
