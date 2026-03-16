from __future__ import annotations

from dataclasses import dataclass
from email.utils import getaddresses
from typing import Literal
from urllib.parse import urlparse

from app.core.config import Settings, get_settings

NotificationChannelDeliveryMode = Literal["inline", "worker"]
NotificationChannelHealthStatus = Literal["ready", "degraded"]
NotificationChannelTargetKind = Literal["in_app", "http_url", "email_list"]


@dataclass(frozen=True)
class NotificationChannelCapability:
    channel: str
    delivery_mode: NotificationChannelDeliveryMode
    target_kind: NotificationChannelTargetKind
    configured: bool
    health_status: NotificationChannelHealthStatus
    summary: str
    target_hint: str
    target_example: str


@dataclass(frozen=True)
class NotificationDispatchPreflight:
    normalized_target: str
    status: str
    error: str | None = None


def get_notification_channel_default_target(
    channel: str,
    settings: Settings | None = None,
) -> str | None:
    settings = settings or get_settings()
    if channel == "in_app":
        return "sensitive-access-inbox"

    target_by_channel = {
        "webhook": settings.notification_webhook_default_target,
        "slack": settings.notification_slack_default_target,
        "feishu": settings.notification_feishu_default_target,
        "email": settings.notification_email_default_target,
    }
    target = target_by_channel.get(channel, "")
    normalized = target.strip()
    return normalized or None


def _resolve_notification_target(
    channel: str,
    target: str,
    settings: Settings,
) -> str:
    explicit_target = target.strip()
    if explicit_target:
        return explicit_target
    return get_notification_channel_default_target(channel, settings) or ""


def _missing_target_error(channel: str) -> str:
    if channel == "webhook":
        return (
            "Webhook delivery requires a notification target URL. Provide notification_target "
            "or configure SEVENFLOWS_NOTIFICATION_WEBHOOK_DEFAULT_TARGET."
        )
    if channel == "slack":
        return (
            "Slack delivery requires an incoming webhook URL. Provide notification_target "
            "or configure SEVENFLOWS_NOTIFICATION_SLACK_DEFAULT_TARGET."
        )
    if channel == "feishu":
        return (
            "Feishu delivery requires a bot webhook URL. Provide notification_target "
            "or configure SEVENFLOWS_NOTIFICATION_FEISHU_DEFAULT_TARGET."
        )
    if channel == "email":
        return (
            "Email delivery requires at least one recipient. Provide notification_target "
            "or configure SEVENFLOWS_NOTIFICATION_EMAIL_DEFAULT_TARGET."
        )
    return f"Notification channel '{channel}' requires a notification_target."


def _smtp_email_configured(settings: Settings) -> bool:
    return bool(
        settings.notification_email_smtp_host.strip()
        and settings.notification_email_from_address.strip()
    )


