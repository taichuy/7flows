import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Grid } from 'antd';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { ConsoleNodeContributionEntry } from '@1flowbase/api-client';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

const schemaRuntimeSpies = vi.hoisted(() => ({
  resolveAgentFlowNodeSchema: vi.fn(),
  SchemaDrawerPanel: vi.fn()
}));

vi.mock('../../schema/node-schema-registry', async () => {
  const actual = await vi.importActual<typeof import('../../schema/node-schema-registry')>(
    '../../schema/node-schema-registry'
  );

  return {
    ...actual,
    resolveAgentFlowNodeSchema: vi.fn((nodeType) => {
      schemaRuntimeSpies.resolveAgentFlowNodeSchema(nodeType);
      return actual.resolveAgentFlowNodeSchema(nodeType);
    })
  };
});

vi.mock('../../../../shared/schema-ui/overlay-shell/SchemaDrawerPanel', () => ({
  SchemaDrawerPanel: schemaRuntimeSpies.SchemaDrawerPanel
}));

import * as orchestrationApi from '../../api/orchestration';
import * as nodeContributionsApi from '../../api/node-contributions';
import * as runtimeApi from '../../api/runtime';
import { VersionHistoryDrawer } from '../../components/history/VersionHistoryDrawer';
import { AgentFlowEditorShell } from '../../components/editor/AgentFlowEditorShell';
import { NODE_DETAIL_DEFAULT_WIDTH } from '../../lib/detail-panel-width';
import { AgentFlowEditorPage } from '../../pages/AgentFlowEditorPage';
import { resetAuthStore, useAuthStore } from '../../../../state/auth-store';
import { renderReactFlowScene } from '../../../../test/renderers/render-react-flow-scene';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };
}

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

function renderShell(ui: ReactNode) {
  return renderReactFlowScene(ui as ReactElement);
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  schemaRuntimeSpies.resolveAgentFlowNodeSchema.mockClear();
  schemaRuntimeSpies.SchemaDrawerPanel.mockReset();
  schemaRuntimeSpies.SchemaDrawerPanel.mockImplementation(
    ({
      children,
      schema
    }: {
      children?: ReactNode;
      schema: { title: string };
    }) => (
      <div data-testid="mock-schema-drawer">
        <div data-testid="mock-schema-drawer-title">{schema.title}</div>
        {children}
      </div>
    )
  );
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
  vi.spyOn(runtimeApi, 'fetchNodeLastRun').mockResolvedValue(null);
  vi.spyOn(nodeContributionsApi, 'fetchNodeContributions').mockResolvedValue([]);
  vi.spyOn(runtimeApi, 'buildNodeDebugPreviewInput').mockReturnValue({
    input_payload: {}
  });
  vi.spyOn(runtimeApi, 'buildFlowDebugRunInput').mockReturnValue({
    input_payload: {
      'node-start': { query: '请总结退款政策' }
    }
  });
  vi.spyOn(runtimeApi, 'startNodeDebugPreview').mockResolvedValue({
    flow_run: {
      id: 'run-1',
      application_id: 'app-1',
      flow_id: 'flow-1',
      draft_id: 'draft-1',
      compiled_plan_id: 'plan-1',
      run_mode: 'debug_node_preview',
      status: 'succeeded',
      target_node_id: 'node-llm',
      input_payload: {},
      output_payload: {},
      error_payload: null,
      created_by: 'user-1',
      started_at: '2026-04-17T09:00:00Z',
      finished_at: '2026-04-17T09:00:01Z',
      created_at: '2026-04-17T09:00:00Z'
    },
    node_run: {
      id: 'node-run-1',
      flow_run_id: 'run-1',
      node_id: 'node-llm',
      node_type: 'llm',
      node_alias: 'LLM',
      status: 'succeeded',
      input_payload: {},
      output_payload: {},
      error_payload: null,
      metrics_payload: {
        output_contract_count: 1
      },
      started_at: '2026-04-17T09:00:00Z',
      finished_at: '2026-04-17T09:00:01Z'
    },
    checkpoints: [],
    events: []
  });
  vi.spyOn(runtimeApi, 'startFlowDebugRun').mockResolvedValue({
    flow_run: {
      id: 'flow-run-1',
      application_id: 'app-1',
      flow_id: 'flow-1',
      draft_id: 'draft-1',
      compiled_plan_id: 'plan-1',
      run_mode: 'debug_flow_run',
      status: 'waiting_human',
      target_node_id: null,
      input_payload: {
        'node-start': { query: '请总结退款政策' }
      },
      output_payload: {},
      error_payload: null,
      created_by: 'user-1',
      started_at: '2026-04-17T09:00:00Z',
      finished_at: null,
      created_at: '2026-04-17T09:00:00Z'
    },
    node_runs: [],
    checkpoints: [
      {
        id: 'checkpoint-1',
        flow_run_id: 'flow-run-1',
        node_run_id: null,
        status: 'waiting_human',
        reason: '等待人工输入',
        locator_payload: { node_id: 'node-human' },
        variable_snapshot: {},
        external_ref_payload: { prompt: '请人工审核' },
        created_at: '2026-04-17T09:00:00Z'
      }
    ],
    callback_tasks: [],
    events: []
  });
});

