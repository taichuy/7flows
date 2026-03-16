from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.sensitive_access import (
    ApprovalTicketRecord,
    NotificationDispatchRecord,
    SensitiveAccessRequestRecord,
    SensitiveResourceRecord,
)
from app.services.notification_channel_diagnostics import (
    list_notification_channel_diagnostics,
)


def test_list_notification_channel_diagnostics_summarizes_dispatch_history(
    sqlite_session: Session,
) -> None:
    now = datetime.now(UTC)
    resource = SensitiveResourceRecord(
        id="resource-1",
        label="Published secret",
        sensitivity_level="L3",
        source="published_secret",
        metadata_payload={"endpoint_id": "pub-1"},
        created_at=now - timedelta(minutes=20),
        updated_at=now - timedelta(minutes=20),
    )
    access_request = SensitiveAccessRequestRecord(
        id="request-1",
        run_id=None,
        node_run_id=None,
        requester_type="ai",
        requester_id="assistant-main",
        resource_id=resource.id,
        action_type="read",
        purpose_text="inspect publish secret",
        decision="require_approval",
        reason_code="approval_required_high_sensitive_access",
        created_at=now - timedelta(minutes=18),
        decided_at=None,
    )
    approval_ticket = ApprovalTicketRecord(
        id="ticket-1",
        access_request_id=access_request.id,
        run_id=None,
        node_run_id=None,
        status="pending",
        waiting_status="waiting",
        approved_by=None,
        decided_at=None,
        expires_at=now + timedelta(hours=1),
        created_at=now - timedelta(minutes=18),
    )
    sqlite_session.add_all([resource, access_request, approval_ticket])
    sqlite_session.flush()

    sqlite_session.add_all(
        [
            NotificationDispatchRecord(
                id="dispatch-email-delivered",
                approval_ticket_id=approval_ticket.id,
                channel="email",
                target="ops@example.com; security@example.com",
                status="delivered",
                delivered_at=now - timedelta(minutes=12),
                error=None,
                created_at=now - timedelta(minutes=14),
            ),
            NotificationDispatchRecord(
                id="dispatch-email-failed",
                approval_ticket_id=approval_ticket.id,
                channel="email",
                target="ops@example.com; security@example.com",
                status="failed",
                delivered_at=None,
                error="SMTP timeout",
                created_at=now - timedelta(minutes=2),
            ),
            NotificationDispatchRecord(
                id="dispatch-slack-pending",
                approval_ticket_id=approval_ticket.id,
                channel="slack",
                target="https://hooks.slack.com/services/T000/B000/SECRET",
                status="pending",
                delivered_at=None,
                error=None,
                created_at=now - timedelta(minutes=1),
            ),
        ]
    )
    sqlite_session.commit()

    diagnostics = {
        item.capability.channel: item
        for item in list_notification_channel_diagnostics(
            sqlite_session,
            settings=Settings(
                notification_email_smtp_host="smtp.example.test",
                notification_email_from_address="noreply@example.test",
            ),
        )
    }

    email = diagnostics["email"]
    assert email.dispatch_summary.delivered_count == 1
    assert email.dispatch_summary.failed_count == 1
    assert email.dispatch_summary.pending_count == 0
    assert email.dispatch_summary.latest_failure_error == "SMTP timeout"
    assert email.dispatch_summary.latest_failure_target == "o***@example.com +1"
    smtp_host = next(fact for fact in email.config_facts if fact.key == "smtp_host")
    assert smtp_host.status == "configured"
    assert smtp_host.value == "smtp.example.test:587"

    slack = diagnostics["slack"]
    assert slack.dispatch_summary.pending_count == 1
    assert slack.dispatch_summary.latest_dispatch_at is not None
    assert "worker 队列" in slack.health_reason
