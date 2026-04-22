import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ConsoleNodeContributionEntry } from '@1flowbase/api-client';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import { AgentFlowCanvasFrame } from '../components/editor/AgentFlowCanvasFrame';
import {
  AgentFlowEditorStoreProvider,
  useAgentFlowEditorStore
} from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';
import { renderReactFlowScene } from '../../../test/renderers/render-react-flow-scene';

const readyContribution: ConsoleNodeContributionEntry = {
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
};

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-21T01:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };
}

function DocumentProbe() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);

  return (
    <pre data-testid="working-document">
      {JSON.stringify(document)}
    </pre>
  );
}

beforeEach(() => {
  resetAuthStore();
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: {
      id: 'user-1',
      account: 'root',
      effective_display_role: 'root',
      current_workspace_id: 'workspace-1'
    },
    me: {
      id: 'user-1',
      account: 'root',
      email: 'root@example.com',
      phone: null,
      nickname: 'Root',
      name: 'Root',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'root',
      permissions: ['application.view.all', 'application.edit.own']
    }
  });
});

describe('node contribution picker', () => {
  test('writes contribution identity into the draft node document', async () => {
    renderReactFlowScene(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <AgentFlowCanvasFrame
          applicationId="app-1"
          applicationName="Support Agent"
          nodeContributions={[readyContribution]}
        />
        <DocumentProbe />
      </AgentFlowEditorStoreProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: '在 LLM 后新增节点' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /OpenAI Prompt/i }));

    await waitFor(() => {
      expect(
        screen.getByText('OpenAI Prompt', { selector: '.agent-flow-node-card__title' })
      ).toBeInTheDocument();
    });

    const document = JSON.parse(
      screen.getByTestId('working-document').textContent ?? '{}'
    );
    const pluginNode = document.graph.nodes.at(-1);

    expect(pluginNode).toMatchObject({
      type: 'plugin_node',
      plugin_id: 'prompt_pack@0.1.0',
      plugin_version: '0.1.0',
      contribution_code: 'openai_prompt',
      node_shell: 'action',
      schema_version: '1flowbase.node-contribution/v1'
    });
  }, 20_000);
});
