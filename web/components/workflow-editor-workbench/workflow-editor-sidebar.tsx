"use client";

import React from "react";
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
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
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
  onWorkflowNameChange: (value: string) => void;
  onAddNode: (type: string) => void;
  onNavigateValidationIssue: (item: WorkflowValidationNavigatorItem) => void;
  onSelectRunId: (runId: string | null) => void;
  onRefreshRuns: () => void;
};

export function WorkflowEditorSidebar({
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
  onWorkflowNameChange,
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
      : "选择节点或连线后，这里会显示编辑器反馈。");
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

  return (
    <aside className="editor-sidebar">
      <article className="diagnostic-panel editor-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2>Canvas overview</h2>
          </div>
        </div>

        <label className="binding-field">
          <span className="binding-label">Workflow name</span>
          <input
            className="trace-text-input"
            value={workflowName}
            onChange={(event) => onWorkflowNameChange(event.target.value)}
            placeholder="输入 workflow 名称"
          />
        </label>

        <div className="workflow-chip-row compact-stack">
          {workflows.map((item) => {
            const workflowDetailLink = workspaceStarterGovernanceQueryScope
              ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
                  workflowId: item.id,
                  viewState: workspaceStarterGovernanceQueryScope
                })
              : buildAuthorFacingWorkflowDetailLinkSurface({
                  workflowId: item.id
                });
            const workflowDetailHref = appendWorkflowLibraryViewStateForWorkflow(
              workflowDetailLink.href,
              item,
              {
                definitionIssue: null
              }
            );

            return (
              <WorkflowChipLink
                key={item.id}
                workflow={item}
                href={workflowDetailHref}
                selected={item.id === workflowId}
              />
            );
          })}
        </div>
      </article>

      <article className="diagnostic-panel editor-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Palette</p>
            <h2>Add nodes</h2>
          </div>
        </div>
        <p className="section-copy">
          先覆盖当前 MVP 较有意义的节点类型。`trigger` 保持单实例，`loop` 暂不放进画布。
        </p>

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

        <div className="summary-strip compact-strip">
          {primaryNodeLane ? (
            <div className="summary-card">
              <span>Node lane</span>
              <strong>{primaryNodeLane.shortLabel}</strong>
            </div>
          ) : null}
          <div className="summary-card">
            <span>Palette nodes</span>
            <strong>{primaryNodeLane?.count ?? editorNodeLibrary.length}</strong>
          </div>
          <div className="summary-card">
            <span>Plugin-backed</span>
            <strong>{pluginBackedNodeCount}</strong>
          </div>
          <div className="summary-card">
            <span>Tool lanes</span>
            <strong>{toolSourceLanes.length}</strong>
          </div>
        </div>

        <div className="starter-tag-row">
          {nodeSourceLanes.map((lane) => (
            <span className="event-chip" key={`${lane.kind}-${lane.label}`}>
              {lane.shortLabel} · {lane.count}
            </span>
          ))}
        </div>

        <div className="starter-tag-row">
          {toolSourceLanes.map((lane) => (
            <span className="event-chip" key={`${lane.kind}-${lane.label}`}>
              {lane.shortLabel} · {lane.count}
            </span>
          ))}
        </div>

        {plannedNodeLibrary.length > 0 ? (
          <div className="binding-field compact-stack">
            <span className="binding-label">Planned node types</span>
            <div className="tool-badge-row">
              {plannedNodeLibrary.map((item) => (
                <span className="event-chip" key={`planned-${item.type}`}>
                  {item.label}
                </span>
              ))}
            </div>
            <small className="section-copy">
              这些类型已经进入统一节点目录，但当前仍保持 planned，不进入 palette 按钮或 runtime 主链。
            </small>
          </div>
        ) : null}

        <div className="editor-palette">
          {editorNodeLibrary.map((item) => (
            <button
              key={item.type}
              className="editor-node-add"
              type="button"
              onClick={() => onAddNode(item.type)}
            >
              <span className="starter-track">{item.businessTrack}</span>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <div className="starter-meta-row">
                <span>{item.type}</span>
                <span>{item.source.shortLabel}</span>
              </div>
              {item.bindingSourceLanes.length > 0 ? (
                <div className="starter-meta-row">
                  <span>{item.bindingRequired ? "binding" : "optional"}</span>
                  <span>
                    {item.bindingSourceLanes.map((lane) => lane.shortLabel).join(" / ")}
                  </span>
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </article>

      <article className="diagnostic-panel editor-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Status</p>
            <h2>Editor feedback</h2>
          </div>
        </div>

        {persistBlockers.length > 0 ? (
          <WorkflowPersistBlockerNotice
            title="Save gate"
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
          title="Execution preflight"
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
            {validationNavigatorItems.slice(0, 8).map((item) => (
              <button
                key={item.key}
                className="validation-issue-button"
                type="button"
                onClick={() => onNavigateValidationIssue(item)}
              >
                <strong>{item.target.label}</strong>
                <span>{item.message}</span>
              </button>
            ))}
          </div>
        ) : null}
      </article>

      <WorkflowRunOverlayPanel
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
    </aside>
  );
}

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
