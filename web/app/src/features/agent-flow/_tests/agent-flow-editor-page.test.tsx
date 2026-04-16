import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Grid } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';
import { AppProviders } from '../../../app/AppProviders';
import * as orchestrationApi from '../api/orchestration';
import { VersionHistoryDrawer } from '../components/history/VersionHistoryDrawer';
import { AgentFlowEditorShell } from '../components/editor/AgentFlowEditorShell';
import { AgentFlowEditorPage } from '../pages/AgentFlowEditorPage';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentFlowEditorShell', () => {
  test('renders the default three nodes and overlay controls', async () => {
    render(
      <div style={{ width: 1280, height: 720 }}>
        <AgentFlowEditorShell
          applicationId="app-1"
          applicationName="Support Agent"
          initialState={createInitialState()}
        />
      </div>
    );

    expect(
      await screen.findByText('Start', { selector: '.agent-flow-node-card__title' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LLM' })).toBeInTheDocument();
    expect(
      screen.getByText('Answer', { selector: '.agent-flow-node-card__title' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布配置' })).toBeInTheDocument();
  }, 20_000);

  test('saves the current document when clicking 保存', async () => {
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

    render(
      <div style={{ width: 1280, height: 720 }}>
        <AgentFlowEditorShell
          applicationId="app-1"
          applicationName="Support Agent"
          initialState={initialState}
          saveDraftOverride={saveDraftOverride}
        />
      </div>
    );

    fireEvent.change(screen.getByLabelText('节点别名'), {
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
    render(
      <div style={{ width: 1280, height: 720 }}>
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
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Issues' }));
    fireEvent.click(await screen.findByRole('button', { name: 'LLM 缺少模型' }));

    await waitFor(() => {
      expect(screen.getByLabelText('模型')).toHaveFocus();
    });
  }, 20_000);

  test('restores a history version into the current draft', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '恢复版本 1' }));

    expect(restoreVersion).toHaveBeenCalledWith('version-1');
  });

  test('shows a desktop-only message on small screens', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: false } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    render(
      <AppProviders>
        <AgentFlowEditorPage
          applicationId="app-1"
          applicationName="Support Agent"
        />
      </AppProviders>
    );

    expect(await screen.findByText('请使用桌面端编辑')).toBeInTheDocument();
  });

  test('renders provider-backed editor chrome on desktop', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    render(
      <AppProviders>
        <AgentFlowEditorPage
          applicationId="app-1"
          applicationName="Support Agent"
        />
      </AppProviders>
    );

    expect(await screen.findByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issues' })).toBeInTheDocument();
    expect(screen.queryByText('请使用桌面端编辑')).not.toBeInTheDocument();
  }, 20_000);

  test('renders node detail shell with config and last-run tabs on orchestration page', async () => {
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
    vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
      createInitialState()
    );

    render(
      <AppProviders>
        <AgentFlowEditorPage
          applicationId="app-1"
          applicationName="Support Agent"
        />
      </AppProviders>
    );

    expect(await screen.findByRole('tab', { name: '配置' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '上次运行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '运行当前节点' })).toBeDisabled();
    expect(screen.getByTestId('agent-flow-editor-body')).toHaveClass(
      'agent-flow-editor__body--with-detail'
    );
  }, 20_000);
});
