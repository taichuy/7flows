"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { memo, useEffect, useMemo, useState } from "react";
import { MenuFoldOutlined } from "@ant-design/icons";
import { Button, Input, Tabs } from "antd";
import type { RunSnapshotWithId } from "@/app/actions/run-snapshot";
import type { WorkflowLibrarySourceLane } from "@/lib/get-workflow-library";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
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
  buildWorkflowStudioSurfaceHref,
  getWorkflowStudioSurfaceDefinition,
  getWorkflowStudioSurfaceDefinitions
} from "@/lib/workbench-links";
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import { appendWorkflowLibraryViewStateForWorkflow } from "@/lib/workflow-library-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import {
  getPrimaryAuthoringNodeCatalog,
  sortWorkflowNodeCatalogForAuthoring
} from "@/lib/workflow-node-catalog";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import type { WorkflowEditorDiagnosticsPanelProps } from "@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-diagnostics-panel";
import type { WorkflowEditorRunPanelProps } from "@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-run-panel";
import type {
  WorkflowEditorSidebarAuthoringSourceContext,
  WorkflowEditorSidebarProps,
  WorkflowEditorSidebarTabKey
} from "@/components/workflow-editor-workbench/types";

import { type WorkflowPersistBlocker } from "./persist-blockers";
import type { WorkflowEditorMessageKind, WorkflowEditorMessageTone } from "./shared";

const LazyWorkflowEditorDiagnosticsPanel = dynamic<WorkflowEditorDiagnosticsPanelProps>(
  () =>
    import("@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-diagnostics-panel").then(
      (module) => module.WorkflowEditorDiagnosticsPanel
    ),
  {
    ssr: false,
    loading: () => (
      <article
        className="diagnostic-panel editor-panel"
        data-component="workflow-editor-diagnostics-panel-loading"
      >
        <h2>诊断面板</h2>
        <p className="section-copy">正在按需加载保存阻断、治理摘要与 remediation 明细。</p>
      </article>
    )
  }
);

const LazyWorkflowEditorRunPanel = dynamic<WorkflowEditorRunPanelProps>(
  () =>
    import("@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-run-panel").then(
      (module) => module.WorkflowEditorRunPanel
    ),
  {
    ssr: false,
    loading: () => (
      <article
        className="diagnostic-panel editor-panel"
        data-component="workflow-editor-run-overlay-loading"
      >
        <h2>运行面板</h2>
        <p className="section-copy">正在按需加载最近 runs、snapshot 与 trace。</p>
      </article>
    )
  }
);

type WorkflowEditorNodeRailView = "catalog" | "drafts";

