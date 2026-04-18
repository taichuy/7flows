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
  type Edge
} from '@xyflow/react';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { useEffect, useMemo } from 'react';
import { useRef } from 'react';

import { useCanvasInteractions } from '../../hooks/interactions/use-canvas-interactions';
import { useEdgeInteractions } from '../../hooks/interactions/use-edge-interactions';
import { useNodeInteractions } from '../../hooks/interactions/use-node-interactions';
import { useSelectionInteractions } from '../../hooks/interactions/use-selection-interactions';
import { toCanvasEdges } from '../../lib/adapters/to-canvas-edges';
import { toCanvasNodes } from '../../lib/adapters/to-canvas-nodes';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectActiveContainerId,
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';
import { AgentFlowCustomConnectionLine } from '../canvas/custom-connection-line';
import { NodePickerPopover } from '../node-picker/NodePickerPopover';
import { agentFlowEdgeTypes, agentFlowNodeTypes } from '../canvas/node-types';

interface AgentFlowCanvasProps {
  issueCountByNodeId: Record<string, number>;
  onViewportSnapshotChange?: (
    viewport: FlowAuthoringDocument['editor']['viewport']
  ) => void;
  onViewportGetterReady?: (
    getter: (() => FlowAuthoringDocument['editor']['viewport']) | null
  ) => void;
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

function PendingLocateNodeEffect() {
  const reactFlow = useReactFlow();
  const pendingLocateNodeId = useAgentFlowEditorStore(
    (state) => state.pendingLocateNodeId
  );
  const setInteractionState = useAgentFlowEditorStore(
    (state) => state.setInteractionState
  );

  useEffect(() => {
    if (!pendingLocateNodeId) {
      return;
    }

    void reactFlow.fitView({
      nodes: [{ id: pendingLocateNodeId }],
      duration: 240,
      padding: 0.24
    });
    setInteractionState({ pendingLocateNodeId: null });
  }, [pendingLocateNodeId, reactFlow, setInteractionState]);

  return null;
}

function AgentFlowCanvasInner({
  issueCountByNodeId,
  onViewportSnapshotChange,
  onViewportGetterReady
}: AgentFlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const activeContainerId = useAgentFlowEditorStore(selectActiveContainerId);
  const selectedEdgeId = useAgentFlowEditorStore((state) => state.selectedEdgeId);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const nodePickerState = useAgentFlowEditorStore((state) => state.nodePickerState);
  const canvasInteractions = useCanvasInteractions();
  const nodeInteractions = useNodeInteractions();
  const edgeInteractions = useEdgeInteractions();
  const selectionInteractions = useSelectionInteractions();

  const nodes = useMemo(
    () =>
      toCanvasNodes(
        document,
        activeContainerId,
        selectedNodeId,
        nodePickerState.open && !nodePickerState.anchorCanvasPosition
          ? nodePickerState.anchorNodeId
          : null,
        issueCountByNodeId,
        {
          onOpenPicker: nodeInteractions.openNodePicker,
          onClosePicker: nodeInteractions.closeNodePicker,
          onOpenContainer: nodeInteractions.openContainer,
          onSelectNode: nodeInteractions.selectNode,
          onInsertNode: nodeInteractions.insertAfterNode
        }
      ),
    [
      activeContainerId,
      document,
      issueCountByNodeId,
      nodeInteractions,
      nodePickerState.anchorCanvasPosition,
      nodePickerState.anchorNodeId,
      nodePickerState.open,
      selectedNodeId
    ]
  );
  const edges = useMemo(
    () =>
      toCanvasEdges(document, activeContainerId, selectedEdgeId, {
        onInsertNode: edgeInteractions.insertOnEdge
      }),
    [activeContainerId, document, edgeInteractions.insertOnEdge, selectedEdgeId]
  );

  return (
    <div className="agent-flow-canvas" ref={canvasRef}>
      <ReactFlow
        edges={edges}
        nodes={nodes}
        viewport={document.editor.viewport}
        nodeTypes={agentFlowNodeTypes}
        edgeTypes={agentFlowEdgeTypes}
        connectionLineComponent={AgentFlowCustomConnectionLine}
        nodesDraggable
        onConnect={edgeInteractions.connect}
        onConnectStart={(_, payload) => {
          edgeInteractions.startConnection(payload);
        }}
        onConnectEnd={(event) => {
          if (!event) {
            edgeInteractions.cancelConnection();
            return;
          }

          const target = event.target instanceof Element ? event.target : null;

          if (
            target?.closest('.react-flow__node') ||
            target?.closest('.react-flow__handle')
          ) {
            edgeInteractions.cancelConnection();
            return;
          }

          const bounds = canvasRef.current?.getBoundingClientRect();
          const clientPosition =
            'changedTouches' in event && event.changedTouches.length > 0
              ? {
                  x: event.changedTouches[0].clientX,
                  y: event.changedTouches[0].clientY
                }
              : {
                  x: 'clientX' in event ? event.clientX : 0,
                  y: 'clientY' in event ? event.clientY : 0
                };

          edgeInteractions.finishConnectionOnPane({
            x: clientPosition.x - (bounds?.left ?? 0),
            y: clientPosition.y - (bounds?.top ?? 0)
          });
        }}
        onNodesChange={canvasInteractions.onNodesChange}
        onViewportChange={canvasInteractions.onViewportChange}
        onReconnect={(oldEdge: Edge, connection) => {
          edgeInteractions.reconnect(oldEdge.id, connection);
        }}
        onEdgeClick={(_, edge) => {
          selectionInteractions.selectEdge(edge.id);
        }}
        isValidConnection={edgeInteractions.isValidConnection}
        onPaneClick={selectionInteractions.clearSelection}
      >
        <Background gap={20} size={1} />
        <PendingLocateNodeEffect />
        <ViewportObserver
          onViewportSnapshotChange={onViewportSnapshotChange}
          onViewportGetterReady={onViewportGetterReady}
        />
        <ZoomToolbar />
      </ReactFlow>
      {nodePickerState.open &&
      nodePickerState.anchorNodeId &&
      nodePickerState.anchorCanvasPosition ? (
        <div
          className="agent-flow-floating-picker-anchor"
          style={{
            left: nodePickerState.anchorCanvasPosition.x,
            top: nodePickerState.anchorCanvasPosition.y
          }}
        >
          <NodePickerPopover
            ariaLabel="在当前连线位置插入节点"
            buttonClassName="agent-flow-floating-picker-anchor__button"
            open
            placement="bottom"
            onOpenChange={(open) => {
              if (!open) {
                nodeInteractions.closeNodePicker();
              }
            }}
            onPickNode={(nodeType) => {
              edgeInteractions.insertFromConnection(nodeType);
            }}
          />
        </div>
      ) : null}
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
