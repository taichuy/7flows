import { describe, expect, test } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { NODE_DETAIL_DEFAULT_WIDTH } from '../lib/detail-panel-width';
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
    expect(store.getState().nodeDetailWidth).toBe(NODE_DETAIL_DEFAULT_WIDTH);

    store.getState().setPanelState({
      nodeDetailTab: 'lastRun',
      nodeDetailWidth: 488
    });

    expect(store.getState().nodeDetailTab).toBe('lastRun');
    expect(store.getState().nodeDetailWidth).toBe(488);
  });

  test('keeps node detail width when switching tabs', () => {
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

    store.getState().setPanelState({
      nodeDetailWidth: 560,
      nodeDetailTab: 'config'
    });
    store.getState().setPanelState({ nodeDetailTab: 'lastRun' });

    expect(store.getState().nodeDetailWidth).toBe(560);
    expect(store.getState().nodeDetailTab).toBe('lastRun');
  });

  test('keeps node detail width when replacing from server state', () => {
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

    store.getState().setPanelState({
      nodeDetailWidth: 560,
      nodeDetailTab: 'lastRun'
    });

    store.getState().replaceFromServerState({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-2',
        flow_id: 'flow-1',
        updated_at: '2026-04-16T10:05:00Z',
        document: {
          ...initialDocument,
          meta: {
            ...initialDocument.meta,
            name: 'Server synced'
          }
        }
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    expect(store.getState().workingDocument.meta.name).toBe('Server synced');
    expect(store.getState().nodeDetailWidth).toBe(560);
    expect(store.getState().nodeDetailTab).toBe('config');
  });
});
