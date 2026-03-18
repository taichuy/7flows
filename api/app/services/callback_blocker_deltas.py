from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.schemas.run_views import RunExecutionNodeItem
from app.schemas.sensitive_access import CallbackBlockerDeltaSummary
from app.services.run_views import RunViewService

run_view_service = RunViewService()


@dataclass(frozen=True)
class CallbackBlockerSnapshot:
    operator_status_kinds: tuple[str, ...]
    operator_status_labels: tuple[str, ...]
    recommended_action_label: str | None = None


@dataclass(frozen=True)
class CallbackBlockerScopedSnapshot:
    run_id: str
    node_run_id: str | None
    snapshot: CallbackBlockerSnapshot | None


def _join_parts(parts: list[str | None]) -> str | None:
    normalized = [part.strip() for part in parts if isinstance(part, str) and part.strip()]
    return " ".join(normalized) if normalized else None


def _format_labels(labels: tuple[str, ...]) -> str:
    return "、".join(labels)


def _get_epoch(value: datetime | None) -> float:
    if value is None:
        return 0
    return value.astimezone(UTC).timestamp()


def _has_scheduled_resume_delay(value: float | None) -> bool:
    return isinstance(value, (int, float))


def _is_scheduled_resume_overdue(node: RunExecutionNodeItem) -> bool:
    due_at = node.scheduled_resume_due_at
    if due_at is None:
        return False
    return _get_epoch(due_at) <= datetime.now(UTC).timestamp()


def _count_pending_approvals(node: RunExecutionNodeItem) -> int:
    return sum(
        1
        for entry in node.sensitive_access_entries
        if entry.approval_ticket is not None and entry.approval_ticket.status == "pending"
    )


def _count_failed_notifications(node: RunExecutionNodeItem) -> int:
    return sum(
        1
        for entry in node.sensitive_access_entries
        for notification in entry.notifications
        if notification.status == "failed"
    )


def _has_pending_waiting_approval(node: RunExecutionNodeItem) -> bool:
    return any(
        entry.approval_ticket is not None
        and entry.approval_ticket.status == "pending"
        and entry.approval_ticket.waiting_status == "waiting"
        for entry in node.sensitive_access_entries
    )


def _has_retriable_notification(node: RunExecutionNodeItem) -> bool:
    return any(
        notification.status != "delivered"
        for entry in node.sensitive_access_entries
        for notification in entry.notifications
    )


def _has_callback_signals(node: RunExecutionNodeItem) -> bool:
    return bool(
        node.waiting_reason
        or node.callback_waiting_lifecycle
        or _has_scheduled_resume_delay(node.scheduled_resume_delay_seconds)
        or node.scheduled_resume_due_at is not None
        or node.callback_tickets
        or node.sensitive_access_entries
    )


def _pick_callback_node(
    nodes: list[RunExecutionNodeItem],
    node_run_id: str | None,
) -> RunExecutionNodeItem | None:
    normalized_node_run_id = (node_run_id or "").strip() or None
    if normalized_node_run_id:
        return next(
            (node for node in nodes if node.node_run_id == normalized_node_run_id),
            None,
        )

    return (
        next((node for node in nodes if node.status == "waiting_callback"), None)
        or next((node for node in nodes if node.phase == "waiting_callback"), None)
        or next((node for node in nodes if _has_callback_signals(node)), None)
    )


