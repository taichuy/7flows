from collections.abc import Iterable

from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.operator_follow_up import OperatorRunFollowUpSummary, OperatorRunSnapshot
from app.services.run_callback_ticket_cleanup import CallbackTicketCleanupResult


def _join_parts(parts: Iterable[str | None]) -> str | None:
    normalized = [part.strip() for part in parts if isinstance(part, str) and part.strip()]
    if not normalized:
        return None
    return " ".join(normalized)


def _select_primary_snapshot(
    summary: OperatorRunFollowUpSummary,
) -> OperatorRunSnapshot | None:
    for item in summary.sampled_runs:
        if item.snapshot is not None:
            return item.snapshot
    return None


def build_manual_resume_outcome_explanation(
    summary: OperatorRunFollowUpSummary,
) -> SignalFollowUpExplanation:
    snapshot = _select_primary_snapshot(summary)
    if snapshot is None or not snapshot.status:
        return SignalFollowUpExplanation(
            primary_signal="已发起手动恢复；当前还未读取到最新 run 快照。",
            follow_up="请立即回看当前 run 时间线，确认是否真正离开 waiting 状态。",
        )

    status = snapshot.status.strip()
    shared_follow_up = (
        summary.explanation.follow_up.strip()
        if summary.explanation is not None and summary.explanation.follow_up
        else None
    )

    if status == "waiting":
        return SignalFollowUpExplanation(
            primary_signal="已发起手动恢复，但 run 仍处于 waiting。",
            follow_up=_join_parts(
                [
                    "请继续检查 callback ticket、审批进度或定时恢复是否仍在阻塞。",
                    shared_follow_up,
                ]
            ),
        )

    if status == "running":
        return SignalFollowUpExplanation(
            primary_signal="已发起手动恢复，run 已重新进入 running。",
            follow_up=_join_parts(
                [
                    "接下来重点确认节点是否继续推进，而不只是停留在恢复事件。",
                    shared_follow_up,
                ]
            ),
        )

    if status == "succeeded":
        return SignalFollowUpExplanation(
            primary_signal="已发起手动恢复，run 已完成 succeeded。",
            follow_up=_join_parts(
                [
                    "当前阻塞链路已经解除，可回看时间线确认恢复从哪个节点继续完成。",
                    shared_follow_up,
                ]
            ),
        )

    if status == "failed":
        return SignalFollowUpExplanation(
            primary_signal="已发起手动恢复，但 run 已落到 failed。",
            follow_up=_join_parts(
                [
                    "请结合 blocker timeline 与节点错误继续排障。",
                    shared_follow_up,
                ]
            ),
        )

    return SignalFollowUpExplanation(
        primary_signal=f"已发起手动恢复，当前 run 状态：{status}。",
        follow_up=_join_parts(
            [
                "请继续回看时间线确认这次恢复是否真正推动了执行。",
                shared_follow_up,
            ]
        ),
    )


def build_callback_cleanup_outcome_explanation(
    result: CallbackTicketCleanupResult,
    summary: OperatorRunFollowUpSummary,
) -> SignalFollowUpExplanation:
    snapshot = _select_primary_snapshot(summary)
    status = snapshot.status.strip() if snapshot is not None and snapshot.status else None

    if result.dry_run:
        if result.matched_count <= 0:
            return SignalFollowUpExplanation(
                primary_signal="本次 dry-run 没有发现需要 cleanup 的过期 callback ticket。",
                follow_up=(
                    "如果 run 仍停在 waiting，更可能是审批未完成、外部 callback 未到达，"
                    "或尚未到自动恢复窗口。"
                ),
            )
        return SignalFollowUpExplanation(
            primary_signal=(
                f"本次 dry-run 匹配到 {result.matched_count} 条潜在过期 callback ticket，"
                "但尚未真正写回状态。"
            ),
            follow_up=(
                "如需真正收口过期 ticket 并触发后续恢复，"
                "请确认当前 scope 后执行非 dry-run cleanup。"
            ),
        )

    if result.matched_count <= 0:
        return SignalFollowUpExplanation(
            primary_signal="当前 slice 没有发现已过期的 callback ticket。",
            follow_up=(
                "如果 run 仍停在 waiting，优先回看 callback / approval / scheduled resume 事实链，"
                "不要只重复 cleanup。"
            ),
        )

    if result.terminated_count > 0:
        return SignalFollowUpExplanation(
            primary_signal=(
                f"本次 cleanup 已处理 {result.expired_count} 条过期 callback ticket，"
                f"其中 {result.terminated_count} 个 run 因达到最大过期轮次被终止。"
            ),
            follow_up=(
                "下一步：沿失败路径排查 callback waiting 为什么长期未解除，"
                "并决定是否重新发起新的 run 或访问请求。"
            ),
        )

    if result.scheduled_resume_count > 0:
        return SignalFollowUpExplanation(
            primary_signal=(
                f"本次 cleanup 已处理 {result.expired_count} 条过期 callback ticket，"
                f"并为 {result.scheduled_resume_count} 个 run 重新安排恢复。"
            ),
            follow_up=(
                "下一步：继续观察 run 是否真正离开 waiting；"
                "若仍停留，优先检查审批、callback 或定时恢复事实链。"
                if status == "waiting"
                else "下一步：回看 run 时间线，确认这次 cleanup 安排的恢复是否真正推动了执行。"
            ),
        )

    return SignalFollowUpExplanation(
        primary_signal=(
            f"本次 cleanup 已处理 {result.expired_count} 条过期 callback ticket，"
            "但当前没有新增恢复调度。"
        ),
        follow_up=(
            "下一步：确认 waiting 节点是否已转入其他阻塞路径，"
            "或当前 slice 是否已经不再属于待恢复范围。"
        ),
    )
