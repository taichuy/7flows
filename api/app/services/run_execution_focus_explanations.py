from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.run_views import (
    RunExecutionFocusExplanation,
    RunExecutionNodeItem,
)


def _split_compatibility_details(reason: str) -> list[str]:
    prefix = "兼容 backend 细节："
    detail = reason[len(prefix) :].strip() if reason.startswith(prefix) else reason
    parts: list[str] = []
    for raw_item in detail.replace("；", ";").split(";"):
        item = raw_item.strip()
        if item:
            parts.append(item)
    return parts


def _count_pending_callback_tickets(node: RunExecutionNodeItem) -> int:
    return sum(1 for ticket in node.callback_tickets if ticket.status == "pending")


def _count_pending_approval_tickets(node: RunExecutionNodeItem) -> int:
    return sum(
        1
        for entry in node.sensitive_access_entries
        if entry.approval_ticket is not None
        and entry.approval_ticket.status == "pending"
    )


def _format_copy_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    normalized = (
        value.replace(tzinfo=UTC)
        if value.tzinfo is None
        else value.astimezone(UTC)
    )
    return normalized.isoformat().replace("+00:00", "Z")


def _resolve_execution_blocking_explanation(
    node: RunExecutionNodeItem,
) -> RunExecutionFocusExplanation | None:
    reason = (node.execution_blocking_reason or "").strip()
    normalized = reason.lower()

    if reason:
        if "cannot run with execution class 'inline'" in normalized:
            return RunExecutionFocusExplanation(
                primary_signal=(
                    "执行阻断：当前节点要求受控执行，但 execution class 仍是 inline。"
                ),
                follow_up=(
                    "下一步：把 execution class 调整为 subprocess，"
                    "或为 sandbox / microvm 注册兼容 backend；"
                    "强隔离路径不要静默退回 inline。"
                ),
            )

        if (
            "no compatible sandbox backend" in normalized
            or "strong-isolation paths must fail closed" in normalized
        ):
            return RunExecutionFocusExplanation(
                primary_signal=(
                    "执行阻断：当前节点要求强隔离执行，但没有兼容的 sandbox backend 可用。"
                ),
                follow_up=(
                    "下一步：先恢复或注册兼容的 sandbox backend，再重试当前节点；"
                    "在此之前继续保持 fail-closed。"
                ),
            )

        if (
            "compatibility adapter" in normalized
            and "does not support requested execution class" in normalized
        ):
            return RunExecutionFocusExplanation(
                primary_signal=(
                    "执行阻断：当前 compat adapter 不支持请求的 execution class。"
                ),
                follow_up=(
                    "下一步：先把节点执行级别调回 adapter 支持范围，"
                    "或补齐支持该 execution class 的 compat adapter。"
                ),
            )

        if (
            "native tool" in normalized
            and "does not support requested execution class" in normalized
        ):
            return RunExecutionFocusExplanation(
                primary_signal=(
                    "执行阻断：当前 tool 默认执行边界不支持请求的 execution class。"
                ),
                follow_up=(
                    "下一步：先核对 tool 的默认 execution class 和治理配置，"
                    "不支持时不要强推到更重的隔离级别。"
                ),
            )

        compatibility_details = _split_compatibility_details(reason)
        if reason.startswith("兼容 backend 细节：") or any(
            "does not support" in item.lower() for item in compatibility_details
        ):
            detail_count = len(compatibility_details)
            return RunExecutionFocusExplanation(
                primary_signal=(
                    f"执行阻断：sandbox backend 能力与当前节点配置不兼容（{detail_count} 项）。"
                    if detail_count > 0
                    else "执行阻断：sandbox backend 能力与当前节点配置不兼容。"
                ),
                follow_up=(
                    "下一步：优先核对 profile、language、dependency mode、"
                    "network/filesystem policy 与 backend capability 是否一致。"
                ),
            )

        return RunExecutionFocusExplanation(
            primary_signal=f"执行阻断：{reason}",
            follow_up=(
                "下一步：优先核对 execution class、sandbox backend readiness "
                "和 tool governance 是否匹配。"
            ),
        )

    if node.execution_unavailable_count > 0:
        return RunExecutionFocusExplanation(
            primary_signal=(
                "执行阻断：当前节点记录了 "
                f"{node.execution_unavailable_count} 次 execution unavailable。"
            ),
            follow_up=(
                "下一步：优先核对 execution class、sandbox backend readiness "
                "和 tool governance 是否匹配。"
            ),
        )

    if node.execution_blocked_count > 0:
        return RunExecutionFocusExplanation(
            primary_signal=(
                "执行阻断：当前节点记录了 "
                f"{node.execution_blocked_count} 次 execution blocked。"
            ),
            follow_up=(
                "下一步：优先回到 execution policy 和 tool governance 事实链，"
                "确认是谁阻断了执行。"
            ),
        )

    return None


