from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.services.run_action_explanations import (
    build_callback_cleanup_outcome_explanation,
)
from app.services.run_callback_ticket_cleanup import CallbackTicketCleanupResult


def _build_follow_up_summary(*, status: str = "waiting") -> OperatorRunFollowUpSummary:
    return OperatorRunFollowUpSummary(
        affected_run_count=1,
        sampled_run_count=1,
        waiting_run_count=1 if status == "waiting" else 0,
        running_run_count=1 if status == "running" else 0,
        succeeded_run_count=1 if status == "succeeded" else 0,
        failed_run_count=1 if status == "failed" else 0,
        unknown_run_count=0,
        sampled_runs=[
            OperatorRunSnapshotSample(
                run_id="run-cleanup",
                snapshot=OperatorRunSnapshot(
                    workflow_id="wf-cleanup",
                    status=status,
                    current_node_id="agent",
                    waiting_reason="waiting external callback",
                ),
            )
        ],
        explanation=SignalFollowUpExplanation(
            primary_signal="本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
            follow_up="run run-cleanup：当前 run 状态：waiting。",
        ),
    )


def test_build_callback_cleanup_outcome_explanation_for_dry_run() -> None:
    explanation = build_callback_cleanup_outcome_explanation(
        CallbackTicketCleanupResult(
            source="operator_callback_cleanup",
            dry_run=True,
            limit=10,
            matched_count=1,
            expired_count=0,
            scheduled_resume_count=0,
            terminated_count=0,
            run_ids=["run-cleanup"],
            scheduled_resume_run_ids=[],
            terminated_run_ids=[],
            items=[],
        ),
        _build_follow_up_summary(),
    )

    assert explanation == SignalFollowUpExplanation(
        primary_signal="本次 dry-run 匹配到 1 条潜在过期 callback ticket，但尚未真正写回状态。",
        follow_up=(
            "如需真正收口过期 ticket 并触发后续恢复，"
            "请确认当前 scope 后执行非 dry-run cleanup。"
        ),
    )


def test_build_callback_cleanup_outcome_explanation_for_scheduled_resume() -> None:
    explanation = build_callback_cleanup_outcome_explanation(
        CallbackTicketCleanupResult(
            source="operator_callback_cleanup",
            dry_run=False,
            limit=10,
            matched_count=1,
            expired_count=1,
            scheduled_resume_count=1,
            terminated_count=0,
            run_ids=["run-cleanup"],
            scheduled_resume_run_ids=["run-cleanup"],
            terminated_run_ids=[],
            items=[],
        ),
        _build_follow_up_summary(status="waiting"),
    )

    assert explanation == SignalFollowUpExplanation(
        primary_signal="本次 cleanup 已处理 1 条过期 callback ticket，并为 1 个 run 重新安排恢复。",
        follow_up=(
            "下一步：继续观察 run 是否真正离开 waiting；"
            "若仍停留，优先检查审批、callback 或定时恢复事实链。"
        ),
    )


def test_build_callback_cleanup_outcome_explanation_for_terminated_runs() -> None:
    explanation = build_callback_cleanup_outcome_explanation(
        CallbackTicketCleanupResult(
            source="operator_callback_cleanup",
            dry_run=False,
            limit=10,
            matched_count=1,
            expired_count=1,
            scheduled_resume_count=0,
            terminated_count=1,
            run_ids=["run-cleanup"],
            scheduled_resume_run_ids=[],
            terminated_run_ids=["run-cleanup"],
            items=[],
        ),
        _build_follow_up_summary(status="failed"),
    )

    assert explanation == SignalFollowUpExplanation(
        primary_signal=(
            "本次 cleanup 已处理 1 条过期 callback ticket，"
            "其中 1 个 run 因达到最大过期轮次被终止。"
        ),
        follow_up=(
            "下一步：沿失败路径排查 callback waiting 为什么长期未解除，"
            "并决定是否重新发起新的 run 或访问请求。"
        ),
    )
