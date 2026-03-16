from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.run import NodeRun, Run
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.services.sensitive_access_types import (
    SensitiveAccessControlError,
    SensitiveAccessRequestBundle,
)


def list_resources(
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
    db: Session,
    *,
    decision: str | None = None,
    requester_type: str | None = None,
    run_id: str | None = None,
    node_run_id: str | None = None,
    access_request_id: str | None = None,
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
    if node_run_id:
        statement = statement.where(SensitiveAccessRequestRecord.node_run_id == node_run_id)
    if access_request_id:
        statement = statement.where(SensitiveAccessRequestRecord.id == access_request_id)
    return db.scalars(statement).all()


def list_approval_tickets(
    db: Session,
    *,
    status: str | None = None,
    waiting_status: str | None = None,
    run_id: str | None = None,
    node_run_id: str | None = None,
    access_request_id: str | None = None,
    approval_ticket_id: str | None = None,
) -> list[ApprovalTicketRecord]:
    statement = select(ApprovalTicketRecord).order_by(ApprovalTicketRecord.created_at.desc())
    if status:
        statement = statement.where(ApprovalTicketRecord.status == status)
    if waiting_status:
        statement = statement.where(ApprovalTicketRecord.waiting_status == waiting_status)
    if run_id:
        statement = statement.where(ApprovalTicketRecord.run_id == run_id)
    if node_run_id:
        statement = statement.where(ApprovalTicketRecord.node_run_id == node_run_id)
    if access_request_id:
        statement = statement.where(ApprovalTicketRecord.access_request_id == access_request_id)
    if approval_ticket_id:
        statement = statement.where(ApprovalTicketRecord.id == approval_ticket_id)
    return db.scalars(statement).all()


def list_notification_dispatches(
    db: Session,
    *,
    approval_ticket_id: str | None = None,
    run_id: str | None = None,
    node_run_id: str | None = None,
    access_request_id: str | None = None,
    status: str | None = None,
) -> list[NotificationDispatchRecord]:
    statement = select(NotificationDispatchRecord).order_by(
        NotificationDispatchRecord.created_at.desc()
    )
    if run_id or node_run_id or access_request_id:
        statement = statement.join(
            ApprovalTicketRecord,
            ApprovalTicketRecord.id == NotificationDispatchRecord.approval_ticket_id,
        )
    if approval_ticket_id:
        statement = statement.where(
            NotificationDispatchRecord.approval_ticket_id == approval_ticket_id
        )
    if run_id:
        statement = statement.where(ApprovalTicketRecord.run_id == run_id)
    if node_run_id:
        statement = statement.where(ApprovalTicketRecord.node_run_id == node_run_id)
    if access_request_id:
        statement = statement.where(
            ApprovalTicketRecord.access_request_id == access_request_id
        )
    if status:
        statement = statement.where(NotificationDispatchRecord.status == status)
    return db.scalars(statement).all()


def workflow_id_for_run(db: Session, *, run_id: str | None) -> str:
    if not run_id:
        return ""
    run = db.get(Run, run_id)
    return str(run.workflow_id or "") if run is not None else ""


def find_credential_resource(
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


def find_workflow_context_resource(
    db: Session,
    *,
    run_id: str | None,
    source_node_id: str,
    artifact_type: str,
) -> SensitiveResourceRecord | None:
    workflow_id = workflow_id_for_run(db, run_id=run_id)

    statement = select(SensitiveResourceRecord).where(
        SensitiveResourceRecord.source == "workflow_context"
    )
    fallback_match: SensitiveResourceRecord | None = None
    for record in db.scalars(statement):
        metadata_payload = record.metadata_payload or {}
        resource_node_id = str(
            metadata_payload.get("source_node_id")
            or metadata_payload.get("node_id")
            or ""
        ).strip()
        resource_artifact_type = str(
            metadata_payload.get("artifact_type")
            or metadata_payload.get("artifactType")
            or ""
        ).strip()
        if resource_node_id != source_node_id or resource_artifact_type != artifact_type:
            continue

        resource_workflow_id = str(metadata_payload.get("workflow_id") or "").strip()
        if workflow_id and resource_workflow_id == workflow_id:
            return record
        if not resource_workflow_id and fallback_match is None:
            fallback_match = record
    return fallback_match


def find_tool_resource(
    db: Session,
    *,
    run_id: str | None,
    tool_id: str,
    ecosystem: str | None = None,
    adapter_id: str | None = None,
) -> SensitiveResourceRecord | None:
    workflow_id = workflow_id_for_run(db, run_id=run_id)

    statement = select(SensitiveResourceRecord).where(
        SensitiveResourceRecord.source == "local_capability"
    )
    fallback_match: SensitiveResourceRecord | None = None
    for record in db.scalars(statement):
        metadata_payload = record.metadata_payload or {}
        resource_tool_id = str(
            metadata_payload.get("tool_id")
            or metadata_payload.get("toolId")
            or ""
        ).strip()
        if resource_tool_id != tool_id:
            continue

        resource_ecosystem = str(metadata_payload.get("ecosystem") or "").strip()
        if resource_ecosystem and resource_ecosystem != str(ecosystem or "").strip():
            continue

        resource_adapter_id = str(
            metadata_payload.get("adapter_id")
            or metadata_payload.get("adapterId")
            or ""
        ).strip()
        if resource_adapter_id and resource_adapter_id != str(adapter_id or "").strip():
            continue

        resource_workflow_id = str(metadata_payload.get("workflow_id") or "").strip()
        if workflow_id and resource_workflow_id == workflow_id:
            return record
        if not resource_workflow_id and fallback_match is None:
            fallback_match = record
    return fallback_match


def find_existing_access_bundle(
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
        notifications = list_notification_dispatches(
            db,
            approval_ticket_id=approval_ticket.id,
        )

    return SensitiveAccessRequestBundle(
        resource=resource,
        access_request=access_request,
        approval_ticket=approval_ticket,
        notifications=notifications,
    )


def validate_runtime_scope(
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
