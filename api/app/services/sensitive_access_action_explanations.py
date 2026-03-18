from collections import Counter

from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.sensitive_access import (
    ApprovalTicketBulkSkippedItem,
    NotificationDispatchBulkRetriedItem,
    NotificationDispatchBulkSkippedItem,
)
from app.services.sensitive_access_reasoning import describe_sensitive_access_reasoning
from app.services.sensitive_access_types import (
    ApprovalDecisionBundle,
    NotificationDispatchRetryBundle,
)

_APPROVAL_SKIP_REASON_LABELS = {
    "not_found": "票据不存在",
    "not_pending": "票据已不在待处理",
    "invalid_state": "票据状态不允许当前操作",
}

_NOTIFICATION_SKIP_REASON_LABELS = {
    "not_found": "通知不存在",
    "not_latest": "不是最新通知",
    "already_delivered": "通知已送达",
    "not_waiting": "关联票据已不在 waiting",
    "invalid_state": "通知状态不允许当前操作",
}


def _join_parts(parts: list[str | None]) -> str | None:
    normalized = [part.strip() for part in parts if part and part.strip()]
    if not normalized:
        return None
    return " ".join(normalized)


def _format_reason_summary(
    reasons: Counter[str],
    labels: dict[str, str],
) -> str | None:
    if not reasons:
        return None
    return "、".join(
        f"{labels.get(reason, reason)} {count} 条"
        for reason, count in reasons.items()
    )


def build_approval_decision_outcome_explanation(
    bundle: ApprovalDecisionBundle,
) -> SignalFollowUpExplanation:
    decision = bundle.approval_ticket.status
    reasoning = describe_sensitive_access_reasoning(
        decision=bundle.access_request.decision,
        reason_code=bundle.access_request.reason_code,
    )
    notification_cleanup_count = sum(
        1 for item in bundle.notifications if item.status == "failed"
    )

    if decision == "approved":
        primary_signal = "审批已通过，对应 waiting 链路已交回 runtime 恢复。"
        follow_up = _join_parts(
            [
                reasoning.policy_summary,
                (
                    f"同时已收口 {notification_cleanup_count} 条旧通知，避免审批完成后仍沿旧目标继续催办。"
                    if notification_cleanup_count > 0
                    else None
                ),
                "如果 run 仍停在 waiting，请继续检查 callback 到达情况或定时恢复链路。",
            ]
        )
        return SignalFollowUpExplanation(
            primary_signal=primary_signal,
            follow_up=follow_up,
        )

    primary_signal = "审批已拒绝，对应 waiting 链路会保持 blocked / failed，不会继续自动恢复。"
    follow_up = _join_parts(
        [
            reasoning.policy_summary,
            (
                f"同时已收口 {notification_cleanup_count} 条旧通知，避免审批完成后继续向旧目标投递。"
                if notification_cleanup_count > 0
                else None
            ),
            "后续应转向人工处理，或在条件变化后重新发起新的访问请求。",
        ]
    )
    return SignalFollowUpExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )


def build_notification_retry_outcome_explanation(
    bundle: NotificationDispatchRetryBundle,
) -> SignalFollowUpExplanation:
    target = bundle.notification.target.strip() or "当前目标"
    status = bundle.notification.status

    if status == "delivered":
        primary_signal = f"通知已重新投递到 {target}，审批人现在可以直接处理这条请求。"
    elif status == "pending":
        primary_signal = f"通知已按 {target} 重新入队，等待 worker 投递。"
    elif status == "failed":
        primary_signal = (
            f"通知已尝试重试到 {target}，但当前通道仍未成功投递。"
        )
    else:
        primary_signal = "通知已触发重试，但仍需回看最新投递结果。"

    follow_up = _join_parts(
        [
            bundle.notification.error if status == "failed" else None,
            "这一步只负责重新送达审批请求，不会直接恢复 run；后续仍取决于审批结果或后续 callback。",
        ]
    )
    return SignalFollowUpExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )


def build_bulk_approval_decision_outcome_explanation(
    *,
    status: str,
    decided_count: int,
    skipped_items: list[ApprovalTicketBulkSkippedItem],
) -> SignalFollowUpExplanation:
    if decided_count <= 0:
        primary_signal = "本次没有成功处理任何审批票据。"
    elif status == "approved":
        primary_signal = (
            f"本次已批准 {decided_count} 条审批票据，并把对应 waiting 链路交回 runtime 恢复。"
        )
    else:
        primary_signal = (
            f"本次已拒绝 {decided_count} 条审批票据，对应 waiting 链路会保持 blocked / failed。"
        )

    skipped_reason_summary = _format_reason_summary(
        Counter(item.reason for item in skipped_items),
        _APPROVAL_SKIP_REASON_LABELS,
    )
    follow_up = _join_parts(
        [
            (
                f"另有 {len(skipped_items)} 条未处理（{skipped_reason_summary}），请先刷新 inbox slice 再决定是否补做。"
                if skipped_items
                else None
            ),
            (
                "后续请继续回看对应 run detail / inbox slice，确认 waiting 是否真正继续前进。"
                if status == "approved" and decided_count > 0
                else None
            ),
            (
                "被拒绝的 waiting 链路不会继续自动恢复；如需放行，应重新发起新的访问请求。"
                if status == "rejected" and decided_count > 0
                else None
            ),
        ]
    )
    return SignalFollowUpExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )


def build_bulk_notification_retry_outcome_explanation(
    *,
    retried_items: list[NotificationDispatchBulkRetriedItem],
    skipped_items: list[NotificationDispatchBulkSkippedItem],
) -> SignalFollowUpExplanation:
    status_counts = Counter(item.notification.status for item in retried_items)
    retried_count = len(retried_items)

    if retried_count <= 0:
        primary_signal = "本次没有成功重试任何通知。"
    elif status_counts.get("failed", 0) > 0:
        primary_signal = (
            f"本次已触发 {retried_count} 条通知重试，但仍有 {status_counts['failed']} 条在当前通道失败。"
        )
    elif status_counts.get("pending", 0) > 0:
        primary_signal = (
            f"本次已重试 {retried_count} 条通知，其中 {status_counts['pending']} 条正在等待 worker 投递。"
        )
    else:
        primary_signal = f"本次已重试 {retried_count} 条通知，并已重新送达对应目标。"

    skipped_reason_summary = _format_reason_summary(
        Counter(item.reason for item in skipped_items),
        _NOTIFICATION_SKIP_REASON_LABELS,
    )
    follow_up = _join_parts(
        [
            (
                f"另有 {len(skipped_items)} 条未处理（{skipped_reason_summary}），请先刷新当前 ticket 的最新通知列表。"
                if skipped_items
                else None
            ),
            "通知重试只负责把审批请求重新送达目标，不会直接恢复 run；后续仍取决于审批结果或 callback。",
        ]
    )
    return SignalFollowUpExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )
