import json

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.services.notification_delivery import NotificationDeliveryService
from app.services.notification_dispatch_scheduler import NotificationDispatchScheduler
from app.services.run_resume_scheduler import RunResumeScheduler
from app.services.sensitive_access_control import SensitiveAccessControlService


def _create_high_sensitivity_resource(
    service: SensitiveAccessControlService,
    sqlite_session: Session,
    *,
    label: str,
) -> str:
    resource = service.create_resource(
        sqlite_session,
        label=label,
        sensitivity_level="L3",
        source="workspace_resource",
        metadata={"path": "/exports/prod.csv"},
    )
    sqlite_session.commit()
    return resource.id


class FakeSMTPClient:
    def __init__(self) -> None:
        self.ehlo_calls = 0
        self.started_tls = False
        self.logged_in: tuple[str, str] | None = None
        self.messages: list = []

    def __enter__(self) -> "FakeSMTPClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def ehlo(self) -> None:
        self.ehlo_calls += 1

    def starttls(self) -> None:
        self.started_tls = True

    def login(self, username: str, password: str) -> None:
        self.logged_in = (username, password)

    def send_message(self, message) -> None:
        self.messages.append(message)


def test_notification_delivery_service_delivers_webhook_dispatch(
    sqlite_session: Session,
) -> None:
    sent_payloads: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent_payloads.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(204)

    def client_factory() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(handler))

    service = SensitiveAccessControlService(
        resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
        notification_dispatch_scheduler=NotificationDispatchScheduler(
            dispatcher=lambda _request: None
        ),
        settings=Settings(
            notification_email_smtp_host="smtp.example.test",
            notification_email_smtp_port=2525,
            notification_email_smtp_username="mailer",
            notification_email_smtp_password="secret",
            notification_email_from_address="noreply@example.test",
            notification_email_from_name="7Flows Ops",
            notification_email_starttls=True,
        ),
    )
    resource_id = _create_high_sensitivity_resource(
        service,
        sqlite_session,
        label="Webhook export",
    )

    bundle = service.request_access(
        sqlite_session,
        run_id=None,
        node_run_id=None,
        requester_type="ai",
        requester_id="assistant-export",
        resource_id=resource_id,
        action_type="read",
        purpose_text="notify operator for export review",
        notification_channel="webhook",
        notification_target="https://hooks.example.test/notify",
    )
    sqlite_session.commit()

    notification = bundle.notifications[0]
    assert notification.status == "pending"

    context = NotificationDeliveryService(client_factory=client_factory).deliver_dispatch(
        sqlite_session,
        dispatch_id=notification.id,
    )

    assert context.notification.status == "delivered"
    assert context.notification.delivered_at is not None
    assert context.notification.error is None
    assert len(sent_payloads) == 1
    assert sent_payloads[0]["dispatchId"] == notification.id
    assert sent_payloads[0]["approvalTicket"]["id"] == bundle.approval_ticket.id


def test_notification_delivery_service_marks_webhook_failure(
    sqlite_session: Session,
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="service unavailable")

    def client_factory() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(handler))

    service = SensitiveAccessControlService(
        resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
        notification_dispatch_scheduler=NotificationDispatchScheduler(
            dispatcher=lambda _request: None
        ),
        settings=Settings(
            notification_email_smtp_host="smtp.example.test",
            notification_email_smtp_port=2525,
            notification_email_smtp_username="mailer",
            notification_email_smtp_password="secret",
            notification_email_from_address="noreply@example.test",
            notification_email_from_name="7Flows Ops",
            notification_email_starttls=True,
        ),
    )
    resource_id = _create_high_sensitivity_resource(
        service,
        sqlite_session,
        label="Webhook export failure",
    )

    bundle = service.request_access(
        sqlite_session,
        run_id=None,
        node_run_id=None,
        requester_type="ai",
        requester_id="assistant-export",
        resource_id=resource_id,
        action_type="read",
        purpose_text="notify operator for export review",
        notification_channel="webhook",
        notification_target="https://hooks.example.test/notify",
    )
    sqlite_session.commit()

    context = NotificationDeliveryService(client_factory=client_factory).deliver_dispatch(
        sqlite_session,
        dispatch_id=bundle.notifications[0].id,
    )

    assert context.notification.status == "failed"
    assert context.notification.delivered_at is None
    assert "Webhook delivery failed" in (context.notification.error or "")


