import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  modelProviderOptionInstances,
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
import {
  AgentFlowEditorStoreProvider,
  useAgentFlowEditorStore
} from '../store/editor/provider';
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

describe('LlmModelField', () => {
  beforeEach(() => {
    modelProviderOptionsApi.fetchModelProviderOptions.mockReset();
    modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValue(
      modelProviderOptionsContract
    );
  });

  test('writes selected provider instance and model back to the llm node config', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '模型' }));

    expect(await screen.findByText('模型供应商实例')).toBeInTheDocument();
    const providerButton = await screen.findByRole('button', {
      name: `选择模型供应商实例 ${modelProviderOptionInstances[0].display_name}`
    });

    fireEvent.click(providerButton);
    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              model_provider: expect.objectContaining({
                provider_instance_id: 'provider-openai-prod',
                model_id: ''
              })
            })
          })
        ])
      );
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: `选择模型 ${modelProviderOptionInstances[0].models[0].display_name}`
      })
    );

    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              model_provider: expect.objectContaining({
                provider_instance_id: 'provider-openai-prod',
                model_id: 'gpt-4o-mini',
                provider_label: modelProviderOptionInstances[0].display_name,
                model_label: modelProviderOptionInstances[0].models[0].display_name
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

  test('shows a formal error state and settings link when the current provider instance is unavailable', async () => {
    const state = createInitialState();
    const llmNode = state.draft.document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_instance_id: 'provider-stale',
      model_id: 'gpt-4o-mini'
    };

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={state}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '模型' }));

    expect(
      await screen.findByText('当前节点引用的模型供应商实例不可用。')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '模型供应商设置' })
    ).toHaveAttribute('href', '/settings/model-providers');
  });
});