def is_http_target(target: str) -> bool:
    parsed = urlparse(target.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def parse_email_recipients(target: str) -> list[str]:
    normalized = target.strip()
    if normalized.lower().startswith("mailto:"):
        normalized = urlparse(normalized).path
    normalized = normalized.replace(";", ",")
    recipients = [address.strip() for _, address in getaddresses([normalized]) if address]
    return [address for address in recipients if "@" in address and " " not in address]


def list_notification_channel_capabilities(
    settings: Settings | None = None,
) -> list[NotificationChannelCapability]:
    settings = settings or get_settings()
    email_configured = _smtp_email_configured(settings)
    return [
        NotificationChannelCapability(
            channel="in_app",
            delivery_mode="inline",
            target_kind="in_app",
            configured=True,
            health_status="ready",
            summary="直接写入 sensitive access inbox，不依赖外部渠道或 worker。",
            target_hint="固定使用 sensitive-access-inbox。",
            target_example="sensitive-access-inbox",
        ),
        NotificationChannelCapability(
            channel="webhook",
            delivery_mode="worker",
            target_kind="http_url",
            configured=True,
            health_status="ready",
            summary="通过通用 HTTP POST 投递；target 必须是可达的 http(s) URL。",
            target_hint="填写完整 webhook URL。",
            target_example="https://hooks.example.com/sensitive-access",
        ),
        NotificationChannelCapability(
            channel="slack",
            delivery_mode="worker",
            target_kind="http_url",
            configured=True,
            health_status="ready",
            summary="当前仅支持 Slack incoming webhook URL，不支持 channel 名称或 bot token 路由。",
            target_hint="填写 Slack incoming webhook URL。",
            target_example="https://hooks.slack.com/services/T000/B000/SECRET",
        ),
        NotificationChannelCapability(
            channel="feishu",
            delivery_mode="worker",
            target_kind="http_url",
            configured=True,
            health_status="ready",
            summary="当前仅支持飞书机器人 webhook URL，不支持 tenant app 鉴权。",
            target_hint="填写飞书机器人 webhook URL。",
            target_example="https://open.feishu.cn/open-apis/bot/v2/hook/secret-token",
        ),
        NotificationChannelCapability(
            channel="email",
            delivery_mode="worker",
            target_kind="email_list",
            configured=email_configured,
            health_status="ready" if email_configured else "degraded",
            summary=(
                "通过 SMTP 投递到邮箱列表。"
                if email_configured
                else "SMTP adapter 尚未配置；邮件通知会被立即标记为 failed，不会进入 worker 队列。"
            ),
            target_hint="填写一个或多个邮箱地址，支持逗号、分号或 mailto:。",
            target_example="ops@example.com; security@example.com",
        ),
    ]


def evaluate_notification_dispatch_preflight(
    *,
    channel: str,
    target: str,
    settings: Settings | None = None,
) -> NotificationDispatchPreflight:
    settings = settings or get_settings()
    normalized_target = _resolve_notification_target(channel, target, settings)
    if channel == "in_app":
        return NotificationDispatchPreflight(
            normalized_target=normalized_target or "sensitive-access-inbox",
            status="delivered",
        )

    if channel == "webhook":
        if not normalized_target:
            return NotificationDispatchPreflight(
                normalized_target="",
                status="failed",
                error=_missing_target_error(channel),
            )
        if not is_http_target(normalized_target):
            return NotificationDispatchPreflight(
                normalized_target=normalized_target,
                status="failed",
                error="Webhook notification target must be an http(s) URL.",
            )
        return NotificationDispatchPreflight(
            normalized_target=normalized_target,
            status="pending",
        )

    if channel == "slack":
        if not normalized_target:
            return NotificationDispatchPreflight(
                normalized_target="",
                status="failed",
                error=_missing_target_error(channel),
            )
        if not is_http_target(normalized_target):
            return NotificationDispatchPreflight(
                normalized_target=normalized_target,
                status="failed",
                error=(
                    "Slack delivery currently requires the notification target to be "
                    "an incoming webhook URL."
                ),
            )
        return NotificationDispatchPreflight(
            normalized_target=normalized_target,
            status="pending",
        )

    if channel == "feishu":
        if not normalized_target:
            return NotificationDispatchPreflight(
                normalized_target="",
                status="failed",
                error=_missing_target_error(channel),
            )
        if not is_http_target(normalized_target):
            return NotificationDispatchPreflight(
                normalized_target=normalized_target,
                status="failed",
                error=(
                    "Feishu delivery currently requires the notification target to be "
                    "a bot webhook URL."
                ),
            )
        return NotificationDispatchPreflight(
            normalized_target=normalized_target,
            status="pending",
        )

    if channel == "email":
        if not normalized_target:
            return NotificationDispatchPreflight(
                normalized_target="",
                status="failed",
                error=_missing_target_error(channel),
            )
        if not parse_email_recipients(normalized_target):
            return NotificationDispatchPreflight(
                normalized_target=normalized_target,
                status="failed",
                error=(
                    "Email delivery requires the notification target to contain at "
                    "least one valid email address."
                ),
            )
        if not _smtp_email_configured(settings):
            return NotificationDispatchPreflight(
                normalized_target=normalized_target,
                status="failed",
                error=(
                    "Email delivery adapter is not configured. Set "
                    "SEVENFLOWS_NOTIFICATION_EMAIL_SMTP_HOST and "
                    "SEVENFLOWS_NOTIFICATION_EMAIL_FROM_ADDRESS."
                ),
            )
        return NotificationDispatchPreflight(
            normalized_target=normalized_target,
            status="pending",
        )

    return NotificationDispatchPreflight(
        normalized_target=normalized_target,
        status="failed",
        error=f"Notification channel '{channel}' is not registered.",
    )