def _build_operator_statuses(node: RunExecutionNodeItem) -> tuple[tuple[str, str], ...]:
    statuses: list[tuple[str, str]] = []
    pending_approval_count = _count_pending_approvals(node)
    pending_ticket_count = sum(1 for ticket in node.callback_tickets if ticket.status == "pending")
    late_callback_count = (
        node.callback_waiting_lifecycle.late_callback_count
        if node.callback_waiting_lifecycle is not None
        else 0
    )

    if pending_approval_count > 0:
        statuses.append(("approval_pending", "approval pending"))

    if pending_ticket_count > 0:
        statuses.append(("external_callback_pending", "waiting external callback"))

    if (
        _has_scheduled_resume_delay(node.scheduled_resume_delay_seconds)
        or node.scheduled_resume_due_at
    ):
        statuses.append(
            (
                "scheduled_resume_pending",
                (
                    "scheduled resume overdue"
                    if _is_scheduled_resume_overdue(node)
                    else "scheduled resume queued"
                ),
            )
        )

    if late_callback_count > 0:
        statuses.append(("late_callback_recorded", "late callback recorded"))

    if node.callback_waiting_lifecycle is not None and node.callback_waiting_lifecycle.terminated:
        statuses.append(("terminated", "callback waiting terminated"))

    return tuple(statuses)


def _pick_inline_sensitive_access_entry(node: RunExecutionNodeItem) -> bool:
    return _has_pending_waiting_approval(node) or _has_retriable_notification(node)


def _build_recommended_action_label(node: RunExecutionNodeItem) -> str | None:
    pending_approval_count = _count_pending_approvals(node)
    failed_notification_count = _count_failed_notifications(node)
    expired_ticket_count = (
        node.callback_waiting_lifecycle.expired_ticket_count
        if node.callback_waiting_lifecycle is not None
        else 0
    )
    late_callback_count = (
        node.callback_waiting_lifecycle.late_callback_count
        if node.callback_waiting_lifecycle is not None
        else 0
    )
    pending_ticket_count = sum(1 for ticket in node.callback_tickets if ticket.status == "pending")
    has_overdue_scheduled_resume = _is_scheduled_resume_overdue(node)

    if pending_approval_count > 0:
        if _pick_inline_sensitive_access_entry(node):
            return (
                "Retry notification here first"
                if failed_notification_count > 0
                else "Handle approval here first"
            )
        return "Open inbox slice first"

    if node.callback_waiting_lifecycle is not None and node.callback_waiting_lifecycle.terminated:
        return "Inspect termination before retrying"

    if expired_ticket_count > 0:
        return "Cleanup expired tickets first"

    if has_overdue_scheduled_resume:
        return "Scheduled resume is overdue"

    if pending_ticket_count > 0:
        return "Wait for callback result"

    if late_callback_count > 0 or node.callback_tickets:
        return "Try manual resume now"

    if _has_scheduled_resume_delay(node.scheduled_resume_delay_seconds):
        return "Watch the scheduled resume"

    return None


def capture_callback_blocker_snapshot(
    db: Session,
    *,
    run_id: str | None,
    node_run_id: str | None = None,
) -> CallbackBlockerSnapshot | None:
    normalized_run_id = (run_id or "").strip()
    if not normalized_run_id:
        return None

    execution_view = run_view_service.get_execution_view(db, normalized_run_id)
    if execution_view is None:
        return None

    node = _pick_callback_node(execution_view.nodes, node_run_id)
    if node is None:
        return None

    operator_statuses = _build_operator_statuses(node)
    return CallbackBlockerSnapshot(
        operator_status_kinds=tuple(status_kind for status_kind, _ in operator_statuses),
        operator_status_labels=tuple(status_label for _, status_label in operator_statuses),
        recommended_action_label=_build_recommended_action_label(node),
    )


