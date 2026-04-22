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
import { AgentFlowEditorStoreProvider } from '../store/editor/AgentFlowEditorStoreProvider';
import { useAgentFlowEditorStore } from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

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

async function selectProviderOption(label: string) {
  const providerSelect = await screen.findByRole('combobox', {
    name: '模型供应商'
  });

  fireEvent.mouseDown(providerSelect);
  const [option] = await screen.findAllByText((_, element) => {
    if (!element) {
      return false;
    }

    return (
      element.matches('.ant-select-item-option-content') &&
      Boolean(element.textContent?.includes(label))
    );
  });
  fireEvent.click(option);
}

describe('LlmModelField', () => {
  beforeEach(() => {
    modelProviderOptionsApi.fetchModelProviderOptions.mockReset();
    modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValue(
      modelProviderOptionsContract
    );
  });

  test('writes selected provider code and model back to the llm node config', async () => {
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

    await selectProviderOption(modelProviderOptionsProviders[0].display_name);
    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              model_provider: expect.objectContaining({
                provider_code: 'openai_compatible',
                model_id: 'gpt-4o-mini'
              })
            })
          })
        ])
      );
    });
    expect(screen.getByRole('button', { name: '模型设置' })).not.toHaveTextContent(
      modelProviderOptionsProviders[0].models[0].display_name
    );
    fireEvent.click(screen.getByRole('button', { name: '模型设置' }));

    expect(await screen.findByRole('heading', { name: '生效模型' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('搜索生效模型')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '模型供应商设置' })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '生效模型' }));
    fireEvent.click(
      await screen.findByRole('option', {
        name: modelProviderOptionsProviders[0].models[0].display_name
      })
    );

    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              model_provider: expect.objectContaining({
                provider_code: 'openai_compatible',
                model_id: 'gpt-4o-mini',
                provider_label: modelProviderOptionsProviders[0].display_name,
                model_label: modelProviderOptionsProviders[0].models[0].display_name
              }),
              llm_parameters: {
                schema_version: '1.0.0',
                items: {
                  temperature: {
                    enabled: false,
                    value: 0.7
                  }
                }
              }
            })
          })
        ])
      );
    });
  }, 10_000);

  test('shows a formal error state when the current provider is unavailable', async () => {
    const state = createInitialState();
    const llmNode = state.draft.document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: 'provider_stale',
      model_id: 'gpt-4o-mini'
    };

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={state}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '模型设置' }));

    expect(
      await screen.findByText('当前节点引用的模型供应商不可用。')
    ).toBeInTheDocument();
  });

  test('resets to the new provider first enabled model when switching providers', async () => {
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

    await selectProviderOption(modelProviderOptionsProviders[1].display_name);

    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              model_provider: expect.objectContaining({
                provider_code: modelProviderOptionsProviders[1].provider_code,
                model_id: modelProviderOptionsProviders[1].models[0].model_id,
                provider_label: modelProviderOptionsProviders[1].display_name,
                model_label: modelProviderOptionsProviders[1].models[0].display_name
              })
            })
          })
        ])
      );
    });
  });
});
