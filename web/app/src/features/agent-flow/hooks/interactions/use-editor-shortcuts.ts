import { useEffect } from 'react';

import { useAgentFlowEditorStore } from '../../store/editor/provider';

export function useEditorShortcuts() {
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      setSelection({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],
        focusedFieldKey: null,
        openInspectorSectionKey: null
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null
        }
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPanelState, setSelection]);
}