def build_callback_blocker_delta_summary(
    *,
    before: CallbackBlockerSnapshot | None,
    after: CallbackBlockerSnapshot | None,
) -> CallbackBlockerDeltaSummary | None:
    if before is None and after is None:
        return None

    before_kinds = before.operator_status_kinds if before is not None else ()
    after_kinds = after.operator_status_kinds if after is not None else ()
    before_labels = before.operator_status_labels if before is not None else ()
    after_labels = after.operator_status_labels if after is not None else ()
    cleared_labels = tuple(
        label
        for kind, label in zip(before_kinds, before_labels, strict=False)
        if kind not in after_kinds
    )
    added_labels = tuple(
        label
        for kind, label in zip(after_kinds, after_labels, strict=False)
        if kind not in before_kinds
    )
    before_action_label = before.recommended_action_label if before is not None else None
    after_action_label = after.recommended_action_label if after is not None else None
    changed = before_kinds != after_kinds or before_action_label != after_action_label
    summary = _join_parts(
        [
            (
                f"阻塞变化：已解除 {_format_labels(cleared_labels)}。"
                if cleared_labels
                else None
            ),
            f"新增 {_format_labels(added_labels)}。" if added_labels else None,
            (
                f"阻塞变化：当前仍是 {_format_labels(after_labels)}。"
                if not cleared_labels and not added_labels and after_labels
                else None
            ),
            (
                "阻塞变化：当前 callback summary 已没有显式 operator blocker。"
                if after is not None and not after_labels
                else None
            ),
            (
                "动作后暂未读到最新 blocker 快照，请刷新当前页确认阻塞是否真正减少。"
                if after is None and before is not None
                else None
            ),
            (
                f"建议动作已切换为“{after_action_label}”。"
                if after is not None
                and before_action_label != after_action_label
                and after_action_label
                else None
            ),
            (
                "建议动作已清空；下一步应结合最新 run 状态确认是否真正离开 waiting。"
                if after is not None
                and before_action_label != after_action_label
                and after_action_label is None
                and before_action_label is not None
                else None
            ),
            (
                f"建议动作仍是“{after_action_label}”。"
                if after is not None
                and before_action_label == after_action_label
                and after_action_label
                else None
            ),
        ]
    )

    return CallbackBlockerDeltaSummary(
        sampled_scope_count=1,
        changed_scope_count=1 if changed else 0,
        cleared_scope_count=1 if cleared_labels else 0,
        fully_cleared_scope_count=1 if before_kinds and not after_kinds else 0,
        still_blocked_scope_count=1 if after_kinds else 0,
        summary=summary,
    )


def build_bulk_callback_blocker_delta_summary(
    before_snapshots: list[CallbackBlockerScopedSnapshot],
    after_snapshots: list[CallbackBlockerScopedSnapshot],
) -> CallbackBlockerDeltaSummary | None:
    if not before_snapshots and not after_snapshots:
        return None

    after_by_scope = {
        (item.run_id, item.node_run_id): item.snapshot for item in after_snapshots
    }
    deltas = [
        build_callback_blocker_delta_summary(
            before=item.snapshot,
            after=after_by_scope.get((item.run_id, item.node_run_id)),
        )
        for item in before_snapshots
    ]
    normalized_deltas = [item for item in deltas if item is not None]
    if not normalized_deltas:
        return None

    sampled_scope_count = len(normalized_deltas)
    changed_scope_count = sum(item.changed_scope_count for item in normalized_deltas)
    cleared_scope_count = sum(item.cleared_scope_count for item in normalized_deltas)
    fully_cleared_scope_count = sum(
        item.fully_cleared_scope_count for item in normalized_deltas
    )
    still_blocked_scope_count = sum(
        item.still_blocked_scope_count for item in normalized_deltas
    )
    summary = _join_parts(
        [
            f"已回读 {sampled_scope_count} 个 blocker 样本；发生变化 {changed_scope_count} 个。",
            f"其中已解除阻塞 {cleared_scope_count} 个。" if cleared_scope_count > 0 else None,
            (
                f"已完全清空显式 operator blocker {fully_cleared_scope_count} 个。"
                if fully_cleared_scope_count > 0
                else None
            ),
            (
                f"动作后仍有 {still_blocked_scope_count} 个样本存在 operator blocker。"
                if still_blocked_scope_count > 0
                else None
            ),
        ]
    )
    return CallbackBlockerDeltaSummary(
        sampled_scope_count=sampled_scope_count,
        changed_scope_count=changed_scope_count,
        cleared_scope_count=cleared_scope_count,
        fully_cleared_scope_count=fully_cleared_scope_count,
        still_blocked_scope_count=still_blocked_scope_count,
        summary=summary,
    )
