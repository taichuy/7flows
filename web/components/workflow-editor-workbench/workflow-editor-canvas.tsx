"use client";

import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeParams
} from "@xyflow/react";

import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import { nodeColorByType } from "@/components/workflow-editor-workbench/workflow-canvas-node";

type WorkflowEditorCanvasProps = {
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange<Node<WorkflowCanvasNodeData>>;
  onEdgesChange: OnEdgesChange<Edge<WorkflowCanvasEdgeData>>;
  onConnect: OnConnect;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
};

export function WorkflowEditorCanvas({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange
}: WorkflowEditorCanvasProps) {
  return (
    <section className="editor-canvas-panel">
      <div className="editor-canvas-card">
        <ReactFlow
          fitView
          fitViewOptions={{ padding: 0.16, duration: 240 }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          deleteKeyCode={["Delete", "Backspace"]}
          onlyRenderVisibleElements
          minZoom={0.4}
          maxZoom={1.5}
          className="editor-canvas"
        >
          <Panel className="workflow-canvas-helper-panel" position="top-left">
            <strong>xyflow Studio</strong>
            <span>选中节点后可插入下一节点，或用 ··· 打开配置。</span>
          </Panel>
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
  );
}
