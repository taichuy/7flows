import { describe, expect, test } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

import { createAgentFlowEditorStore } from '../store/editor';

describe('agent flow editor store', () => {
  test('seeds working document, selection, panel state and sync state from server data', () => {
    const initialDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const store = createAgentFlowEditorStore({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-1',
        flow_id: 'flow-1',
        updated_at: '2026-04-16T10:00:00Z',
        document: initialDocument
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    expect(store.getState().workingDocument.meta.flowId).toBe('flow-1');
    expect(store.getState().selectedNodeId).toBe('node-llm');
    expect(store.getState().issuesOpen).toBe(false);
    expect(store.getState().autosaveStatus).toBe('idle');
  });

  test('replaces server state and clears scratch interaction state after restore', () => {
    const initialDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const restoredDocument = {
      ...initialDocument,
      meta: {
        ...initialDocument.meta,
        name: 'Restored flow'
      }
    };
    const store = createAgentFlowEditorStore({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-1',
        flow_id: 'flow-1',
        updated_at: '2026-04-16T10:00:00Z',
        document: initialDocument
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    store.getState().setPanelState({
      issuesOpen: true,
      historyOpen: true,
      nodePickerState: {
        open: true,
        anchorNodeId: 'node-llm',
        anchorEdgeId: null,
        anchorCanvasPosition: null
      }
    });
    store.getState().focusIssueField({
      nodeId: 'node-answer',
      sectionKey: 'outputs',
      fieldKey: 'bindings.answer_template'
    });

    store.getState().replaceFromServerState({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-1',
        flow_id: 'flow-1',
        updated_at: '2026-04-16T10:05:00Z',
        document: restoredDocument
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    expect(store.getState().workingDocument.meta.name).toBe('Restored flow');
    expect(store.getState().issuesOpen).toBe(false);
    expect(store.getState().historyOpen).toBe(false);
    expect(store.getState().nodePickerState.open).toBe(false);
    expect(store.getState().focusedFieldKey).toBe(null);
    expect(store.getState().highlightedIssueId).toBe(null);
  });

  test('tracks node detail tab and width in panel state', () => {
    const store = createAgentFlowEditorStore({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-1',
        flow_id: 'flow-1',
        updated_at: '2026-04-16T10:00:00Z',
        document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    expect(store.getState().nodeDetailTab).toBe('config');
    expect(store.getState().nodeDetailWidth).toBe(420);

    store.getState().setPanelState({
      nodeDetailTab: 'lastRun',
      nodeDetailWidth: 488
    });

    expect(store.getState().nodeDetailTab).toBe('lastRun');
    expect(store.getState().nodeDetailWidth).toBe(488);
  });
});
