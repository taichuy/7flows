import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../app/AppProviders';
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
      <AppProviders>
        <AgentFlowNodeCard
          {...({
            data: {
              nodeId: 'node-llm',
              nodeType: 'llm',
              nodeSchema: resolveAgentFlowNodeSchema('llm'),
              typeLabel: 'LLM',
              alias: 'LLM',
              description: '选择并调用大语言模型',
              config: {
                model_provider: {
                  provider_code: 'openai_compatible',
                  model_id: 'gpt-4',
                  provider_label: 'OpenAI Prod',
                  model_label: 'GPT-4'
                }
              },
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
      </AppProviders>,
    );

    const card = screen.getByRole('button', { name: /LLM OpenAI Prod GPT-4/ });
    const trigger = screen.getByRole('button', { name: '在 LLM 后新增节点' });
    expect(card).toBeInTheDocument();
    expect(screen.getByText('LLM')).toBeInTheDocument();
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Prod')).toBeInTheDocument();
    expect(screen.queryByText('选择并调用大语言模型')).not.toBeInTheDocument();

    expect(trigger).toHaveClass('react-flow__handle');
    expect(within(trigger).queryByRole('button')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(onOpenPicker).toHaveBeenCalledWith('node-llm');
  });
});
