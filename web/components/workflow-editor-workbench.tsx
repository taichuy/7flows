"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Background,
  Controls,
  type Node,
  type NodeProps,
  type OnConnect,
  type OnSelectionChangeParams,
  type XYPosition,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  Handle,
  MiniMap,
  useEdgesState,
  useNodesState
} from "@xyflow/react";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { WorkflowDetail, WorkflowListItem } from "@/lib/get-workflows";
import {
  EDITOR_NODE_LIBRARY,
  buildEditorEdge,
  createWorkflowNodeDraft,
  reactFlowToWorkflowDefinition,
  workflowDefinitionToReactFlow,
  type WorkflowCanvasEdgeData,
  type WorkflowCanvasNodeData
} from "@/lib/workflow-editor";

type WorkflowEditorWorkbenchProps = {
  workflow: WorkflowDetail;
  workflows: WorkflowListItem[];
};

const nodeTypes = {
  workflowNode: WorkflowCanvasNode
};

export function WorkflowEditorWorkbench({
  workflow,
  workflows
}: WorkflowEditorWorkbenchProps) {
  const initialGraph = workflowDefinitionToReactFlow(workflow.definition);
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const [persistedWorkflowName, setPersistedWorkflowName] = useState(workflow.name);
  const [workflowVersion, setWorkflowVersion] = useState(workflow.version);
  const [persistedDefinition, setPersistedDefinition] = useState(workflow.definition);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialGraph.nodes[0]?.id ?? null
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodeConfigText, setNodeConfigText] = useState(() =>
    stringifyJson(initialGraph.nodes[0]?.data.config ?? {})
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | "idle">("idle");
  const [isSaving, startSavingTransition] = useTransition();

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const currentDefinition = reactFlowToWorkflowDefinition(nodes, edges, persistedDefinition);
  const isDirty =
    workflowName.trim() !== persistedWorkflowName ||
    JSON.stringify(currentDefinition) !== JSON.stringify(persistedDefinition);

  useEffect(() => {
    const nextGraph = workflowDefinitionToReactFlow(workflow.definition);
    setWorkflowName(workflow.name);
    setPersistedWorkflowName(workflow.name);
    setWorkflowVersion(workflow.version);
    setPersistedDefinition(workflow.definition);
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSelectedNodeId(nextGraph.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setNodeConfigText(stringifyJson(nextGraph.nodes[0]?.data.config ?? {}));
    setMessage(null);
    setMessageTone("idle");
  }, [workflow, setEdges, setNodes]);

  useEffect(() => {
    setNodeConfigText(stringifyJson(selectedNode?.data.config ?? {}));
  }, [selectedNodeId, selectedNode?.data.config]);

  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target) {
      return;
    }

    setEdges((currentEdges) =>
      addEdge(buildEditorEdge(connection.source, connection.target), currentEdges)
    );
    setSelectedEdgeId(null);
    setMessage(null);
    setMessageTone("idle");
  };

  const handleSelectionChange = (selection: OnSelectionChangeParams) => {
    const nextNode = selection.nodes[0];
    const nextEdge = selection.edges[0];
    setSelectedNodeId(nextNode?.id ?? null);
    setSelectedEdgeId(nextEdge?.id ?? null);
  };

  const handleAddNode = (type: (typeof EDITOR_NODE_LIBRARY)[number]["type"]) => {
    const draft = createWorkflowNodeDraft(type, nodes.length + 1);
    const nextNode: Node<WorkflowCanvasNodeData> = {
      id: draft.id,
      type: "workflowNode",
      position: readNodePosition(draft.config),
      data: {
        label: draft.name,
        nodeType: draft.type,
        config: stripUiPosition(draft.config)
      },
      selected: true
    };

    setNodes((currentNodes) => [...currentNodes, nextNode]);
    setSelectedNodeId(nextNode.id);
    setSelectedEdgeId(null);
    setMessage(`${draft.name} 已加入画布，记得保存 workflow。`);
    setMessageTone("success");
  };

  const handleNodeNameChange = (value: string) => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                label: value
              }
            }
          : node
      )
    );
  };

  const applyNodeConfigJson = () => {
    if (!selectedNodeId) {
      return;
    }

    try {
      const parsed = JSON.parse(nodeConfigText) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("节点 config 必须是 JSON 对象。");
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: parsed
                }
              }
            : node
        )
      );
      setMessage("节点 config 已应用到本地画布。");
      setMessageTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "节点 config 不是合法 JSON。");
      setMessageTone("error");
    }
  };

  const handleNodeRuntimePolicyChange = (value: string) => {
    if (!selectedNodeId) {
      return;
    }

    if (!value.trim()) {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  runtimePolicy: undefined
                }
              }
            : node
        )
      );
      setMessage("已清空 runtimePolicy。");
      setMessageTone("success");
      return;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("runtimePolicy 必须是 JSON 对象。");
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  runtimePolicy: parsed
                }
              }
            : node
        )
      );
      setMessage("runtimePolicy 已应用。");
      setMessageTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "runtimePolicy 不是合法 JSON。");
      setMessageTone("error");
    }
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNode) {
      return;
    }

    if (selectedNode.data.nodeType === "trigger") {
      setMessage("最小编辑器暂不允许删除唯一 trigger 节点。");
      setMessageTone("error");
      return;
    }

    if (
      selectedNode.data.nodeType === "output" &&
      nodes.filter((node) => node.data.nodeType === "output").length <= 1
    ) {
      setMessage("至少保留一个 output 节点，避免保存后被后端校验拒绝。");
      setMessageTone("error");
      return;
    }

    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNode.id));
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    setSelectedNodeId(null);
    setMessage(`节点 ${selectedNode.data.label} 已从画布移除。`);
    setMessageTone("success");
  };

  const handleDeleteSelectedEdge = () => {
    if (!selectedEdge) {
      return;
    }

    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdge.id));
    setSelectedEdgeId(null);
    setMessage("已移除所选连线。");
    setMessageTone("success");
  };

  const updateSelectedEdge = (
    patch: Partial<WorkflowCanvasEdgeData> & { label?: string | undefined }
  ) => {
    if (!selectedEdgeId) {
      return;
    }

    const { label, ...dataPatch } = patch;

    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.id === selectedEdgeId
          ? {
              ...edge,
              ...(label !== undefined ? { label } : {}),
              ...(dataPatch.channel
                ? {
                    animated: dataPatch.channel === "data"
                  }
                : {}),
              data: {
                ...(edge.data ?? { channel: "control" }),
                ...dataPatch
              }
            }
          : edge
      )
    );
  };

  const handleSave = () => {
    const nextDefinition = reactFlowToWorkflowDefinition(nodes, edges, persistedDefinition);
    startSavingTransition(async () => {
      setMessage("正在保存 workflow definition...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflow.id)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: workflowName.trim() || workflow.name,
              definition: nextDefinition
            })
          }
        );
        const body = (await response.json().catch(() => null)) as
          | { detail?: string; version?: string; name?: string; definition?: WorkflowDetail["definition"] }
          | null;

        if (!response.ok) {
          setMessage(body?.detail ?? `保存失败，API 返回 ${response.status}。`);
          setMessageTone("error");
          return;
        }

        setPersistedWorkflowName(workflowName.trim() || workflow.name);
        setPersistedDefinition(nextDefinition);
        setWorkflowVersion(body?.version ?? workflowVersion);
        setMessage(
          `已保存 workflow，当前版本 ${body?.version ?? workflowVersion}。`
        );
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端保存 workflow，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  return (
    <ReactFlowProvider>
      <main className="editor-shell">
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
              <span className="pill">workflow {workflow.id}</span>
              <span className="pill">version {workflowVersion}</span>
              <span className="pill">{nodes.length} nodes</span>
              <span className="pill">{edges.length} edges</span>
            </div>
            <div className="hero-actions">
              <Link className="inline-link" href="/">
                返回系统首页
              </Link>
              <button
                className="sync-button"
                type="button"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存 workflow"}
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
              当前边界：<strong>Loop / 发布网关 / 调试联动稍后继续</strong>
            </p>
            <dl className="signal-list">
              <div>
                <dt>Selected node</dt>
                <dd>{selectedNode?.data.label ?? "-"}</dd>
              </div>
              <div>
                <dt>Selected edge</dt>
                <dd>{selectedEdge?.id ?? "-"}</dd>
              </div>
              <div>
                <dt>Workflows</dt>
                <dd>{workflows.length}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="editor-workspace">
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
                  onChange={(event) => setWorkflowName(event.target.value)}
                  placeholder="输入 workflow 名称"
                />
              </label>

              <div className="workflow-chip-row compact-stack">
                {workflows.map((item) => (
                  <Link
                    key={item.id}
                    className={`workflow-chip ${item.id === workflow.id ? "selected" : ""}`}
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

              <div className="editor-palette">
                {EDITOR_NODE_LIBRARY.map((item) => (
                  <button
                    key={item.type}
                    className="editor-node-add"
                    type="button"
                    onClick={() => handleAddNode(item.type)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.type}</span>
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
            </article>
          </aside>

          <section className="editor-canvas-panel">
            <div className="editor-canvas-card">
              <ReactFlow
                fitView
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onSelectionChange={handleSelectionChange}
                deleteKeyCode={["Delete", "Backspace"]}
                className="editor-canvas"
              >
                <Background gap={24} size={1} />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) => nodeColorByType((node.data as WorkflowCanvasNodeData).nodeType)}
                />
                <Controls />
              </ReactFlow>
            </div>
          </section>

          <aside className="editor-inspector">
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
                  </div>

                  <label className="binding-field">
                    <span className="binding-label">Node name</span>
                    <input
                      className="trace-text-input"
                      value={selectedNode.data.label}
                      onChange={(event) => handleNodeNameChange(event.target.value)}
                    />
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Node config JSON</span>
                    <textarea
                      className="editor-json-area"
                      value={nodeConfigText}
                      onChange={(event) => setNodeConfigText(event.target.value)}
                    />
                  </label>

                  <button className="sync-button" type="button" onClick={applyNodeConfigJson}>
                    应用 config JSON
                  </button>

                  <label className="binding-field">
                    <span className="binding-label">Runtime policy JSON</span>
                    <textarea
                      key={`${selectedNode.id}-runtime-policy`}
                      className="editor-json-area"
                      defaultValue={stringifyJson(selectedNode.data.runtimePolicy ?? {})}
                      onBlur={(event) => handleNodeRuntimePolicyChange(event.target.value)}
                    />
                  </label>

                  <button
                    className="editor-danger-button"
                    type="button"
                    onClick={handleDeleteSelectedNode}
                  >
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
                        updateSelectedEdge({
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
                        updateSelectedEdge({
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
                        updateSelectedEdge({
                          conditionExpression: event.target.value
                        })
                      }
                      placeholder="outcome == 'succeeded'"
                    />
                  </label>

                  <button
                    className="editor-danger-button"
                    type="button"
                    onClick={handleDeleteSelectedEdge}
                  >
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
                <li>运行时尚未支持 `loop`，因此当前画布不暴露 loop 节点。</li>
                <li>后端会继续校验 trigger 唯一、output 必需和边引用合法性。</li>
                <li>更细的节点配置表单会在后续逐步替换 JSON 文本区。</li>
              </ul>
            </article>
          </aside>
        </section>
      </main>
    </ReactFlowProvider>
  );
}

function WorkflowCanvasNode({
  data,
  selected
}: NodeProps<Node<WorkflowCanvasNodeData>>) {
  return (
    <div
      className={`workflow-canvas-node ${selected ? "selected" : ""}`}
      style={
        {
          "--node-accent": nodeColorByType(data.nodeType)
        } as CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} />
      <div className="workflow-canvas-node-label">{data.label}</div>
      <div className="workflow-canvas-node-type">{data.nodeType}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function nodeColorByType(type: string) {
  switch (type) {
    case "trigger":
      return "#216e4a";
    case "output":
      return "#d0632d";
    case "tool":
      return "#2f6ca3";
    case "condition":
    case "router":
      return "#8b5cf6";
    case "mcp_query":
      return "#0f766e";
    default:
      return "#62574a";
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function stripUiPosition(config: Record<string, unknown>) {
  const nextConfig = { ...config };
  const ui = isRecord(nextConfig.ui) ? { ...(nextConfig.ui as Record<string, unknown>) } : null;
  if (!ui) {
    return nextConfig;
  }

  delete ui.position;
  if (Object.keys(ui).length === 0) {
    delete nextConfig.ui;
    return nextConfig;
  }

  nextConfig.ui = ui;
  return nextConfig;
}

function readNodePosition(config: Record<string, unknown>): XYPosition {
  const ui = isRecord(config.ui) ? (config.ui as Record<string, unknown>) : null;
  const position = ui && isRecord(ui.position) ? (ui.position as Record<string, unknown>) : null;
  return {
    x: typeof position?.x === "number" ? position.x : 320,
    y: typeof position?.y === "number" ? position.y : 220
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
