from __future__ import annotations

from app.models.workflow import Workflow
from app.models.workspace_starter import WorkspaceStarterTemplateRecord
from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.workspace_starter import WorkspaceStarterSourceGovernance
from app.services.workspace_starter_template_diff import build_workspace_starter_source_diff


def build_workspace_starter_source_governance(
    record: WorkspaceStarterTemplateRecord,
    source_workflow: Workflow | None,
) -> WorkspaceStarterSourceGovernance:
    template_version = record.created_from_workflow_version

    if record.created_from_workflow_id is None:
        return WorkspaceStarterSourceGovernance(
            kind="no_source",
            status_label="独立快照",
            summary="这个 workspace starter 不是从具体 workflow 派生出来的，当前只保留模板快照。",
            template_version=template_version,
            outcome_explanation=SignalFollowUpExplanation(
                primary_signal="当前 starter 是独立快照，没有来源 workflow 漂移需要回读。",
                follow_up=(
                    "可以直接从创建页进入画布；若后续需要纳入来源治理，再回到 "
                    "workspace starter library 重新绑定来源。"
                ),
            ),
        )

    if source_workflow is None:
        return WorkspaceStarterSourceGovernance(
            kind="missing_source",
            status_label="来源缺失",
            summary="记录中的来源 workflow 已不存在或当前不可访问。",
            source_workflow_id=record.created_from_workflow_id,
            template_version=template_version,
            outcome_explanation=SignalFollowUpExplanation(
                primary_signal="当前 starter 记录的来源 workflow 已不可用。",
                follow_up=(
                    "先去 workspace starter library 排查来源关系；"
                    "确认模板仍可复用后，再从创建页继续创建。"
                ),
            ),
        )

    diff = build_workspace_starter_source_diff(record, source_workflow)
    if diff.changed:
        primary_signal = (
            f"来源 workflow {diff.source_version} 相比模板快照"
            f" {diff.template_version or '未记录版本'} 已有漂移。"
        )
        follow_up = diff.action_decision.summary
        kind = "drifted"
    else:
        primary_signal = f"当前 starter 快照与来源 workflow {diff.source_version} 已对齐。"
        follow_up = (
            "可以直接从创建页进入画布；如需调整模板元数据或来源绑定，"
            "再回到 workspace starter library。"
        )
        kind = "synced"

    return WorkspaceStarterSourceGovernance(
        kind=kind,
        status_label=diff.action_decision.status_label,
        summary=diff.action_decision.summary,
        source_workflow_id=diff.source_workflow_id,
        source_workflow_name=diff.source_workflow_name,
        template_version=diff.template_version,
        source_version=diff.source_version,
        action_decision=diff.action_decision,
        outcome_explanation=SignalFollowUpExplanation(
            primary_signal=primary_signal,
            follow_up=follow_up,
        ),
    )
