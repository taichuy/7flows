from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)


def test_create_sensitive_resource_and_list_it(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    create_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Primary credential",
            "description": "Payment provider credential",
            "sensitivity_level": "L2",
            "source": "credential",
            "metadata": {"credential_id": "cred-1"},
        },
    )

    assert create_response.status_code == 201
    create_body = create_response.json()
    assert create_body["label"] == "Primary credential"
    assert create_body["sensitivity_level"] == "L2"
    assert create_body["source"] == "credential"
    assert create_body["metadata"] == {"credential_id": "cred-1"}

    list_response = client.get(
        "/api/sensitive-access/resources",
        params={"sensitivity_level": "L2"},
    )

    assert list_response.status_code == 200
    list_body = list_response.json()
    assert len(list_body) == 1
    assert list_body[0]["id"] == create_body["id"]

    stored = sqlite_session.get(SensitiveResourceRecord, create_body["id"])
    assert stored is not None
    assert stored.metadata_payload == {"credential_id": "cred-1"}


def test_request_low_sensitivity_access_allows_without_ticket(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Template docs",
            "sensitivity_level": "L0",
            "source": "workspace_resource",
            "metadata": {"path": "/docs/template.md"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "workflow",
            "requester_id": "workflow-demo",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "hydrate starter prompt",
        },
    )

    assert request_response.status_code == 201
    body = request_response.json()
    assert body["request"]["decision"] == "allow"
    assert body["request"]["reason_code"] == "allow_low_sensitivity"
    assert body["approval_ticket"] is None
    assert body["notifications"] == []

    stored_requests = sqlite_session.query(SensitiveAccessRequestRecord).all()
    assert len(stored_requests) == 1
    assert stored_requests[0].decided_at is not None
    assert sqlite_session.query(ApprovalTicketRecord).count() == 0


def test_request_high_sensitivity_access_creates_approval_ticket_and_decision(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Published production secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-main",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "inspect published auth secret",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    assert request_body["request"]["decision"] == "require_approval"
    assert request_body["request"]["reason_code"] == "approval_required_high_sensitive_access"
    assert approval_ticket is not None
    assert approval_ticket["status"] == "pending"
    assert approval_ticket["waiting_status"] == "waiting"
    assert request_body["notifications"] == [
        {
            "id": request_body["notifications"][0]["id"],
            "approval_ticket_id": approval_ticket["id"],
            "channel": "in_app",
            "target": "sensitive-access-inbox",
            "status": "delivered",
            "delivered_at": request_body["notifications"][0]["delivered_at"],
            "error": None,
            "created_at": request_body["notifications"][0]["created_at"],
        }
    ]

    decision_response = client.post(
        f"/api/sensitive-access/approval-tickets/{approval_ticket['id']}/decision",
        json={"status": "approved", "approved_by": "ops-reviewer"},
    )

    assert decision_response.status_code == 200
    decision_body = decision_response.json()
    assert decision_body["request"]["decision"] == "allow"
    assert decision_body["request"]["reason_code"] == "approved_after_review"
    assert decision_body["approval_ticket"]["status"] == "approved"
    assert decision_body["approval_ticket"]["waiting_status"] == "resumed"
    assert decision_body["approval_ticket"]["approved_by"] == "ops-reviewer"
    assert len(decision_body["notifications"]) == 1

    stored_request = sqlite_session.get(
        SensitiveAccessRequestRecord,
        request_body["request"]["id"],
    )
    stored_ticket = sqlite_session.get(ApprovalTicketRecord, approval_ticket["id"])
    stored_notifications = sqlite_session.query(NotificationDispatchRecord).all()
    assert stored_request is not None
    assert stored_ticket is not None
    assert stored_request.decision == "allow"
    assert stored_ticket.status == "approved"
    assert stored_ticket.waiting_status == "resumed"
    assert len(stored_notifications) == 1
