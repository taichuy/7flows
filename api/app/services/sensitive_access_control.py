from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run
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


def _utcnow() -> datetime:
    return datetime.now(UTC)


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
    notifications: list[NotificationDispatchRecord] = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "notifications", list(self.notifications or []))


@dataclass(frozen=True)
class ApprovalDecisionBundle:
    access_request: SensitiveAccessRequestRecord
    approval_ticket: ApprovalTicketRecord
    notifications: list[NotificationDispatchRecord]


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
        statement = select(SensitiveResourceRecord).order_by(
            SensitiveResourceRecord.created_at.desc()
        )
        if sensitivity_level:
            statement = statement.where(
                SensitiveResourceRecord.sensitivity_level == sensitivity_level
            )
        if source:
            statement = statement.where(SensitiveResourceRecord.source == source)
        return db.scalars(statement).all()

    def list_access_requests(
        self,
        db: Session,
        *,
        decision: str | None = None,
        requester_type: str | None = None,
        run_id: str | None = None,
    ) -> list[SensitiveAccessRequestRecord]:
        statement = select(SensitiveAccessRequestRecord).order_by(
            SensitiveAccessRequestRecord.created_at.desc()
        )
        if decision:
            statement = statement.where(SensitiveAccessRequestRecord.decision == decision)
        if requester_type:
            statement = statement.where(
                SensitiveAccessRequestRecord.requester_type == requester_type
            )
        if run_id:
            statement = statement.where(SensitiveAccessRequestRecord.run_id == run_id)
        return db.scalars(statement).all()

    def list_approval_tickets(
        self,
        db: Session,
        *,
        status: str | None = None,
        waiting_status: str | None = None,
        run_id: str | None = None,
    ) -> list[ApprovalTicketRecord]:
        statement = select(ApprovalTicketRecord).order_by(ApprovalTicketRecord.created_at.desc())
        if status:
            statement = statement.where(ApprovalTicketRecord.status == status)
        if waiting_status:
            statement = statement.where(ApprovalTicketRecord.waiting_status == waiting_status)
        if run_id:
            statement = statement.where(ApprovalTicketRecord.run_id == run_id)
        return db.scalars(statement).all()

    def list_notification_dispatches(
        self,
        db: Session,
        *,
        approval_ticket_id: str | None = None,
        status: str | None = None,
    ) -> list[NotificationDispatchRecord]:
        statement = select(NotificationDispatchRecord).order_by(
            NotificationDispatchRecord.created_at.desc()
        )
        if approval_ticket_id:
            statement = statement.where(
                NotificationDispatchRecord.approval_ticket_id == approval_ticket_id
            )
        if status:
            statement = statement.where(NotificationDispatchRecord.status == status)
        return db.scalars(statement).all()

    def find_credential_resource(
        self,
        db: Session,
        *,
        credential_id: str,
    ) -> SensitiveResourceRecord | None:
        statement = select(SensitiveResourceRecord).where(
            SensitiveResourceRecord.source == "credential"
        )
        for record in db.scalars(statement):
            metadata_payload = record.metadata_payload or {}
            if str(metadata_payload.get("credential_id") or "") == credential_id:
                return record
        return None

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
            existing_bundle = self._find_existing_access_bundle(
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

        self._validate_runtime_scope(
            db,
            run_id=run_id,
            node_run_id=node_run_id,
        )

        decision_result = self._evaluate_default_policy(
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
                NotificationDispatchRecord(
                    id=str(uuid4()),
                    approval_ticket_id=approval_ticket.id,
                    channel=notification_channel,
                    target=notification_target,
                    status="delivered" if notification_channel == "in_app" else "pending",
                    delivered_at=_utcnow() if notification_channel == "in_app" else None,
                    error=None,
                    created_at=_utcnow(),
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
            )
        return ApprovalDecisionBundle(
            access_request=access_request,
            approval_ticket=approval_ticket,
            notifications=notifications,
        )

    def _find_existing_access_bundle(
        self,
        db: Session,
        *,
        run_id: str | None,
        node_run_id: str | None,
        requester_type: str,
        requester_id: str,
        resource_id: str,
        action_type: str,
    ) -> SensitiveAccessRequestBundle | None:
        statement = (
            select(SensitiveAccessRequestRecord)
            .where(
                SensitiveAccessRequestRecord.requester_type == requester_type,
                SensitiveAccessRequestRecord.requester_id == requester_id.strip(),
                SensitiveAccessRequestRecord.resource_id == resource_id,
                SensitiveAccessRequestRecord.action_type == action_type,
            )
            .order_by(SensitiveAccessRequestRecord.created_at.desc())
        )
        if run_id is None:
            statement = statement.where(SensitiveAccessRequestRecord.run_id.is_(None))
        else:
            statement = statement.where(SensitiveAccessRequestRecord.run_id == run_id)
        if node_run_id is None:
            statement = statement.where(SensitiveAccessRequestRecord.node_run_id.is_(None))
        else:
            statement = statement.where(SensitiveAccessRequestRecord.node_run_id == node_run_id)

        access_request = db.scalars(statement).first()
        if access_request is None:
            return None

        resource = db.get(SensitiveResourceRecord, resource_id)
        if resource is None:
            raise SensitiveAccessControlError("Sensitive resource not found.")

        approval_ticket = db.scalar(
            select(ApprovalTicketRecord).where(
                ApprovalTicketRecord.access_request_id == access_request.id
            )
        )
        notifications: list[NotificationDispatchRecord] = []
        if approval_ticket is not None:
            notifications = self.list_notification_dispatches(
                db,
                approval_ticket_id=approval_ticket.id,
            )

        return SensitiveAccessRequestBundle(
            resource=resource,
            access_request=access_request,
            approval_ticket=approval_ticket,
            notifications=notifications,
        )

    def _validate_runtime_scope(
        self,
        db: Session,
        *,
        run_id: str | None,
        node_run_id: str | None,
    ) -> None:
        if run_id:
            run = db.get(Run, run_id)
            if run is None:
                raise SensitiveAccessControlError("Run not found.")

        if node_run_id:
            node_run = db.get(NodeRun, node_run_id)
            if node_run is None:
                raise SensitiveAccessControlError("Node run not found.")
            if run_id and node_run.run_id != run_id:
                raise SensitiveAccessControlError(
                    "Node run does not belong to the provided run."
                )

    def _evaluate_default_policy(
        self,
        *,
        sensitivity_level: str,
        requester_type: str,
        action_type: str,
    ) -> AccessDecisionResult:
        if sensitivity_level == "L0":
            return AccessDecisionResult("allow", "allow_low_sensitivity")

        if sensitivity_level == "L1":
            if requester_type != "human" and action_type in {"export", "write"}:
                return AccessDecisionResult(
                    "require_approval",
                    "approval_required_non_human_mutation",
                )
            return AccessDecisionResult("allow", "allow_standard_low_risk")

        if sensitivity_level == "L2":
            if requester_type == "human" and action_type in {"read", "use", "invoke"}:
                return AccessDecisionResult(
                    "allow",
                    "allow_human_moderate_runtime_use",
                )
            if action_type in {"read", "use", "invoke"}:
                return AccessDecisionResult(
                    "allow_masked",
                    "masked_moderate_runtime_use",
                )
            return AccessDecisionResult(
                "require_approval",
                "approval_required_moderate_sensitive_operation",
            )

        if requester_type != "human" and action_type in {"export", "write"}:
            return AccessDecisionResult(
                "deny",
                "deny_non_human_high_sensitive_mutation",
            )
        return AccessDecisionResult(
            "require_approval",
            "approval_required_high_sensitive_access",
        )
