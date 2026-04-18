import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createDefaultAgentFlowDocument,
  type FlowNodeType
} from '@1flowbase/flow-schema';
import { AgentFlowCanvas } from '../components/editor/AgentFlowCanvas';
import {
  AgentFlowEditorStoreProvider,
  useAgentFlowEditorStore
} from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

type MockNodeChange = {
  id: string;
  type: string;
  dragging?: boolean;
  position?: { x: number; y: number };
};

type MockViewport = {
  x: number;
  y: number;
  zoom: number;
};

type MockReactFlowProps = {
  children?: ReactNode;
  edges?: Array<{
    id: string;
    selected?: boolean;
    data?: {
      onInsertNode?: (edgeId: string, nodeType: FlowNodeType) => void;
    };
  }>;
  onConnect?: (connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => void;
  onConnectEnd?: (event: {
    clientX: number;
    clientY: number;
    target: EventTarget | null;
  }) => void;
  onConnectStart?: (
    event: unknown,
    payload: {
      nodeId: string | null;
      handleType: 'source' | 'target' | null;
      handleId: string | null;
    }
  ) => void;
  onEdgeClick?: (
    event: unknown,
    edge: {
      id: string;
    }
  ) => void;
  onPaneClick?: () => void;
  onNodesChange?: (changes: MockNodeChange[]) => void;
  onReconnect?: (
    oldEdge: {
      id: string;
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    },
    connection: {
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }
  ) => void;
  onViewportChange?: (viewport: MockViewport) => void;
  viewport?: MockViewport;
};

let latestReactFlowProps: MockReactFlowProps | null = null;
let mockViewport: MockViewport = { x: 0, y: 0, zoom: 1 };

function createInitialState(document = createDefaultAgentFlowDocument({ flowId: 'flow-1' })) {
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

type ObservedEditorState = {
  nodePickerState: {
    open: boolean;
    anchorNodeId: string | null;
    anchorEdgeId: string | null;
    anchorCanvasPosition: { x: number; y: number } | null;
  };
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  workingDocument: ReturnType<typeof createDefaultAgentFlowDocument>;
};

function StoreObserver({
  onChange
}: {
  onChange: (state: ObservedEditorState) => void;
}) {
  const workingDocument = useAgentFlowEditorStore(selectWorkingDocument);
  const nodePickerState = useAgentFlowEditorStore((state) => state.nodePickerState);
  const selectedEdgeId = useAgentFlowEditorStore((state) => state.selectedEdgeId);
  const selectedNodeId = useAgentFlowEditorStore((state) => state.selectedNodeId);

  useEffect(() => {
    onChange({
      nodePickerState,
      selectedEdgeId,
      selectedNodeId,
      workingDocument
    });
  }, [nodePickerState, onChange, selectedEdgeId, selectedNodeId, workingDocument]);

  return null;
}

function renderCanvas(
  document = createDefaultAgentFlowDocument({ flowId: 'flow-1' })
) {
  let latestState: ObservedEditorState | null = null;

  render(
    <AgentFlowEditorStoreProvider initialState={createInitialState(document)}>
      <StoreObserver
        onChange={(state) => {
          latestState = state;
        }}
      />
      <AgentFlowCanvas issueCountByNodeId={{}} />
    </AgentFlowEditorStoreProvider>
  );

  return {
    getState() {
      if (!latestState) {
        throw new Error('editor state not observed');
      }

      return latestState;
    }
  };
}

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  EdgeLabelRenderer: ({ children }: { children?: ReactNode }) => children ?? null,
  Handle: () => null,
  MarkerType: {
    ArrowClosed: 'arrowclosed'
  },
  Panel: ({ children }: { children?: ReactNode }) => children ?? null,
  Position: {
    Left: 'left',
    Right: 'right'
  },
  ReactFlow: (props: MockReactFlowProps) => {
    latestReactFlowProps = props;
    mockViewport = props.viewport ?? mockViewport;

    return (
      <div data-testid="mock-react-flow">
        <button
          type="button"
          onClick={() =>
            props.onNodesChange?.([
              {
                id: 'node-llm',
                type: 'position',
                dragging: false,
                position: { x: 520, y: 260 }
              }
            ])
          }
        >
          trigger node drag
        </button>
        <button
          type="button"
          onClick={() => {
            mockViewport = { x: 120, y: 48, zoom: 0.85 };
            props.onViewportChange?.(mockViewport);
          }}
        >
          trigger viewport change
        </button>
        {props.children}
      </div>
    );
  },
  ReactFlowProvider: ({ children }: { children?: ReactNode }) => children ?? null,
  getBezierPath: () => ['M0,0', 0, 0],
  useReactFlow: () => ({
    fitView: vi.fn(),
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    zoomIn: vi.fn(),
    zoomOut: vi.fn()
  }),
  useViewport: () => mockViewport
}));