describe('AgentFlowEditorShell', () => {
  test('renders node cards through node schema card blocks and keeps debug overlay actions', async () => {
    schemaRuntimeSpies.resolveAgentFlowNodeSchema.mockClear();

    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    expect(
      await screen.findByText('Start', { selector: '.agent-flow-node-card__title' })
    ).toBeInTheDocument();
    expect(schemaRuntimeSpies.resolveAgentFlowNodeSchema).toHaveBeenCalledWith('start');
    expect(schemaRuntimeSpies.resolveAgentFlowNodeSchema).toHaveBeenCalledWith('llm');
    expect(schemaRuntimeSpies.resolveAgentFlowNodeSchema).toHaveBeenCalledWith('answer');
    expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '调试整流' })).toBeInTheDocument();
  }, 20_000);

  test('renders the default three nodes and overlay controls', async () => {
    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    expect(
      await screen.findByText('Start', { selector: '.agent-flow-node-card__title' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('LLM', { selector: '.agent-flow-node-card__title' })
    ).toBeInTheDocument();
    expect(screen.getByText('模型供应商未选择')).toBeInTheDocument();
    expect(
      screen.getByText('Answer', { selector: '.agent-flow-node-card__title' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '调试整流' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布配置' })).toBeInTheDocument();
  }, 20_000);

  test('starts whole-flow debug run from overlay action', async () => {
    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '调试整流' }));

    await waitFor(() => {
      expect(runtimeApi.startFlowDebugRun).toHaveBeenCalledWith(
        'app-1',
        { input_payload: { 'node-start': { query: '请总结退款政策' } } },
        expect.any(String)
      );
    });
  }, 20_000);

  test('saves alias changes from the header editor', async () => {
    const initialState = createInitialState();
    const saveDraftOverride = vi.fn(async (input) => ({
      ...initialState,
      draft: {
        ...initialState.draft,
        id: 'draft-2',
        updated_at: '2026-04-15T09:10:00Z',
        document: input.document
      }
    }));

    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={initialState}
        saveDraftOverride={saveDraftOverride}
      />
    );

    const header = screen.getByTestId('node-detail-header');

    fireEvent.change(within(header).getByLabelText('节点别名'), {
      target: { value: 'Support LLM' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(saveDraftOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          change_kind: 'logical',
          summary: '更新节点配置',
          document: expect.objectContaining({
            graph: expect.objectContaining({
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: 'node-llm',
                  alias: 'Support LLM'
                })
              ])
            })
          })
        })
      );
    });
  }, 20_000);

  test('opens the selected issue target and focuses the node field', async () => {
    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={{
          ...createInitialState(),
          versions: [
            {
              id: 'version-1',
              sequence: 1,
              trigger: 'autosave',
              change_kind: 'logical',
              summary: '初始化默认草稿',
              created_at: '2026-04-15T09:00:00Z'
            }
          ]
        }}
        saveDraftOverride={vi.fn().mockResolvedValue(createInitialState())}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Issues' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'LLM 缺少模型供应商' })
    );

    await waitFor(() => {
      expect(screen.getByLabelText('模型')).toHaveFocus();
    });
  }, 20_000);

  test('restores a history version into the current draft', async () => {
    schemaRuntimeSpies.SchemaDrawerPanel.mockClear();
    const versions = [
      {
        id: 'version-1',
        sequence: 1,
        trigger: 'autosave' as const,
        change_kind: 'logical' as const,
        summary: '初始化默认草稿',
        created_at: '2026-04-15T09:00:00Z'
      }
    ];
    const restoreVersion = vi.fn().mockResolvedValue({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-2',
        flow_id: 'flow-1',
        updated_at: '2026-04-15T09:15:00Z',
        document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
      },
      versions,
      autosave_interval_seconds: 30
    });

    render(
      <VersionHistoryDrawer
        open
        onClose={vi.fn()}
        versions={versions}
        restoring={false}
        onRestore={restoreVersion}
      />
    );

    expect(schemaRuntimeSpies.SchemaDrawerPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        schema: expect.objectContaining({
          title: '历史版本',
          width: 420,
          getContainer: false
        }),
        onClose: expect.any(Function)
      }),
      undefined
    );
    fireEvent.click(screen.getByRole('button', { name: '恢复版本 1' }));

    expect(restoreVersion).toHaveBeenCalledWith('version-1');
  });

  test('shows a desktop-only message on small screens', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: false } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    renderShell(
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    );

    expect(await screen.findByText('请使用桌面端编辑')).toBeInTheDocument();
  });

  test('renders provider-backed editor chrome on desktop', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );
    vi.mocked(nodeContributionsApi.fetchNodeContributions).mockResolvedValueOnce([
      readyContribution
    ]);

    renderShell(
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    );

    expect(await screen.findByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issues' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '在 LLM 后新增节点' }));
    expect(
      await screen.findByRole('menuitem', { name: /OpenAI Prompt/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('请使用桌面端编辑')).not.toBeInTheDocument();
    expect(nodeContributionsApi.fetchNodeContributions).toHaveBeenCalledWith('app-1');
  }, 20_000);

  test('renders node detail inside a docked overlay panel on orchestration page', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    renderShell(
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    );

    const detailDock = await screen.findByTestId('agent-flow-editor-detail-dock');

    expect(detailDock).toBeInTheDocument();
    expect(within(detailDock).getByLabelText('节点详情')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /设置|配置/ })).toBeInTheDocument();
  }, 20_000);

  test('keeps last-run content inside the same docked detail panel dock', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    renderShell(
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    );

    const detailDock = await screen.findByTestId('agent-flow-editor-detail-dock');

    fireEvent.click(screen.getByRole('tab', { name: '上次运行' }));

    expect(await screen.findByText('当前节点还没有运行记录')).toBeInTheDocument();
    expect(detailDock).toBeInTheDocument();
    expect(within(detailDock).getByLabelText('节点详情')).toBeInTheDocument();
    expect(screen.queryByText('请使用桌面端编辑')).not.toBeInTheDocument();
  }, 20_000);

  test('hides config content after switching to the last-run tab', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    renderShell(
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    );

    fireEvent.click(await screen.findByRole('tab', { name: '上次运行' }));

    expect(await screen.findByText('当前节点还没有运行记录')).toBeVisible();
    expect(screen.getByLabelText('模型')).not.toBeVisible();
  }, 20_000);

  test('resizes the docked node detail panel by dragging its resize handle', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
          top: 0,
          right: 1280,
          bottom: 720,
          left: 0,
          toJSON: () => ({})
        }) as DOMRect
    );

    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    const detailDock = await screen.findByTestId('agent-flow-editor-detail-dock');

    expect(detailDock).toHaveStyle(`width: ${NODE_DETAIL_DEFAULT_WIDTH}px`);
    expect(detailDock).toHaveAttribute('data-layout', 'regular');

    fireEvent.mouseDown(
      screen.getByRole('separator', { name: '调整节点详情宽度' }),
      { clientX: 860 }
    );
    fireEvent.mouseMove(window, { clientX: 960 });
    fireEvent.mouseUp(window);

    expect(detailDock).toHaveStyle('width: 320px');
    expect(detailDock).toHaveAttribute('data-layout', 'compact');
  }, 20_000);
});
