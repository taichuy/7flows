import { duplicateNodeSubgraph, getDuplicatedNodeId } from '../../lib/document/transforms/duplicate';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';

export function useNodeDetailActions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const setWorkingDocument = useAgentFlowEditorStore(
    (state) => state.setWorkingDocument
  );
  const setInteractionState = useAgentFlowEditorStore(
    (state) => state.setInteractionState
  );
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  return {
    closeDetail() {
      setSelection({
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        focusedFieldKey: null,
        openInspectorSectionKey: null
      });
    },
    locateSelectedNode() {
      if (!selectedNodeId) {
        return;
      }

      setInteractionState({ pendingLocateNodeId: selectedNodeId });
    },
    duplicateSelectedNode() {
      if (!selectedNodeId) {
        return;
      }

      const nextDocument = duplicateNodeSubgraph(document, { nodeId: selectedNodeId });
      const duplicatedNodeId = getDuplicatedNodeId(
        document.graph.nodes.map((node) => node.id),
        selectedNodeId
      );

      setWorkingDocument(nextDocument);
      setSelection({
        selectedNodeId: duplicatedNodeId,
        selectedNodeIds: [duplicatedNodeId],
        selectedEdgeId: null
      });
    }
  };
}
