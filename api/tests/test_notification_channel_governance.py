from app.core.config import Settings
from app.services.notification_channel_governance import (
    evaluate_notification_dispatch_preflight,
    list_notification_channel_capabilities,
)


def test_list_notification_channel_capabilities_marks_email_as_degraded_without_smtp() -> None:
    capabilities = {
        item.channel: item
        for item in list_notification_channel_capabilities(
            Settings(
                notification_email_smtp_host="",
                notification_email_from_address="",
            )
        )
    }

    assert capabilities["in_app"].health_status == "ready"
    assert capabilities["email"].health_status == "degraded"
    assert capabilities["email"].configured is False


def test_evaluate_notification_dispatch_preflight_requires_webhook_url_for_slack() -> None:
    preflight = evaluate_notification_dispatch_preflight(
        channel="slack",
        target="#ops-review",
    )

    assert preflight.status == "failed"
    assert "incoming webhook URL" in (preflight.error or "")


def test_evaluate_notification_dispatch_preflight_accepts_email_when_smtp_is_configured() -> None:
    preflight = evaluate_notification_dispatch_preflight(
        channel="email",
        target="ops@example.com; security@example.com",
        settings=Settings(
            notification_email_smtp_host="smtp.example.test",
            notification_email_from_address="noreply@example.test",
        ),
    )

    assert preflight.status == "pending"
    assert preflight.error is None


def test_evaluate_notification_dispatch_preflight_uses_configured_default_target() -> None:
    preflight = evaluate_notification_dispatch_preflight(
        channel="slack",
        target="",
        settings=Settings(
            notification_slack_default_target="https://hooks.slack.com/services/T000/B000/SECRET",
        ),
    )

    assert preflight.status == "pending"
    assert preflight.error is None
    assert (
        preflight.normalized_target
        == "https://hooks.slack.com/services/T000/B000/SECRET"
    )


def test_evaluate_notification_dispatch_preflight_requires_target_when_no_default_is_configured(
) -> None:
    preflight = evaluate_notification_dispatch_preflight(
        channel="webhook",
        target="",
        settings=Settings(),
    )

    assert preflight.status == "failed"
    assert "SEVENFLOWS_NOTIFICATION_WEBHOOK_DEFAULT_TARGET" in (preflight.error or "")


def test_evaluate_notification_dispatch_preflight_fails_email_when_smtp_is_missing() -> None:
    preflight = evaluate_notification_dispatch_preflight(
        channel="email",
        target="ops@example.com",
        settings=Settings(
            notification_email_smtp_host="",
            notification_email_from_address="",
        ),
    )

    assert preflight.status == "failed"
    assert "Email delivery adapter is not configured" in (preflight.error or "")
