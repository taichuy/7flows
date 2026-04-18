import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { useEditorShortcuts } from '../hooks/interactions/use-editor-shortcuts';
import {
  AgentFlowEditorStoreProvider,
  useAgentFlowEditorStore
} from '../store/editor/provider';

function createInitialState(
  document = createDefaultAgentFlowDocument({ flowId: 'flow-1' })
) {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-16T10:00:00Z',
      document
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

describe('useEditorShortcuts', () => {
  test('removes the selected edge when pressing Delete', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        {children}
      </AgentFlowEditorStoreProvider>
    );

    const { result } = renderHook(
      () => {
        useEditorShortcuts();

        return {
          edges: useAgentFlowEditorStore((state) => state.workingDocument.graph.edges),
          selectedEdgeId: useAgentFlowEditorStore((state) => state.selectedEdgeId),
          setSelection: useAgentFlowEditorStore((state) => state.setSelection)
        };
      },
      { wrapper }
    );

    act(() => {
      result.current.setSelection({
        selectedEdgeId: 'edge-llm-answer',
        selectedNodeId: null,
        selectedNodeIds: []
      });
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(result.current.selectedEdgeId).toBe(null);
    expect(result.current.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-llm-answer'
        })
      ])
    );
  });

  test('removes the selected node when pressing Delete', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        {children}
      </AgentFlowEditorStoreProvider>
    );

    const { result } = renderHook(
      () => {
        useEditorShortcuts();

        return {
          nodes: useAgentFlowEditorStore((state) => state.workingDocument.graph.nodes),
          edges: useAgentFlowEditorStore((state) => state.workingDocument.graph.edges),
          selectedNodeId: useAgentFlowEditorStore((state) => state.selectedNodeId),
          setSelection: useAgentFlowEditorStore((state) => state.setSelection)
        };
      },
      { wrapper }
    );

    act(() => {
      result.current.setSelection({
        selectedNodeId: 'node-llm',
        selectedNodeIds: ['node-llm'],
        selectedEdgeId: null
      });
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(result.current.selectedNodeId).toBe(null);
    expect(result.current.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-llm'
        })
      ])
    );
    expect(result.current.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-start-llm'
        }),
        expect.objectContaining({
          id: 'edge-llm-answer'
        })
      ])
    );
  });
});
