import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';
import { VersionHistoryDrawer } from '../components/history/VersionHistoryDrawer';
import { AgentFlowEditorShell } from '../components/editor/AgentFlowEditorShell';
import { useEditorAutosave } from '../hooks/useEditorAutosave';

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

function AutosaveHarness({
  document,
  lastSavedDocument,
  onSave
}: {
  document: ReturnType<typeof createDefaultAgentFlowDocument>;
  lastSavedDocument: ReturnType<typeof createDefaultAgentFlowDocument>;
  onSave: (input: {
    document: ReturnType<typeof createDefaultAgentFlowDocument>;
    change_kind: 'layout' | 'logical';
    summary: string;
  }) => Promise<void>;
}) {
  const status = useEditorAutosave({
    document,
    lastSavedDocument,
    onSave
  });

  return <span>{status}</span>;
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

    expect(await screen.findByText('Start')).toBeInTheDocument();
    expect(screen.getAllByText('LLM').length).toBeGreaterThan(0);
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布配置' })).toBeInTheDocument();
  });

  test('sends layout changes without appending history', async () => {
    vi.useFakeTimers();
    const lastSavedDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const layoutChangedDocument = {
      ...lastSavedDocument,
      editor: {
        ...lastSavedDocument.editor,
        viewport: { x: 120, y: 48, zoom: 0.85 }
      }
    };
    const saveDraft = vi.fn().mockResolvedValue(undefined);

    render(
      <AutosaveHarness
        document={layoutChangedDocument}
        lastSavedDocument={lastSavedDocument}
        onSave={saveDraft}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ change_kind: 'layout' })
    );
  });

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
  });

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
});
