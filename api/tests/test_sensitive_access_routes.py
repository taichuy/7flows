from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from pytest import MonkeyPatch
from sqlalchemy.orm import Session

from app.api.routes import sensitive_access as sensitive_access_routes
from app.core.config import Settings
from app.models.run import NodeRun, Run
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.models.workflow import Workflow
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
    assert body["request"]["decision_label"] == "Allowed"
    assert body["request"]["reason_code"] == "allow_low_sensitivity"
    assert body["request"]["reason_label"] == "Low-sensitivity access allowed"
    assert (
        body["request"]["policy_summary"]
        == "Default policy allows low-sensitivity resources without extra review."
    )
    assert body["approval_ticket"] is None
    assert body["notifications"] == []

    stored_requests = sqlite_session.query(SensitiveAccessRequestRecord).all()
    assert len(stored_requests) == 1
    assert stored_requests[0].decided_at is not None
    assert sqlite_session.query(ApprovalTicketRecord).count() == 0


def test_request_high_sensitivity_access_creates_approval_ticket_and_decision(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-success",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-success",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        waiting_reason="waiting approval",
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()

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
            "run_id": run.id,
            "node_run_id": node_run.id,
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
    assert request_body["request"]["decision_label"] == "Approval required"
    assert request_body["request"]["reason_code"] == "approval_required_high_sensitive_access"
    assert (
        request_body["request"]["reason_label"]
        == "High-sensitivity access requires approval"
    )
    assert (
        request_body["request"]["policy_summary"]
        == "High-sensitivity access must be reviewed by an operator before the workflow can resume."
    )
    assert approval_ticket is not None
    assert approval_ticket["status"] == "pending"
    assert approval_ticket["waiting_status"] == "waiting"
    assert approval_ticket["expires_at"] is not None
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
    assert decision_body["request"]["decision_label"] == "Allowed"
    assert decision_body["request"]["reason_code"] == "approved_after_review"
    assert decision_body["request"]["reason_label"] == "Access approved after review"
    assert (
        decision_body["request"]["policy_summary"]
        == "An operator approved the request and the blocked workflow can resume."
    )
    assert decision_body["approval_ticket"]["status"] == "approved"
    assert decision_body["approval_ticket"]["waiting_status"] == "resumed"
    assert decision_body["approval_ticket"]["approved_by"] == "ops-reviewer"
    assert len(decision_body["notifications"]) == 1
    assert decision_body["outcome_explanation"] == {
        "primary_signal": "审批已通过，对应 waiting 链路已交回 runtime 恢复。",
        "follow_up": (
            "An operator approved the request and the blocked workflow can resume. "
            "如果 run 仍停在 waiting，请继续检查 callback 到达情况或定时恢复链路。"
        ),
    }
    assert decision_body["run_snapshot"] == {
        "workflow_id": sample_workflow.id,
        "status": "waiting",
        "current_node_id": "mock_tool",
        "waiting_reason": "waiting approval",
    }

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


def test_decide_expired_approval_ticket_marks_ticket_expired_and_returns_error(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    scheduled_resumes = []
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=scheduled_resumes.append),
            notification_dispatch_scheduler=NotificationDispatchScheduler(
                dispatcher=lambda _request: None
            ),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-expired",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-expired",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Expired approval secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-expired-approval"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": run.id,
            "node_run_id": node_run.id,
            "requester_type": "ai",
            "requester_id": "assistant-expired-approval",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "expire before operator decision",
        },
    )

    assert request_response.status_code == 201
    approval_ticket = request_response.json()["approval_ticket"]
    assert approval_ticket is not None

    stored_ticket = sqlite_session.get(ApprovalTicketRecord, approval_ticket["id"])
    assert stored_ticket is not None
    stored_ticket.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    sqlite_session.commit()

    decision_response = client.post(
        f"/api/sensitive-access/approval-tickets/{approval_ticket['id']}/decision",
        json={"status": "approved", "approved_by": "ops-reviewer"},
    )

    assert decision_response.status_code == 422
    assert decision_response.json()["detail"] == "Approval ticket expired."

    sqlite_session.refresh(stored_ticket)
    stored_request = sqlite_session.get(
        SensitiveAccessRequestRecord,
        request_response.json()["request"]["id"],
    )
    assert stored_request is not None
    assert stored_ticket.status == "expired"
    assert stored_ticket.waiting_status == "failed"
    assert stored_request.decision == "deny"
    assert stored_request.reason_code == "approval_expired"
    assert len(scheduled_resumes) == 1
    assert scheduled_resumes[0].run_id == run.id
    assert scheduled_resumes[0].source == "sensitive_access_expiry"


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
    assert any(
        fact["key"] == "default_target" and "each request must provide" in fact["value"]
        for fact in channels["slack"]["config_facts"]
    )


