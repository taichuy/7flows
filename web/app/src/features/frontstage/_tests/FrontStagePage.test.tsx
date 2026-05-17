import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import type {
  FrontstagePageContent,
  SaveFrontstagePageContentInput
} from '../api/page-content';
import type { NormalizedFrontstageBlockCatalogEntry } from '../lib/block-catalog';
import { createFrontstageBuiltInJsBlockTemplateCode } from '../lib/block-templates';
import {
  insertPageIntoGroup,
  moveNodeInTree,
  removeNodeFromTree,
  renameNodeInTree
} from '../lib/page-tree';
import { FrontStagePage } from '../pages/FrontStagePage';

const pageContentSaveHook = vi.hoisted(() => ({ useFrontstagePageContentSave: vi.fn() }));
const blockCatalogHook = vi.hoisted(() => ({ useFrontstageBlockCatalog: vi.fn() }));
const blockCodeHook = vi.hoisted(() => ({ useFrontstageBlockCode: vi.fn() }));
const blockCodeApi = vi.hoisted(() => ({
  fetchFrontstageBlockCode: vi.fn((_workspaceId: string, pageId: string, codeRef: string) => Promise.resolve({ pageId, codeRef, code: 'export default {}' })),
  frontstageBlockCodeQueryKey: vi.fn((workspaceId: string, pageId: string, codeRef: string) => ['frontstage', workspaceId, 'pages', pageId, 'block-code', codeRef] as const),
  saveFrontstageBlockCode: vi.fn()
}));

vi.mock('../hooks/use-frontstage-page-content-save', () => pageContentSaveHook);
vi.mock('../hooks/use-frontstage-block-catalog', () => blockCatalogHook);
vi.mock('../hooks/use-frontstage-block-code', () => blockCodeHook);
vi.mock('../api/block-code', () => blockCodeApi);

type TestFrontStageTreeNode = {
  id: string;
  title: string | null;
  kind: 'group' | 'page';
  children?: TestFrontStageTreeNode[];
};

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

