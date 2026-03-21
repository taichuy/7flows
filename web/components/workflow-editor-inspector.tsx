"use client";

import React from "react";
import type { Edge, Node } from "@xyflow/react";

import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { WorkflowNodeConfigForm } from "@/components/workflow-node-config-form";
import { WorkflowNodeIoSchemaForm } from "@/components/workflow-node-config-form/node-io-schema-form";
import { WorkflowNodeRuntimePolicyForm } from "@/components/workflow-node-config-form/runtime-policy-form";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowEditorPublishForm } from "@/components/workflow-editor-publish-form";
import { WorkflowEditorVariableForm } from "@/components/workflow-editor-variable-form";

type WorkflowEditorInspectorProps = {
  selectedNode: Node<WorkflowCanvasNodeData> | null;
  selectedEdge: Edge<WorkflowCanvasEdgeData> | null;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  tools: PluginToolRegistryItem[];
  nodeConfigText: string;
  onNodeConfigTextChange: (value: string) => void;
  onApplyNodeConfigJson: () => void;
  onNodeNameChange: (value: string) => void;
  onNodeConfigChange: (nextConfig: Record<string, unknown>) => void;
  onNodeInputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeOutputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyUpdate: (nextRuntimePolicy: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyChange: (value: string) => void;
  workflowVersion: string;
  availableWorkflowVersions: string[];
  workflowVariables: Array<Record<string, unknown>>;
  workflowPublish: Array<Record<string, unknown>>;
  onWorkflowVariablesChange: (
    nextVariables: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  onWorkflowPublishChange: (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  onDeleteSelectedNode: () => void;
  onUpdateSelectedEdge: (
    patch: Partial<WorkflowCanvasEdgeData> & { label?: string | undefined }
  ) => void;
  onDeleteSelectedEdge: () => void;
  highlightedNodeSection?: "config" | "contract" | "runtime" | null;
  highlightedNodeFieldPath?: string | null;
  highlightedPublishEndpointIndex?: number | null;
  highlightedPublishEndpointFieldPath?: string | null;
  highlightedVariableIndex?: number | null;
  highlightedVariableFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  persistBlockedMessage?: string | null;
  persistBlockerSummary?: string | null;
  persistBlockers: WorkflowPersistBlocker[];
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function WorkflowEditorInspector({
  selectedNode,
  selectedEdge,
  nodes,
  edges,
  tools,
  nodeConfigText,
  onNodeConfigTextChange,
  onApplyNodeConfigJson,
  onNodeNameChange,
  onNodeConfigChange,
  onNodeInputSchemaChange,
  onNodeOutputSchemaChange,
  onNodeRuntimePolicyUpdate,
  onNodeRuntimePolicyChange,
  workflowVersion,
  availableWorkflowVersions,
  workflowVariables,
  workflowPublish,
  onWorkflowVariablesChange,
  onWorkflowPublishChange,
  onDeleteSelectedNode,
  onUpdateSelectedEdge,
  onDeleteSelectedEdge,
  highlightedNodeSection = null,
  highlightedNodeFieldPath = null,
  highlightedPublishEndpointIndex = null,
  highlightedPublishEndpointFieldPath = null,
  highlightedVariableIndex = null,
  highlightedVariableFieldPath = null,
  focusedValidationItem = null,
  persistBlockedMessage = null,
  persistBlockerSummary = null,
  persistBlockers,
  sandboxReadiness
}: WorkflowEditorInspectorProps) {
  return (
    <>
      <article className="diagnostic-panel editor-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inspector</p>
            <h2>Selection details</h2>
          </div>
        </div>

        {selectedNode ? (
          <div className="binding-form">
            <div className="tool-badge-row">
              <span className="event-chip">{selectedNode.data.nodeType}</span>
              <span className="event-chip">node {selectedNode.id}</span>
              {selectedNode.data.nodeType === "tool" ? (
                <span className="event-chip">{tools.length} catalog tools</span>
              ) : null}
            </div>

            <label className="binding-field">
              <span className="binding-label">Node name</span>
              <input
                className="trace-text-input"
                value={selectedNode.data.label}
                onChange={(event) => onNodeNameChange(event.target.value)}
              />
            </label>

            <WorkflowNodeConfigForm
              node={selectedNode}
              nodes={nodes}
              tools={tools}
              sandboxReadiness={sandboxReadiness}
              highlightedFieldPath={highlightedNodeSection === "config" ? highlightedNodeFieldPath : null}
              focusedValidationItem={
                highlightedNodeSection === "config" ? focusedValidationItem : null
              }
              onChange={onNodeConfigChange}
            />

            <WorkflowNodeIoSchemaForm
              node={selectedNode}
              onInputSchemaChange={onNodeInputSchemaChange}
              onOutputSchemaChange={onNodeOutputSchemaChange}
              highlighted={highlightedNodeSection === "contract"}
              highlightedFieldPath={
                highlightedNodeSection === "contract" ? highlightedNodeFieldPath : null
              }
              focusedValidationItem={
                highlightedNodeSection === "contract" ? focusedValidationItem : null
              }
              sandboxReadiness={sandboxReadiness}
            />

            <label className="binding-field">
              <span className="binding-label">Advanced config JSON</span>
              <textarea
                className="editor-json-area"
                value={nodeConfigText}
                onChange={(event) => onNodeConfigTextChange(event.target.value)}
              />
            </label>

            <button className="sync-button" type="button" onClick={onApplyNodeConfigJson}>
              应用高级 config JSON
            </button>

            <WorkflowNodeRuntimePolicyForm
              node={selectedNode}
              nodes={nodes}
              edges={edges}
              onChange={onNodeRuntimePolicyUpdate}
              highlighted={highlightedNodeSection === "runtime"}
              highlightedFieldPath={
                highlightedNodeSection === "runtime" ? highlightedNodeFieldPath : null
              }
              focusedValidationItem={
                highlightedNodeSection === "runtime" ? focusedValidationItem : null
              }
              sandboxReadiness={sandboxReadiness}
            />

            <label className="binding-field">
              <span className="binding-label">Runtime policy JSON</span>
              <textarea
                key={`${selectedNode.id}-runtime-policy`}
                className="editor-json-area"
                defaultValue={stringifyJson(selectedNode.data.runtimePolicy ?? {})}
                onBlur={(event) => onNodeRuntimePolicyChange(event.target.value)}
              />
            </label>

            <button className="editor-danger-button" type="button" onClick={onDeleteSelectedNode}>
              删除所选节点
            </button>
          </div>
        ) : selectedEdge ? (
          <div className="binding-form">
            <div className="tool-badge-row">
              <span className="event-chip">edge {selectedEdge.id}</span>
              <span className="event-chip">
                {selectedEdge.source} -&gt; {selectedEdge.target}
              </span>
            </div>

            <label className="binding-field">
              <span className="binding-label">Channel</span>
              <select
                className="binding-select"
                value={selectedEdge.data?.channel ?? "control"}
                onChange={(event) =>
                  onUpdateSelectedEdge({
                    channel: event.target.value === "data" ? "data" : "control"
                  })
                }
              >
                <option value="control">control</option>
                <option value="data">data</option>
              </select>
            </label>

            <label className="binding-field">
              <span className="binding-label">Condition</span>
              <input
                className="trace-text-input"
                value={selectedEdge.data?.condition ?? ""}
                onChange={(event) =>
                  onUpdateSelectedEdge({
                    condition: event.target.value,
                    label: event.target.value.trim() || undefined
                  })
                }
                placeholder="success / failed / branch key"
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Condition expression</span>
              <input
                className="trace-text-input"
                value={selectedEdge.data?.conditionExpression ?? ""}
                onChange={(event) =>
                  onUpdateSelectedEdge({
                    conditionExpression: event.target.value
                  })
                }
                placeholder="outcome == 'succeeded'"
              />
            </label>

            <button className="editor-danger-button" type="button" onClick={onDeleteSelectedEdge}>
              删除所选连线
            </button>
          </div>
        ) : (
          <p className="empty-state">
            先从画布上选择一个节点或连线，再继续编辑它的基础 metadata。
          </p>
        )}
      </article>

      {persistBlockedMessage ? (
        <article className="diagnostic-panel editor-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Status</p>
              <h2>Save gate</h2>
            </div>
          </div>

          <WorkflowPersistBlockerNotice
            title="Inspector remediation"
            summary={persistBlockerSummary ?? persistBlockedMessage}
            blockers={persistBlockers}
          />
        </article>
      ) : null}

      <WorkflowEditorPublishForm
        workflowVersion={workflowVersion}
        availableWorkflowVersions={availableWorkflowVersions}
        publishEndpoints={workflowPublish}
        sandboxReadiness={sandboxReadiness}
        onChange={onWorkflowPublishChange}
        focusedValidationItem={
          focusedValidationItem?.target.scope === "publish" ? focusedValidationItem : null
        }
        persistBlockers={persistBlockers}
        highlightedEndpointIndex={highlightedPublishEndpointIndex}
        highlightedEndpointFieldPath={highlightedPublishEndpointFieldPath}
      />

      <WorkflowEditorVariableForm
        variables={workflowVariables}
        onChange={onWorkflowVariablesChange}
        highlightedVariableIndex={highlightedVariableIndex}
        highlightedVariableFieldPath={highlightedVariableFieldPath}
        focusedValidationItem={
          focusedValidationItem?.target.scope === "variables" ? focusedValidationItem : null
        }
        persistBlockers={persistBlockers}
        sandboxReadiness={sandboxReadiness}
      />

      <article
        className={`diagnostic-panel editor-panel ${highlightedNodeSection === "config" ? "validation-focus-ring" : ""}`.trim()}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Hints</p>
            <h2>Current rules</h2>
          </div>
        </div>

        <ul className="roadmap-list compact-list">
          <li>保存时会把节点位置写回 `config.ui.position`。</li>
          <li>`tool` / `mcp_query` / `condition` / `router` 已优先改成结构化表单，其余配置仍可走高级 JSON。</li>
          <li>节点 `inputSchema` / `outputSchema` 已有独立 section，避免继续混在通用 config JSON 里。</li>
          <li>`runtimePolicy` 现已补上 execution / retry / join 结构化表单，复杂场景仍可回退到 JSON。</li>
          <li>workflow `variables` 现已接上结构化表单，方便把全局输入、公共约束和后续发布 schema 对齐到同一处。</li>
          <li>workflow `publish` 现已接上结构化 draft 表单；`workflowVersion` 留空会跟随当前保存版本，正式发布与 API key 治理仍放在独立 publish 页面。</li>
          <li>`tool` 节点会直接消费 `/api/plugins/tools` 的持久化目录，不再只停留在首页绑定面板。</li>
          <li>保存前会校验 `tool` 节点和 `llm_agent.toolPolicy` 是否仍指向当前 tool catalog，避免目录漂移拖到 runtime 才暴露。</li>
          <li>保存前也会校验显式声明的 adapter 绑定和 execution class 是否被当前工具执行目标支持，避免把 `microvm` / `sandbox` 之类的目标写进 definition 后再由 runtime 静默降级。</li>
          <li>运行时尚未支持 `loop`，因此当前画布仍不暴露 loop 节点。</li>
          <li>后端会继续校验 trigger 唯一、output 必需和边引用合法性。</li>
        </ul>
      </article>
    </>
  );
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
