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
import type { NormalizedFrontstageBlockCatalogEntry } from '../../lib/block-catalog';
import { FrontStagePage } from '../../pages/FrontStagePage';

const pageContentSaveHook = vi.hoisted(() => ({
  useFrontstagePageContentSave: vi.fn()
}));
const blockCatalogHook = vi.hoisted(() => ({
  useFrontstageBlockCatalog: vi.fn()
}));
const blockCodeHook = vi.hoisted(() => ({
  useFrontstageBlockCode: vi.fn()
}));

vi.mock(
  '../../hooks/use-frontstage-page-content-save',
  () => pageContentSaveHook
);
vi.mock('../../hooks/use-frontstage-block-catalog', () => blockCatalogHook);
vi.mock('../../hooks/use-frontstage-block-code', () => blockCodeHook);
vi.mock('../../components/BlockCodeEditorDrawer', () => ({
  BlockCodeEditorDrawer: ({
    open,
    workspaceId,
    pageId,
    block
  }: {
    open: boolean;
    workspaceId: string | null | undefined;
    pageId: string | null | undefined;
    block?: { id?: string; codeRef?: string | null } | null;
  }) =>
    open ? (
      <div role="dialog" aria-label="区块代码">
        <span>workspace:{workspaceId ?? 'none'}</span>
        <span>page:{pageId ?? 'none'}</span>
        <span>block:{block?.id ?? 'none'}</span>
        <span>code:{block?.codeRef ?? 'none'}</span>
      </div>
    ) : null
}));

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
    'x-layout': {
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

function createBlockPayloadWithLayout(
  blockId: string,
  order: number,
  layout: Record<string, unknown>
) {
  return {
    ...createBlockPayload(blockId, order),
    'x-layout': {
      order,
      region: 'main',
      ...layout
    }
  };
}

function createConfigurableBlockPayload() {
  return {
    id: 'hero',
    codeRef: 'hero-code',
    catalog: {
      providerCode: 'official',
      installationId: 'installation-1'
    },
    contribution: {
      pluginId: 'official.blocks',
      pluginVersion: '1.0.0',
      code: 'hero.banner'
    },
    props: {
      title: 'Configured title',
      data: {
        model: 'orders',
        fields: ['id', 'title'],
        operations: {
          query: true,
          update: true
        },
        pagination: { pageSize: 20 }
      }
    },
    'x-layout': {
      order: 3,
      width: 12,
      height: 5,
      region: 'main'
    },
    runtime: {
      kind: 'js-ui',
      entry: 'blocks/hero/index.js',
      hint: 'js-ui'
    }
  };
}

function createCatalogEntry(): NormalizedFrontstageBlockCatalogEntry {
  return {
    id: 'official:hero.banner',
    runtimeKind: 'iframe',
    installationId: 'installation-1',
    providerCode: 'official',
    pluginId: 'official.blocks',
    pluginVersion: '1.0.0',
    contributionCode: 'hero.banner',
    title: 'Hero Banner',
    entry: 'blocks/hero/index.js',
    permissions: {
      network: 'none',
      storage: 'none',
      secrets: 'none'
    },
    contextContract: {
      primitives: ['text', 'data_record'],
      inputSchema: {
        type: 'object',
        properties: {
          recordId: { type: 'string' }
        }
      }
    },
    uiCapabilities: ['configurable', 'data_binding'],
    raw: {
      installation_id: 'installation-1',
      provider_code: 'official',
      plugin_id: 'official.blocks',
      plugin_version: '1.0.0',
      contribution_code: 'hero.banner',
      title: 'Hero Banner',
      runtime: 'iframe',
      entry: 'blocks/hero/index.js',
      context_contract: {
        primitives: ['text', 'data_record'],
        input_schema: {
          type: 'object'
        }
      },
      permissions: {
        network: 'none',
        storage: 'none',
        secrets: 'none'
      },
      ui_capabilities: ['configurable', 'data_binding']
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

function createPageContentWithBlockPayloads(
  blocks: Array<Record<string, unknown>>
): FrontstagePageContent {
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

function mockFrontstageBlockCatalog(
  items: NormalizedFrontstageBlockCatalogEntry[] = []
) {
  blockCatalogHook.useFrontstageBlockCatalog.mockReturnValue({
    items,
    diagnostics: [],
    loading: false,
    error: null
  });
}

function mockFrontstageBlockCode() {
  blockCodeHook.useFrontstageBlockCode.mockReturnValue({
    code: '',
    draft: '',
    dirty: false,
    loading: false,
    saving: false,
    error: null,
    setDraft: vi.fn(),
    reset: vi.fn(),
    save: vi.fn()
  });
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

function getPageTreeItem(title: string) {
  return screen.getByRole('button', {
    name: new RegExp(`${escapeRegExp(title)}\\s+页面节点`)
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
    mockFrontstageBlockCatalog();
    mockFrontstageBlockCode();
  });

  test('saves selected block deletion and falls back to the next block', async () => {
    authenticate(['frontstage.page.design']);
    const saveState = mockPageContentSaveState();
    renderFrontStagePage(
      createPageContentWithBlocks(['hero', 'feature', 'cta'])
    );

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
    renderFrontStagePage(
      createPageContentWithBlocks(['hero', 'feature', 'cta'])
    );

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
    expect(getSavedBlockIds(moveDownInput)).toEqual(['hero', 'cta', 'feature']);

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

  test('saves selected block layout dimensions and keeps selection', async () => {
    authenticate(['frontstage.page.design']);
    const saveState = mockPageContentSaveState();
    renderFrontStagePage(
      createPageContentWithBlockPayloads([
        createBlockPayloadWithLayout('hero', 0, { width: 12, height: 4 }),
        createBlockPayload('cta', 1)
      ])
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.change(
      within(getSelectedBlockActions()).getByLabelText('区块宽度'),
      { target: { value: '16' } }
    );

    await waitFor(() => {
      expect(saveState.save).toHaveBeenCalledTimes(1);
    });

    const [saveInput] = saveState.save.mock.calls[0] as [
      SaveFrontstagePageContentInput
    ];
    const [heroBlock, ctaBlock] = getSavedBlocks(saveInput);
    expect(heroBlock['x-layout']).toMatchObject({
      order: 0,
      region: 'main',
      width: 16,
      height: 4
    });
    expect(ctaBlock['x-layout']).toMatchObject({ order: 1, region: 'main' });
    expect(heroBlock).not.toHaveProperty('layout');
    expect(ctaBlock).not.toHaveProperty('layout');

    await waitFor(() => {
      expect(getSelectedBlockActions()).toHaveTextContent('当前选中区块：hero');
    });
  });

  test('disables selected block arrange actions while page content is saving', () => {
    authenticate(['frontstage.page.design']);
    mockPageContentSaveState({ saving: true, isPending: true });
    renderFrontStagePage(
      createPageContentWithBlocks(['hero', 'feature', 'cta'])
    );

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
    expect(within(actions).getByLabelText('区块宽度')).toBeDisabled();
    expect(within(actions).getByLabelText('区块高度')).toBeDisabled();
    expect(screen.getByText('区块保存中')).toBeInTheDocument();
  });

  test('opens block code editor drawer for the selected block in design mode', async () => {
    authenticate(['frontstage.page.design']);
    renderFrontStagePage(createPageContentWithBlocks(['hero', 'cta']));

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '编辑代码'
      })
    );

    const dialog = await screen.findByRole('dialog', { name: '区块代码' });
    expect(
      within(dialog).getByText('workspace:workspace-1')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('page:page-1')).toBeInTheDocument();
    expect(within(dialog).getByText('block:hero')).toBeInTheDocument();
    expect(within(dialog).getByText('code:hero-code')).toBeInTheDocument();
  });

  test('hides block code editor entry outside design mode and without design permission', () => {
    authenticate(['frontstage.page.design']);
    const view = renderFrontStagePage(createPageContentWithBlocks(['hero']));

    fireEvent.click(getBlockRow('hero'));
    expect(
      screen.queryByRole('button', { name: '编辑代码' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    expect(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '编辑代码'
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    expect(
      screen.queryByRole('button', { name: '编辑代码' })
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
          pageContent={createPageContentWithBlocks(['hero'])}
        />
      </AppProviders>
    );

    expect(
      screen.queryByRole('button', { name: '编辑代码' })
    ).not.toBeInTheDocument();
  });

  test('shows block configuration entry only for a selected block in design mode with design permission', () => {
    authenticate(['frontstage.page.design']);
    const view = renderFrontStagePage(createPageContentWithBlocks(['hero']));

    fireEvent.click(getBlockRow('hero'));
    expect(
      screen.queryByRole('button', { name: '配置区块' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    expect(
      screen.queryByRole('button', { name: '配置区块' })
    ).not.toBeInTheDocument();

    fireEvent.click(getBlockRow('hero'));
    expect(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '配置区块'
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    expect(
      screen.queryByRole('button', { name: '配置区块' })
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
          pageContent={createPageContentWithBlocks(['hero'])}
        />
      </AppProviders>
    );

    expect(
      screen.queryByRole('button', { name: '配置区块' })
    ).not.toBeInTheDocument();
  });

  test('opens readonly block configuration drawer from the selected block model', async () => {
    authenticate(['frontstage.page.design']);
    mockFrontstageBlockCatalog([createCatalogEntry()]);
    renderFrontStagePage(
      createPageContentWithBlockPayloads([createConfigurableBlockPayload()])
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '配置区块'
      })
    );

    const dialog = await screen.findByRole('dialog', { name: '区块配置' });
    const basicSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-basic'
    );
    expect(basicSection).toHaveTextContent('hero');
    expect(basicSection).toHaveTextContent('hero-code');
    expect(basicSection).toHaveTextContent('Width12');
    expect(basicSection).toHaveTextContent('Height5');
    expect(basicSection).toHaveTextContent('Order0');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Data' }));
    const dataSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-data'
    );
    expect(dataSection).toHaveTextContent('orders');
    expect(dataSection).toHaveTextContent('2 fields');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Code' }));
    const codeSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-code'
    );
    expect(codeSection).toHaveTextContent('js-ui');
    expect(codeSection).toHaveTextContent('blocks/hero/index.js');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Context' }));
    const contextSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-context'
    );
    expect(contextSection).toHaveTextContent('CatalogMatched');
    expect(contextSection).toHaveTextContent('text');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Limits' }));
    const limitsSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-limits'
    );
    expect(limitsSection).toHaveTextContent('Timeout1000 ms');
    expect(limitsSection).toHaveTextContent('Max render depth8');
  });

  test('closes block configuration drawer when exiting design mode, switching pages, or clearing selection', async () => {
    authenticate(['frontstage.page.design']);
    const pageTree = [
      {
        id: 'page-1',
        title: '页面 page-1',
        kind: 'page' as const
      },
      {
        id: 'page-2',
        title: '页面 page-2',
        kind: 'page' as const
      }
    ];
    const view = render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-1"
          initialPageTree={pageTree}
          pageContent={createPageContentWithBlocks(['hero'])}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '配置区块'
      })
    );
    expect(
      await screen.findByRole('dialog', { name: '区块配置' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '区块配置' })
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '配置区块'
      })
    );
    expect(
      await screen.findByRole('dialog', { name: '区块配置' })
    ).toBeInTheDocument();

    fireEvent.click(getBlockRow('hero'));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '区块配置' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('frontstage-selected-block-actions')
      ).not.toBeInTheDocument();
    });

    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '配置区块'
      })
    );
    expect(
      await screen.findByRole('dialog', { name: '区块配置' })
    ).toBeInTheDocument();

    fireEvent.click(getPageTreeItem('页面 page-2'));
    view.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-2"
          initialPageTree={pageTree}
          pageContent={createPageContent({
            page: {
              id: 'page-2',
              title: 'Second',
              kind: 'page',
              parentId: null,
              rank: '002000',
              schemaRootUid: 'root-2'
            },
            schema: {
              rootUid: 'root-2',
              payload: {}
            },
            root: {
              uid: 'root-2',
              payload: {}
            }
          })}
        />
      </AppProviders>
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '区块配置' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('frontstage-selected-block-actions')
      ).not.toBeInTheDocument();
    });
  }, 15000);

  test('closes block code editor drawer when exiting design mode or switching pages', async () => {
    authenticate(['frontstage.page.design']);
    const pageTree = [
      {
        id: 'page-1',
        title: '页面 page-1',
        kind: 'page' as const
      },
      {
        id: 'page-2',
        title: '页面 page-2',
        kind: 'page' as const
      }
    ];
    const view = render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-1"
          initialPageTree={pageTree}
          pageContent={createPageContentWithBlocks(['hero'])}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '编辑代码'
      })
    );
    expect(
      await screen.findByRole('dialog', { name: '区块代码' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '区块代码' })
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(getBlockRow('hero'));
    fireEvent.click(
      within(getSelectedBlockActions()).getByRole('button', {
        name: '编辑代码'
      })
    );
    expect(
      await screen.findByRole('dialog', { name: '区块代码' })
    ).toBeInTheDocument();

    fireEvent.click(getPageTreeItem('页面 page-2'));
    view.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-2"
          initialPageTree={pageTree}
          pageContent={createPageContent({
            page: {
              id: 'page-2',
              title: 'Second',
              kind: 'page',
              parentId: null,
              rank: '002000',
              schemaRootUid: 'root-2'
            },
            schema: {
              rootUid: 'root-2',
              payload: {}
            },
            root: {
              uid: 'root-2',
              payload: {}
            }
          })}
        />
      </AppProviders>
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '区块代码' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('frontstage-selected-block-actions')
      ).not.toBeInTheDocument();
    });
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

  test('does not show selected block arrange actions in browsing mode or without design permission', () => {
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
  });
});