def test_notification_delivery_service_delivers_email_dispatch(
    sqlite_session: Session,
) -> None:
    fake_client = FakeSMTPClient()
    captured_factory_args: dict[str, object] = {}

    def smtp_factory(host: str, port: int, timeout_seconds: float, use_ssl: bool):
        captured_factory_args.update(
            {
                "host": host,
                "port": port,
                "timeout_seconds": timeout_seconds,
                "use_ssl": use_ssl,
            }
        )
        return fake_client

    service = SensitiveAccessControlService(
        resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
        notification_dispatch_scheduler=NotificationDispatchScheduler(
            dispatcher=lambda _request: None
        ),
        settings=Settings(
            notification_email_smtp_host="smtp.example.test",
            notification_email_smtp_port=2525,
            notification_email_smtp_username="mailer",
            notification_email_smtp_password="secret",
            notification_email_from_address="noreply@example.test",
            notification_email_from_name="7Flows Ops",
            notification_email_starttls=True,
        ),
    )
    resource_id = _create_high_sensitivity_resource(
        service,
        sqlite_session,
        label="Email export",
    )

    bundle = service.request_access(
        sqlite_session,
        run_id=None,
        node_run_id=None,
        requester_type="ai",
        requester_id="assistant-export",
        resource_id=resource_id,
        action_type="read",
        purpose_text="notify operator for export review",
        notification_channel="email",
        notification_target="ops@example.com; security@example.com",
    )
    sqlite_session.commit()

    assert bundle.notifications[0].status == "pending"

    context = NotificationDeliveryService(
        settings=Settings(
            notification_email_smtp_host="smtp.example.test",
            notification_email_smtp_port=2525,
            notification_email_smtp_username="mailer",
            notification_email_smtp_password="secret",
            notification_email_from_address="noreply@example.test",
            notification_email_from_name="7Flows Ops",
            notification_email_starttls=True,
        ),
        smtp_factory=smtp_factory,
    ).deliver_dispatch(
        sqlite_session,
        dispatch_id=bundle.notifications[0].id,
    )

    assert context.notification.status == "delivered"
    assert context.notification.delivered_at is not None
    assert captured_factory_args == {
        "host": "smtp.example.test",
        "port": 2525,
        "timeout_seconds": 10.0,
        "use_ssl": False,
    }
    assert fake_client.started_tls is True
    assert fake_client.logged_in == ("mailer", "secret")
    assert len(fake_client.messages) == 1
    message = fake_client.messages[0]
    assert message["From"] == "7Flows Ops <noreply@example.test>"
    assert message["To"] == "ops@example.com, security@example.com"
    assert bundle.approval_ticket.id in message.get_content()


def test_notification_delivery_service_marks_email_failure_when_not_configured(
    sqlite_session: Session,
) -> None:
    service = SensitiveAccessControlService(
        resume_scheduler=RunResumeScheduler(dispatcher=lambda _request: None),
        notification_dispatch_scheduler=NotificationDispatchScheduler(
            dispatcher=lambda _request: None
        ),
    )
    resource_id = _create_high_sensitivity_resource(
        service,
        sqlite_session,
        label="Email export missing config",
    )

    bundle = service.request_access(
        sqlite_session,
        run_id=None,
        node_run_id=None,
        requester_type="ai",
        requester_id="assistant-export",
        resource_id=resource_id,
        action_type="read",
        purpose_text="notify operator for export review",
        notification_channel="email",
        notification_target="ops@example.com",
    )
    sqlite_session.commit()

    assert bundle.notifications[0].status == "failed"

    context = NotificationDeliveryService(
        settings=Settings(
            notification_email_smtp_host="",
            notification_email_from_address="",
        )
    ).deliver_dispatch(
        sqlite_session,
        dispatch_id=bundle.notifications[0].id,
    )

    assert context.notification.status == "failed"
    assert context.notification.delivered_at is None
    assert "Email delivery adapter is not configured" in (context.notification.error or "")
