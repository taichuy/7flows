import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  modelProviderOptionsProviders,
  modelProviderOptionsContract
} from '../../../test/model-provider-contract-fixtures';

const modelProviderOptionsApi = vi.hoisted(() => ({
  modelProviderOptionsQueryKey: ['model-providers', 'options'] as const,
  fetchModelProviderOptions: vi.fn()
}));

vi.mock('../api/model-provider-options', () => modelProviderOptionsApi);

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';
import { AppProviders } from '../../../app/AppProviders';
import { NodeConfigTab } from '../components/detail/tabs/NodeConfigTab';
import { listLlmProviderOptions } from '../lib/model-options';
import { AgentFlowEditorStoreProvider } from '../store/editor/AgentFlowEditorStoreProvider';
import { useAgentFlowEditorStore } from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

const primaryProviderOption = modelProviderOptionsProviders[0];
const primaryProviderFirstGroup = primaryProviderOption.model_groups[0];
const primaryProviderFirstModel = primaryProviderFirstGroup.models[0];
const primaryProviderSecondGroup = primaryProviderOption.model_groups[1];
const primaryProviderSecondModel = primaryProviderSecondGroup.models[0];
const secondaryProviderOption = modelProviderOptionsProviders[1];
const secondaryProviderFirstGroup = secondaryProviderOption.model_groups[0];
const secondaryProviderFirstModel = secondaryProviderFirstGroup.models[0];

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-18T10:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

function DocumentObserver({
  onChange
}: {
  onChange: (
    document: ReturnType<typeof createDefaultAgentFlowDocument>
  ) => void;
}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);

  useEffect(() => {
    onChange(document);
  }, [document, onChange]);

  return null;
}

function renderWithProviders(ui: ReactNode) {
  return render(<AppProviders>{ui}</AppProviders>);
}

async function openModelSettings() {
  fireEvent.click(await screen.findByRole('button', { name: '模型' }));
  expect(await screen.findByRole('heading', { name: '模型设置' })).toBeInTheDocument();
}

async function openModelDropdown() {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: '选择供应商和模型' }));
}

async function clickModelOption(label: string) {
  const [option] = await screen.findAllByText((content, element) => {
    if (!element || !element.matches('.agent-flow-model-settings__option-main')) {
      return false;
    }

    return content.trim() === label;
  });

  fireEvent.click(option.closest('button') as HTMLButtonElement);
}

