from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.sensitive_access import NotificationDispatchRecord
from app.services.notification_channel_governance import (
    NotificationChannelCapability,
    list_notification_channel_capabilities,
    parse_email_recipients,
)

NotificationChannelConfigFactStatus = Literal["configured", "missing", "info"]


@dataclass(frozen=True)
class NotificationChannelConfigFact:
    key: str
    label: str
    status: NotificationChannelConfigFactStatus
    value: str


@dataclass(frozen=True)
class NotificationChannelDispatchSummary:
    pending_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    latest_dispatch_at: datetime | None = None
    latest_delivered_at: datetime | None = None
    latest_failure_at: datetime | None = None
    latest_failure_error: str | None = None
    latest_failure_target: str | None = None


@dataclass(frozen=True)
class NotificationChannelDiagnostics:
    capability: NotificationChannelCapability
    health_reason: str
    config_facts: list[NotificationChannelConfigFact]
    dispatch_summary: NotificationChannelDispatchSummary


def _summarize_http_target(target: str) -> str:
    parsed = urlparse(target.strip())
    if not parsed.scheme or not parsed.netloc:
        return target.strip() or "(empty target)"
    path = parsed.path.rstrip("/")
    if not path:
        return f"{parsed.scheme}://{parsed.netloc}"
    segments = [segment for segment in path.split("/") if segment]
    if not segments:
        return f"{parsed.scheme}://{parsed.netloc}"
    return f"{parsed.scheme}://{parsed.netloc}/.../{segments[-1][:6]}"


def _mask_email_address(address: str) -> str:
    local_part, _, domain = address.partition("@")
    if not domain:
        return address
    if not local_part:
        return f"***@{domain}"
    return f"{local_part[0]}***@{domain}"


def _summarize_email_target(target: str) -> str:
    recipients = parse_email_recipients(target)
    if not recipients:
        return target.strip() or "(empty target)"
    summary = _mask_email_address(recipients[0])
    if len(recipients) == 1:
        return summary
    return f"{summary} +{len(recipients) - 1}"


def _summarize_target(channel: str, target: str) -> str:
    if channel == "email":
        return _summarize_email_target(target)
    if channel == "in_app":
        return target.strip() or "sensitive-access-inbox"
    return _summarize_http_target(target)


def _build_channel_config_facts(
    capability: NotificationChannelCapability,
    settings: Settings,
) -> list[NotificationChannelConfigFact]:
    facts = [
        NotificationChannelConfigFact(
            key="delivery_mode",
            label="Delivery mode",
            status="info",
            value=(
                "Inline inbox write-through"
                if capability.delivery_mode == "inline"
                else "Worker queue dispatch"
            ),
        ),
        NotificationChannelConfigFact(
            key="target_contract",
            label="Target contract",
            status="info",
            value=capability.target_hint,
        ),
    ]

    if capability.delivery_mode == "worker":
        facts.append(
            NotificationChannelConfigFact(
                key="delivery_timeout",
                label="Delivery timeout",
                status="info",
                value=f"{settings.notification_delivery_timeout_seconds:g}s",
            )
        )

    if capability.channel != "email":
        facts.append(
            NotificationChannelConfigFact(
                key="channel_scope",
                label="Channel scope",
                status="info",
                value="Per-request target; no shared adapter credential in current kernel.",
            )
        )
        return facts

    facts.extend(
        [
            NotificationChannelConfigFact(
                key="smtp_host",
                label="SMTP host",
                status="configured" if settings.notification_email_smtp_host.strip() else "missing",
                value=(
                    f"{settings.notification_email_smtp_host.strip()}:{settings.notification_email_smtp_port}"
                    if settings.notification_email_smtp_host.strip()
                    else "SEVENFLOWS_NOTIFICATION_EMAIL_SMTP_HOST is empty"
                ),
            ),
            NotificationChannelConfigFact(
                key="from_address",
                label="From address",
                status=(
                    "configured"
                    if settings.notification_email_from_address.strip()
                    else "missing"
                ),
                value=(
                    settings.notification_email_from_address.strip()
                    if settings.notification_email_from_address.strip()
                    else "SEVENFLOWS_NOTIFICATION_EMAIL_FROM_ADDRESS is empty"
                ),
            ),
            NotificationChannelConfigFact(
                key="smtp_transport",
                label="SMTP transport",
                status="info",
                value=(
                    "ssl"
                    if settings.notification_email_use_ssl
                    else "starttls"
                    if settings.notification_email_starttls
                    else "plain"
                ),
            ),
            NotificationChannelConfigFact(
                key="smtp_auth",
                label="SMTP auth",
                status="info",
                value=(
                    "username/password configured"
                    if settings.notification_email_smtp_username.strip()
                    and settings.notification_email_smtp_password
                    else "anonymous or relay"
                ),
            ),
        ]
    )
    return facts


