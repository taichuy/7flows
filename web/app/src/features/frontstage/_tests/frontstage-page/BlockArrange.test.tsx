import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../../state/auth-store';
import type {
  FrontstagePageContent,
  SaveFrontstagePageContentInput
} from '../../api/page-content';
import { FrontStagePage } from '../../pages/FrontStagePage';

const pageContentSaveHook = vi.hoisted(() => ({
  useFrontstagePageContentSave: vi.fn()
}));

vi.mock('../../hooks/use-frontstage-page-content-save', () =>
  pageContentSaveHook
);

type FrontstagePageContentSaveState = {
  save: ReturnType<typeof vi.fn>;
  saving: boolean;
  isPending: boolean;
  error: Error | null;
  reset: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
};

function authenticate(permissions: string[]) {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: {
      id: 'actor-1',
      account: 'normal-user',
      effective_display_role: 'developer',
      current_workspace_id: 'workspace-1'
    },
    me: {
      id: 'user-1',
      account: 'normal-user',
      email: 'user@example.com',
      phone: null,
      nickname: 'Normal User',
      name: 'Normal User',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'developer',
      permissions
    }
  });
}

function createPageContent(
  overrides: Partial<FrontstagePageContent> = {}
): FrontstagePageContent {
  return {
    page: {
      id: 'page-1',
      title: 'Landing',
      kind: 'page',
      parentId: null,
      rank: '001000',
      schemaRootUid: 'root-1'
    },
    schema: {
      rootUid: 'root-1',
      payload: {}
    },
    root: {
      uid: 'root-1',
      payload: {}
    },
    ...overrides
  };
}

function createBlockPayload(blockId: string, order: number) {
  return {
    id: blockId,
    codeRef: `${blockId}-code`,
    catalog: {
      providerCode: null,
      installationId: null
    },
    contribution: {
      pluginId: null,
      pluginVersion: null,
      code: 'frontstage.js-ui-block'
    },
    props: {},
    layout: {
      order,
      region: 'main'
    },
    runtime: {
      kind: 'js-ui',
      entry: null,
      hint: 'js-ui'
    }
  };
}

function createPageContentWithBlocks(
  blockIds: string[]
): FrontstagePageContent {
  const blocks = blockIds.map((blockId, index) =>
    createBlockPayload(blockId, index)
  );

  return createPageContent({
    schema: {
      rootUid: 'root-1',
      payload: { blocks }
    },
    root: {
      uid: 'root-1',
      payload: { blocks }
    }
  });
}

function createSavedPageContentFromInput(
  input: SaveFrontstagePageContentInput
): FrontstagePageContent {
  return createPageContent({
    schema: {
      rootUid: 'root-1',
      payload: input.schema.payload
    },
    root: {
      uid: 'root-1',
      payload: input.root.payload
    }
  });
}

function mockPageContentSaveState(
  overrides: Partial<FrontstagePageContentSaveState> = {}
): FrontstagePageContentSaveState {
  const state = {
    save: vi.fn((input: SaveFrontstagePageContentInput) =>
      Promise.resolve(createSavedPageContentFromInput(input))
    ),
    saving: false,
    isPending: false,
    error: null,
    reset: vi.fn(),
    clearError: vi.fn(),
    ...overrides
  };

  pageContentSaveHook.useFrontstagePageContentSave.mockReturnValue(state);
  return state;
}

