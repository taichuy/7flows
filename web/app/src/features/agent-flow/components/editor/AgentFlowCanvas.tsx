import '@xyflow/react/dist/style.css';

import { AimOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type NodeChange,
  type Viewport
} from '@xyflow/react';
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';
import { useEffect, useMemo, useState } from 'react';

import {
  createNextNodeId,
  createNodeDocument,
  insertNodeAfter
} from '../../lib/default-agent-flow-document';
import {
  agentFlowNodeTypes,
  agentFlowEdgeTypes,
  toCanvasEdges,
  toCanvasNodes
} from '../nodes/node-registry';

interface AgentFlowCanvasProps {
  activeContainerId: string | null;
  document: FlowAuthoringDocument;
  issueCountByNodeId: Record<string, number>;
  selectedNodeId: string | null;
  onOpenContainer: (nodeId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  onDocumentChange: (document: FlowAuthoringDocument) => void;
  onViewportSnapshotChange?: (
    viewport: FlowAuthoringDocument['editor']['viewport']
  ) => void;
  onViewportGetterReady?: (
    getter: (() => FlowAuthoringDocument['editor']['viewport']) | null
  ) => void;
}

interface InsertNodeEventDetail {
  edgeId: string;
  nodeType: Parameters<typeof createNodeDocument>[0];
  sourceNodeId: string;
}

function applyNodePositionChanges(
  document: FlowAuthoringDocument,
  changes: NodeChange[]
) {
  const nextPositionsByNodeId = new Map<string, { x: number; y: number }>();

  for (const change of changes) {
    if (change.type !== 'position' || !change.position) {
      continue;
    }

    nextPositionsByNodeId.set(change.id, change.position);
  }

  if (nextPositionsByNodeId.size === 0) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => {
        const nextPosition = nextPositionsByNodeId.get(node.id);

        if (!nextPosition) {
          return node;
        }

        return {
          ...node,
          position: nextPosition
        };
      })
    }
  };
}

function applyViewportChanges(
  document: FlowAuthoringDocument,
  viewport: Viewport
) {
  const currentViewport = document.editor.viewport;

  if (
    currentViewport.x === viewport.x &&
    currentViewport.y === viewport.y &&
    currentViewport.zoom === viewport.zoom
  ) {
    return document;
  }

  return {
    ...document,
    editor: {
      ...document.editor,
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom
      }
    }
  };
}

function applyEdgeReconnect(
  document: FlowAuthoringDocument,
  edgeId: string,
  connection: Connection
) {
  if (!connection.source || !connection.target) {
    return document;
  }

  const sourceNode = document.graph.nodes.find(
    (node) => node.id === connection.source
  );
  const targetNode = document.graph.nodes.find(
    (node) => node.id === connection.target
  );

  if (!sourceNode || !targetNode || sourceNode.containerId !== targetNode.containerId) {
    return document;
  }

  let changed = false;
  const nextEdges = document.graph.edges.map((edge) => {
    if (edge.id !== edgeId) {
      return edge;
    }

    const nextSourceHandle = connection.sourceHandle ?? null;
    const nextTargetHandle = connection.targetHandle ?? null;

    if (
      edge.source === connection.source &&
      edge.target === connection.target &&
      edge.sourceHandle === nextSourceHandle &&
      edge.targetHandle === nextTargetHandle &&
      edge.containerId === sourceNode.containerId
    ) {
      return edge;
    }

    changed = true;

    return {
      ...edge,
      source: connection.source,
      target: connection.target,
      sourceHandle: nextSourceHandle,
      targetHandle: nextTargetHandle,
      containerId: sourceNode.containerId
    };
  });

  if (!changed) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      edges: nextEdges
    }
  };
}

function ZoomToolbar() {
  const reactFlow = useReactFlow();
  const { zoom } = useViewport();

  return (
    <Panel position="bottom-left" style={{ left: 0, bottom: 0 }}>
      <div className="agent-flow-zoom-toolbar">
        <div aria-label="画布缩放工具栏" className="agent-flow-zoom-toolbar__actions" role="toolbar">
          <Button
            aria-label="缩小画布"
            className="agent-flow-zoom-toolbar__button"
            icon={<MinusOutlined />}
            onClick={() => {
              void reactFlow.zoomOut({ duration: 160 });
            }}
            size="small"
            type="text"
          />
          <Button
            aria-label="放大画布"
            className="agent-flow-zoom-toolbar__button"
            icon={<PlusOutlined />}
            onClick={() => {
              void reactFlow.zoomIn({ duration: 160 });
            }}
            size="small"
            type="text"
          />
          <Button
            aria-label="适应画布"
            className="agent-flow-zoom-toolbar__button"
            icon={<AimOutlined />}
            onClick={() => {
              void reactFlow.fitView({ duration: 160, padding: 0.16 });
            }}
            size="small"
            type="text"
          />
        </div>
        <div aria-label="当前缩放" className="agent-flow-zoom-display">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </Panel>
  );
}

