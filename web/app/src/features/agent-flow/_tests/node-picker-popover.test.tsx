import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { NodePickerPopover } from '../components/node-picker/NodePickerPopover';
import {
  calculateNodePickerMaxHeight
} from '../components/node-picker/node-picker-layout';
import {
  BUILTIN_NODE_PICKER_OPTIONS,
  type NodePickerOption
} from '../lib/plugin-node-definitions';

const pluginOptions: NodePickerOption[] = [
  {
    kind: 'plugin_contribution',
    label: 'OpenAI Prompt',
    disabled: false,
    disabledReason: null,
    contribution: {
      installation_id: 'installation-1',
      provider_code: 'prompt_pack',
      plugin_id: 'prompt_pack@0.1.0',
      plugin_version: '0.1.0',
      contribution_code: 'openai_prompt',
      node_shell: 'action',
      category: 'generation',
      title: 'OpenAI Prompt',
      description: 'Generate prompt output',
      dependency_status: 'ready',
      schema_version: '1flowbase.node-contribution/v1',
      experimental: false,
      icon: 'sparkles',
      schema_ui: {},
      output_schema: {},
      required_auth: [],
      visibility: 'public',
      dependency_installation_kind: 'model_provider',
      dependency_plugin_version_range: '^0.1.0'
    }
  },
  {
    kind: 'plugin_contribution',
    label: 'SQL Exporter',
    disabled: true,
    disabledReason: '缺少依赖插件',
    contribution: {
      installation_id: 'installation-2',
      provider_code: 'sql_pack',
      plugin_id: 'sql_pack@0.1.0',
      plugin_version: '0.1.0',
      contribution_code: 'sql_exporter',
      node_shell: 'action',
      category: 'export',
      title: 'SQL Exporter',
      description: 'Export rows to sql',
      dependency_status: 'missing_plugin',
      schema_version: '1flowbase.node-contribution/v1',
      experimental: false,
      icon: 'database',
      schema_ui: {},
      output_schema: {},
      required_auth: [],
      visibility: 'public',
      dependency_installation_kind: 'model_provider',
      dependency_plugin_version_range: '^0.1.0'
    }
  }
];

describe('NodePickerPopover', () => {
  test('groups built-in nodes by workflow purpose', () => {
    render(
      <NodePickerPopover
        ariaLabel="在 LLM 后新增节点"
        open
        onOpenChange={vi.fn()}
        onPickNode={vi.fn()}
      />
    );

    expect(screen.getByText('起止输出')).toBeInTheDocument();
    expect(screen.getByText('模型与生成')).toBeInTheDocument();
    expect(screen.getByText('流程控制')).toBeInTheDocument();
    expect(screen.getByText('数据处理')).toBeInTheDocument();
    expect(screen.getByText('外部能力')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /LLM/i })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Knowledge Retrieval/i })
    ).toBeInTheDocument();
  });

  test('filters node groups through the picker search', () => {
    render(
      <NodePickerPopover
        ariaLabel="在 LLM 后新增节点"
        open
        onOpenChange={vi.fn()}
        onPickNode={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), {
      target: { value: 'http' }
    });

    expect(
      screen.getByRole('menuitem', { name: /HTTP Request/i })
    ).toBeInTheDocument();
    expect(screen.getByText('外部能力')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /LLM/i })).not.toBeInTheDocument();
    expect(screen.queryByText('模型与生成')).not.toBeInTheDocument();
  });

  test('keeps category tabs and search above the scrollable node list', () => {
    render(
      <NodePickerPopover
        ariaLabel="在 LLM 后新增节点"
        open
        options={[...BUILTIN_NODE_PICKER_OPTIONS, ...pluginOptions]}
        onOpenChange={vi.fn()}
        onPickNode={vi.fn()}
      />
    );

    expect(screen.getByRole('tab', { name: '内置' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: '扩展' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(
      screen.queryByRole('menuitem', { name: /OpenAI Prompt/i })
    ).not.toBeInTheDocument();

    const searchInput = screen.getByRole('textbox', { name: '搜索节点' });
    const header = searchInput.closest('.agent-flow-node-picker__header');
    const list = document.querySelector('.agent-flow-node-picker__list');

    expect(header).not.toBeNull();
    expect(list).not.toBeNull();
    expect(list?.contains(searchInput)).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: '扩展' }));

    expect(screen.getByRole('tab', { name: '内置' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(screen.getByRole('tab', { name: '扩展' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByRole('menuitem', { name: /OpenAI Prompt/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /LLM/i })).not.toBeInTheDocument();
  });

  test('lets mousedown bubble so the surrounding handle can start a connection drag', () => {
    const handleMouseDown = vi.fn();

    render(
      <div onMouseDown={handleMouseDown}>
        <NodePickerPopover
          ariaLabel="在 LLM 后新增节点"
          open={false}
          onOpenChange={vi.fn()}
          onPickNode={vi.fn()}
        />
      </div>
    );

    fireEvent.mouseDown(
      screen.getByRole('button', { name: '在 LLM 后新增节点' })
    );

    expect(handleMouseDown).toHaveBeenCalledTimes(1);
  });

  test('keeps click from bubbling to the surrounding node card', () => {
    const handleClick = vi.fn();

    render(
      <div onClick={handleClick}>
        <NodePickerPopover
          ariaLabel="在 LLM 后新增节点"
          open={false}
          onOpenChange={vi.fn()}
          onPickNode={vi.fn()}
        />
      </div>
    );

    fireEvent.click(
      screen.getByRole('button', { name: '在 LLM 后新增节点' })
    );

    expect(handleClick).not.toHaveBeenCalled();
  });

  test('renders plugin contribution entries and disables missing dependencies', () => {
    render(
      <NodePickerPopover
        ariaLabel="在 LLM 后新增节点"
        open
        options={pluginOptions}
        onOpenChange={vi.fn()}
        onPickNode={vi.fn()}
      />
    );

    expect(
      screen.getByRole('menuitem', { name: /OpenAI Prompt/i })
    ).toBeEnabled();
    expect(
      screen.getByRole('menuitem', { name: /SQL Exporter/i })
    ).toBeDisabled();
  });

  test('calculates picker height with a 10px canvas bottom gap', () => {
    expect(calculateNodePickerMaxHeight(500, 360)).toBe(130);
    expect(calculateNodePickerMaxHeight(500, 460)).toBe(120);
  });
});
