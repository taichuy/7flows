import '@xyflow/react/dist/style.css';

import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';
import { useMemo, useState } from 'react';

import {
  createNextNodeId,
  createNodeDocument,
  insertNodeAfter
} from '../../lib/default-agent-flow-document';
import {
  agentFlowNodeTypes,
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
}

function AgentFlowCanvasInner({
  activeContainerId,
  document,
  issueCountByNodeId,
  onOpenContainer,
  selectedNodeId,
  onSelectNode,
  onDocumentChange
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

  return (
    <div className="agent-flow-canvas">
      <ReactFlow
        fitView
        edges={edges}
        nodes={nodes}
        nodeTypes={agentFlowNodeTypes}
        onPaneClick={() => {
          onSelectNode(null);
          setPickerNodeId(null);
        }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
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
