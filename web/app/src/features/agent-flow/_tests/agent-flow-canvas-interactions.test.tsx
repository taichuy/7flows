import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';
import { AgentFlowCanvas } from '../components/editor/AgentFlowCanvas';

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
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const onDocumentChange = vi.fn();

    render(
      <AgentFlowCanvas
        activeContainerId={null}
        document={document}
        issueCountByNodeId={{}}
        selectedNodeId="node-llm"
        onOpenContainer={vi.fn()}
        onSelectNode={vi.fn()}
        onDocumentChange={onDocumentChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger node drag' }));

    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        graph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'node-llm',
              position: { x: 520, y: 260 }
            })
          ])
        })
      })
    );
  });

  test('opens with the document viewport and shows a plain percentage label', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    render(
      <AgentFlowCanvas
        activeContainerId={null}
        document={document}
        issueCountByNodeId={{}}
        selectedNodeId="node-llm"
        onOpenContainer={vi.fn()}
        onSelectNode={vi.fn()}
        onDocumentChange={vi.fn()}
      />
    );

    expect(latestReactFlowProps?.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(screen.getByLabelText('当前缩放')).toHaveTextContent('100%');
  });

  test('writes viewport changes back into the document', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const onDocumentChange = vi.fn();

    render(
      <AgentFlowCanvas
        activeContainerId={null}
        document={document}
        issueCountByNodeId={{}}
        selectedNodeId="node-llm"
        onOpenContainer={vi.fn()}
        onSelectNode={vi.fn()}
        onDocumentChange={onDocumentChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger viewport change' }));

    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({
          viewport: { x: 120, y: 48, zoom: 0.85 }
        })
      })
    );
  });

  test('inserts a node when the edge add event is dispatched', async () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const onDocumentChange = vi.fn();

    render(
      <AgentFlowCanvas
        activeContainerId={null}
        document={document}
        issueCountByNodeId={{}}
        selectedNodeId="node-llm"
        onOpenContainer={vi.fn()}
        onSelectNode={vi.fn()}
        onDocumentChange={onDocumentChange}
      />
    );

    expect(latestReactFlowProps).not.toBeNull();

    window.dispatchEvent(
      new CustomEvent('agent-flow-insert-node', {
        detail: {
          sourceNodeId: 'node-llm',
          nodeType: 'template_transform',
          edgeId: 'edge-node-llm-node-answer'
        }
      })
    );

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalled();
    });

    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        graph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              type: 'template_transform'
            })
          ])
        })
      })
    );
  });

  test('rewrites the document edge when an existing line is reconnected', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const onDocumentChange = vi.fn();

    render(
      <AgentFlowCanvas
        activeContainerId={null}
        document={document}
        issueCountByNodeId={{}}
        selectedNodeId="node-llm"
        onOpenContainer={vi.fn()}
        onSelectNode={vi.fn()}
        onDocumentChange={onDocumentChange}
      />
    );

    expect(latestReactFlowProps?.onReconnect).toBeTypeOf('function');

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

    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        graph: expect.objectContaining({
          edges: expect.arrayContaining([
            expect.objectContaining({
              id: 'edge-start-llm',
              source: 'node-start',
              target: 'node-answer',
              sourceHandle: 'source-right',
              targetHandle: 'target-left'
            })
          ])
        })
      })
    );
  });
});