describe('LlmModelField', () => {
  beforeEach(() => {
    modelProviderOptionsApi.fetchModelProviderOptions.mockReset();
    modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValue(
      modelProviderOptionsContract
    );
  });

  test('maps provider-level parameter schema and effective model limits from provider options', () => {
    const providerOptions = listLlmProviderOptions(modelProviderOptionsContract);
    const openaiProvider = providerOptions.find(
      (option) => option.value === primaryProviderOption.provider_code
    );

    expect(openaiProvider?.parameterForm?.fields[0]?.key).toBe('temperature');
    expect(openaiProvider?.models[0]).toMatchObject({
      contextWindow: primaryProviderFirstModel.context_window,
      effectiveContextWindow: primaryProviderFirstModel.context_window,
      maxOutputTokens: primaryProviderFirstModel.max_output_tokens
    });
  });

  test('opens a unified model dialog and writes the selected grouped model back to the llm node config', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const { container } = renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(container.querySelector('.agent-flow-model-field')).toBeNull();

    await openModelSettings();
    expect(screen.getByRole('combobox', { name: '选择供应商和模型' })).toBeInTheDocument();
    expect(screen.queryByText(primaryProviderOption.display_name)).not.toBeInTheDocument();
    await openModelDropdown();
    expect(screen.getByText(primaryProviderOption.display_name)).toBeInTheDocument();
    expect(
      screen.getByText(primaryProviderFirstGroup.source_instance_display_name)
    ).toBeInTheDocument();
    expect(
      screen.getByText(primaryProviderSecondGroup.source_instance_display_name)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型供应商设置' })).toBeInTheDocument();

    await clickModelOption(primaryProviderSecondModel.display_name);

    await waitFor(() => {
      const llmNode = latestDocument.graph.nodes.find((node) => node.id === 'node-llm');

      expect(llmNode?.config).toMatchObject({
        model_provider: {
          provider_code: 'openai_compatible',
          source_instance_id: primaryProviderSecondGroup.source_instance_id,
          model_id: primaryProviderSecondModel.model_id,
          provider_label: primaryProviderOption.display_name,
          model_label: primaryProviderSecondModel.display_name
        },
        llm_parameters: {
          schema_version: '1.0.0',
          items: {
            temperature: {
              enabled: false,
              value: 0.7
            }
          }
        }
      });
    });
  }, 10_000);

  test('renders provider-level parameter controls inside the model dialog instead of the inspector body', async () => {
    const duplicatedModelContract = JSON.parse(
      JSON.stringify(modelProviderOptionsContract)
    ) as typeof modelProviderOptionsContract;
    const duplicatedProvider = duplicatedModelContract.providers[0];

    duplicatedProvider.parameter_form = {
      schema_version: '1.0.0',
      fields: [
        {
          key: 'top_p',
          label: 'Top P',
          type: 'number',
          send_mode: 'optional',
          enabled_by_default: true,
          options: [],
          visible_when: [],
          disabled_when: [],
          default_value: 0.9
        }
      ]
    };

    duplicatedProvider.model_groups = [
      {
        source_instance_id: 'provider-openai-prod',
        source_instance_display_name: 'OpenAI Production',
        models: [
          {
            ...primaryProviderFirstModel,
            model_id: 'gpt-4o-mini',
            display_name: 'GPT-4o Mini'
          }
        ]
      },
      {
        source_instance_id: 'provider-openai-backup',
        source_instance_display_name: 'OpenAI Backup',
        models: [
          {
            ...primaryProviderFirstModel,
            model_id: 'gpt-4o-mini',
            display_name: 'GPT-4o Mini'
          }
        ]
      }
    ];
    modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValueOnce(
      duplicatedModelContract
    );

    const state = createInitialState();
    const llmNode = state.draft.document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: duplicatedProvider.provider_code,
      source_instance_id: 'provider-openai-backup',
      model_id: 'gpt-4o-mini',
      provider_label: duplicatedProvider.display_name,
      model_label: 'GPT-4o Mini'
    };

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={state}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openModelSettings();
    expect(await screen.findByText('Top P')).toBeInTheDocument();
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument();
    expect(screen.queryByText('返回格式')).not.toBeInTheDocument();
  });

  test('renders effective context and optional max output in the model selector options', async () => {
    const duplicatedModelContract = JSON.parse(
      JSON.stringify(modelProviderOptionsContract)
    ) as typeof modelProviderOptionsContract;

    duplicatedModelContract.providers[0].model_groups[0].models[0].context_window = 256000;
    duplicatedModelContract.providers[0].model_groups[0].models[0].max_output_tokens = 8192;
    duplicatedModelContract.providers[0].model_groups[1].models[0].context_window = 64000;
    duplicatedModelContract.providers[0].model_groups[1].models[0].max_output_tokens = null;
    modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValueOnce(
      duplicatedModelContract
    );

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openModelSettings();
    await openModelDropdown();

    expect(await screen.findByText('上下文 256K')).toBeInTheDocument();
    expect(screen.getAllByText('输出 8192').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('上下文 64K')).toBeInTheDocument();
  });

  test('shows a formal error state when the current provider is unavailable', async () => {
    const state = createInitialState();
    const llmNode = state.draft.document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: 'provider_stale',
      source_instance_id: 'provider-stale-instance',
      model_id: 'gpt-4o-mini'
    };

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={state}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openModelSettings();
    await openModelDropdown();

    expect(
      await screen.findByText('当前节点引用的模型供应商不可用。')
    ).toBeInTheDocument();
  });

  test('switches provider by choosing a model from another provider group', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openModelSettings();
    await openModelDropdown();
    await clickModelOption(secondaryProviderFirstModel.display_name);

    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              model_provider: expect.objectContaining({
                provider_code: secondaryProviderOption.provider_code,
                source_instance_id: secondaryProviderFirstGroup.source_instance_id,
                model_id: secondaryProviderFirstModel.model_id,
                provider_label: secondaryProviderOption.display_name,
                model_label: secondaryProviderFirstModel.display_name
              })
            })
          })
        ])
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: `${secondaryProviderOption.display_name} ${secondaryProviderFirstGroup.source_instance_display_name} ${secondaryProviderFirstModel.display_name}`
        })
      ).not.toBeInTheDocument();
    });
  });
});