def _build_health_reason(
    capability: NotificationChannelCapability,
    dispatch_summary: NotificationChannelDispatchSummary,
) -> str:
    if not capability.configured:
        return (
            "当前 channel contract 已知，但关键配置缺失；新 dispatch 会在 preflight 直接失败，"
            "不会继续进入 worker。"
        )
    if dispatch_summary.failed_count > 0:
        return (
            "当前 channel contract 已就绪，但历史 dispatch 已出现失败；"
            "请结合最新错误与 target contract 排查。"
        )
    if dispatch_summary.pending_count > 0:
        return "当前 channel contract 已就绪，仍有 dispatch 在 worker 队列中等待投递。"
    return "当前 channel contract 已就绪，暂无待排查的 dispatch 失败记录。"


def _build_dispatch_summary_map(
    db: Session,
) -> dict[str, NotificationChannelDispatchSummary]:
    counts_by_channel_status = {
        (channel, status): count
        for channel, status, count in (
            db.query(
                NotificationDispatchRecord.channel,
                NotificationDispatchRecord.status,
                func.count(NotificationDispatchRecord.id),
            )
            .group_by(NotificationDispatchRecord.channel, NotificationDispatchRecord.status)
            .all()
        )
    }
    latest_dispatch_at_by_channel = dict(
        db.query(
            NotificationDispatchRecord.channel,
            func.max(NotificationDispatchRecord.created_at),
        )
        .group_by(NotificationDispatchRecord.channel)
        .all()
    )
    latest_delivered_at_by_channel = dict(
        db.query(
            NotificationDispatchRecord.channel,
            func.max(NotificationDispatchRecord.delivered_at),
        )
        .filter(NotificationDispatchRecord.delivered_at.is_not(None))
        .group_by(NotificationDispatchRecord.channel)
        .all()
    )

    latest_failed_by_channel: dict[str, NotificationDispatchRecord] = {}
    failed_dispatches = (
        db.query(NotificationDispatchRecord)
        .filter(NotificationDispatchRecord.status == "failed")
        .order_by(NotificationDispatchRecord.created_at.desc())
        .all()
    )
    for dispatch in failed_dispatches:
        latest_failed_by_channel.setdefault(dispatch.channel, dispatch)

    channels = {
        channel for channel, _status in counts_by_channel_status
    } | set(latest_dispatch_at_by_channel) | set(latest_delivered_at_by_channel)

    summary_map: dict[str, NotificationChannelDispatchSummary] = {}
    for channel in channels:
        latest_failed = latest_failed_by_channel.get(channel)
        summary_map[channel] = NotificationChannelDispatchSummary(
            pending_count=counts_by_channel_status.get((channel, "pending"), 0),
            delivered_count=counts_by_channel_status.get((channel, "delivered"), 0),
            failed_count=counts_by_channel_status.get((channel, "failed"), 0),
            latest_dispatch_at=latest_dispatch_at_by_channel.get(channel),
            latest_delivered_at=latest_delivered_at_by_channel.get(channel),
            latest_failure_at=latest_failed.created_at if latest_failed is not None else None,
            latest_failure_error=latest_failed.error if latest_failed is not None else None,
            latest_failure_target=(
                _summarize_target(channel, latest_failed.target)
                if latest_failed is not None
                else None
            ),
        )
    return summary_map


def list_notification_channel_diagnostics(
    db: Session,
    settings: Settings | None = None,
) -> list[NotificationChannelDiagnostics]:
    settings = settings or get_settings()
    capability_items = list_notification_channel_capabilities(settings)
    summary_map = _build_dispatch_summary_map(db)
    diagnostics: list[NotificationChannelDiagnostics] = []
    for capability in capability_items:
        dispatch_summary = summary_map.get(capability.channel, NotificationChannelDispatchSummary())
        diagnostics.append(
            NotificationChannelDiagnostics(
                capability=capability,
                health_reason=_build_health_reason(capability, dispatch_summary),
                config_facts=_build_channel_config_facts(capability, settings),
                dispatch_summary=dispatch_summary,
            )
        )
    return diagnostics