def build_run_execution_focus_explanation(
    node: RunExecutionNodeItem | None,
) -> RunExecutionFocusExplanation | None:
    if node is None:
        return None

    blocking_explanation = _resolve_execution_blocking_explanation(node)
    if blocking_explanation is not None:
        primary_signal = blocking_explanation.primary_signal
    elif node.waiting_reason:
        primary_signal = f"等待原因：{node.waiting_reason}"
    elif node.execution_fallback_reason:
        primary_signal = f"执行降级：{node.execution_fallback_reason}"
    elif node.execution_unavailable_count > 0:
        primary_signal = (
            "当前节点记录了 "
            f"{node.execution_unavailable_count} 次 execution unavailable。"
        )
    elif node.execution_blocked_count > 0:
        primary_signal = (
            "当前节点记录了 "
            f"{node.execution_blocked_count} 次 execution blocked。"
        )
    else:
        primary_signal = None

    pending_approval_count = _count_pending_approval_tickets(node)
    if pending_approval_count > 0:
        follow_up = (
            "下一步：优先处理这条 sensitive access 审批票据，再观察 waiting 节点是否恢复。"
            if pending_approval_count == 1
            else (
                "下一步：当前有 "
                f"{pending_approval_count} 条 sensitive access 审批仍待处理，"
                "优先清掉审批阻塞。"
            )
        )
    else:
        pending_callback_ticket_count = _count_pending_callback_tickets(node)
        if pending_callback_ticket_count > 0:
            follow_up = (
                "下一步：优先确认 callback ticket 是否已回调；"
                "若尚未回调，继续沿 ticket / inbox 事实链跟进。"
                if pending_callback_ticket_count == 1
                else (
                    "下一步：当前有 "
                    f"{pending_callback_ticket_count} 条 callback ticket 仍待回调，"
                    "优先沿 ticket / inbox 事实链排查。"
                )
            )
        elif node.scheduled_resume_delay_seconds is not None:
            due_copy = ""
            due_at_copy = _format_copy_datetime(node.scheduled_resume_due_at)
            if due_at_copy:
                due_copy = f"，预计在 {due_at_copy} 左右触发"
            follow_up = (
                "下一步：当前节点已安排自动 resume"
                f"（{node.scheduled_resume_delay_seconds}s）{due_copy}，"
                "优先观察调度补偿是否恢复。"
            )
        elif blocking_explanation is not None:
            follow_up = blocking_explanation.follow_up
        elif node.waiting_reason:
            follow_up = (
                "下一步：优先沿 waiting / callback 事实链排查，"
                "不要只盯单次 invocation 返回。"
            )
        elif node.execution_fallback_reason:
            follow_up = (
                "下一步：确认 fallback 是否可接受；若不可接受，"
                "再回到原始 execution backend / capability 做治理。"
            )
        else:
            follow_up = None

    if primary_signal is None and follow_up is None:
        return None
    return RunExecutionFocusExplanation(
        primary_signal=primary_signal,
        follow_up=follow_up,
    )