function createBackendPage(pageId: string): TestFrontStageTreeNode {
  return {
    id: pageId,
    title: `页面 ${pageId}`,
    kind: 'page'
  };
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

function createTestNodeId() {
  return crypto.randomUUID();
}

function FrontStagePageHarness({
  workspaceId = 'workspace-1',
  pageId,
  onNavigatePage,
  initialPageTree,
  pageContent,
  isPageContentLoading,
  hasPageContentLoadError
}: {
  workspaceId?: string;
  pageId?: string;
  onNavigatePage?: (pageId?: string) => void;
  initialPageTree?: TestFrontStageTreeNode[];
  pageContent?: FrontstagePageContent;
  isPageContentLoading?: boolean;
  hasPageContentLoadError?: boolean;
}) {
  const [pageTree, setPageTree] = useState<TestFrontStageTreeNode[]>(
    initialPageTree ?? []
  );

  return (
    <FrontStagePage
      workspaceId={workspaceId}
      pageId={pageId}
      onNavigatePage={onNavigatePage}
      initialPageTree={pageTree}
      pageContent={pageContent}
      isPageContentLoading={isPageContentLoading}
      hasPageContentLoadError={hasPageContentLoadError}
      onCreateGroupNode={(input) => {
        const groupNode = {
          id: createTestNodeId(),
          title: input.title,
          kind: 'group' as const,
          children: []
        };
        setPageTree((currentTree) => [...currentTree, groupNode]);
        return Promise.resolve({ id: groupNode.id, kind: groupNode.kind });
      }}
      onCreatePageNode={(input) => {
        const pageNode = {
          id: createTestNodeId(),
          title: input.title,
          kind: 'page' as const
        };
        setPageTree((currentTree) =>
          input.parentId
            ? insertPageIntoGroup(currentTree, input.parentId, pageNode)
            : [...currentTree, pageNode]
        );
        return Promise.resolve({ id: pageNode.id, kind: pageNode.kind });
      }}
      onRenamePageNode={(nodeId, input) => {
        setPageTree((currentTree) =>
          renameNodeInTree(currentTree, nodeId, input.title ?? '')
        );
        return Promise.resolve({ id: nodeId, kind: 'page' });
      }}
      onMovePageNode={(nodeId, input) => {
        setPageTree((currentTree) =>
          moveNodeInTree(currentTree, nodeId, input.rank === '000000' ? -1 : 1)
        );
        return Promise.resolve({ id: nodeId, kind: 'page' });
      }}
      onDeletePageNode={(nodeId) => {
        setPageTree((currentTree) => removeNodeFromTree(currentTree, nodeId));
        return Promise.resolve();
      }}
    />
  );
}

function renderPage(
  pageId?: string,
  onNavigatePage?: (pageId?: string) => void
) {
  return render(
    <AppProviders>
      <FrontStagePageHarness
        pageId={pageId}
        onNavigatePage={onNavigatePage}
        initialPageTree={pageId ? [createBackendPage(pageId)] : undefined}
      />
    </AppProviders>
  );
}

function renderPageWithInitialTree(
  pageTree: TestFrontStageTreeNode[],
  pageId?: string,
  onNavigatePage?: (pageId?: string) => void
) {
  return render(
    <AppProviders>
      <FrontStagePageHarness
        pageId={pageId}
        onNavigatePage={onNavigatePage}
        initialPageTree={pageTree}
      />
    </AppProviders>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPageTreeItem(title: string) {
  return screen.getByRole('button', {
    name: new RegExp(`${escapeRegExp(title)}\\s+页面节点`)
  });
}

function getGroupTreeItem(title: string) {
  return screen.getByTestId(`frontstage-tree-node-group-${title}`);
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

function createCatalogEntry(
  overrides: Partial<NormalizedFrontstageBlockCatalogEntry> = {}
): NormalizedFrontstageBlockCatalogEntry {
  return {
    id: '1flowbase:frontstage.js-ui-block',
    runtimeKind: 'iframe',
    installationId: 'builtin-installation',
    providerCode: '1flowbase',
    pluginId: 'builtin-frontstage',
    pluginVersion: '1.0.0',
    contributionCode: 'frontstage.js-ui-block',
    title: '空白 JS Block',
    entry: 'index.js',
    permissions: {
      network: 'none',
      storage: 'none',
      secrets: 'none'
    },
    contextContract: {
      primitives: [],
      inputSchema: {}
    },
    uiCapabilities: [],
    raw: {} as NormalizedFrontstageBlockCatalogEntry['raw'],
    ...overrides
  };
}

function createCatalogMatchedBlockPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'frontstage-js-block-1',
    codeRef: 'frontstage-js-block-1-code',
    catalog: {
      providerCode: '1flowbase',
      installationId: 'builtin-installation'
    },
    contribution: {
      pluginId: 'builtin-frontstage',
      pluginVersion: '1.0.0',
      code: 'frontstage.js-ui-block'
    },
    props: {
      title: 'Landing hero'
    },
    'x-layout': {
      order: 0,
      region: 'main'
    },
    runtime: {
      kind: 'iframe',
      entry: 'index.js',
      hint: 'iframe'
    },
    ...overrides
  };
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

describe('FrontStagePage', () => {
  let confirmSpy: {
    mockRestore: () => void;
    mockReturnValue: (value: boolean) => unknown;
  };

  beforeEach(() => {
    resetAuthStore();
    vi.clearAllMocks();
    mockPageContentSaveState();
    mockFrontstageBlockCatalog();
    mockFrontstageBlockCode();
    blockCodeApi.saveFrontstageBlockCode.mockResolvedValue({
      pageId: 'page-1',
      codeRef: 'frontstage-js-block-1-code',
      code: 'saved template'
    });
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  test('shows page context and design mode is unavailable without permission', () => {
    authenticate(['route_page.view.all']);
    renderPage('page-1');

    expect(screen.getByText('Workspace：workspace-1')).toBeInTheDocument();
    expect(screen.getByText('页面 page-1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '进入设计模式' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '新增区块' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('当前页面：页面 page-1')).toBeInTheDocument();
  });

  test('toggles design mode button only when frontstage.page.design is granted', () => {
    authenticate(['frontstage.page.design']);
    renderPage('page-1');

    const designButton = screen.getByRole('button', { name: '进入设计模式' });
    expect(
      screen.queryByRole('button', { name: '新增区块' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '页面管理' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '当前页面设置' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'JS Block 试运行' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('页面树已同步')).not.toBeInTheDocument();

    fireEvent.click(designButton);
    expect(
      screen.getByRole('button', { name: '退出设计模式' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '新增区块' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '页面管理' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '当前页面设置' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'JS Block 试运行' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('页面树已同步')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '新建分组' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '新建页面' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    expect(
      screen.getByRole('button', { name: '进入设计模式' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '新增区块' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '页面管理' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '当前页面设置' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'JS Block 试运行' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('页面树已同步')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '新建分组' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '新建页面' })
    ).not.toBeInTheDocument();
  });

  test('shows real page tree operation states without local draft wording', () => {
    authenticate(['frontstage.page.design']);
    const view = render(
      <AppProviders>
        <FrontStagePage workspaceId="workspace-1" initialPageTree={[]} />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    expect(screen.getByText('页面树已同步')).toBeInTheDocument();
    expect(screen.queryByText(/本地草稿/)).not.toBeInTheDocument();

    view.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          initialPageTree={[]}
          isPageTreeMutating
        />
      </AppProviders>
    );
    expect(screen.getByText('保存中')).toBeInTheDocument();

    view.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          initialPageTree={[]}
          pageTreeMutationError={new Error('failed')}
        />
      </AppProviders>
    );
    expect(screen.getByText('操作失败')).toBeInTheDocument();
  });

  test('keeps mutation status scoped to design mode controls', () => {
    authenticate(['frontstage.page.design']);
    render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          initialPageTree={[]}
          isPageTreeMutating
        />
      </AppProviders>
    );

    const designButton = screen.getByRole('button', { name: '进入设计模式' });
    fireEvent.click(designButton);
    expect(screen.getByText('保存中')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    expect(screen.queryByText('保存中')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    expect(screen.getByText('保存中')).toBeInTheDocument();
  });

  test('saves selected catalog block and writes blank JS template code', async () => {
    authenticate(['frontstage.page.design']);
    mockFrontstageBlockCatalog([createCatalogEntry()]);
    const saveState = mockPageContentSaveState();

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent()}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新增区块' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择' }));

    await waitFor(() => {
      expect(saveState.save).toHaveBeenCalledTimes(1);
    });

    expect(
      pageContentSaveHook.useFrontstagePageContentSave
    ).toHaveBeenLastCalledWith({
      workspaceId: 'workspace-1',
      pageId: 'page-1'
    });

    const [saveInput] = saveState.save.mock.calls[0] as [
      SaveFrontstagePageContentInput
    ];
    const [block] = getSavedBlocks(saveInput);

    expect(block).toMatchObject({
      id: 'frontstage-js-block-1',
      codeRef: 'frontstage-js-block-1-code',
      catalog: {
        providerCode: '1flowbase',
        installationId: 'builtin-installation'
      },
      contribution: {
        pluginId: 'builtin-frontstage',
        pluginVersion: '1.0.0',
        code: 'frontstage.js-ui-block'
      },
      props: {},
      'x-layout': {
        order: 0,
        region: 'main'
      },
      runtime: {
        kind: 'iframe',
        entry: 'index.js',
        hint: 'iframe'
      }
    });
    expect(block).not.toHaveProperty('layout');
    expect(blockCodeApi.saveFrontstageBlockCode).toHaveBeenCalledWith(
      'workspace-1',
      'page-1',
      expect.objectContaining({
        codeRef: 'frontstage-js-block-1-code',
        code: createFrontstageBuiltInJsBlockTemplateCode({
          templateId: 'blank',
          blockId: 'frontstage-js-block-1',
          codeRef: 'frontstage-js-block-1-code',
          contributionCode: 'frontstage.js-ui-block'
        })
      }),
      'csrf-123'
    );
  });

  test.each([['Data Table', 'data-table'], ['Create Form', 'create-form']] as const)(
    'writes the selected %s JS template code when adding a block',
    async (templateName, templateId) => {
      authenticate(['frontstage.page.design']);
      mockFrontstageBlockCatalog([createCatalogEntry()]);
      mockPageContentSaveState();
      render(
        <AppProviders>
          <FrontStagePageHarness
            pageId="page-1"
            initialPageTree={[createBackendPage('page-1')]}
            pageContent={createPageContent()}
          />
        </AppProviders>
      );
      fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
      fireEvent.click(screen.getByRole('button', { name: '新增区块' }));
      fireEvent.click(await screen.findByRole('radio', { name: templateName }));
      fireEvent.click(screen.getByRole('button', { name: '选择' }));

      await waitFor(() =>
        expect(blockCodeApi.saveFrontstageBlockCode).toHaveBeenCalledTimes(1)
      );

      expect(blockCodeApi.saveFrontstageBlockCode).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        expect.objectContaining({
          code: createFrontstageBuiltInJsBlockTemplateCode({
            templateId,
            blockId: 'frontstage-js-block-1',
            codeRef: 'frontstage-js-block-1-code',
            contributionCode: 'frontstage.js-ui-block'
          })
        }),
        'csrf-123'
      );
    }
  );

  test('disables Add Block while page content is saving', () => {
    authenticate(['frontstage.page.design']);
    mockPageContentSaveState({ saving: true, isPending: true });

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent()}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    expect(screen.getByRole('button', { name: '新增区块' })).toBeDisabled();
    expect(screen.getByText('区块保存中')).toBeInTheDocument();
  });

  test('shows a clear Add Block save error in design mode', async () => {
    authenticate(['frontstage.page.design']);
    mockFrontstageBlockCatalog([createCatalogEntry()]);
    mockPageContentSaveState({
      save: vi.fn(() => Promise.reject(new Error('request failed')))
    });

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent()}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新增区块' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择' }));

    expect(await screen.findByText('区块保存失败')).toBeInTheDocument();
    expect(screen.getByText('request failed')).toBeInTheDocument();
  });

  test('shows a clear Add Block code template save error', async () => {
    authenticate(['frontstage.page.design']);
    mockFrontstageBlockCatalog([createCatalogEntry()]);
    mockPageContentSaveState();
    blockCodeApi.saveFrontstageBlockCode.mockRejectedValueOnce(
      new Error('code save failed')
    );

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent()}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新增区块' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择' }));

    expect(await screen.findByText('区块保存失败')).toBeInTheDocument();
    expect(screen.getByText('code save failed')).toBeInTheDocument();
    expect(screen.queryByText('1 个区块')).not.toBeInTheDocument();
  });

  test('disables Add Block when no page or no page content is available', () => {
    authenticate(['frontstage.page.design']);
    const view = render(
      <AppProviders>
        <FrontStagePageHarness />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    expect(screen.getByRole('button', { name: '新增区块' })).toBeDisabled();

    view.rerender(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
        />
      </AppProviders>
    );

    expect(screen.getByRole('button', { name: '新增区块' })).toBeDisabled();
  });

  test('renders and selects the new block after Add Block save succeeds', async () => {
    authenticate(['frontstage.page.design']);
    mockFrontstageBlockCatalog([createCatalogEntry()]);
    mockPageContentSaveState();

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent()}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新增区块' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择' }));

    await waitFor(() => {
      expect(screen.getByText('1 个区块')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /frontstage-js-block-1/ })
    ).toBeInTheDocument();
    expect(screen.getByText('已选区块')).toBeInTheDocument();
    expect(screen.getAllByText('frontstage-js-block-1')).toHaveLength(2);
  });

  test('supports adding and deleting page tree nodes in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    expect(screen.getByText('分组 1')).toBeInTheDocument();
    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();

    const pageListItem = getPageTreeItem('页面 新建 1');
    fireEvent.click(
      within(pageListItem).getByRole('button', { name: /删\s*除/ })
    );

    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
  });

  test('creates page through page tree mutation callback without local fake node', async () => {
    authenticate(['frontstage.page.design']);
    let resolveCreatePage: (() => void) | undefined;
    const createPagePromise = new Promise<void>((resolve) => {
      resolveCreatePage = resolve;
    });
    const onCreatePageNode = vi.fn(() => createPagePromise);

    render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          initialPageTree={[]}
          onCreatePageNode={onCreatePageNode}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    await waitFor(() => {
      expect(onCreatePageNode).toHaveBeenCalledWith({
        title: '页面 新建 1',
        parentId: null,
        rank: '001000'
      });
    });
    expect(screen.getByText('保存中')).toBeInTheDocument();
    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();

    await act(async () => {
      resolveCreatePage?.();
      await createPagePromise;
    });

    expect(screen.getByText('页面树已同步')).toBeInTheDocument();
    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
  });

  test('renames and deletes through page tree mutation callbacks', async () => {
    authenticate(['frontstage.page.design']);
    const onRenamePageNode = vi.fn().mockResolvedValue(undefined);
    const onDeletePageNode = vi.fn().mockResolvedValue(undefined);

    render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          onRenamePageNode={onRenamePageNode}
          onDeletePageNode={onDeletePageNode}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('页面-已重命名');

    try {
      const pageItem = getPageTreeItem('页面 page-1');

      fireEvent.click(within(pageItem).getByRole('button', { name: '重命名' }));
      await waitFor(() => {
        expect(onRenamePageNode).toHaveBeenCalledWith('page-1', {
          title: '页面-已重命名'
        });
      });
      await waitFor(() => {
        expect(screen.getByText('页面树已同步')).toBeInTheDocument();
      });
      expect(screen.queryByText('页面-已重命名')).not.toBeInTheDocument();

      const deleteButton = within(pageItem).getByRole('button', {
        name: /删\s*除/
      });
      await waitFor(() => {
        expect(deleteButton).toBeEnabled();
      });
      fireEvent.click(deleteButton);
      await waitFor(() => {
        expect(onDeletePageNode).toHaveBeenCalledWith('page-1');
      });
      expect(screen.getByText('页面 page-1')).toBeInTheDocument();
    } finally {
      promptSpy.mockRestore();
    }
  });

  test('moves nodes through page tree mutation callback', async () => {
    authenticate(['frontstage.page.design']);
    const onMovePageNode = vi.fn().mockResolvedValue(undefined);

    render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          initialPageTree={[
            createBackendPage('page-1'),
            createBackendPage('page-2')
          ]}
          onMovePageNode={onMovePageNode}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    const secondPageItem = getPageTreeItem('页面 page-2');
    fireEvent.click(
      within(secondPageItem).getByRole('button', { name: /上\s*移/ })
    );

    await waitFor(() => {
      expect(onMovePageNode).toHaveBeenCalledWith('page-2', {
        parentId: null,
        rank: '000000'
      });
    });

    const rows = screen.getAllByRole('button', {
      name: /页面 page-\d+ 页面节点/
    });
    expect(rows[0]).toHaveTextContent('页面 page-1');
    expect(rows[1]).toHaveTextContent('页面 page-2');
  });

  test('does not delete node when delete confirmation is canceled', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const pageItem = getPageTreeItem('页面 新建 1');

    confirmSpy.mockReturnValue(false);
    fireEvent.click(within(pageItem).getByRole('button', { name: /删\s*除/ }));

    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();
    expect(screen.getByText('分组 1')).toBeInTheDocument();
  });

  test('generates unique page id when existing page ids conflict', () => {
    authenticate(['frontstage.page.design']);

    renderPageWithInitialTree([
      {
        id: 'page-1',
        title: '页面 page-1',
        kind: 'page'
      }
    ]);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();
  });

  test('adds page under group in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    const groupContainer = getGroupTreeItem('分组 1');

    fireEvent.click(
      within(groupContainer).getByRole('button', { name: '组内新增页面' })
    );

    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();
  });

  test('generates unique group id when existing group ids conflict', () => {
    authenticate(['frontstage.page.design']);

    renderPageWithInitialTree([
      {
        id: 'group-1',
        title: '分组 1',
        kind: 'group',
        children: []
      }
    ]);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    expect(screen.getByText('分组 2')).toBeInTheDocument();
  });

  test('only allows adding a page into top-level groups', () => {
    authenticate(['frontstage.page.design']);

    renderPageWithInitialTree([
      {
        id: 'group-root',
        title: '分组 一级',
        kind: 'group',
        children: [
          {
            id: 'group-nested',
            title: '分组 二级',
            kind: 'group',
            children: [
              {
                id: 'page-inside-nested',
                title: '页面 嵌套',
                kind: 'page'
              }
            ]
          }
        ]
      }
    ]);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    const rootGroupItem = getGroupTreeItem('分组 一级');

    expect(
      within(rootGroupItem).getByRole('button', { name: '组内新增页面' })
    ).toBeInTheDocument();
    expect(screen.queryByText('分组 二级')).not.toBeInTheDocument();
    expect(screen.getByText('页面 嵌套')).toBeInTheDocument();
  });

  test('supports page order move controls in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const initialTreeRows = screen.getAllByRole('button', {
      name: /页面 新建 \d+ 页面节点/
    });
    expect(initialTreeRows[0]).toHaveTextContent('页面 新建 1');
    expect(initialTreeRows[1]).toHaveTextContent('页面 新建 2');

    const secondRowUpButton = within(initialTreeRows[1]).getByRole('button', {
      name: /上\s*移/
    });
    const firstRowDownButton = within(initialTreeRows[0]).getByRole('button', {
      name: /下\s*移/
    });

    expect(secondRowUpButton).toBeEnabled();
    expect(firstRowDownButton).toBeEnabled();

    fireEvent.click(secondRowUpButton);

    const movedUpRows = screen.getAllByRole('button', {
      name: /页面 新建 \d+ 页面节点/
    });
    expect(movedUpRows[0]).toHaveTextContent('页面 新建 2');
    expect(movedUpRows[1]).toHaveTextContent('页面 新建 1');

    const firstRowUpButton = within(movedUpRows[0]).getByRole('button', {
      name: /上\s*移/
    });
    const secondRowDownButton = within(movedUpRows[1]).getByRole('button', {
      name: /下\s*移/
    });

    expect(firstRowUpButton).toBeDisabled();
    expect(secondRowDownButton).toBeDisabled();

    const movedDownButton = within(movedUpRows[0]).getByRole('button', {
      name: /下\s*移/
    });
    fireEvent.click(movedDownButton);

    const movedDownRows = screen.getAllByRole('button', {
      name: /页面 新建 \d+ 页面节点/
    });
    expect(movedDownRows[0]).toHaveTextContent('页面 新建 1');
    expect(movedDownRows[1]).toHaveTextContent('页面 新建 2');
  });

  test('deletes group and cascades child pages', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    const groupItem = getGroupTreeItem('分组 1');

    fireEvent.click(
      within(groupItem).getByRole('button', { name: '组内新增页面' })
    );
    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();

    const [groupDeleteButton] = within(groupItem).getAllByRole('button', {
      name: /删\s*除/
    });
    fireEvent.click(groupDeleteButton);

    expect(screen.queryByText('分组 1')).not.toBeInTheDocument();
    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
  });

  test('falls back to first available page when selected page is deleted by parent group', async () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage(undefined, onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    const groupItem = getGroupTreeItem('分组 1');

    fireEvent.click(
      within(groupItem).getByRole('button', { name: '组内新增页面' })
    );
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    await waitFor(() => {
      expect(screen.getByText('当前页面：页面 新建 2')).toBeInTheDocument();
    });
    const rootPageId = onNavigatePage.mock.calls.at(-1)?.[0] as
      | string
      | undefined;

    const groupItemForDelete = getGroupTreeItem('分组 1');

    const [groupDeleteButton] = within(groupItemForDelete).getAllByRole(
      'button',
      {
        name: /删\s*除/
      }
    );
    fireEvent.click(groupDeleteButton);

    await waitFor(() => {
      expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
      expect(screen.getByText('当前页面：页面 新建 2')).toBeInTheDocument();
      expect(onNavigatePage).toHaveBeenLastCalledWith(rootPageId);
    });
  });

  test('falls back to workspace-level route when selected nested group is deleted and no pages remain', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPageWithInitialTree(
      [
        {
          id: 'group-root',
          title: '分组 一级',
          kind: 'group',
          children: [
            {
              id: 'group-inner',
              title: '分组 二级',
              kind: 'group',
              children: [
                {
                  id: 'page-inside',
                  title: '页面 嵌套',
                  kind: 'page'
                }
              ]
            }
          ]
        }
      ],
      'page-inside',
      onNavigatePage
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    const rootGroup = getGroupTreeItem('分组 一级');

    const [rootGroupDeleteButton] = within(rootGroup).getAllByRole('button', {
      name: /删\s*除/
    });
    fireEvent.click(rootGroupDeleteButton);

    expect(screen.queryByText('页面 嵌套')).not.toBeInTheDocument();
    expect(screen.getByText('当前未选中页面')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith(undefined);
  });

  test('renames node title in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('页面-已重命名');

    try {
      const pageItem = getPageTreeItem('页面 新建 1');

      fireEvent.click(within(pageItem).getByRole('button', { name: '重命名' }));
      expect(screen.getByText('页面-已重命名')).toBeInTheDocument();
    } finally {
      promptSpy.mockRestore();
    }
  });

  test('allows renaming node title to empty string', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('');

    try {
      const pageItem = getPageTreeItem('页面 新建 1');

      fireEvent.click(within(pageItem).getByRole('button', { name: '重命名' }));
      expect(screen.getByText('未命名页面')).toBeInTheDocument();
      expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
    } finally {
      promptSpy.mockRestore();
    }
  });

  test('renaming a node passes current title into the prompt default value', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockImplementation((title, defaultValue) => {
        expect(title).toBe('重命名节点');
        expect(defaultValue).toBe('页面 新建 1');
        return '页面 新建 1';
      });

    try {
      const pageItem = getPageTreeItem('页面 新建 1');

      fireEvent.click(within(pageItem).getByRole('button', { name: '重命名' }));
      expect(promptSpy).toHaveBeenCalledTimes(1);
    } finally {
      promptSpy.mockRestore();
    }
  });

  test('navigates to created page when entering pageId-less frontstage route', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage(undefined, onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    expect(onNavigatePage).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    );
  });

  test('falls back to first page when deleting selected page', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage(undefined, onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    const firstPageId = onNavigatePage.mock.calls[0]?.[0] as string | undefined;

    const secondPageItem = getPageTreeItem('页面 新建 2');

    fireEvent.click(
      within(secondPageItem).getByRole('button', { name: /删\s*除/ })
    );
    expect(screen.getByText('当前页面：页面 新建 1')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith(firstPageId);
  });

  test('navigates to workspace-level frontstage route when all pages are deleted', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage('page-1', onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    const pageItem = getPageTreeItem('页面 page-1');
    fireEvent.click(within(pageItem).getByRole('button', { name: /删\s*除/ }));

    expect(onNavigatePage).toHaveBeenCalledWith(undefined);
  });

  test('falls back to first page when route pageId is missing from current tree', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();
    const backendTree = [createBackendPage('page-1')];

    const view = render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-1"
          onNavigatePage={onNavigatePage}
          initialPageTree={backendTree}
        />
      </AppProviders>
    );

    onNavigatePage.mockReset();
    view.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="non-existent-page"
          onNavigatePage={onNavigatePage}
          initialPageTree={backendTree}
        />
      </AppProviders>
    );

    expect(screen.getByText('当前页面：页面 page-1')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith('page-1');
  });

  test('navigates to workspace-level route when initial tree is empty and pageId is invalid', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPageWithInitialTree([], 'invalid-page-id', onNavigatePage);

    expect(screen.getByText('当前未选中页面')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith(undefined);
  });

  test('synchronizes page tree when initialPageTree updates', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();
    const view = render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          onNavigatePage={onNavigatePage}
        />
      </AppProviders>
    );

    expect(screen.getByText('当前未选中页面')).toBeInTheDocument();
    expect(screen.queryByText('分组 一级')).not.toBeInTheDocument();
    expect(onNavigatePage).not.toHaveBeenCalled();

    view.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          onNavigatePage={onNavigatePage}
          initialPageTree={[
            {
              id: 'group-root',
              title: '分组 一级',
              kind: 'group',
              children: [
                {
                  id: 'group-inner',
                  title: '分组 二级',
                  kind: 'group',
                  children: [
                    {
                      id: 'page-1',
                      title: '页面 内页',
                      kind: 'page'
                    }
                  ]
                }
              ]
            }
          ]}
        />
      </AppProviders>
    );

    expect(screen.getByText('分组 一级')).toBeInTheDocument();
    expect(screen.queryByText('分组 二级')).not.toBeInTheDocument();
    expect(screen.getByText('页面 内页')).toBeInTheDocument();
    expect(screen.getByText('当前页面：页面 内页')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith('page-1');
  });

  test('shows manager shell and canvas placeholders', () => {
    authenticate(['frontstage.page.design']);
    renderPage('page-1');

    expect(
      screen.getByRole('heading', { name: '页面管理' })
    ).toBeInTheDocument();
    expect(screen.getByText('当前页面：页面 page-1')).toBeInTheDocument();
    expect(screen.getByText('未选择页面内容')).toBeInTheDocument();
    expect(screen.getByText('选择页面后将显示只读内容画布。')).toBeInTheDocument();
    expect(screen.getByText('页面 page-1')).toBeInTheDocument();
  });

  test('connects ready runtime run plan state into the PageCanvas slot', async () => {
    authenticate(['route_page.view.all']);
    mockFrontstageBlockCatalog([createCatalogEntry()]);

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent({
            root: {
              uid: 'root-1',
              payload: {
                blocks: [createCatalogMatchedBlockPayload()]
              }
            }
          })}
        />
      </AppProviders>
    );

    expect(await screen.findByText('运行计划已就绪')).toBeInTheDocument();
    const slots = within(screen.getByTestId('page-canvas-render-slots'))
      .getAllByRole('button');

    expect(slots[0]).toHaveTextContent('frontstage-js-block-1');
    expect(slots[0]).toHaveTextContent('代码已就绪');
    expect(slots[0]).toHaveTextContent('运行计划已就绪');
    expect(blockCodeApi.fetchFrontstageBlockCode).toHaveBeenCalledWith(
      'workspace-1',
      'page-1',
      'frontstage-js-block-1-code'
    );
  });

  test('surfaces catalog-missing runtime run plan state from the PageCanvas container', async () => {
    authenticate(['route_page.view.all']);
    mockFrontstageBlockCatalog([]);

    render(
      <AppProviders>
        <FrontStagePageHarness
          pageId="page-1"
          initialPageTree={[createBackendPage('page-1')]}
          pageContent={createPageContent({
            root: {
              uid: 'root-1',
              payload: {
                blocks: [createCatalogMatchedBlockPayload()]
              }
            }
          })}
        />
      </AppProviders>
    );

    expect(await screen.findByText('Catalog 未匹配')).toBeInTheDocument();
    const slots = within(screen.getByTestId('page-canvas-render-slots'))
      .getAllByRole('button');

    expect(slots[0]).toHaveTextContent('frontstage-js-block-1');
    expect(slots[0]).toHaveTextContent('代码已就绪');
    expect(slots[0]).toHaveTextContent('Catalog 未匹配');
  });

  test('shows empty page tree state when pageId is absent', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    expect(screen.getByText('当前未选中页面')).toBeInTheDocument();
    expect(
      screen.getByText(
        '当前工作区页面树为空。请在设计态创建页面后将显示树结构。'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Workspace：workspace-1')).toBeInTheDocument();
  });

  test('supports nullable page title from initial tree', () => {
    authenticate(['frontstage.page.design']);

    renderPageWithInitialTree([
      {
        id: 'page-null-title',
        title: null,
        kind: 'page'
      }
    ]);

    expect(screen.getByText('未命名页面')).toBeInTheDocument();
  });

  test('uses tree page title as current page label and page header title', () => {
    authenticate(['frontstage.page.design']);

    renderPageWithInitialTree([
      {
        id: 'page-custom-title',
        title: '我的自定义主页',
        kind: 'page'
      }
    ]);

    expect(screen.getByRole('list')).toHaveTextContent('我的自定义主页');
    expect(screen.getByText('当前页面：我的自定义主页')).toBeInTheDocument();
    expect(screen.getByText('空态占位 · 我的自定义主页')).toBeInTheDocument();
  });

  test('shows loading state when page tree is being loaded for the first time', () => {
    authenticate(['frontstage.page.design']);

    render(
      <AppProviders>
        <FrontStagePage workspaceId="workspace-1" isPageTreeLoading />
      </AppProviders>
    );

    expect(screen.getByText('页面树加载中…')).toBeInTheDocument();
    expect(screen.getByText('正在加载页面树，请稍后...')).toBeInTheDocument();
  });

  test('shows error state with retry when page tree load fails before any cached tree is available', () => {
    authenticate(['frontstage.page.design']);

    const onRetryLoadPageTree = vi.fn();

    render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          hasPageTreeLoadError
          onRetryLoadPageTree={onRetryLoadPageTree}
        />
      </AppProviders>
    );

    expect(screen.getByText('页面树加载失败')).toBeInTheDocument();
    expect(
      screen.getByText(
        '页面树加载失败，请检查网络后重试。点击“重试”按钮重新发起加载。'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(onRetryLoadPageTree).toHaveBeenCalledTimes(1);
  });

  test('shows partial error banner when page tree load fails but cached tree exists', () => {
    authenticate(['frontstage.page.design']);

    const onRetryLoadPageTree = vi.fn();

    render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-1"
          initialPageTree={[
            {
              id: 'page-1',
              title: '页面 内页',
              kind: 'page'
            }
          ]}
          hasPageTreeLoadError
          onRetryLoadPageTree={onRetryLoadPageTree}
        />
      </AppProviders>
    );

    expect(screen.getByText('页面树加载失败')).toBeInTheDocument();
    expect(
      screen.getByText(
        '页面树加载失败，当前页面树仍可查看；请点击“重试”恢复最新数据。'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('当前页面：页面 内页')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(onRetryLoadPageTree).toHaveBeenCalledTimes(1);
  });
});