function WorkflowEditorSidebarComponent({
  currentHref,
  workflowId,
  workflowName,
  workflowVersion = "0.1.0",
  workflowStageLabel = "draft only",
  workflowLibraryHref = "/workflows",
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
  authoringSourceNodeId = null,
  authoringSourceNodeLabel = null,
  authoringSourceContext = null,
  callbackWaitingAutomation,
  sandboxReadiness,
  workspaceStarterGovernanceQueryScope = null,
  createWorkflowHref = "/workflows/new",
  workspaceStarterLibraryHref = "/workspace-starters",
  hasScopedWorkspaceStarterFilters = false,
  isLoadingRunOverlay,
  isRefreshingRuns,
  onCollapse,
  onActiveTabChange,
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
  const preferredTabKey = useMemo<WorkflowEditorSidebarTabKey>(() => {
    if (selectedRunId) {
      return "3";
    }

    const shouldFocusDiagnostics =
      persistBlockers.length > 0 ||
      messageKind === "workspace_starter_saved" ||
      Boolean(remediationItem) ||
      validationNavigatorItems.length > 0 ||
      Boolean(traceError) ||
      messageTone === "error";

    return shouldFocusDiagnostics ? "2" : "1";
  }, [
    messageTone,
    messageKind,
    persistBlockers.length,
    remediationItem,
    traceError,
    validationNavigatorItems.length,
    selectedRunId
  ]);
  const [activeTabKey, setActiveTabKey] = useState<WorkflowEditorSidebarTabKey>(preferredTabKey);
  const [activatedTabKeys, setActivatedTabKeys] = useState<WorkflowEditorSidebarTabKey[]>([
    preferredTabKey
  ]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeRailView, setNodeRailView] = useState<WorkflowEditorNodeRailView>("catalog");
  const orderedEditorNodeLibrary = useMemo(
    () => sortWorkflowNodeCatalogForAuthoring(editorNodeLibrary),
    [editorNodeLibrary]
  );
  const primaryAuthoringNodeLibrary = useMemo(
    () => getPrimaryAuthoringNodeCatalog(orderedEditorNodeLibrary),
    [orderedEditorNodeLibrary]
  );
  const filteredEditorNodeLibrary = useMemo(() => {
    const keyword = nodeSearch.trim().toLowerCase();
    if (!keyword) {
      return orderedEditorNodeLibrary;
    }

    return orderedEditorNodeLibrary.filter((item) => {
      const haystack = [item.label, item.type, item.description, item.supportSummary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [nodeSearch, orderedEditorNodeLibrary]);
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
              label: `同域草稿 ${workflowChipLinks.length}`
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
    setActivatedTabKeys((currentKeys) =>
      currentKeys.includes(activeTabKey)
        ? currentKeys
        : [...currentKeys, activeTabKey]
    );
  }, [activeTabKey]);

  useEffect(() => {
    onActiveTabChange?.(activeTabKey);
  }, [activeTabKey, onActiveTabChange]);

  useEffect(() => {
    setNodeRailView("catalog");
  }, [workflowId]);

  const hasActivatedDiagnosticsPanel = activatedTabKeys.includes("2");
  const hasActivatedRunPanel = activatedTabKeys.includes("3");
  const studioSurfaceItems = getWorkflowStudioSurfaceDefinitions().filter(
    (item) => item.key !== "publish"
  );
  const studioModeLabel = getWorkflowStudioSurfaceDefinition("editor").modeLabel;

  return (
    <aside className="editor-sidebar">
      <div
        className="workflow-editor-sidebar-studio-rail"
        data-component="workflow-editor-sidebar-studio-rail"
      >
        <div className="workflow-editor-sidebar-studio-rail-head">
          <div className="workflow-studio-rail-header">
            <div className="workflow-studio-breadcrumb-row">
              <Link className="workflow-studio-breadcrumb-link" href={workflowLibraryHref}>
                编排中心
              </Link>
              <span className="workflow-studio-breadcrumb-current">{workflowName}</span>
            </div>

            <div className="workflow-studio-inline-metrics">
              <span className="workflow-studio-inline-tag">v{workflowVersion}</span>
              <span className="workflow-studio-inline-tag">{workflowStageLabel}</span>
              <span className="workflow-studio-shell-mode">{studioModeLabel}</span>
            </div>
          </div>

          {onCollapse ? (
            <Button
              aria-label="收起左侧栏"
              className="workflow-editor-sidebar-collapse-button"
              data-action="collapse-sidebar"
              icon={<MenuFoldOutlined />}
              onClick={onCollapse}
              type="text"
            />
          ) : null}
        </div>

        <nav className="workflow-studio-surface-rail" aria-label="Workflow studio surfaces">
          {studioSurfaceItems.map((item) => (
            <Link
              className={`workflow-studio-rail-link ${
                item.key === "editor" ? "active" : ""
              }`.trim()}
              href={buildWorkflowStudioSurfaceHref(workflowId, item.key)}
              key={item.key}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          ))}
        </nav>

        <div className="workflow-studio-rail-secondary">
          <Link
            className="workflow-studio-rail-secondary-link"
            href={buildWorkflowStudioSurfaceHref(workflowId, "publish")}
          >
            发布治理
          </Link>
          <Link className="workflow-studio-rail-secondary-link" href="/runs">
            运行诊断
          </Link>
          <Link className="workflow-studio-rail-secondary-link" href={workspaceStarterLibraryHref}>
            Starter 模板
          </Link>
        </div>
      </div>

      <Tabs
        activeKey={activeTabKey}
        className="workflow-editor-sidebar-tabs"
        onChange={(tabKey) => setActiveTabKey(tabKey as WorkflowEditorSidebarTabKey)}
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
                  <p>先插节点，再切草稿。</p>
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
                    {nodeSearch.trim() ? <span>当前筛选：{nodeSearch.trim()}</span> : <span>名称 / 类型搜索</span>}
                  </div>
                </div>

                {!nodeSearch.trim() && primaryAuthoringNodeLibrary.length > 0 ? (
                  <div
                    className="binding-field compact-stack"
                    data-component="workflow-editor-primary-authoring-path"
                  >
                    <span className="binding-label">常用主链</span>
                    <small className="section-copy">
                      {formatAuthoringSourceCopy(
                        authoringSourceNodeLabel,
                        authoringSourceContext
                      )}{" "}
                      {authoringSourceNodeId
                        ? "Reference 会自动补齐 reference.sourceNodeId 与 readableNodeIds，但仍保持显式授权边界。"
                        : "选中上游后从这里新增 Reference，会自动补齐 reference.sourceNodeId 与 readableNodeIds。"}
                    </small>
                    <div className="workflow-editor-catalog-list">
                      {primaryAuthoringNodeLibrary.map((item) => (
                        <button
                          key={`primary-authoring-${item.type}`}
                          className="workflow-editor-catalog-button"
                          type="button"
                          onClick={() =>
                            onAddNode(
                              item.type,
                              authoringSourceNodeId
                                ? { sourceNodeId: authoringSourceNodeId }
                                : undefined
                            )
                          }
                        >
                          <div className="workflow-editor-catalog-button-mark">+</div>
                          <div className="workflow-editor-catalog-button-copy">
                            <div className="workflow-editor-catalog-button-label">{item.label}</div>
                            <div className="workflow-editor-catalog-button-description">
                              {formatPrimaryAuthoringNodeDescription(
                                item.type,
                                item.description,
                                authoringSourceNodeLabel
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}



                {plannedNodeLibrary.length > 0 ? (
                  <details className="binding-field compact-stack">
                    <summary className="binding-label" style={{ cursor: "pointer", userSelect: "none" }}>
                      规划中的节点 ({plannedNodeLibrary.length}) · {plannedNodeLibrary.map((item) => item.label).join(" / ")}
                    </summary>
                    <div className="tool-badge-row" style={{ marginTop: "8px" }}>
                      {plannedNodeLibrary.map((item) => (
                        <span className="event-chip" key={`planned-${item.type}`}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                    <small className="section-copy">
                      规划占位，暂不进入当前画布。
                    </small>
                  </details>
                ) : null}

                <div className="workflow-editor-catalog-list">
                  {filteredEditorNodeLibrary.map((item) => (
                    <button
                      key={item.type}
                      className="workflow-editor-catalog-button"
                      type="button"
                      onClick={() =>
                        onAddNode(
                          item.type,
                          authoringSourceNodeId
                            ? { sourceNodeId: authoringSourceNodeId }
                            : undefined
                        )
                      }
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
                      没找到匹配节点。换个关键词，或继续配置当前节点。
                    </div>
                  ) : null}
                </div>
              </section>

              <section hidden={nodeRailView !== "drafts"} aria-hidden={nodeRailView !== "drafts"}>
                {hasScopedWorkflowLinks ? (
                  <div className="binding-field compact-stack workflow-editor-scoped-workflows">
                    <span className="binding-label">同域草稿</span>
                    <small className="section-copy">
                      切草稿只放这里，不和节点插入混在一起。
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
                    暂无同域草稿，继续从节点目录补当前 workflow。
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
            hasActivatedDiagnosticsPanel ? (
            <LazyWorkflowEditorDiagnosticsPanel
              currentHref={currentHref}
              workflows={workflows}
              unsupportedNodes={unsupportedNodes}
              message={message}
              messageTone={messageTone}
              messageKind={messageKind}
              savedWorkspaceStarter={savedWorkspaceStarter}
              persistBlockerSummary={persistBlockerSummary}
              persistBlockers={persistBlockers}
              persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
              executionPreflightMessage={executionPreflightMessage}
              toolExecutionValidationIssueCount={toolExecutionValidationIssueCount}
              focusedValidationItem={focusedValidationItem}
              preflightValidationItem={preflightValidationItem}
              validationNavigatorItems={validationNavigatorItems}
              traceError={traceError}
              sandboxReadiness={sandboxReadiness}
              workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
              createWorkflowHref={createWorkflowHref}
              workspaceStarterLibraryHref={workspaceStarterLibraryHref}
              hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
              onNavigateValidationIssue={onNavigateValidationIssue}
            />
            ) : (
            <article className="diagnostic-panel editor-panel" data-component="workflow-editor-diagnostics-panel-deferred">
              <h2>诊断面板</h2>
              <p className="section-copy">只有切到诊断时，才挂载保存阻断、治理摘要与 remediation 明细。</p>
            </article>
            )
          )
        },
        {
          key: '3',
          label: '运行',
          children: (
            hasActivatedRunPanel ? (
            <LazyWorkflowEditorRunPanel
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
            ) : (
            <article className="diagnostic-panel editor-panel" data-component="workflow-editor-run-overlay-deferred">
              <h2>运行面板</h2>
              <p className="section-copy">切到运行后再加载最近 runs、snapshot 与 trace，默认画布首屏不提前挂载。</p>
            </article>
            )
          )
        }
      ]}
      />
    </aside>
  );
}

export const WorkflowEditorSidebar = memo(WorkflowEditorSidebarComponent);

function formatAuthoringSourceCopy(
  authoringSourceNodeLabel: string | null,
  authoringSourceContext: WorkflowEditorSidebarAuthoringSourceContext | null
) {
  const resolvedLabel = authoringSourceNodeLabel ?? "Trigger";

  if (authoringSourceContext === "selected") {
    return `当前已选中 ${resolvedLabel}；这里的常用节点会直接插到它后方。`;
  }

  if (authoringSourceContext === "default_trigger") {
    return `当前未选节点；这里会默认从 ${resolvedLabel} 继续主链。`;
  }

  return "这里优先放常用节点；需要续接主链时先在画布里选中一个上游。";
}

function formatPrimaryAuthoringNodeDescription(
  nodeType: string,
  fallbackDescription: string,
  authoringSourceNodeLabel: string | null
) {
  const resolvedLabel = authoringSourceNodeLabel ?? "当前上游";

  switch (nodeType) {
    case "llm_agent":
      return `${resolvedLabel} 后方优先接 LLM 主节点，继续模型编排主链。`;
    case "reference":
      return `${resolvedLabel} 后方新增 Reference 时，会自动补齐显式引用授权。`;
    case "tool":
      return `${resolvedLabel} 后方直接接 Tool，保持工具编排主路径。`;
    case "condition":
      return `${resolvedLabel} 后方插入 Condition，快速切进分支控制。`;
    default:
      return fallbackDescription;
  }
}
