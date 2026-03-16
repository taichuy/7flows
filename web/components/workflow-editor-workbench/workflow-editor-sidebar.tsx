"use client";

import Link from "next/link";

import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { UnsupportedWorkflowNodeSummary } from "@/lib/workflow-node-catalog";
import type { RunDetail } from "@/lib/get-run-detail";
import type { RunTrace } from "@/lib/get-run-trace";
import { type WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type { WorkflowListItem } from "@/lib/get-workflows";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { WorkflowRunOverlayPanel } from "@/components/workflow-run-overlay-panel";

import type { WorkflowEditorMessageTone } from "./shared";

type WorkflowEditorSidebarProps = {
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
  validationNavigatorItems: WorkflowValidationNavigatorItem[];
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  run: RunDetail | null;
  trace: RunTrace | null;
  traceError: string | null;
  selectedNodeId: string | null;
  isLoadingRunOverlay: boolean;
  isRefreshingRuns: boolean;
  onWorkflowNameChange: (value: string) => void;
  onAddNode: (type: string) => void;
  onNavigateValidationIssue: (item: WorkflowValidationNavigatorItem) => void;
  onSelectRunId: (runId: string | null) => void;
  onRefreshRuns: () => void;
};

export function WorkflowEditorSidebar({
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
  validationNavigatorItems,
  runs,
  selectedRunId,
  run,
  trace,
  traceError,
  selectedNodeId,
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
          {workflows.map((item) => (
            <Link
              key={item.id}
              className={`workflow-chip ${item.id === workflowId ? "selected" : ""}`}
              href={`/workflows/${encodeURIComponent(item.id)}`}
            >
              <span>{item.name}</span>
              <small>
                {item.version} · {item.status}
              </small>
            </Link>
          ))}
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

        <p className={`sync-message ${messageTone}`}>
          {message ?? "选择节点或连线后，这里会显示编辑器反馈。"}
        </p>

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
        trace={trace}
        traceError={traceError}
        selectedNodeId={selectedNodeId}
        isLoading={isLoadingRunOverlay}
        isRefreshingRuns={isRefreshingRuns}
        onSelectRunId={onSelectRunId}
        onRefreshRuns={onRefreshRuns}
      />
    </aside>
  );
}