function ViewportObserver({
  onViewportSnapshotChange,
  onViewportGetterReady
}: {
  onViewportSnapshotChange?: (
    viewport: FlowAuthoringDocument['editor']['viewport']
  ) => void;
  onViewportGetterReady?: (
    getter: (() => FlowAuthoringDocument['editor']['viewport']) | null
  ) => void;
}) {
  const reactFlow = useReactFlow();
  const viewport = useViewport();

  useEffect(() => {
    onViewportGetterReady?.(() => reactFlow.getViewport());

    return () => onViewportGetterReady?.(null);
  }, [onViewportGetterReady, reactFlow]);

  useEffect(() => {
    onViewportSnapshotChange?.({
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom
    });
  }, [onViewportSnapshotChange, viewport.x, viewport.y, viewport.zoom]);

  return null;
}

function AgentFlowCanvasInner({
  activeContainerId,
  document,
  issueCountByNodeId,
  onOpenContainer,
  selectedNodeId,
  onSelectNode,
  onDocumentChange,
  onViewportSnapshotChange,
  onViewportGetterReady
}: AgentFlowCanvasProps) {
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);

  const nodes = useMemo(
    () =>
      toCanvasNodes(
        document,
        activeContainerId,
        selectedNodeId,
        pickerNodeId,
        issueCountByNodeId,
        {
        onOpenPicker: setPickerNodeId,
        onClosePicker: () => setPickerNodeId(null),
        onOpenContainer,
        onSelectNode: (nodeId) => {
          onSelectNode(nodeId);
          setPickerNodeId(null);
        },
        onInsertNode: (anchorNodeId, nodeType) => {
          const anchorNode = document.graph.nodes.find((node) => node.id === anchorNodeId);

          if (!anchorNode) {
            return;
          }

          const nextNode = createNodeDocument(
            nodeType,
            createNextNodeId(document, nodeType),
            anchorNode.position.x + 280,
            anchorNode.position.y
          );
          const nextDocument = insertNodeAfter(document, anchorNodeId, nextNode);

          onDocumentChange(nextDocument);
          onSelectNode(nextNode.id);
          setPickerNodeId(null);
        }
      }),
    [
      activeContainerId,
      document,
      issueCountByNodeId,
      onOpenContainer,
      onDocumentChange,
      onSelectNode,
      pickerNodeId,
      selectedNodeId
    ]
  );
  const edges = useMemo(
    () => toCanvasEdges(document, activeContainerId),
    [activeContainerId, document]
  );

  useEffect(() => {
    const handleInsert = (event: Event) => {
      const detail = (event as CustomEvent<InsertNodeEventDetail>).detail;
      const anchorNode = document.graph.nodes.find((node) => node.id === detail.sourceNodeId);

      if (!anchorNode) {
        return;
      }

      const nextNode = createNodeDocument(
        detail.nodeType,
        createNextNodeId(document, detail.nodeType),
        anchorNode.position.x + 280,
        anchorNode.position.y
      );
      const nextDocument = insertNodeAfter(document, detail.sourceNodeId, nextNode);

      onDocumentChange(nextDocument);
      onSelectNode(nextNode.id);
    };

    window.addEventListener('agent-flow-insert-node', handleInsert);

    return () => window.removeEventListener('agent-flow-insert-node', handleInsert);
  }, [document, onDocumentChange, onSelectNode]);

  return (
    <div className="agent-flow-canvas">
      <ReactFlow
        edges={edges}
        nodes={nodes}
        viewport={document.editor.viewport}
        nodeTypes={agentFlowNodeTypes}
        edgeTypes={agentFlowEdgeTypes}
        nodesDraggable
        onNodesChange={(changes) => {
          const nextDocument = applyNodePositionChanges(document, changes);

          if (nextDocument !== document) {
            onDocumentChange(nextDocument);
          }
        }}
        onViewportChange={(viewport) => {
          const nextDocument = applyViewportChanges(document, viewport);

          if (nextDocument !== document) {
            onDocumentChange(nextDocument);
          }
        }}
        onReconnect={(oldEdge: Edge, connection) => {
          const nextDocument = applyEdgeReconnect(document, oldEdge.id, connection);

          if (nextDocument !== document) {
            onDocumentChange(nextDocument);
          }
        }}
        onPaneClick={() => {
          onSelectNode(null);
          setPickerNodeId(null);
        }}
      >
        <Background gap={20} size={1} />
        <ViewportObserver
          onViewportSnapshotChange={onViewportSnapshotChange}
          onViewportGetterReady={onViewportGetterReady}
        />
        <ZoomToolbar />
      </ReactFlow>
    </div>
  );
}

export function AgentFlowCanvas(props: AgentFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
