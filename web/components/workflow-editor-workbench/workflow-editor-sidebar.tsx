"use client";

import React, { memo, useEffect, useMemo, useState } from "react";
import { Input, Tabs } from "antd";
import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import type { RunSnapshotWithId } from "@/app/actions/run-snapshot";
import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { UnsupportedWorkflowNodeSummary } from "@/lib/workflow-node-catalog";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import type { RunTrace } from "@/lib/get-run-trace";
import { type WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import { appendWorkflowLibraryViewStateForWorkflow } from "@/lib/workflow-library-query";
import {
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildWorkflowEditorStarterSaveSurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import {
  buildLegacyPublishAuthModeContractSummary,
  buildLegacyPublishAuthModeFollowUp
} from "@/lib/legacy-publish-auth-contract";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { buildWorkflowCatalogGapDetail } from "@/lib/workflow-governance-handoff";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { WorkflowRunOverlayPanel } from "@/components/workflow-run-overlay-panel";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import {
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterTemplateFollowUpSurface
} from "@/components/workspace-starter-library/shared";

import {
  buildWorkflowPersistBlockerRecommendedNextStep,
  type WorkflowPersistBlocker
} from "./persist-blockers";
import type { WorkflowEditorMessageKind, WorkflowEditorMessageTone } from "./shared";

type WorkflowEditorSidebarProps = {
  currentHref?: string;
  workflowId: string;
  workflowName: string;
  workflows: WorkflowListItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  editorNodeLibrary: WorkflowNodeCatalogItem[];
  plannedNodeLibrary: WorkflowNodeCatalogItem[];
  unsupportedNodes: UnsupportedWorkflowNodeSummary[];
  message: string | null;
  messageTone: WorkflowEditorMessageTone;
  messageKind?: WorkflowEditorMessageKind;
  savedWorkspaceStarter?: WorkspaceStarterTemplateItem | null;
  persistBlockerSummary: string | null;
  persistBlockers: WorkflowPersistBlocker[];
  persistBlockerRecommendedNextStep?: OperatorRecommendedNextStep | null;
  executionPreflightMessage: string | null;
  toolExecutionValidationIssueCount: number;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  preflightValidationItem?: WorkflowValidationNavigatorItem | null;
  validationNavigatorItems: WorkflowValidationNavigatorItem[];
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  run: RunDetail | null;
  runSnapshot: RunSnapshotWithId | null;
  trace: RunTrace | null;
  traceError: string | null;
  selectedNodeId: string | null;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  isLoadingRunOverlay: boolean;
  isRefreshingRuns: boolean;
  onAddNode: (type: string) => void;
  onNavigateValidationIssue: (item: WorkflowValidationNavigatorItem) => void;
  onSelectRunId: (runId: string | null) => void;
  onRefreshRuns: () => void;
};

type WorkflowEditorNodeRailView = "catalog" | "drafts";

function buildValidationIssueGovernancePreview(item: WorkflowValidationNavigatorItem) {
  const chips: string[] = [];
  const details: string[] = [];
  const catalogGapToolIds = Array.from(new Set(item.catalogGapToolIds ?? []));

  if (catalogGapToolIds.length > 0) {
    chips.push("catalog gap");
    const catalogGapDetail = buildWorkflowCatalogGapDetail({
      toolGovernance: {
        referenced_tool_ids: catalogGapToolIds,
        missing_tool_ids: catalogGapToolIds,
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      },
      subjectLabel: "这条校验项",
      returnDetail:
        "点击这条校验项后，编辑器会跳到对应字段，并继续沿同一份 workflow governance handoff 收口。"
    });

    if (catalogGapDetail) {
      details.push(catalogGapDetail);
    }
  }

  if (item.hasLegacyPublishAuthModeIssues) {
    chips.push("publish auth blocker");
    details.push(
      `${buildLegacyPublishAuthModeContractSummary()} ${buildLegacyPublishAuthModeFollowUp()}`
    );
  }

  if (chips.length === 0 && details.length === 0) {
    return null;
  }

  return {
    chips: Array.from(new Set(chips)),
    details: Array.from(new Set(details))
  };
}

function WorkflowEditorSidebarComponent({
  currentHref,
  workflowId,
  workflowName,
  workflows,
  nodeSourceLanes,
  toolSourceLanes,
  editorNodeLibrary,
  plannedNodeLibrary,
  unsupportedNodes,
  message,
  messageTone,
  messageKind = "default",
  savedWorkspaceStarter = null,
  persistBlockerSummary,
  persistBlockers,
  persistBlockerRecommendedNextStep = null,
  executionPreflightMessage,
  toolExecutionValidationIssueCount,
  focusedValidationItem = null,
  preflightValidationItem = null,
  validationNavigatorItems,
  runs,
  selectedRunId,
  run,
  runSnapshot,
  trace,
  traceError,
  selectedNodeId,
  callbackWaitingAutomation,
  sandboxReadiness,
  workspaceStarterGovernanceQueryScope = null,
  createWorkflowHref = "/workflows/new",
  workspaceStarterLibraryHref = "/workspace-starters",
  hasScopedWorkspaceStarterFilters = false,
  isLoadingRunOverlay,
  isRefreshingRuns,
  onAddNode,
  onNavigateValidationIssue,
  onSelectRunId,
  onRefreshRuns
}: WorkflowEditorSidebarProps) {
  const primaryNodeLane = nodeSourceLanes[0] ?? null;
  const pluginBackedNodeCount = editorNodeLibrary.filter(
    (item) => item.bindingRequired
  ).length;
  const remediationItem = focusedValidationItem ?? preflightValidationItem;
  const resolvedPersistBlockerRecommendedNextStep =
    persistBlockerRecommendedNextStep ??
    buildWorkflowPersistBlockerRecommendedNextStep(
      persistBlockers,
      sandboxReadiness,
      currentHref
    );
  const feedbackMessage =
    message ??
    (persistBlockers.length > 0
      ? "选择一个待修正项或点击保存，编辑器会跳到首个阻断点。"
      : "选中节点后即可编辑配置，或在画布里点 + 插入下一节点。");
  const savedWorkspaceStarterLibraryHref = savedWorkspaceStarter
    ? workspaceStarterGovernanceQueryScope
      ? buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState({
          ...workspaceStarterGovernanceQueryScope,
          selectedTemplateId: savedWorkspaceStarter.id
        })
      : mergeWorkspaceStarterSelectionIntoHref(workspaceStarterLibraryHref, savedWorkspaceStarter.id)
    : workspaceStarterLibraryHref;
  const savedWorkspaceStarterCreateWorkflowHref = savedWorkspaceStarter
    ? workspaceStarterGovernanceQueryScope
      ? buildWorkflowCreateHrefFromWorkspaceStarterViewState({
          ...workspaceStarterGovernanceQueryScope,
          selectedTemplateId: savedWorkspaceStarter.id
        })
      : mergeWorkspaceStarterSelectionIntoHref(createWorkflowHref, savedWorkspaceStarter.id)
    : createWorkflowHref;
  const savedWorkspaceStarterSourceWorkflowId = savedWorkspaceStarter
    ? savedWorkspaceStarter.source_governance?.source_workflow_id ??
      savedWorkspaceStarter.created_from_workflow_id ??
      null
    : null;
  const savedWorkspaceStarterSourceWorkflowSummary = savedWorkspaceStarterSourceWorkflowId
    ? workflows.find((item) => item.id === savedWorkspaceStarterSourceWorkflowId) ?? null
    : null;
  const savedWorkspaceStarterFollowUpSurface = savedWorkspaceStarter
    ? buildWorkspaceStarterMissingToolGovernanceSurface({
        template: savedWorkspaceStarter,
        missingToolIds:
          savedWorkspaceStarterSourceWorkflowSummary?.tool_governance?.missing_tool_ids ?? [],
        sourceWorkflowSummariesById: savedWorkspaceStarterSourceWorkflowSummary
          ? {
              [savedWorkspaceStarterSourceWorkflowSummary.id]: savedWorkspaceStarterSourceWorkflowSummary
            }
          : null,
        workspaceStarterGovernanceQueryScope
      }) ??
      buildWorkspaceStarterTemplateFollowUpSurface({
        template: savedWorkspaceStarter,
        createWorkflowHref: savedWorkspaceStarterCreateWorkflowHref,
        workspaceStarterGovernanceQueryScope
      })
    : null;
  const starterSaveSurfaceCopy =
    messageKind === "workspace_starter_saved"
      ? buildWorkflowEditorStarterSaveSurfaceCopy({
          createWorkflowHref: savedWorkspaceStarterCreateWorkflowHref,
          workspaceStarterLibraryHref: savedWorkspaceStarterLibraryHref,
          hasScopedWorkspaceStarterFilters,
          savedStarterName: savedWorkspaceStarter?.name ?? null,
          recommendedNextStepDetail: savedWorkspaceStarterFollowUpSurface?.detail ?? null,
          primaryResourceSummary: savedWorkspaceStarterFollowUpSurface?.primaryResourceSummary ?? null,
          workspaceStarterLibraryLabel: savedWorkspaceStarter
            ? `打开刚保存的 starter：${savedWorkspaceStarter.name}`
            : null,
          createWorkflowLabel:
            savedWorkspaceStarterFollowUpSurface?.entryKey === "createWorkflow"
              ? savedWorkspaceStarterFollowUpSurface.entryOverride?.label ??
                savedWorkspaceStarterFollowUpSurface.label
              : null
        })
      : null;
  const workflowChipLinks = workflows.slice(0, 6).map((workflow) => {
    const baseHref = workspaceStarterGovernanceQueryScope
      ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
          workflowId: workflow.id,
          viewState: workspaceStarterGovernanceQueryScope,
          variant: "chip"
        }).href
      : buildAuthorFacingWorkflowDetailLinkSurface({
          workflowId: workflow.id,
          variant: "chip"
        }).href;

    return {
      workflow,
      href: appendWorkflowLibraryViewStateForWorkflow(baseHref, workflow, {
        definitionIssue: null
      })
    };
  });
  const preferredTabKey = useMemo(() => {
    const shouldFocusDiagnostics =
      persistBlockers.length > 0 ||
      Boolean(starterSaveSurfaceCopy) ||
      Boolean(remediationItem) ||
      validationNavigatorItems.length > 0 ||
      Boolean(traceError) ||
      messageTone === "error";

    return shouldFocusDiagnostics ? "2" : "1";
  }, [
    messageTone,
    persistBlockers.length,
    remediationItem,
    starterSaveSurfaceCopy,
    traceError,
    validationNavigatorItems.length
  ]);
  const [activeTabKey, setActiveTabKey] = useState(preferredTabKey);
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeRailView, setNodeRailView] = useState<WorkflowEditorNodeRailView>("catalog");
  const filteredEditorNodeLibrary = useMemo(() => {
    const keyword = nodeSearch.trim().toLowerCase();
    if (!keyword) {
      return editorNodeLibrary;
    }

    return editorNodeLibrary.filter((item) => {
      const haystack = [item.label, item.type, item.description, item.supportSummary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [editorNodeLibrary, nodeSearch]);
  const hasScopedWorkflowLinks = workflowChipLinks.length > 0;
  const railSummaryPills = useMemo(
    () =>
      [
        primaryNodeLane
          ? {
              key: "primary-lane",
              label: `节点域 · ${primaryNodeLane.shortLabel}`,
              tone: "accent" as const
            }
          : null,
        {
          key: "catalog-count",
          label: `${filteredEditorNodeLibrary.length}/${editorNodeLibrary.length} 个节点`
        },
        pluginBackedNodeCount > 0
          ? {
              key: "plugin-backed",
              label: `插件节点 ${pluginBackedNodeCount}`
            }
          : null,
        toolSourceLanes.length > 0
          ? {
              key: "tool-lanes",
              label: `工具域 ${toolSourceLanes.length}`
            }
          : null,
        hasScopedWorkflowLinks
          ? {
              key: "draft-count",
              label: `相关草稿 ${workflowChipLinks.length}`
            }
          : null
      ].filter((item): item is { key: string; label: string; tone?: "accent" } => Boolean(item)),
    [
      editorNodeLibrary.length,
      filteredEditorNodeLibrary.length,
      hasScopedWorkflowLinks,
      pluginBackedNodeCount,
      primaryNodeLane,
      toolSourceLanes.length,
      workflowChipLinks.length
    ]
  );
  const laneBadges = useMemo(
    () =>
      [...nodeSourceLanes, ...toolSourceLanes].map((lane) => ({
        key: `${lane.kind}-${lane.label}`,
        label: `${lane.shortLabel} · ${lane.count}`
      })),
    [nodeSourceLanes, toolSourceLanes]
  );

  useEffect(() => {
    setActiveTabKey(preferredTabKey);
  }, [preferredTabKey, workflowId]);

  useEffect(() => {
    setNodeRailView("catalog");
  }, [workflowId]);

  return (
    <aside className="editor-sidebar">
      <Tabs
        activeKey={activeTabKey}
        className="workflow-editor-sidebar-tabs"
        onChange={setActiveTabKey}
        centered
        items={[
        {
          key: '1',
          label: '节点',
          children: (
            <article className="diagnostic-panel editor-panel">
              <div className="workflow-editor-rail-header">
                <div className="workflow-editor-rail-header-copy">
                  <h2>节点目录</h2>
                  <p>先插节点，相关草稿按需再看。</p>
                </div>
                <div className="workflow-editor-rail-summary" aria-label="节点栏摘要">
                  {railSummaryPills.map((pill) => (
                    <span
                      className={`workflow-editor-rail-summary-pill${pill.tone === "accent" ? " accent" : ""}`}
                      key={pill.key}
                    >
                      {pill.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="workflow-editor-rail-switch" role="tablist" aria-label="Editor node rail view">
                <button
                  className={`workflow-editor-rail-switch-button${nodeRailView === "catalog" ? " active" : ""}`}
                  type="button"
                  aria-pressed={nodeRailView === "catalog"}
                  onClick={() => setNodeRailView("catalog")}
                >
                  节点目录
                </button>
                {hasScopedWorkflowLinks ? (
                  <button
                    className={`workflow-editor-rail-switch-button${nodeRailView === "drafts" ? " active" : ""}`}
                    type="button"
                    aria-pressed={nodeRailView === "drafts"}
                    onClick={() => setNodeRailView("drafts")}
                  >
                    同域草稿 {workflowChipLinks.length}
                  </button>
                ) : null}
              </div>

              {laneBadges.length > 0 ? (
                <div className="workflow-editor-rail-badge-row">
                  {laneBadges.map((badge) => (
                    <span className="event-chip" key={badge.key}>
                      {badge.label}
                    </span>
                  ))}
                </div>
              ) : null}

              <section hidden={nodeRailView !== "catalog"} aria-hidden={nodeRailView !== "catalog"}>
                <div className="workflow-editor-catalog-search-block">
                  <Input
                    allowClear
                    className="workflow-editor-catalog-search"
                    placeholder="搜索节点，例如 agent / loop / tool"
                    value={nodeSearch}
                    onChange={(event) => setNodeSearch(event.target.value)}
                  />
                  <div className="workflow-editor-catalog-search-meta">
                    <span>{filteredEditorNodeLibrary.length} / {editorNodeLibrary.length} 个节点</span>
                    {nodeSearch.trim() ? <span>当前筛选：{nodeSearch.trim()}</span> : <span>支持按名称、类型搜索</span>}
                  </div>
                </div>

                {hasScopedWorkflowLinks ? (
                  <div className="workflow-editor-rail-handoff">
                    <span>还有 {workflowChipLinks.length} 个同域草稿，需要时再切换。</span>
                    <button
                      className="workflow-editor-inline-link"
                      type="button"
                      onClick={() => setNodeRailView("drafts")}
                    >
                      查看同域草稿
                    </button>
                  </div>
                ) : null}

                {plannedNodeLibrary.length > 0 ? (
                  <div className="binding-field compact-stack">
                    <span className="binding-label">规划中的节点</span>
                    <div className="tool-badge-row">
                      {plannedNodeLibrary.map((item) => (
                        <span className="event-chip" key={`planned-${item.type}`}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                    <small className="section-copy">
                      这些类型仅作规划占位，暂不进入当前画布主链。
                    </small>
                  </div>
                ) : null}

                <div className="workflow-editor-catalog-list">
                  {filteredEditorNodeLibrary.map((item) => (
                    <button
                      key={item.type}
                      className="workflow-editor-catalog-button"
                      type="button"
                      onClick={() => onAddNode(item.type)}
                    >
                      <div className="workflow-editor-catalog-button-mark">
                        +
                      </div>
                      <div className="workflow-editor-catalog-button-copy">
                        <div className="workflow-editor-catalog-button-label">{item.label}</div>
                        <div className="workflow-editor-catalog-button-description">
                          {item.description}
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredEditorNodeLibrary.length === 0 ? (
                    <div className="workflow-editor-catalog-empty">
                      没找到匹配节点。换个关键词，或从右侧配置继续编辑当前节点。
                    </div>
                  ) : null}
                </div>
              </section>

              <section hidden={nodeRailView !== "drafts"} aria-hidden={nodeRailView !== "drafts"}>
                {hasScopedWorkflowLinks ? (
                  <div className="binding-field compact-stack workflow-editor-scoped-workflows">
                    <span className="binding-label">相关草稿</span>
                    <small className="section-copy">
                      当前只在这里切换相关草稿，避免和节点插入混在一起。
                    </small>
                    <div className="workflow-editor-catalog-search-meta">
                      <span>当前编辑：{workflowName}</span>
                      <span>可切换 {workflowChipLinks.length} 个相关应用</span>
                    </div>
                    <div className="workflow-editor-scoped-workflow-grid">
                      {workflowChipLinks.map(({ workflow, href }) => (
                        <WorkflowChipLink
                          key={`workflow-chip-${workflow.id}`}
                          workflow={workflow}
                          href={href}
                          selected={workflow.id === workflowId}
                          currentHref={currentHref}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="workflow-editor-catalog-empty">
                    当前还没有可切换的同域草稿，先从节点目录继续补当前工作流。
                  </div>
                )}
              </section>

            </article>
          )
        },
        {
          key: '2',
          label: '诊断',
          children: (
            <article className="diagnostic-panel editor-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">编辑器反馈</p>
                  <h2>当前阻断与下一步</h2>
                </div>
              </div>

              {unsupportedNodes.length > 0 ? (
                <div className="sync-message error">
                  <p>当前 workflow 已包含未进入执行主链的节点类型，编辑器会保留它们，但不能假装已可运行：</p>
                  <ul className="roadmap-list compact-list">
                    {unsupportedNodes.map((item) => (
                      <li key={`unsupported-${item.type}`}>
                        {item.label} x{item.count}：{item.supportSummary}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {persistBlockers.length > 0 ? (
                <WorkflowPersistBlockerNotice
                  title="保存阻断"
                  summary={persistBlockerSummary}
                  blockers={persistBlockers}
                  sandboxReadiness={sandboxReadiness}
                  currentHref={currentHref}
                  hideRecommendedNextStep={Boolean(persistBlockerRecommendedNextStep)}
                />
              ) : null}

              <p className={`sync-message ${messageTone}`}>{feedbackMessage}</p>

              {starterSaveSurfaceCopy ? (
                <WorkspaceStarterFollowUpCard
                  title={starterSaveSurfaceCopy.nextStepTitle}
                  label={savedWorkspaceStarterFollowUpSurface?.label ?? "继续推进"}
                  detail={starterSaveSurfaceCopy.description}
                  primaryResourceSummary={starterSaveSurfaceCopy.primaryResourceSummary}
                  workflowGovernanceHandoff={savedWorkspaceStarterFollowUpSurface?.workflowGovernanceHandoff}
                  actions={<WorkbenchEntryLinks {...starterSaveSurfaceCopy.nextStepLinks} />}
                />
              ) : null}

              <SandboxReadinessOverviewCard
                currentHref={currentHref}
                readiness={sandboxReadiness}
                title="执行前检查"
                intro={executionPreflightMessage}
                hideWhenHealthy={toolExecutionValidationIssueCount === 0}
                hideRecommendedNextStep={Boolean(resolvedPersistBlockerRecommendedNextStep)}
              />

              {remediationItem ? (
                <WorkflowValidationRemediationCard
                  currentHref={currentHref}
                  item={remediationItem}
                  sandboxReadiness={sandboxReadiness}
                />
              ) : null}

              {validationNavigatorItems.length > 0 ? (
                <div className="validation-issue-list">
                  {validationNavigatorItems.slice(0, 8).map((item) => {
                    const governancePreview = buildValidationIssueGovernancePreview(item);

                    return (
                      <button
                        key={item.key}
                        className="validation-issue-button"
                        type="button"
                        onClick={() => onNavigateValidationIssue(item)}
                      >
                        <strong>{item.target.label}</strong>
                        <span>{item.message}</span>
                        {governancePreview ? (
                          <div className="compact-stack">
                            {governancePreview.chips.length > 0 ? (
                              <div className="tool-badge-row">
                                {governancePreview.chips.map((chip) => (
                                  <span className="event-chip" key={`${item.key}-${chip}`}>
                                    {chip}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {governancePreview.details.map((detail) => (
                              <small className="section-copy" key={`${item.key}-${detail}`}>
                                {detail}
                              </small>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </article>
          )
        },
        {
          key: '3',
          label: '运行',
          children: (
            <WorkflowRunOverlayPanel
              currentHref={currentHref}
              runs={runs}
              selectedRunId={selectedRunId}
              run={run}
              runSnapshot={runSnapshot}
              trace={trace}
              traceError={traceError}
              selectedNodeId={selectedNodeId}
              callbackWaitingAutomation={callbackWaitingAutomation}
              sandboxReadiness={sandboxReadiness}
              workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
              isLoading={isLoadingRunOverlay}
              isRefreshingRuns={isRefreshingRuns}
              onSelectRunId={onSelectRunId}
              onRefreshRuns={onRefreshRuns}
            />
          )
        }
      ]}
      />
    </aside>
  );
}

export const WorkflowEditorSidebar = memo(WorkflowEditorSidebarComponent);

function mergeWorkspaceStarterSelectionIntoHref(href: string, starterId: string) {
  const [pathWithQuery, hash = ""] = href.split("#");
  const [pathname, query = ""] = pathWithQuery.split("?");
  const searchParams = new URLSearchParams(query);

  searchParams.set("starter", starterId);
  searchParams.sort();

  const resolvedQuery = searchParams.toString();
  const resolvedPath = resolvedQuery ? `${pathname}?${resolvedQuery}` : pathname;

  return hash ? `${resolvedPath}#${hash}` : resolvedPath;
}
