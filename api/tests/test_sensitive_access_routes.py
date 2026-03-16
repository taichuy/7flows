from fastapi.testclient import TestClient
from pytest import MonkeyPatch
from sqlalchemy.orm import Session

from app.api.routes import sensitive_access as sensitive_access_routes
from app.core.config import Settings
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.services.notification_dispatch_scheduler import NotificationDispatchScheduler
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.sensitive_access_control import SensitiveAccessControlService


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


def test_request_external_notification_channel_fails_fast_when_target_is_not_supported(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
) -> None:
    scheduled_dispatches = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Workspace production export",
            "sensitivity_level": "L3",
            "source": "workspace_resource",
            "metadata": {"path": "/exports/prod.csv"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-export",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "notify operator for export review",
            "notification_channel": "slack",
            "notification_target": "#ops-review",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    notification = request_body["notifications"][0]
    assert approval_ticket is not None
    assert approval_ticket["status"] == "pending"
    assert approval_ticket["waiting_status"] == "waiting"
    assert notification["channel"] == "slack"
    assert notification["target"] == "#ops-review"
    assert notification["status"] == "failed"
    assert "incoming webhook URL" in notification["error"]

    assert scheduled_dispatches == []

    stored_notification = sqlite_session.get(NotificationDispatchRecord, notification["id"])
    assert stored_notification is not None
    assert stored_notification.status == "failed"


def test_list_notification_channels_returns_capabilities(client: TestClient) -> None:
    response = client.get("/api/sensitive-access/notification-channels")

    assert response.status_code == 200
    body = response.json()
    channels = {item["channel"]: item for item in body}
    assert set(channels) == {"in_app", "webhook", "slack", "feishu", "email"}
    assert channels["in_app"]["delivery_mode"] == "inline"
    assert channels["webhook"]["target_kind"] == "http_url"
    assert channels["slack"]["health_status"] == "ready"
    assert channels["email"]["target_kind"] == "email_list"
    assert channels["email"]["health_reason"]
    assert channels["email"]["dispatch_summary"] == {
        "pending_count": 0,
        "delivered_count": 0,
        "failed_count": 0,
        "latest_dispatch_at": None,
        "latest_delivered_at": None,
        "latest_failure_at": None,
        "latest_failure_error": None,
        "latest_failure_target": None,
    }
    assert any(
        fact["key"] == "smtp_host" and fact["status"] == "missing"
        for fact in channels["email"]["config_facts"]
    )


def test_bulk_decide_approval_tickets_allows_partial_success(
    client: TestClient,
    sqlite_session: Session,
) -> None:
    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Published production secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"endpoint_id": "pub-bulk-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-bulk",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "bulk approval review",
        },
    )

    assert request_response.status_code == 201
    ticket_id = request_response.json()["approval_ticket"]["id"]

    bulk_response = client.post(
        "/api/sensitive-access/approval-tickets/bulk-decision",
        json={
            "status": "approved",
            "approved_by": "ops-bulk-reviewer",
            "ticket_ids": [ticket_id, "missing-ticket", ticket_id],
        },
    )

    assert bulk_response.status_code == 200
    body = bulk_response.json()
    assert body["requested_count"] == 2
    assert body["decided_count"] == 1
    assert body["skipped_count"] == 1
    assert body["decided_items"][0]["id"] == ticket_id
    assert body["decided_items"][0]["status"] == "approved"
    assert body["skipped_items"] == [
        {
            "ticket_id": "missing-ticket",
            "reason": "not_found",
            "detail": "Approval ticket not found.",
        }
    ]
    assert body["skipped_reason_summary"] == [
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Approval ticket not found.",
        }
    ]

    stored_ticket = sqlite_session.get(ApprovalTicketRecord, ticket_id)
    assert stored_ticket is not None
    assert stored_ticket.status == "approved"
    assert stored_ticket.waiting_status == "resumed"
    assert stored_ticket.approved_by == "ops-bulk-reviewer"


def test_retry_notification_dispatch_creates_new_attempt(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
) -> None:
    scheduled_dispatches = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Publish approval export",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-1"},
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
            "purpose_text": "notify operator to inspect publish secret",
            "notification_channel": "email",
            "notification_target": "ops@example.com",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    first_notification = request_body["notifications"][0]
    assert first_notification["status"] == "pending"

    retry_response = client.post(
        f"/api/sensitive-access/notification-dispatches/{first_notification['id']}/retry"
    )

    assert retry_response.status_code == 200
    retry_body = retry_response.json()
    retried_notification = retry_body["notification"]
    assert retry_body["approval_ticket"]["id"] == approval_ticket["id"]
    assert retried_notification["id"] != first_notification["id"]
    assert retried_notification["channel"] == "email"
    assert retried_notification["target"] == "ops@example.com"
    assert retried_notification["status"] == "pending"
    assert retried_notification["error"] is None

    assert len(scheduled_dispatches) == 2
    assert scheduled_dispatches[0].dispatch_id == first_notification["id"]
    assert scheduled_dispatches[1].dispatch_id == retried_notification["id"]
    assert scheduled_dispatches[1].source == "sensitive_access_retry"

    notifications = (
        sqlite_session.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.approval_ticket_id == approval_ticket["id"])
        .all()
    )
    assert len(notifications) == 2


def test_bulk_retry_notification_dispatches_allows_partial_success(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
) -> None:
    scheduled_dispatches = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=scheduled_dispatches.append
            ),
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_smtp_port=2525,
                notification_email_from_address="noreply@example.test",
            ),
        ),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Publish approval export",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-bulk-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-bulk-retry",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "bulk retry notification",
            "notification_channel": "email",
            "notification_target": "ops@example.com",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    first_notification = request_body["notifications"][0]
    assert first_notification["status"] == "pending"

    bulk_retry_response = client.post(
        "/api/sensitive-access/notification-dispatches/bulk-retry",
        json={
            "dispatch_ids": [first_notification["id"], "missing-dispatch", first_notification["id"]],
        },
    )

    assert bulk_retry_response.status_code == 200
    body = bulk_retry_response.json()
    assert body["requested_count"] == 2
    assert body["retried_count"] == 1
    assert body["skipped_count"] == 1
    retried_item = body["retried_items"][0]
    assert retried_item["approval_ticket"]["id"] == approval_ticket["id"]
    assert retried_item["notification"]["id"] != first_notification["id"]
    assert retried_item["notification"]["status"] == "pending"
    assert body["skipped_items"] == [
        {
            "dispatch_id": "missing-dispatch",
            "reason": "not_found",
            "detail": "Notification dispatch not found.",
        }
    ]
    assert body["skipped_reason_summary"] == [
        {
            "reason": "not_found",
            "count": 1,
            "detail": "Notification dispatch not found.",
        }
    ]

    assert len(scheduled_dispatches) == 2
    assert scheduled_dispatches[0].dispatch_id == first_notification["id"]
    assert scheduled_dispatches[1].dispatch_id == retried_item["notification"]["id"]
    assert scheduled_dispatches[1].source == "sensitive_access_retry"

    notifications = (
        sqlite_session.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.approval_ticket_id == approval_ticket["id"])
        .all()
    )
    assert len(notifications) == 2
    original_notification = next(
        item for item in notifications if item.id == first_notification["id"]
    )
    retried_notification = next(
        item for item in notifications if item.id == retried_item["notification"]["id"]
    )
    assert original_notification.status == "failed"
    assert retried_notification.status == "pending"
