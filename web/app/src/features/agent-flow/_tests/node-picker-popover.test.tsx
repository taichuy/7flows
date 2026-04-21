import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { NodePickerPopover } from '../components/node-picker/NodePickerPopover';
import type { NodePickerOption } from '../lib/plugin-node-definitions';

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

    expect(screen.getByRole('menuitem', { name: /OpenAI Prompt/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /SQL Exporter/i })).toBeDisabled();
  });
});
