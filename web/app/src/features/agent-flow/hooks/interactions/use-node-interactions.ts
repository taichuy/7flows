import type { FlowNodeType } from '@1flowbase/flow-schema';

import {
  createNextNodeId,
  createNodeDocument
} from '../../lib/document/node-factory';
import { insertNodeAfter } from '../../lib/document/transforms/node';
import { useContainerNavigation } from './use-container-navigation';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { selectWorkingDocument } from '../../store/editor/selectors';

export function useNodeInteractions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const setWorkingDocument = useAgentFlowEditorStore(
    (state) => state.setWorkingDocument
  );
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  const setInteractionState = useAgentFlowEditorStore(
    (state) => state.setInteractionState
  );
  const navigation = useContainerNavigation();

  return {
    selectNode(nodeId: string | null) {
      setSelection({
        selectedNodeId: nodeId,
        selectedNodeIds: nodeId ? [nodeId] : [],
        selectedEdgeId: null
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null,
          anchorCanvasPosition: null
        }
      });
    },
    openNodePicker(nodeId: string) {
      setInteractionState({
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        }
      });
      setPanelState({
        nodePickerState: {
          open: true,
          anchorNodeId: nodeId,
          anchorEdgeId: null,
          anchorCanvasPosition: null
        }
      });
    },
    closeNodePicker() {
      setInteractionState({
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        }
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null,
          anchorCanvasPosition: null
        }
      });
    },
    insertAfterNode(anchorNodeId: string, nodeType: FlowNodeType) {
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

      setWorkingDocument(nextDocument);
      setSelection({
        selectedNodeId: nextNode.id,
        selectedNodeIds: [nextNode.id]
      });
      setInteractionState({
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        }
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null,
          anchorCanvasPosition: null
        }
      });
    },
    openContainer(nodeId: string) {
      navigation.openContainer(nodeId);
    }
  };
}
