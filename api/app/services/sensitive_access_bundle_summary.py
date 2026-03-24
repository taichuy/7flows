from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from app.schemas.sensitive_access import SensitiveResourceItem
from app.services.sensitive_access_presenters import serialize_sensitive_resource
from app.services.sensitive_access_types import SensitiveAccessRequestBundle


@dataclass(frozen=True)
class SensitiveAccessBundleSummary:
    request_count: int = 0
    approval_ticket_count: int = 0
    pending_approval_count: int = 0
    approved_approval_count: int = 0
    rejected_approval_count: int = 0
    expired_approval_count: int = 0
    pending_notification_count: int = 0
    delivered_notification_count: int = 0
    failed_notification_count: int = 0
    primary_resource: SensitiveResourceItem | None = None


def _has_pending_waiting_approval(bundle: SensitiveAccessRequestBundle) -> bool:
    approval_ticket = bundle.approval_ticket
    return bool(
        approval_ticket is not None
        and approval_ticket.status == "pending"
        and approval_ticket.waiting_status == "waiting"
    )


def _count_failed_notifications(bundle: SensitiveAccessRequestBundle) -> int:
    return sum(1 for notification in bundle.notifications if notification.status == "failed")


def _has_retriable_notification(bundle: SensitiveAccessRequestBundle) -> bool:
    return any(notification.status != "delivered" for notification in bundle.notifications)


def _resolve_bundle_activity_at(bundle: SensitiveAccessRequestBundle) -> datetime:
    timestamps = [bundle.access_request.created_at]
    if bundle.approval_ticket is not None:
        timestamps.append(bundle.approval_ticket.created_at)
    timestamps.extend(
        notification.created_at
        for notification in bundle.notifications
        if notification.created_at is not None
    )
    return max(timestamps) if timestamps else datetime.min.replace(tzinfo=UTC)


def pick_primary_sensitive_access_bundle(
    bundles: Sequence[SensitiveAccessRequestBundle],
) -> SensitiveAccessRequestBundle | None:
    normalized_bundles = [bundle for bundle in bundles if bundle is not None]
    if not normalized_bundles:
        return None

    return max(
        normalized_bundles,
        key=lambda bundle: (
            1 if _has_pending_waiting_approval(bundle) else 0,
            _count_failed_notifications(bundle),
            1 if _has_retriable_notification(bundle) else 0,
            _resolve_bundle_activity_at(bundle),
        ),
    )


def summarize_sensitive_access_bundles(
    bundles: Sequence[SensitiveAccessRequestBundle],
) -> SensitiveAccessBundleSummary | None:
    normalized_bundles = [bundle for bundle in bundles if bundle is not None]
    if not normalized_bundles:
        return None

    approval_tickets = [
        bundle.approval_ticket
        for bundle in normalized_bundles
        if bundle.approval_ticket is not None
    ]
    notifications = [
        notification for bundle in normalized_bundles for notification in bundle.notifications
    ]
    primary_bundle = pick_primary_sensitive_access_bundle(normalized_bundles)

    return SensitiveAccessBundleSummary(
        request_count=len(normalized_bundles),
        approval_ticket_count=len(approval_tickets),
        pending_approval_count=sum(1 for ticket in approval_tickets if ticket.status == "pending"),
        approved_approval_count=sum(
            1 for ticket in approval_tickets if ticket.status == "approved"
        ),
        rejected_approval_count=sum(
            1 for ticket in approval_tickets if ticket.status == "rejected"
        ),
        expired_approval_count=sum(1 for ticket in approval_tickets if ticket.status == "expired"),
        pending_notification_count=sum(
            1 for notification in notifications if notification.status == "pending"
        ),
        delivered_notification_count=sum(
            1 for notification in notifications if notification.status == "delivered"
        ),
        failed_notification_count=sum(
            1 for notification in notifications if notification.status == "failed"
        ),
        primary_resource=(
            serialize_sensitive_resource(primary_bundle.resource)
            if primary_bundle is not None
            else None
        ),
    )
