"use client";

import { Fragment, memo } from "react";
import Link from "next/link";
import { Button, Input, Tag, Typography } from "antd";

import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import type { WorkflowGovernanceHandoff } from "@/lib/workflow-governance-handoff";
import type { WorkflowCreateWizardSurfaceCopy } from "@/lib/workbench-entry-surfaces";
import type { WorkflowStarterTemplate } from "@/lib/workflow-starters";
import type { WorkflowCreateMessageTone } from "@/components/workflow-create-wizard/use-workflow-create-shell-state";

const { Text, Title } = Typography;

type WorkflowCreateStarterNextStepSurface = {
  label: string;
  detail: string;
  primaryResourceSummary?: string | null;
  workflowGovernanceHandoff?: WorkflowGovernanceHandoff | null;
  href: string | null;
  hrefLabel: string | null;
};

type WorkflowCreateStarterMissingToolBlockingSurface = {
  blockedMessage: string;
};

type WorkflowCreateRecentDraftItem = {
  href: string;
  id: string;
  missingToolSummary: string | null;
  name: string;
  nodeCount: number;
  statusLabel: string;
  version: string;
};

type WorkflowCreateSourceGovernancePresenter = {
  chips: string[];
  primarySignal: string | null;
  summary: string;
  tagLabel: string;
};

type WorkflowCreatePrimarySummaryItem = {
  detail: string;
  label: string;
  value: string;
};

type WorkflowCreatePreviewPanelProps = {
  governanceDisclosureStatus: string | null;
  isCreating: boolean;
  message: string | null;
  messageTone: WorkflowCreateMessageTone;
  recentDrafts: WorkflowCreateRecentDraftItem[];
  recentWorkflowHref: string | null;
  selectedStarter: WorkflowStarterTemplate;
  selectedStarterFactPills: string[];
  selectedStarterNextStepSurface: WorkflowCreateStarterNextStepSurface | null;
  selectedStarterPreviewNodes: string[];
  selectedStarterPreviewOverflow: number;
  selectedStarterSandboxBadges: string[];
  selectedStarterSandboxDependencySummary: string | null;
  selectedStarterSourceGovernancePresenter: WorkflowCreateSourceGovernancePresenter | null;
  selectedStarterTrackLabel: string;
  shouldDisableCreate: boolean;
  shouldRenderSelectedStarterNextStep: boolean;
  shouldRenderSelectedStarterSourceGovernance: boolean;
  starterGovernanceHref: string;
  surfaceCopy: WorkflowCreateWizardSurfaceCopy;
  totalWorkflows: number;
  workflowName: string;
  selectedStarterMissingToolBlockingSurface?: WorkflowCreateStarterMissingToolBlockingSurface | null;
  onCreateWorkflow: () => void;
  onWorkflowNameChange: (value: string) => void;
};

