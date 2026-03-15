"use client";

import Link from "next/link";

import type { UnsupportedWorkflowNodeSummary } from "@/lib/workflow-node-catalog";

type WorkflowEditorHeroProps = {
  workflowId: string;
  workflowVersion: string;
  nodesCount: number;
  edgesCount: number;
  toolsCount: number;
  availableRunsCount: number;
  isDirty: boolean;
  selectedNodeLabel: string | null;
  selectedEdgeId: string | null;
  workflowsCount: number;
  selectedRunAttached: boolean;
  plannedNodeLabels: string[];
  unsupportedNodes: UnsupportedWorkflowNodeSummary[];
  contractValidationIssuesCount: number;
  toolReferenceValidationIssuesCount: number;
  publishVersionValidationIssuesCount: number;
  persistBlockedMessage: string | null;
  isSaving: boolean;
  isSavingStarter: boolean;
  onSave: () => void;
  onSaveAsWorkspaceStarter: () => void;
};

export function WorkflowEditorHero({
  workflowId,
  workflowVersion,
  nodesCount,
  edgesCount,
  toolsCount,
  availableRunsCount,
  isDirty,
  selectedNodeLabel,
  selectedEdgeId,
  workflowsCount,
  selectedRunAttached,
  plannedNodeLabels,
  unsupportedNodes,
  contractValidationIssuesCount,
  toolReferenceValidationIssuesCount,
  publishVersionValidationIssuesCount,
  persistBlockedMessage,
  isSaving,
  isSavingStarter,
  onSave,
  onSaveAsWorkspaceStarter
}: WorkflowEditorHeroProps) {
  const plannedNodeSummary = plannedNodeLabels.join(" / ");

  return (
    <section className="hero editor-hero">
      <div className="hero-copy">
        <p className="eyebrow">Workflow Editor</p>
        <h1>让设计态正式长出画布骨架</h1>
        <p className="hero-text">
          这一版先把 workflow definition 和 `xyflow` 画布接起来，支持最小节点编排、
          边元数据编辑和保存回后端版本链路。更细的节点表单、调试联动和发布配置会继续沿着
          同一条 definition 演进。
        </p>
        <div className="pill-row">
          <span className="pill">workflow {workflowId}</span>
          <span className="pill">version {workflowVersion}</span>
          <span className="pill">{nodesCount} nodes</span>
          <span className="pill">{edgesCount} edges</span>
          <span className="pill">{toolsCount} catalog tools</span>
          <span className="pill">{availableRunsCount} recent runs</span>
          {unsupportedNodes.length > 0 ? (
            <span className="pill">{unsupportedNodes.length} unsupported node types</span>
          ) : null}
          {contractValidationIssuesCount > 0 ? (
            <span className="pill">{contractValidationIssuesCount} contract issues</span>
          ) : null}
          {toolReferenceValidationIssuesCount > 0 ? (
            <span className="pill">{toolReferenceValidationIssuesCount} tool reference issues</span>
          ) : null}
          {publishVersionValidationIssuesCount > 0 ? (
            <span className="pill">{publishVersionValidationIssuesCount} publish version issues</span>
          ) : null}
        </div>
        <div className="hero-actions">
          <Link className="inline-link" href="/">
            返回系统首页
          </Link>
          <Link className="inline-link secondary" href="/workflows/new">
            新建 workflow
          </Link>
          <Link className="inline-link secondary" href="/workspace-starters">
            管理 workspace starters
          </Link>
          <button className="sync-button" type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "保存中..." : "保存 workflow"}
          </button>
          <button
            className="sync-button secondary"
            type="button"
            onClick={onSaveAsWorkspaceStarter}
            disabled={isSavingStarter}
          >
            {isSavingStarter ? "模板保存中..." : "保存为 workspace starter"}
          </button>
        </div>
      </div>

      <div className="hero-panel">
        <div className="panel-label">Editor state</div>
        <div className="panel-value">{isDirty ? "Dirty" : "Synced"}</div>
        <p className="panel-text">
          当前保存链路：<strong>web canvas -&gt; workflow definition -&gt; API versioning</strong>
        </p>
        <p className="panel-text">
          当前节点边界：
          <strong>
            {plannedNodeSummary
              ? `${plannedNodeSummary} 仍保持 planned；发布网关 / 调试联动继续推进`
              : "发布网关 / 调试联动继续推进"}
          </strong>
        </p>
        {unsupportedNodes.length > 0 ? (
          <p className="panel-text">
            当前 workflow 已载入未进入执行主链的节点：
            <strong>
              {unsupportedNodes.map((item) => `${item.label} x${item.count}`).join(" / ")}
            </strong>
          </p>
        ) : null}
        {persistBlockedMessage ? (
          <p className="panel-text">
            当前保存策略：
            <strong>
              含 planned / unknown 节点、非法 contract schema、tool catalog 引用漂移或 publish version 引用失配时阻断保存与 starter 沉淀
            </strong>
          </p>
        ) : null}
        <p className="panel-text">
          当前治理入口：<strong>editor -&gt; workspace starter library</strong>
        </p>
        <dl className="signal-list">
          <div>
            <dt>Selected node</dt>
            <dd>{selectedNodeLabel ?? "-"}</dd>
          </div>
          <div>
            <dt>Selected edge</dt>
            <dd>{selectedEdgeId ?? "-"}</dd>
          </div>
          <div>
            <dt>Workflows</dt>
            <dd>{workflowsCount}</dd>
          </div>
          <div>
            <dt>Selected run</dt>
            <dd>{selectedRunAttached ? "Attached" : "-"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