describe('AgentFlowCanvas interactions', () => {
  beforeEach(() => {
    latestReactFlowProps = null;
    mockViewport = { x: 0, y: 0, zoom: 1 };
  });

  test('writes dragged node positions back into the document', () => {
    const { getState } = renderCanvas();

    fireEvent.click(screen.getByRole('button', { name: 'trigger node drag' }));

    expect(getState().workingDocument.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-llm',
          position: { x: 520, y: 260 }
        })
      ])
    );
  });

  test('opens with the document viewport and shows a plain percentage label', () => {
    renderCanvas();

    expect(latestReactFlowProps?.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(screen.getByLabelText('当前缩放')).toHaveTextContent('100%');
  });

  test('writes viewport changes back into the document', () => {
    const { getState } = renderCanvas();

    fireEvent.click(screen.getByRole('button', { name: 'trigger viewport change' }));

    expect(getState().workingDocument.editor.viewport).toEqual({
      x: 120,
      y: 48,
      zoom: 0.85
    });
  });

  test('inserts a node through the edge action callback', () => {
    const { getState } = renderCanvas();

    expect(latestReactFlowProps).not.toBeNull();
    const insertOnEdge = latestReactFlowProps?.edges
      ?.find((edge) => edge.id === 'edge-llm-answer')
      ?.data?.onInsertNode;

    expect(insertOnEdge).toBeTypeOf('function');

    act(() => {
      insertOnEdge?.('edge-llm-answer', 'template_transform');
    });

    expect(getState().workingDocument.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'template_transform'
        })
      ])
    );
    expect(getState().selectedNodeId).toMatch(/^node-template-transform-/);
  });

  test('rewrites the document edge when an existing line is reconnected', () => {
    const { getState } = renderCanvas();

    expect(latestReactFlowProps?.onReconnect).toBeTypeOf('function');

    act(() => {
      latestReactFlowProps?.onReconnect?.(
        {
          id: 'edge-start-llm',
          source: 'node-start',
          target: 'node-llm',
          sourceHandle: null,
          targetHandle: null
        },
        {
          source: 'node-start',
          target: 'node-answer',
          sourceHandle: 'source-right',
          targetHandle: 'target-left'
        }
      );
    });

    expect(getState().workingDocument.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-start-llm',
          source: 'node-start',
          target: 'node-answer',
          sourceHandle: 'source-right',
          targetHandle: 'target-left'
        })
      ])
    );
  });

  test('creates a new edge when a source handle connects to another node', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    document.graph.edges = document.graph.edges.filter(
      (edge) => edge.id !== 'edge-start-llm'
    );

    const { getState } = renderCanvas(document);

    expect(latestReactFlowProps?.onConnect).toBeTypeOf('function');

    act(() => {
      latestReactFlowProps?.onConnect?.({
        source: 'node-start',
        target: 'node-llm',
        sourceHandle: 'source-right',
        targetHandle: 'target-left'
      });
    });

    expect(getState().workingDocument.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'node-start',
          target: 'node-llm',
          sourceHandle: 'source-right',
          targetHandle: 'target-left'
        })
      ])
    );
  });

  test('opens the shared node picker when a dragged connection stops on the pane', () => {
    const { getState } = renderCanvas();

    expect(latestReactFlowProps?.onConnectStart).toBeTypeOf('function');
    expect(latestReactFlowProps?.onConnectEnd).toBeTypeOf('function');

    act(() => {
      latestReactFlowProps?.onConnectStart?.(null, {
        nodeId: 'node-llm',
        handleType: 'source',
        handleId: 'source-right'
      });
      latestReactFlowProps?.onConnectEnd?.({
        clientX: 420,
        clientY: 260,
        target: document.createElement('div')
      });
    });

    expect(getState().nodePickerState).toEqual({
      open: true,
      anchorNodeId: 'node-llm',
      anchorEdgeId: null,
      anchorCanvasPosition: { x: 420, y: 260 }
    });
  });

  test('creates a branched node from the dragged connection without rewriting the original outgoing edge', async () => {
    const { getState } = renderCanvas();

    act(() => {
      latestReactFlowProps?.onConnectStart?.(null, {
        nodeId: 'node-llm',
        handleType: 'source',
        handleId: 'source-right'
      });
      latestReactFlowProps?.onConnectEnd?.({
        clientX: 420,
        clientY: 260,
        target: document.createElement('div')
      });
    });

    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Template Transform' })
    );

    const insertedNode = getState().workingDocument.graph.nodes.find(
      (node) => node.type === 'template_transform'
    );

    expect(insertedNode).toBeDefined();
    expect(insertedNode?.position).toEqual({ x: 420, y: 260 });
    expect(getState().workingDocument.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-llm-answer',
          source: 'node-llm',
          target: 'node-answer'
        }),
        expect.objectContaining({
          source: 'node-llm',
          target: insertedNode?.id
        })
      ])
    );
    expect(getState().workingDocument.graph.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: insertedNode?.id,
          target: 'node-answer'
        })
      ])
    );
  });

  test('selects an edge when it is clicked', () => {
    const { getState } = renderCanvas();

    expect(latestReactFlowProps?.onEdgeClick).toBeTypeOf('function');

    act(() => {
      latestReactFlowProps?.onEdgeClick?.(null, {
        id: 'edge-llm-answer'
      });
    });

    expect(getState().selectedEdgeId).toBe('edge-llm-answer');
    expect(latestReactFlowProps?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-llm-answer',
          selected: true
        })
      ])
    );
  });

  test('clears node selection when clicking the pane', () => {
    const { getState } = renderCanvas();

    expect(getState().selectedNodeId).toBe('node-llm');
    expect(latestReactFlowProps?.onPaneClick).toBeTypeOf('function');

    act(() => {
      latestReactFlowProps?.onPaneClick?.();
    });

    expect(getState().selectedNodeId).toBe(null);
  });
});