function WorkflowCreatePreviewPanelComponent({
  governanceDisclosureStatus,
  isCreating,
  message,
  messageTone,
  recentDrafts,
  recentWorkflowHref,
  selectedStarter,
  selectedStarterFactPills,
  selectedStarterNextStepSurface,
  selectedStarterPreviewNodes,
  selectedStarterPreviewOverflow,
  selectedStarterSandboxBadges,
  selectedStarterSandboxDependencySummary,
  selectedStarterSourceGovernancePresenter,
  selectedStarterTrackLabel,
  shouldDisableCreate,
  shouldRenderSelectedStarterNextStep,
  shouldRenderSelectedStarterSourceGovernance,
  starterGovernanceHref,
  surfaceCopy,
  totalWorkflows,
  workflowName,
  selectedStarterMissingToolBlockingSurface = null,
  onCreateWorkflow,
  onWorkflowNameChange
}: WorkflowCreatePreviewPanelProps) {
  const primarySummaryItems = buildWorkflowCreatePrimarySummaryItems({
    selectedStarter,
    selectedStarterTrackLabel,
    workflowName
  });

  return (
    <aside className="workflow-create-side" data-component="workflow-create-preview-panel">
      <div className="workflow-create-config-card">
        <div className="workflow-create-config-header">
          <p className="workspace-eyebrow">Step 2</p>
          <Title level={4} style={{ margin: "0 0 6px", color: "#111827" }}>
            命名后进入 Studio
          </Title>
          <Text type="secondary">先确认模式、starter、名称和去向；治理与草稿入口按需展开。</Text>
        </div>

        <div className="workflow-create-side-summary" aria-label="创建主链摘要">
          {primarySummaryItems.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="workflow-create-selected-card">
          <div className="workflow-create-selected-head">
            <div>
              <div className="workflow-create-selected-title">骨架与依赖</div>
            </div>
            <Tag color="blue" style={{ margin: 0 }}>
              {selectedStarterTrackLabel}
            </Tag>
          </div>

          <div className="workflow-create-selected-facts" aria-label="当前 starter 摘要">
            {selectedStarterFactPills.map((item) => (
              <span className="workflow-create-fact-pill" key={`${selectedStarter.id}-${item}`}>
                {item}
              </span>
            ))}
          </div>

          {selectedStarterSandboxBadges.length > 0 ? (
            <div className="workflow-create-selected-badges">
              {selectedStarterSandboxBadges.map((badge) => (
                <Tag key={`${selectedStarter.id}-${badge}`} style={{ margin: 0 }}>
                  {badge}
                </Tag>
              ))}
            </div>
          ) : null}

          {selectedStarterSandboxDependencySummary ? (
            <div className="workflow-create-selected-hint">{selectedStarterSandboxDependencySummary}</div>
          ) : null}
        </div>

        <div className="workflow-create-form-field">
          <div className="workflow-create-form-label">应用名称</div>
          <Input
            size="large"
            value={workflowName}
            onChange={(event) => onWorkflowNameChange(event.target.value)}
            placeholder={selectedStarter.defaultWorkflowName}
          />
        </div>

        <div className="workflow-create-preview-card">
          <div className="workflow-create-preview-header">
            <div>
              <p className="workspace-eyebrow">Studio preview</p>
              <h3>进入后先看到什么</h3>
              <p>先落到 starter 骨架，再回 Studio 继续细化节点和配置。</p>
            </div>
          </div>

          <div className="workflow-create-preview-stage">
            <div className="workflow-create-preview-lane" aria-label="Starter preview lane">
              {selectedStarterPreviewNodes.map((nodeLabel, index) => (
                <Fragment key={`${selectedStarter.id}-${nodeLabel}-${index}`}>
                  <span className="workflow-create-preview-node">{nodeLabel}</span>
                  {index < selectedStarterPreviewNodes.length - 1 ? (
                    <span className="workflow-create-preview-arrow" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                </Fragment>
              ))}
              {selectedStarterPreviewOverflow > 0 ? (
                <span className="workflow-create-preview-node more">
                  +{selectedStarterPreviewOverflow}
                </span>
              ) : null}
            </div>

            <div className="workflow-create-preview-note">{selectedStarter.recommendedNextStep}</div>
          </div>
        </div>

        <Button
          type="primary"
          size="large"
          block
          disabled={shouldDisableCreate}
          onClick={onCreateWorkflow}
          loading={isCreating}
          className="workflow-create-primary-button"
        >
          创建草稿并进入 Studio
        </Button>

        {message ? (
          <div className={`workflow-create-feedback ${messageTone === "error" ? "error" : "success"}`}>
            {message}
          </div>
        ) : null}
      </div>

      {selectedStarterMissingToolBlockingSurface ? (
        <div className="workflow-create-warning-card">
          <strong>catalog gap</strong>
          {selectedStarterMissingToolBlockingSurface.blockedMessage}
        </div>
      ) : null}

      <details className="workflow-create-disclosure workflow-create-support-card workflow-create-side-section">
        <summary className="workflow-create-disclosure-summary">
          <div className="workflow-create-side-section-header">
            <div>
              <p className="workspace-eyebrow">Utility links</p>
              <h3>备用入口</h3>
              <p>主链卡住时，再回首页、模板治理或最近草稿。</p>
            </div>
          </div>
          <span className="workflow-create-disclosure-status">
            {recentWorkflowHref ? "3 个入口" : "2 个入口"}
          </span>
        </summary>
        <div className="workflow-create-disclosure-body">
          <div className="workflow-create-inline-actions">
            <Link href="/" className="workflow-create-inline-link workflow-create-inline-chip muted">
              返回系统首页
            </Link>
            {recentWorkflowHref ? (
              <Link
                href={recentWorkflowHref}
                className="workflow-create-inline-link workflow-create-inline-chip"
              >
                继续最近草稿
              </Link>
            ) : null}
            <Link
              href={starterGovernanceHref}
              className="workflow-create-inline-link workflow-create-inline-chip muted"
            >
              管理 workspace starters
            </Link>
          </div>
        </div>
      </details>

      {recentDrafts.length > 0 ? (
        <details className="workflow-create-disclosure workflow-create-support-card workflow-create-side-section">
          <summary className="workflow-create-disclosure-summary">
            <div className="workflow-create-recent-header workflow-create-side-section-header">
              <div>
                <p className="workspace-eyebrow">Recent drafts</p>
                <h3>已有草稿</h3>
                <p>有接近的应用时，优先续写而不是重建。</p>
              </div>
            </div>
            <span className="workflow-create-disclosure-status">{totalWorkflows} 个草稿</span>
          </summary>
          <div className="workflow-create-disclosure-body">
            <div className="workflow-create-recent-list">
              {recentDrafts.map((workflow) => (
                <Link className="workflow-create-recent-link" href={workflow.href} key={workflow.id}>
                  <div>
                    <strong>{workflow.name}</strong>
                    <p>
                      v{workflow.version} · {workflow.statusLabel} · {workflow.nodeCount} 个节点
                    </p>
                  </div>
                  <span>{workflow.missingToolSummary ?? "继续编排"}</span>
                </Link>
              ))}
            </div>
            {totalWorkflows > recentDrafts.length ? (
              <div className="workflow-create-recent-more">
                还有 {totalWorkflows - recentDrafts.length} 个草稿，优先回工作台按筛选继续。
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {(selectedStarterNextStepSurface && shouldRenderSelectedStarterNextStep) ||
      shouldRenderSelectedStarterSourceGovernance ? (
        <details className="workflow-create-disclosure workflow-create-governance-card">
          <summary className="workflow-create-disclosure-summary">
            <div className="workflow-create-governance-header">
              <div className="workflow-create-governance-eyebrow">治理与来源</div>
              <p>需要 refresh / rebase 或排查来源缺失时，再展开。</p>
            </div>
            {governanceDisclosureStatus ? (
              <span className="workflow-create-disclosure-status">{governanceDisclosureStatus}</span>
            ) : null}
          </summary>
          <div className="workflow-create-disclosure-body workflow-create-governance-body">
            {selectedStarterNextStepSurface && shouldRenderSelectedStarterNextStep ? (
              <div className="workflow-create-followup-card workflow-create-side-section">
                <WorkspaceStarterFollowUpCard
                  title={surfaceCopy.recommendedNextStepTitle}
                  label={selectedStarterNextStepSurface.label}
                  detail={selectedStarterNextStepSurface.detail}
                  primaryResourceSummary={selectedStarterNextStepSurface.primaryResourceSummary}
                  workflowGovernanceHandoff={selectedStarterNextStepSurface.workflowGovernanceHandoff}
                  actions={
                    selectedStarterNextStepSurface.href && selectedStarterNextStepSurface.hrefLabel ? (
                      <Link href={selectedStarterNextStepSurface.href} className="workflow-create-inline-link">
                        {selectedStarterNextStepSurface.hrefLabel}
                      </Link>
                    ) : null
                  }
                />
              </div>
            ) : null}

            {shouldRenderSelectedStarterSourceGovernance ? (
              <>
                {selectedStarterSourceGovernancePresenter ? (
                  <>
                    <div className="workflow-create-selected-badges">
                      <Tag color="blue" style={{ margin: 0 }}>
                        {selectedStarterSourceGovernancePresenter.tagLabel}
                      </Tag>
                      {selectedStarterSourceGovernancePresenter.chips.map((chip) => (
                        <Tag key={`${selectedStarter.id}-${chip}`} style={{ margin: 0 }}>
                          {chip}
                        </Tag>
                      ))}
                    </div>
                    {selectedStarterSourceGovernancePresenter.primarySignal ? (
                      <div>{selectedStarterSourceGovernancePresenter.primarySignal}</div>
                    ) : null}
                    {selectedStarterSourceGovernancePresenter.summary !==
                    selectedStarterNextStepSurface?.detail ? (
                      <div>{selectedStarterSourceGovernancePresenter.summary}</div>
                    ) : null}
                  </>
                ) : null}

                {selectedStarterNextStepSurface?.href && selectedStarterNextStepSurface.hrefLabel ? (
                  <div>
                    {surfaceCopy.sourceGovernanceFollowUpPrefix}
                    <Link
                      href={selectedStarterNextStepSurface.href}
                      className="workflow-create-inline-link with-offset"
                    >
                      {selectedStarterNextStepSurface.hrefLabel}
                    </Link>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </details>
      ) : null}
    </aside>
  );
}

export const WorkflowCreatePreviewPanel = memo(WorkflowCreatePreviewPanelComponent);

function buildWorkflowCreatePrimarySummaryItems({
  selectedStarter,
  selectedStarterTrackLabel,
  workflowName
}: {
  selectedStarter: WorkflowStarterTemplate;
  selectedStarterTrackLabel: string;
  workflowName: string;
}): WorkflowCreatePrimarySummaryItem[] {
  const trimmedWorkflowName = workflowName.trim();

  return [
    {
      label: "应用模式",
      value: selectedStarterTrackLabel,
      detail: "决定当前从哪条作者主链开始创建。"
    },
    {
      label: "当前 starter",
      value: selectedStarter.name,
      detail: selectedStarter.description
    },
    {
      label: "应用名称",
      value: trimmedWorkflowName || selectedStarter.defaultWorkflowName,
      detail: trimmedWorkflowName ? "创建时会按这个名称生成草稿。" : "未填写时回退到默认名称。"
    },
    {
      label: "创建后去向",
      value: "Studio 编辑器",
      detail: selectedStarter.recommendedNextStep
    }
  ];
}
