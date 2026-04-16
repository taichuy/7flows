import { replaceNodeOutputs, updateNodeField } from '../../lib/document/transforms/node';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';

export function useInspectorInteractions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const setWorkingDocument = useAgentFlowEditorStore(
    (state) => state.setWorkingDocument
  );
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  return {
    updateField(fieldKey: string, value: unknown) {
      if (!selectedNodeId) {
        return;
      }

      if (fieldKey === 'config.output_contract' && Array.isArray(value)) {
        setWorkingDocument(replaceNodeOutputs(document, selectedNodeId, value));
        return;
      }

      setWorkingDocument(
        updateNodeField(document, {
          nodeId: selectedNodeId,
          fieldKey,
          value: value as never
        })
      );
    },
    handleFocusComplete() {
      setSelection({
        focusedFieldKey: null
      });
    },
    closeInspector() {
      setSelection({
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        focusedFieldKey: null,
        openInspectorSectionKey: null
      });
    }
  };
}
