"use client";

import type { Edge, Node } from "@xyflow/react";

import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import { WorkflowNodeConfigForm } from "@/components/workflow-node-config-form";

type WorkflowEditorInspectorProps = {
  selectedNode: Node<WorkflowCanvasNodeData> | null;
  selectedEdge: Edge<WorkflowCanvasEdgeData> | null;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  tools: PluginToolRegistryItem[];
  nodeConfigText: string;
  onNodeConfigTextChange: (value: string) => void;
  onApplyNodeConfigJson: () => void;
  onNodeNameChange: (value: string) => void;
  onNodeConfigChange: (nextConfig: Record<string, unknown>) => void;
  onNodeRuntimePolicyChange: (value: string) => void;
  onDeleteSelectedNode: () => void;
  onUpdateSelectedEdge: (
    patch: Partial<WorkflowCanvasEdgeData> & { label?: string | undefined }
  ) => void;
  onDeleteSelectedEdge: () => void;
};

export function WorkflowEditorInspector({
  selectedNode,
  selectedEdge,
  nodes,
  tools,
  nodeConfigText,
  onNodeConfigTextChange,
  onApplyNodeConfigJson,
  onNodeNameChange,
  onNodeConfigChange,
  onNodeRuntimePolicyChange,
  onDeleteSelectedNode,
  onUpdateSelectedEdge,
  onDeleteSelectedEdge
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
              onChange={onNodeConfigChange}
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

      <article className="diagnostic-panel editor-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Hints</p>
            <h2>Current rules</h2>
          </div>
        </div>

        <ul className="roadmap-list compact-list">
          <li>保存时会把节点位置写回 `config.ui.position`。</li>
          <li>`tool` / `mcp_query` / `condition` / `router` 已优先改成结构化表单，其余配置仍可走高级 JSON。</li>
          <li>`tool` 节点会直接消费 `/api/plugins/tools` 的持久化目录，不再只停留在首页绑定面板。</li>
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
