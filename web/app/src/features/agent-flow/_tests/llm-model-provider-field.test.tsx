import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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
    modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValue({
      instances: [
        {
          provider_instance_id: 'provider-openai-prod',
          provider_code: 'openai_compatible',
          protocol: 'openai_responses',
          display_name: 'OpenAI Prod',
          models: [
            {
              model_id: 'gpt-4o-mini',
              display_name: 'GPT-4o Mini',
              source: 'catalog',
              supports_streaming: true,
              supports_tool_call: true,
              supports_multimodal: false,
              context_window: 128000,
              max_output_tokens: 16384,
              provider_metadata: {}
            },
            {
              model_id: 'gpt-4.1',
              display_name: 'GPT-4.1',
              source: 'catalog',
              supports_streaming: true,
              supports_tool_call: true,
              supports_multimodal: false,
              context_window: 128000,
              max_output_tokens: 16384,
              provider_metadata: {}
            }
          ]
        },
        {
          provider_instance_id: 'provider-azure-prod',
          provider_code: 'openai_compatible',
          protocol: 'openai_responses',
          display_name: 'Azure Prod',
          models: [
            {
              model_id: 'azure-gpt-4.1',
              display_name: 'Azure GPT-4.1',
              source: 'catalog',
              supports_streaming: true,
              supports_tool_call: true,
              supports_multimodal: false,
              context_window: 128000,
              max_output_tokens: 16384,
              provider_metadata: {}
            }
          ]
        }
      ]
    });
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
      name: '选择模型供应商实例 OpenAI Prod'
    });

    fireEvent.click(providerButton);
    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              provider_instance_id: 'provider-openai-prod'
            })
          })
        ])
      );
    });
    fireEvent.click(
      await screen.findByRole('button', { name: '选择模型 GPT-4o Mini' })
    );

    await waitFor(() => {
      expect(latestDocument.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-llm',
            config: expect.objectContaining({
              provider_instance_id: 'provider-openai-prod',
              model: 'gpt-4o-mini'
            })
          })
        ])
      );
    });
  });

  test('shows a formal error state and settings link when the current provider instance is unavailable', async () => {
    const state = createInitialState();
    const llmNode = state.draft.document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.provider_instance_id = 'provider-stale';
    llmNode.config.model = 'gpt-4o-mini';

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
