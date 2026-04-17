import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { AgentFlowNodeCard } from '../components/nodes/AgentFlowNodeCard';
import { resolveAgentFlowNodeSchema } from '../schema/node-schema-registry';

vi.mock('@xyflow/react', () => ({
  Handle: ({
    children,
    className,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    role?: string;
    tabIndex?: number;
    ['aria-label']?: string;
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  }) => {
    const domProps = { ...(props as Record<string, unknown>) };

    delete domProps.type;
    delete domProps.position;

    return (
      <div className={`react-flow__handle ${className ?? ''}`} {...domProps}>
        {children}
      </div>
    );
  },
  Position: {
    Left: 'left',
    Right: 'right'
  }
}));

describe('AgentFlowNodeCard', () => {
  test('uses the source handle itself as the add-node trigger instead of nesting a separate button', () => {
    const onOpenPicker = vi.fn();

    render(
      <AgentFlowNodeCard
        {...({
          data: {
            nodeId: 'node-llm',
            nodeType: 'llm',
            nodeSchema: resolveAgentFlowNodeSchema('llm'),
            typeLabel: 'LLM',
            alias: 'LLM',
            description: '',
            config: { model: 'gpt-4' },
            issueCount: 0,
            canEnterContainer: false,
            pickerOpen: false,
            showTargetHandle: true,
            showSourceHandle: true,
            isContainer: false,
            onOpenPicker,
            onClosePicker: vi.fn(),
            onOpenContainer: vi.fn(),
            onSelectNode: vi.fn(),
            onInsertNode: vi.fn()
          },
          id: 'node-llm',
          selected: false
        } as unknown as Parameters<typeof AgentFlowNodeCard>[0])}
      />
    );

    const trigger = screen.getByRole('button', { name: '在 LLM 后新增节点' });
    expect(screen.getByText('gpt-4')).toBeInTheDocument();

    expect(trigger).toHaveClass('react-flow__handle');
    expect(within(trigger).queryByRole('button')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(onOpenPicker).toHaveBeenCalledWith('node-llm');
  });
});