function renderFrontStagePage(pageContent: FrontstagePageContent) {
  return render(
    <AppProviders>
      <FrontStagePage
        workspaceId="workspace-1"
        pageId="page-1"
        initialPageTree={[
          {
            id: 'page-1',
            title: '页面 page-1',
            kind: 'page'
          }
        ]}
        pageContent={pageContent}
      />
    </AppProviders>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSavedBlocks(input: SaveFrontstagePageContentInput) {
  const payload = input.root.payload;
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('root payload must be an object');
  }

  const blocks = (payload as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) {
    throw new Error('root payload blocks must be an array');
  }

  return blocks as Array<Record<string, unknown>>;
}

function getSavedBlockIds(input: SaveFrontstagePageContentInput): unknown[] {
  return getSavedBlocks(input).map((block) => block.id);
}

function getBlockRow(blockId: string) {
  return screen.getByRole('button', {
    name: new RegExp(escapeRegExp(blockId))
  });
}

function getSelectedBlockActions() {
  return screen.getByTestId('frontstage-selected-block-actions');
}

describe('FrontStagePage block arrange actions', () => {
  beforeEach(() => {
    resetAuthStore();
    vi.clearAllMocks();
    mockPageContentSaveState();
  });

  test('saves selected block deletion and falls back to the next block', async () => {
    authenticate(['frontstage.page.design']);
    const saveState = mockPageContentSaveState();
    renderFrontStagePage(createPageContentWithBlocks(['hero', 'feature', 'cta']));

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('feature'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '删除区块'
      })
    );

    await waitFor(() => {
      expect(saveState.save).toHaveBeenCalledTimes(1);
    });

    const [saveInput] = saveState.save.mock.calls[0] as [
      SaveFrontstagePageContentInput
    ];
    expect(getSavedBlockIds(saveInput)).toEqual(['hero', 'cta']);

    await waitFor(() => {
      expect(screen.getByText('2 个区块')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /feature/ })
      ).not.toBeInTheDocument();
      expect(getSelectedBlockActions()).toHaveTextContent('当前选中区块：cta');
    });
  });

  test('clears selected block when deleting the only block', async () => {
    authenticate(['frontstage.page.design']);
    const saveState = mockPageContentSaveState();
    renderFrontStagePage(createPageContentWithBlocks(['hero']));

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '删除区块'
      })
    );

    await waitFor(() => {
      expect(saveState.save).toHaveBeenCalledTimes(1);
    });

    const [saveInput] = saveState.save.mock.calls[0] as [
      SaveFrontstagePageContentInput
    ];
    expect(getSavedBlockIds(saveInput)).toEqual([]);

    await waitFor(() => {
      expect(screen.getByText('页面内容为空')).toBeInTheDocument();
      expect(
        screen.queryByTestId('frontstage-selected-block-actions')
      ).not.toBeInTheDocument();
    });
  });

  test('saves selected block move down and move up while keeping selection', async () => {
    authenticate(['frontstage.page.design']);
    const saveState = mockPageContentSaveState();
    renderFrontStagePage(createPageContentWithBlocks(['hero', 'feature', 'cta']));

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('feature'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '下移区块'
      })
    );

    await waitFor(() => {
      expect(saveState.save).toHaveBeenCalledTimes(1);
    });

    const [moveDownInput] = saveState.save.mock.calls[0] as [
      SaveFrontstagePageContentInput
    ];
    expect(getSavedBlockIds(moveDownInput)).toEqual([
      'hero',
      'cta',
      'feature'
    ]);

    await waitFor(() => {
      expect(getSelectedBlockActions()).toHaveTextContent(
        '当前选中区块：feature'
      );
      expect(
        within(getSelectedBlockActions()).getByRole('button', {
          name: '上移区块'
        })
      ).toBeEnabled();
    });

    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '上移区块'
      })
    );

    await waitFor(() => {
      expect(saveState.save).toHaveBeenCalledTimes(2);
    });

    const [moveUpInput] = saveState.save.mock.calls[1] as [
      SaveFrontstagePageContentInput
    ];
    expect(getSavedBlockIds(moveUpInput)).toEqual(['hero', 'feature', 'cta']);
    expect(getSelectedBlockActions()).toHaveTextContent(
      '当前选中区块：feature'
    );
  });

  test('disables selected block arrange actions while page content is saving', () => {
    authenticate(['frontstage.page.design']);
    mockPageContentSaveState({ saving: true, isPending: true });
    renderFrontStagePage(createPageContentWithBlocks(['hero', 'feature', 'cta']));

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('feature'));

    const actions = getSelectedBlockActions();
    expect(
      within(actions).getByRole('button', { name: '上移区块' })
    ).toBeDisabled();
    expect(
      within(actions).getByRole('button', { name: '下移区块' })
    ).toBeDisabled();
    expect(
      within(actions).getByRole('button', { name: '删除区块' })
    ).toBeDisabled();
    expect(screen.getByText('区块保存中')).toBeInTheDocument();
  });

  test('shows a clear block arrange save error in design mode', async () => {
    authenticate(['frontstage.page.design']);
    mockPageContentSaveState({
      save: vi.fn(() => Promise.reject(new Error('arrange failed')))
    });
    renderFrontStagePage(createPageContentWithBlocks(['hero', 'cta']));

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('cta'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '上移区块'
      })
    );

    expect(await screen.findByText('区块保存失败')).toBeInTheDocument();
    expect(screen.getByText('arrange failed')).toBeInTheDocument();
    expect(getSelectedBlockActions()).toHaveTextContent('当前选中区块：cta');
  });

  test(
    'does not show selected block arrange actions in browsing mode or without design permission',
    () => {
      authenticate(['frontstage.page.design']);
      const view = renderFrontStagePage(
        createPageContentWithBlocks(['hero', 'cta'])
      );

      fireEvent.click(getBlockRow('hero'));
      expect(
        screen.queryByTestId('frontstage-selected-block-actions')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '删除区块' })
      ).not.toBeInTheDocument();

      resetAuthStore();
      authenticate(['route_page.view.all']);
      view.rerender(
        <AppProviders>
          <FrontStagePage
            workspaceId="workspace-1"
            pageId="page-1"
            initialPageTree={[
              {
                id: 'page-1',
                title: '页面 page-1',
                kind: 'page'
              }
            ]}
            pageContent={createPageContentWithBlocks(['hero', 'cta'])}
          />
        </AppProviders>
      );

      expect(
        screen.queryByRole('button', { name: '进入设计模式' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('frontstage-selected-block-actions')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '删除区块' })
      ).not.toBeInTheDocument();
    }
  );
});