def test_create_sensitive_access_request_uses_channel_default_target_when_omitted(
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
                notification_slack_default_target="https://hooks.slack.com/services/T000/B000/SECRET",
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
            "requester_id": "assistant-export-default-target",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "notify operator for export review",
            "notification_channel": "slack",
        },
    )

    assert request_response.status_code == 201
    notification = request_response.json()["notifications"][0]
    assert notification["channel"] == "slack"
    assert notification["target"] == "https://hooks.slack.com/services/T000/B000/SECRET"
    assert notification["status"] == "pending"
    assert notification["error"] is None

    assert len(scheduled_dispatches) == 1
    assert scheduled_dispatches[0].dispatch_id == notification["id"]

    stored_notification = sqlite_session.get(NotificationDispatchRecord, notification["id"])
    assert stored_notification is not None
    assert (
        stored_notification.target
        == "https://hooks.slack.com/services/T000/B000/SECRET"
    )


def test_bulk_decide_approval_tickets_allows_partial_success(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    monkeypatch.setattr(
        sensitive_access_routes,
        "service",
        SensitiveAccessControlService(
            resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
            settings=Settings(),
        ),
    )

    run = Run(
        id="run-approval-bulk",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-approval-bulk",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        waiting_reason="waiting approval",
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()

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
            "run_id": run.id,
            "node_run_id": node_run.id,
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
    assert body["outcome_explanation"] == {
        "primary_signal": "本次已批准 1 条审批票据，并把对应 waiting 链路交回 runtime 恢复。",
        "follow_up": (
            "另有 1 条未处理（票据不存在 1 条），请先刷新 inbox slice 再决定是否补做。 "
            "后续请继续回看对应 run detail / inbox slice，确认 waiting 是否真正继续前进。"
        ),
    }
    assert body["run_follow_up"] == {
        "affected_run_count": 1,
        "sampled_run_count": 1,
        "waiting_run_count": 1,
        "running_run_count": 0,
        "succeeded_run_count": 0,
        "failed_run_count": 0,
        "unknown_run_count": 0,
        "sampled_runs": [
            {
                "run_id": run.id,
                "snapshot": {
                    "workflow_id": sample_workflow.id,
                    "status": "waiting",
                    "current_node_id": "mock_tool",
                    "waiting_reason": "waiting approval",
                },
            }
        ],
    }

    stored_ticket = sqlite_session.get(ApprovalTicketRecord, ticket_id)
    assert stored_ticket is not None
    assert stored_ticket.status == "approved"
    assert stored_ticket.waiting_status == "resumed"
    assert stored_ticket.approved_by == "ops-bulk-reviewer"


def test_retry_notification_dispatch_creates_new_attempt(
    client: TestClient,
    sqlite_session: Session,
    monkeypatch: MonkeyPatch,
    sample_workflow: Workflow,
) -> None:
    scheduled_dispatches = []
    run = Run(
        id="run-notification-retry",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-notification-retry",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        waiting_reason="waiting approval",
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()
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
            "run_id": run.id,
            "node_run_id": node_run.id,
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
    assert retry_body["outcome_explanation"] == {
        "primary_signal": "通知已按 ops@example.com 重新入队，等待 worker 投递。",
        "follow_up": (
            "这一步只负责重新送达审批请求，不会直接恢复 run；"
            "后续仍取决于审批结果或后续 callback。"
        ),
    }
    assert retry_body["run_snapshot"] == {
        "workflow_id": sample_workflow.id,
        "status": "waiting",
        "current_node_id": "mock_tool",
        "waiting_reason": "waiting approval",
    }

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
    sample_workflow: Workflow,
) -> None:
    scheduled_dispatches = []
    run = Run(
        id="run-notification-bulk",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-notification-bulk",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        waiting_reason="waiting approval",
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()
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
            "run_id": run.id,
            "node_run_id": node_run.id,
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
            "dispatch_ids": [
                first_notification["id"],
                "missing-dispatch",
                first_notification["id"],
            ],
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
    assert body["outcome_explanation"] == {
        "primary_signal": "本次已重试 1 条通知，其中 1 条正在等待 worker 投递。",
        "follow_up": (
            "另有 1 条未处理（通知不存在 1 条），请先刷新当前 ticket 的最新通知列表。 "
            "通知重试只负责把审批请求重新送达目标，不会直接恢复 run；"
            "后续仍取决于审批结果或 callback。"
        ),
    }
    assert body["run_follow_up"] == {
        "affected_run_count": 1,
        "sampled_run_count": 1,
        "waiting_run_count": 1,
        "running_run_count": 0,
        "succeeded_run_count": 0,
        "failed_run_count": 0,
        "unknown_run_count": 0,
        "sampled_runs": [
            {
                "run_id": run.id,
                "snapshot": {
                    "workflow_id": sample_workflow.id,
                    "status": "waiting",
                    "current_node_id": "mock_tool",
                    "waiting_reason": "waiting approval",
                },
            }
        ],
    }

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


def test_retry_notification_dispatch_allows_target_override(
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
            "metadata": {"binding_id": "binding-target-override"},
        },
    )
    resource_id = resource_response.json()["id"]

    request_response = client.post(
        "/api/sensitive-access/requests",
        json={
            "requester_type": "ai",
            "requester_id": "assistant-target-override",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "retarget notification",
            "notification_channel": "email",
            "notification_target": "ops-old@example.com",
        },
    )

    assert request_response.status_code == 201
    request_body = request_response.json()
    approval_ticket = request_body["approval_ticket"]
    first_notification = request_body["notifications"][0]
    assert first_notification["status"] == "pending"

    retry_response = client.post(
        f"/api/sensitive-access/notification-dispatches/{first_notification['id']}/retry",
        json={"target": "ops-new@example.com"},
    )

    assert retry_response.status_code == 200
    retry_body = retry_response.json()
    retried_notification = retry_body["notification"]
    assert retry_body["approval_ticket"]["id"] == approval_ticket["id"]
    assert retried_notification["id"] != first_notification["id"]
    assert retried_notification["target"] == "ops-new@example.com"
    assert retried_notification["status"] == "pending"

    assert len(scheduled_dispatches) == 2
    assert scheduled_dispatches[1].dispatch_id == retried_notification["id"]

    notifications = (
        sqlite_session.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.approval_ticket_id == approval_ticket["id"])
        .all()
    )
    assert len(notifications) == 2
    original_notification = next(
        item for item in notifications if item.id == first_notification["id"]
    )
    latest_notification = next(
        item for item in notifications if item.id == retried_notification["id"]
    )
    assert original_notification.target == "ops-old@example.com"
    assert original_notification.status == "failed"
    assert latest_notification.target == "ops-new@example.com"
    assert latest_notification.status == "pending"


def test_sensitive_access_listing_filters_support_node_and_ticket_scopes(
    client: TestClient,
    sqlite_session: Session,
    sample_workflow: Workflow,
) -> None:
    first_run = Run(
        id="run-scope-1",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    second_run = Run(
        id="run-scope-2",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        status="waiting",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    first_node_run = NodeRun(
        id="node-run-scope-1",
        run_id=first_run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        created_at=datetime.now(UTC),
    )
    second_node_run = NodeRun(
        id="node-run-scope-2",
        run_id=second_run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="tool",
        status="waiting_callback",
        phase="waiting_callback",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[],
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([first_run, second_run, first_node_run, second_node_run])
    sqlite_session.commit()

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Scoped approval secret",
            "sensitivity_level": "L3",
            "source": "published_secret",
            "metadata": {"binding_id": "binding-scope-1"},
        },
    )
    resource_id = resource_response.json()["id"]

    first_request = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": "run-scope-1",
            "node_run_id": "node-run-scope-1",
            "requester_type": "ai",
            "requester_id": "assistant-scope-1",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "first scoped request",
        },
    )
    second_request = client.post(
        "/api/sensitive-access/requests",
        json={
            "run_id": "run-scope-2",
            "node_run_id": "node-run-scope-2",
            "requester_type": "ai",
            "requester_id": "assistant-scope-2",
            "resource_id": resource_id,
            "action_type": "read",
            "purpose_text": "second scoped request",
        },
    )

    first_body = first_request.json()
    second_body = second_request.json()

    requests_response = client.get(
        "/api/sensitive-access/requests",
        params={
            "node_run_id": "node-run-scope-1",
            "access_request_id": first_body["request"]["id"],
        },
    )
    assert requests_response.status_code == 200
    assert [item["id"] for item in requests_response.json()] == [first_body["request"]["id"]]

    tickets_response = client.get(
        "/api/sensitive-access/approval-tickets",
        params={
            "node_run_id": "node-run-scope-1",
            "access_request_id": first_body["request"]["id"],
            "approval_ticket_id": first_body["approval_ticket"]["id"],
        },
    )
    assert tickets_response.status_code == 200
    assert [item["id"] for item in tickets_response.json()] == [first_body["approval_ticket"]["id"]]

    notifications_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={"approval_ticket_id": first_body["approval_ticket"]["id"]},
    )
    assert notifications_response.status_code == 200
    notifications = notifications_response.json()
    assert len(notifications) == 1
    assert notifications[0]["approval_ticket_id"] == first_body["approval_ticket"]["id"]

    scoped_notifications_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "run_id": "run-scope-1",
            "node_run_id": "node-run-scope-1",
            "access_request_id": first_body["request"]["id"],
        },
    )
    assert scoped_notifications_response.status_code == 200
    scoped_notifications = scoped_notifications_response.json()
    assert [item["approval_ticket_id"] for item in scoped_notifications] == [
        first_body["approval_ticket"]["id"]
    ]

    notification_status_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "approval_ticket_id": first_body["approval_ticket"]["id"],
            "status": notifications[0]["status"],
            "channel": notifications[0]["channel"],
        },
    )
    assert notification_status_response.status_code == 200
    assert [item["id"] for item in notification_status_response.json()] == [notifications[0]["id"]]

    unmatched_channel_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "approval_ticket_id": first_body["approval_ticket"]["id"],
            "channel": "slack",
        },
    )
    assert unmatched_channel_response.status_code == 200
    assert unmatched_channel_response.json() == []

    unmatched_notifications_response = client.get(
        "/api/sensitive-access/notification-dispatches",
        params={
            "node_run_id": "node-run-scope-1",
            "access_request_id": second_body["request"]["id"],
        },
    )
    assert unmatched_notifications_response.status_code == 200
    assert unmatched_notifications_response.json() == []

    unmatched_tickets_response = client.get(
        "/api/sensitive-access/approval-tickets",
        params={
            "node_run_id": "node-run-scope-1",
            "approval_ticket_id": second_body["approval_ticket"]["id"],
        },
    )
    assert unmatched_tickets_response.status_code == 200
    assert unmatched_tickets_response.json() == []
