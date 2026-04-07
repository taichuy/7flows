"use client";

import { useState } from "react";

import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeTypes,
  type Node,
  type ReactFlowInstance,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeParams
} from "@xyflow/react";
import { Button, Space, Tooltip } from "antd";
import {
  AimOutlined,
  AppstoreOutlined,
  EditOutlined,
  NodeIndexOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SaveOutlined
} from "@ant-design/icons";

import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import { nodeColorByType } from "@/components/workflow-editor-workbench/workflow-canvas-node";

export type WorkflowEditorCanvasProps = {
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  onNodesChange: OnNodesChange<Node<WorkflowCanvasNodeData>>;
  onEdgesChange: OnEdgesChange<Edge<WorkflowCanvasEdgeData>>;
  onConnect: OnConnect;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  isInspectorOpen: boolean;
  hasNodeAssistant: boolean;
  canOpenInspector: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNodeClick: (nodeId: string) => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onToggleInspector: () => void;
  onOpenAssistant: () => void;
  persistBlockerSummary?: string | null;
  isSaving?: boolean;
  isSavingStarter?: boolean;
  onSave?: () => void;
  onSaveAsWorkspaceStarter?: () => void;
  onOpenRunLauncher?: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

const FIT_VIEW_OPTIONS = { padding: 0.2, duration: 240 };

export function WorkflowEditorCanvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  isInspectorOpen,
  hasNodeAssistant,
  canOpenInspector,
  canUndo,
  canRedo,
  onNodeClick,
  isSidebarOpen = false,
  onToggleSidebar,
  onToggleInspector,
  onOpenAssistant,
  persistBlockerSummary = null,
  isSaving = false,
  isSavingStarter = false,
  onSave,
  onSaveAsWorkspaceStarter,
  onOpenRunLauncher,
  onUndo,
  onRedo
}: WorkflowEditorCanvasProps) {
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<
      ReactFlowInstance<Node<WorkflowCanvasNodeData>, Edge<WorkflowCanvasEdgeData>> | null
    >(null);
  return (
    <ReactFlowProvider>
      <section
        className="editor-canvas-panel"
        data-component="workflow-editor-canvas"
        data-inspector-open={isInspectorOpen ? "true" : "false"}
      >
        <div className="editor-canvas-card">
          <ReactFlow
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeClick={(_event, node) => onNodeClick(node.id)}
            onInit={(instance) => setReactFlowInstance(instance)}
            deleteKeyCode={["Delete", "Backspace"]}
            onlyRenderVisibleElements
            minZoom={0.4}
            maxZoom={1.5}
            className="editor-canvas"
          >
            <Panel className="workflow-editor-action-strip-panel" position="top-right">
              <Space
                size={8}
                wrap
                className="workflow-editor-action-strip"
                data-component="workflow-editor-action-strip"
              >
                <Tooltip title={canUndo ? "回退最近一次 workflow 编辑" : "当前没有可撤销的编辑"}>
                  <Button
                    disabled={!canUndo}
                    className="workflow-editor-action-strip-button"
                    data-action="undo"
                    data-command-enabled={canUndo ? "true" : "false"}
                    onClick={onUndo}
                  >
                    撤销
                  </Button>
                </Tooltip>
                <Tooltip title={canRedo ? "恢复最近一次被撤销的 workflow 编辑" : "当前没有可重做的编辑"}>
                  <Button
                    disabled={!canRedo}
                    className="workflow-editor-action-strip-button"
                    data-action="redo"
                    data-command-enabled={canRedo ? "true" : "false"}
                    onClick={onRedo}
                  >
                    重做
                  </Button>
                </Tooltip>
                {onToggleSidebar ? (
                  <Button
                    type={isSidebarOpen ? "primary" : "default"}
                    icon={<AppstoreOutlined />}
                    className="workflow-editor-action-strip-button"
                    data-action="node-library"
                    onClick={onToggleSidebar}
                  >
                    节点目录
                  </Button>
                ) : null}
                <Button
                  type={isInspectorOpen ? "primary" : "default"}
                  icon={<EditOutlined />}
                  disabled={!canOpenInspector}
                  className="workflow-editor-action-strip-button"
                  data-action="inspector"
                  onClick={onToggleInspector}
                >
                  属性栏
                </Button>
                {hasNodeAssistant ? (
                  <Button
                    icon={<RobotOutlined />}
                    className="workflow-editor-action-strip-button"
                    data-action="assistant"
                    onClick={onOpenAssistant}
                  >
                    AI 辅助
                  </Button>
                ) : null}
                <Tooltip title="让当前节点图重新回到主视野">
                  <Button
                    icon={<AimOutlined />}
                    className="workflow-editor-action-strip-button"
                    data-action="fit-view"
                    onClick={() => {
                      void reactFlowInstance?.fitView(FIT_VIEW_OPTIONS);
                    }}
                  >
                    适配视图
                  </Button>
                </Tooltip>
                <Button
                  type={isMiniMapVisible ? "default" : "text"}
                  icon={<NodeIndexOutlined />}
                  className="workflow-editor-action-strip-button"
                  data-action="minimap"
                  onClick={() => setIsMiniMapVisible((current) => !current)}
                >
                  {isMiniMapVisible ? "隐藏地图" : "显示地图"}
                </Button>
                {onSaveAsWorkspaceStarter ? (
                  <Button
                    icon={<SaveOutlined />}
                    className="workflow-editor-action-strip-button"
                    data-action="save-as-workspace-starter"
                    loading={isSavingStarter}
                    onClick={onSaveAsWorkspaceStarter}
                  >
                    存为模板
                  </Button>
                ) : null}
                {onSave ? (
                  <Tooltip title={persistBlockerSummary ?? "保存当前 workflow 草稿"}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      className="workflow-editor-action-strip-button"
                      data-action="save-workflow"
                      loading={isSaving}
                      disabled={Boolean(persistBlockerSummary)}
                      onClick={onSave}
                    >
                      保存
                    </Button>
                  </Tooltip>
                ) : null}
                {onOpenRunLauncher ? (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    className="workflow-editor-action-strip-button workflow-editor-run-button"
                    data-action="run-workflow"
                    onClick={onOpenRunLauncher}
                  >
                    运行
                  </Button>
                ) : null}
              </Space>
            </Panel>
            <Background gap={24} size={1} />
            {isMiniMapVisible ? (
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => nodeColorByType((node.data as WorkflowCanvasNodeData).nodeType)}
              />
            ) : null}
            <Controls />
          </ReactFlow>
        </div>
      </section>
    </ReactFlowProvider>
  );
}
