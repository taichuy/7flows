"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import {
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterSourceGovernanceSurface,
  type WorkspaceStarterFollowUpSurface
} from "@/components/workspace-starter-library/shared";
import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import {
  appendWorkflowLibraryViewState,
} from "@/lib/workflow-library-query";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency
} from "@/lib/workflow-definition-sandbox-governance";
import { formatCatalogGapToolSummary, getWorkflowLegacyPublishAuthBacklogCount } from "@/lib/workflow-definition-governance";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import {
  buildWorkflowGovernanceHandoff,
  type WorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import {
  buildWorkflowCreateWizardSurfaceCopy,
  type WorkflowCreateWizardSurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import {
  createWorkflow,
  type WorkflowListItem,
  WorkflowDefinitionValidationError
} from "@/lib/get-workflows";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkspaceHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowStarterTemplates,
  buildWorkflowStarterTracks,
  type WorkflowStarterTemplate
} from "@/lib/workflow-starters";

type WorkflowCreateWizardProps = {
  catalogToolCount: number;
  governanceQueryScope: WorkspaceStarterGovernanceQueryScope;
  legacyAuthGovernanceSnapshot?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workflows: WorkflowListItem[];
  starters: WorkflowLibraryStarterItem[];
  starterSourceLanes: WorkflowLibrarySourceLane[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  tools: PluginToolRegistryItem[];
};

import { Input, Button, Typography, Tag } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useWorkflowCreateShellState } from "@/components/workflow-create-wizard/use-workflow-create-shell-state";

const { Title, Text } = Typography;

export function WorkflowCreateWizard({
  governanceQueryScope,
  legacyAuthGovernanceSnapshot = null,
  workflows,
  starters,
  nodeCatalog,
  tools
}: WorkflowCreateWizardProps) {
  const router = useRouter();
  const searchQuery = governanceQueryScope.searchQuery;
  const sourceGovernanceKind =
    governanceQueryScope.sourceGovernanceKind === "all"
      ? undefined
      : governanceQueryScope.sourceGovernanceKind;
  const needsFollowUp = governanceQueryScope.needsFollowUp;
  const starterTemplates = useMemo(
    () => buildWorkflowStarterTemplates(starters, nodeCatalog, tools),
    [nodeCatalog, starters, tools]
  );
  const starterTracks = useMemo(
    () => buildWorkflowStarterTracks(starterTemplates),
    [starterTemplates]
  );
  const {
    activeTrack,
    activeTrackPresentation,
    applyStarterSelection,
    clearFeedback,
    createSignalItems,
    handleTrackSelect,
    isCreating,
    message,
    messageTone,
    runCreateTransition,
    selectedStarter,
    selectedStarterTrackPresentation,
    setFeedback,
    setWorkflowName,
    visibleStarters,
    workflowName,
    workspaceStarterGovernanceScope
  } = useWorkflowCreateShellState({
    governanceQueryScope,
    starterTemplates,
    workflowsCount: workflows.length
  });
  const selectedStarterSandboxBadges = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowDefinitionSandboxGovernanceBadges(selectedStarter.sandboxGovernance)
        : [],
    [selectedStarter]
  );
  const selectedStarterSourceGovernance = selectedStarter?.sourceGovernance ?? null;
  const selectedStarterSourceGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkspaceStarterSourceGovernanceSurface({
            template: toWorkspaceStarterGovernanceTemplate(selectedStarter)
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterSourcePresenter =
    selectedStarterSourceGovernanceSurface?.presenter ?? null;
  const selectedStarterSourceChips = selectedStarterSourcePresenter?.factChips ?? [];
  const selectedStarterSourcePrimarySignal =
    selectedStarter?.sourceGovernance?.outcomeExplanation?.primary_signal ??
    null;
  const shouldRenderSelectedStarterSourceGovernance = Boolean(
    selectedStarter &&
      (selectedStarter.origin === "workspace" ||
        selectedStarter.createdFromWorkflowId ||
        selectedStarterSourceGovernance)
  );
  const currentWorkflowCreateHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const starterGovernanceHref = buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const recentWorkflowLink = workflows[0]
    ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: workflows[0].id,
        viewState: workspaceStarterGovernanceScope,
        variant: "recent"
      })
    : null;
  const surfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
    starterGovernanceHref
  });
  const sourceWorkflowSummariesById = useMemo(
    () => Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow] as const)),
    [workflows]
  );
  const selectedStarterMissingToolGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkspaceStarterMissingToolGovernanceSurface({
            template: toWorkspaceStarterGovernanceTemplate(selectedStarter),
            missingToolIds: selectedStarter.missingToolIds,
            sourceWorkflowSummariesById,
            workspaceStarterGovernanceQueryScope: workspaceStarterGovernanceScope
          })
        : null,
    [selectedStarter, sourceWorkflowSummariesById, workspaceStarterGovernanceScope]
  );
  const selectedStarterMissingToolBlockingSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterMissingToolBlockingSurface({
            starter: selectedStarter
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterLegacyAuthWorkflowGovernanceHandoff = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
            starter: selectedStarter,
            legacyAuthGovernanceSnapshot,
            workspaceStarterGovernanceScope
          })
        : null,
    [legacyAuthGovernanceSnapshot, selectedStarter, workspaceStarterGovernanceScope]
  );
  const selectedStarterNextStepSurface = selectedStarter
    ? buildWorkflowCreateStarterNextStepSurface({
        missingToolGovernanceSurface: selectedStarterMissingToolGovernanceSurface,
        legacyAuthWorkflowGovernanceHandoff: selectedStarterLegacyAuthWorkflowGovernanceHandoff,
        starter: selectedStarter,
        sourceGovernanceSurface: selectedStarterSourceGovernanceSurface,
        starterGovernanceHref,
        surfaceCopy
      })
    : null;
  const shouldRenderSelectedStarterNextStep = Boolean(
    selectedStarterNextStepSurface?.workflowGovernanceHandoff ||
      selectedStarterNextStepSurface?.primaryResourceSummary ||
      selectedStarterNextStepSurface?.href
  );
  const selectedStarterSandboxDependencySummary = useMemo(
    () =>
      selectedStarter
        ? describeWorkflowDefinitionSandboxDependency(selectedStarter.sandboxGovernance)
        : null,
    [selectedStarter]
  );
  const selectedStarterPreviewNodes = useMemo(
    () =>
      (selectedStarter?.definition.nodes ?? []).slice(0, 4).map((node) => {
        const catalogLabel = nodeCatalog.find((item) => item.type === node.type)?.label;
        return node.name?.trim() || catalogLabel || node.type;
      }),
    [nodeCatalog, selectedStarter?.definition.nodes]
  );
  const selectedStarterPreviewOverflow = Math.max(
    0,
    (selectedStarter?.definition.nodes?.length ?? 0) - selectedStarterPreviewNodes.length
  );
  const selectedStarterFactPills = useMemo(
    () =>
      selectedStarter
        ? [
            getWorkflowCreateSourceLabel(selectedStarter.origin),
            `${selectedStarter.nodeCount} 个节点`,
            selectedStarter.governedToolCount > 0
              ? `${selectedStarter.governedToolCount} 个工具`
              : "无工具依赖"
          ]
        : [],
    [selectedStarter]
  );
  const governanceDisclosureStatus =
    selectedStarterSourcePresenter?.actionStatusLabel ??
    selectedStarterSourcePresenter?.statusLabel ??
    (selectedStarterNextStepSurface ? "按需展开" : null);
  const handleCreateWorkflow = () => {
    runCreateTransition(async () => {
      if (!selectedStarter) {
        return;
      }

      if (selectedStarterMissingToolBlockingSurface) {
        setFeedback(selectedStarterMissingToolBlockingSurface.blockedMessage, "error");
        return;
      }

      const normalizedName = workflowName.trim() || selectedStarter.defaultWorkflowName;
      setFeedback("正在创建应用草稿...", "idle");

      try {
        const body = await createWorkflow({
          name: normalizedName,
          definition: structuredClone(selectedStarter.definition)
        });

        setFeedback(`已创建 ${normalizedName}，正在进入 xyflow Studio...`, "success");
        router.push(
          buildWorkflowEditorHrefFromWorkspaceStarterViewState(
            body.id,
            workspaceStarterGovernanceScope
          )
        );
        router.refresh();
      } catch (error) {
        setFeedback(
          error instanceof WorkflowDefinitionValidationError
            ? error.message
            : "无法连接后端创建 workflow，请确认 API 已启动。",
          "error"
        );
      }
    });
  };

  const hasScopedWorkspaceStarterFilters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterGovernanceScope
  );

  if (!selectedStarter) {
    return (
      <main className="editor-shell">
        <section className="hero creation-hero">
          <div className="hero-copy">
            <p className="eyebrow">Starter scope</p>
            <h1>当前筛选范围里没有可复用的 active workspace starter</h1>
            <p className="hero-text">
              {surfaceCopy.emptyStateDescription}
            </p>
            <div className="hero-actions">
              <WorkbenchEntryLinks
                {...surfaceCopy.emptyStateLinks}
                currentHref={currentWorkflowCreateHref}
              />
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-label">当前应用类型</div>
            <div className="panel-value">{activeTrackPresentation.label}</div>
            <p className="panel-text">
              {activeTrackPresentation.summary}
            </p>
            <p className="panel-text">
              搜索：<strong>{searchQuery.trim() || "未设置"}</strong>
            </p>
            <p className="panel-text">
              来源治理：<strong>{sourceGovernanceKind ?? "全部"}</strong>
            </p>
            <p className="panel-text">
              follow-up：<strong>{needsFollowUp ? "仅关注热点" : "未启用"}</strong>
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workflow-create-shell">
      <section className="workflow-create-topbar">
        <div className="workflow-create-topbar-left">
          <Link href={buildWorkspaceHrefFromWorkspaceStarterViewState(workspaceStarterGovernanceScope)}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              className="workflow-create-back-button"
            >
              返回工作台
            </Button>
          </Link>
          <div className="workflow-create-topbar-copy">
            <span>New app</span>
            <strong>选起点后直接进入 Studio</strong>
          </div>
        </div>
        <div className="workflow-create-topbar-summary" aria-label="创建页摘要">
          <span className="workflow-create-inline-chip">{activeTrackPresentation.label}</span>
          <span className="workflow-create-inline-chip muted">{visibleStarters.length} 个 starter</span>
          {workflows.length > 0 ? (
            <span className="workflow-create-inline-chip muted">{workflows.length} 个草稿</span>
          ) : null}
        </div>
      </section>

      <section className="workflow-create-page">
        <div className="workflow-create-main-card">
          <div className="workflow-create-shell-bar">
            <div className="workflow-create-shell-copy">
              <p className="workspace-eyebrow">Applications / Create</p>
              <Title level={3} style={{ margin: 0, color: '#111827' }}>
                创建一个应用
              </Title>
              <Text type="secondary">
                先选起点，再命名进入 Studio。
              </Text>

              <div className="workflow-create-step-row" aria-label="应用创建步骤">
                <span className="workflow-create-step-pill active">1 选模板</span>
                <span className="workflow-create-step-pill">2 命名并进入画布</span>
              </div>

              <div className="workflow-create-signal-row">
                {createSignalItems.map((item) => (
                  <span className="workflow-create-signal-pill" key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>

              {hasScopedWorkspaceStarterFilters ? (
                <div className="workflow-create-scoped-banner">
                  <strong>Scoped governance</strong>
                  <span>{surfaceCopy.scopedGovernanceDescription}</span>
                  <Link href={starterGovernanceHref} className="workflow-create-inline-link">
                    {surfaceCopy.scopedGovernanceBackLinkLabel}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          <div className="workflow-create-browser-card">
            <WorkflowStarterBrowser
              activeTrack={activeTrack}
              selectedStarterId={selectedStarter.id}
              starters={visibleStarters}
              tracks={starterTracks}
              onSelectTrack={handleTrackSelect}
              onSelectStarter={applyStarterSelection}
            />
          </div>

        </div>

        <aside className="workflow-create-side">
            <div className="workflow-create-config-card">
              <div className="workflow-create-config-header">
                <p className="workspace-eyebrow">Step 2</p>
                <Title level={4} style={{ margin: '0 0 6px', color: '#111827' }}>
                  命名后进入画布
                </Title>
                <Text type="secondary">
                  右侧只保留创建动作，治理和草稿入口退到二级信息。
                </Text>
              </div>

              <div className="workflow-create-selected-card">
                <div className="workflow-create-selected-head">
                  <div>
                    <div className="workflow-create-selected-title">{selectedStarter.name}</div>
                    <div className="workflow-create-selected-copy">{selectedStarter.description}</div>
                  </div>
                  <Tag color="blue" style={{ margin: 0 }}>
                    {selectedStarterTrackPresentation.label}
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
                  onChange={(event) => {
                    clearFeedback();
                    setWorkflowName(event.target.value);
                  }}
                  placeholder={selectedStarter.defaultWorkflowName}
                />
              </div>

              <div className="workflow-create-preview-card">
                <div className="workflow-create-preview-header">
                  <div>
                    <p className="workspace-eyebrow">Studio preview</p>
                    <h3>创建后直接打开画布</h3>
                    <p>先落到 starter 骨架，细节配置回到 editor 继续处理。</p>
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
                      <span className="workflow-create-preview-node more">+{selectedStarterPreviewOverflow}</span>
                    ) : null}
                  </div>

                  <div className="workflow-create-preview-note">
                    {selectedStarter.recommendedNextStep}
                  </div>
                </div>
              </div>

              <Button
                type="primary"
                size="large"
                block
                disabled={Boolean(selectedStarterMissingToolBlockingSurface)}
                onClick={handleCreateWorkflow}
                loading={isCreating}
                className="workflow-create-primary-button"
              >
                创建并进入画布
              </Button>

              {message ? (
                <div className={`workflow-create-feedback ${messageTone === 'error' ? 'error' : 'success'}`}>
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

          <div className="workflow-create-support-card workflow-create-side-section">
            <div className="workflow-create-side-section-header">
              <div>
                <p className="workspace-eyebrow">Utility links</p>
                <h3>更多入口</h3>
                <p>不压住创建动作时，再回到首页、模板治理或最近草稿。</p>
              </div>
            </div>
            <div className="workflow-create-inline-actions">
              <Link href="/" className="workflow-create-inline-link workflow-create-inline-chip muted">
                返回系统首页
              </Link>
              {recentWorkflowLink ? (
                <Link
                  href={recentWorkflowLink.href}
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

          {workflows.length > 0 ? (
            <details className="workflow-create-disclosure workflow-create-support-card workflow-create-side-section">
              <summary className="workflow-create-disclosure-summary">
                <div className="workflow-create-recent-header workflow-create-side-section-header">
                  <div>
                    <p className="workspace-eyebrow">Recent drafts</p>
                    <h3>继续最近草稿</h3>
                    <p>已有接近的应用时，再展开续写而不是重复创建。</p>
                  </div>
                </div>
                <span className="workflow-create-disclosure-status">{workflows.length} 个草稿</span>
              </summary>
              <div className="workflow-create-disclosure-body">
                <div className="workflow-create-recent-list">
                  {workflows.slice(0, 2).map((workflow) => {
                    const workflowHref = appendWorkflowLibraryViewState(
                      buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
                        workflowId: workflow.id,
                        viewState: workspaceStarterGovernanceScope,
                        variant: "recent"
                      }).href,
                      {
                        definitionIssue: workflow.tool_governance?.missing_tool_ids?.length
                          ? "missing_tool"
                          : null
                      }
                    );

                    return (
                      <Link className="workflow-create-recent-link" href={workflowHref} key={workflow.id}>
                        <div>
                          <strong>{workflow.name}</strong>
                          <p>
                            v{workflow.version} · {workflow.status === "published" ? "已发布" : "草稿"} · {workflow.node_count} 个节点
                          </p>
                        </div>
                        <span>
                          {workflow.tool_governance?.missing_tool_ids?.length
                            ? `${workflow.tool_governance.missing_tool_ids.length} 个工具缺口`
                            : "继续编排"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                {workflows.length > 2 ? (
                  <div className="workflow-create-recent-more">
                    还有 {workflows.length - 2} 个草稿，优先回工作台按筛选继续。
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
                  <div className="workflow-create-governance-eyebrow">Source governance</div>
                  <p>{surfaceCopy.sourceGovernanceDescription}</p>
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
                    {selectedStarterSourcePresenter ? (
                      <>
                        <div className="workflow-create-selected-badges">
                          <Tag color="blue" style={{ margin: 0 }}>
                            {selectedStarterSourcePresenter.actionStatusLabel ?? selectedStarterSourcePresenter.statusLabel}
                          </Tag>
                          {selectedStarterSourceChips.map((chip) => (
                            <Tag key={`${selectedStarter.id}-${chip}`} style={{ margin: 0 }}>
                              {chip}
                            </Tag>
                          ))}
                        </div>
                        {selectedStarterSourcePrimarySignal ? <div>{selectedStarterSourcePrimarySignal}</div> : null}
                        <div>{selectedStarterSourcePresenter.followUp ?? selectedStarterSourcePresenter.summary}</div>
                      </>
                    ) : null}

                    {selectedStarterNextStepSurface?.href && selectedStarterNextStepSurface.hrefLabel ? (
                      <div>
                        {surfaceCopy.sourceGovernanceFollowUpPrefix}
                        <Link href={selectedStarterNextStepSurface.href} className="workflow-create-inline-link with-offset">
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
      </section>
    </main>
  );
}

type WorkspaceStarterSourceGovernanceSurfaceTemplate = Parameters<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>[0]["template"];

type WorkspaceStarterSourceGovernanceSurface = ReturnType<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>;

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

function toWorkspaceStarterGovernanceTemplate(
  starter: WorkflowStarterTemplate
): WorkspaceStarterSourceGovernanceSurfaceTemplate {
  const governance = starter.sourceGovernance;

  return {
    id: starter.id,
    name: starter.name,
    archived: starter.archived,
    created_from_workflow_id: starter.createdFromWorkflowId ?? governance?.sourceWorkflowId ?? null,
    source_governance: governance
      ? {
          kind: governance.kind,
          status_label: governance.statusLabel,
          summary: governance.summary,
          source_workflow_id: governance.sourceWorkflowId ?? null,
          source_workflow_name: governance.sourceWorkflowName ?? null,
          template_version: governance.templateVersion ?? null,
          source_version: governance.sourceVersion ?? null,
          action_decision: governance.actionDecision ?? null,
          outcome_explanation: governance.outcomeExplanation ?? null
        }
      : null
  };
}

function buildWorkflowCreateStarterNextStepSurface({
  missingToolGovernanceSurface,
  legacyAuthWorkflowGovernanceHandoff,
  starter,
  sourceGovernanceSurface,
  starterGovernanceHref,
  surfaceCopy
}: {
  missingToolGovernanceSurface: WorkspaceStarterFollowUpSurface | null;
  legacyAuthWorkflowGovernanceHandoff: WorkflowGovernanceHandoff | null;
  starter: WorkflowStarterTemplate;
  sourceGovernanceSurface: WorkspaceStarterSourceGovernanceSurface | null;
  starterGovernanceHref: string;
  surfaceCopy: WorkflowCreateWizardSurfaceCopy;
}): WorkflowCreateStarterNextStepSurface {
  if (missingToolGovernanceSurface) {
    return {
      label: missingToolGovernanceSurface.label,
      detail: missingToolGovernanceSurface.detail,
      primaryResourceSummary: missingToolGovernanceSurface.primaryResourceSummary,
      workflowGovernanceHandoff: missingToolGovernanceSurface.workflowGovernanceHandoff,
      href: missingToolGovernanceSurface.entryOverride?.href ?? null,
      hrefLabel: missingToolGovernanceSurface.entryOverride?.label ?? null
    };
  }

  const presenter = sourceGovernanceSurface?.presenter ?? null;
  const recommendedNextStep = sourceGovernanceSurface?.recommendedNextStep ?? null;
  const shouldLinkToStarterGovernance =
    starter.origin === "workspace" ||
    Boolean(starter.createdFromWorkflowId) ||
    Boolean(starter.sourceGovernance);

  if (
    recommendedNextStep &&
    (recommendedNextStep.action === "refresh" || recommendedNextStep.action === "rebase")
  ) {
    return {
      label: recommendedNextStep.label,
      detail: recommendedNextStep.detail,
      primaryResourceSummary: recommendedNextStep.primaryResourceSummary,
      workflowGovernanceHandoff:
        recommendedNextStep.workflowGovernanceHandoff ?? legacyAuthWorkflowGovernanceHandoff,
      href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
      hrefLabel: shouldLinkToStarterGovernance
        ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
        : null
    };
  }

  if (presenter?.needsAttention) {
    return {
      label: presenter.actionStatusLabel ?? presenter.statusLabel,
      detail: presenter.followUp ?? presenter.summary,
      primaryResourceSummary: sourceGovernanceSurface?.recommendedNextStep?.primaryResourceSummary,
      workflowGovernanceHandoff:
        sourceGovernanceSurface?.recommendedNextStep?.workflowGovernanceHandoff ??
        legacyAuthWorkflowGovernanceHandoff,
      href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
      hrefLabel: shouldLinkToStarterGovernance
        ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
        : null
    };
  }

  return {
    label: surfaceCopy.createWorkflowRecommendedNextStepLabel,
    detail: starter.recommendedNextStep,
    primaryResourceSummary: null,
    workflowGovernanceHandoff: legacyAuthWorkflowGovernanceHandoff,
    href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
    hrefLabel: shouldLinkToStarterGovernance
      ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
      : null
  };
}

function buildWorkflowCreateStarterMissingToolBlockingSurface({
  starter
}: {
  starter: WorkflowStarterTemplate;
}): WorkflowCreateStarterMissingToolBlockingSurface | null {
  const missingToolIds = Array.from(
    new Set(starter.missingToolIds.map((toolId) => toolId.trim()).filter(Boolean))
  );

  if (missingToolIds.length === 0) {
    return null;
  }

  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();
  const renderedToolSummary = formatCatalogGapToolSummary(missingToolIds) ?? "unknown tool";
  const blockedMessage =
    `当前 starter 仍有 catalog gap（${renderedToolSummary}）；` +
    "如果现在创建，API 会直接拒绝该草稿。先补 tool binding，再沿上面的治理入口完成治理，最后回来创建草稿。";

  return {
    blockedMessage
  };
}

function buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
  starter,
  legacyAuthGovernanceSnapshot,
  workspaceStarterGovernanceScope
}: {
  starter: WorkflowStarterTemplate;
  legacyAuthGovernanceSnapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workspaceStarterGovernanceScope: WorkspaceStarterGovernanceQueryScope;
}): WorkflowGovernanceHandoff | null {
  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();

  if (!sourceWorkflowId || legacyAuthGovernanceSnapshot === null) {
    return null;
  }

  const workflow = legacyAuthGovernanceSnapshot.workflows.find(
    (item) => item.workflow_id === sourceWorkflowId
  );

  if (workflow === undefined || getWorkflowLegacyPublishAuthBacklogCount(workflow) <= 0) {
    return null;
  }

  const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
    workflowId: workflow.workflow_id,
    viewState: workspaceStarterGovernanceScope,
    variant: "source"
  });

  return buildWorkflowGovernanceHandoff({
    workflowId: workflow.workflow_id,
    workflowDetailHref: workflowDetailLink.href,
    toolGovernance: workflow.tool_governance,
    legacyAuthGovernance: legacyAuthGovernanceSnapshot
  });
}

function getWorkflowCreateSourceLabel(origin: WorkflowStarterTemplate["origin"]) {
  if (origin === "workspace") {
    return "团队模板";
  }

  return "官方模板";
}
