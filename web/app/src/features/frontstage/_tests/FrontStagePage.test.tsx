import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import { FrontStagePage } from '../pages/FrontStagePage';

type TestFrontStageTreeNode = {
  id: string;
  title: string;
  kind: 'group' | 'page';
  children?: TestFrontStageTreeNode[];
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

function renderPage(pageId?: string, onNavigatePage?: (pageId: string) => void) {
  return render(
    <AppProviders>
      <FrontStagePage workspaceId="workspace-1" pageId={pageId} onNavigatePage={onNavigatePage} />
    </AppProviders>
  );
}

function renderPageWithInitialTree(
  pageTree: TestFrontStageTreeNode[],
  pageId?: string,
  onNavigatePage?: (pageId: string) => void
) {
  return render(
    <AppProviders>
      <FrontStagePage
        workspaceId="workspace-1"
        pageId={pageId}
        onNavigatePage={onNavigatePage}
        initialPageTree={pageTree}
      />
    </AppProviders>
  );
}

describe('FrontStagePage', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetAuthStore();
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
    expect(screen.queryByRole('button', { name: '进入设计模式' })).not.toBeInTheDocument();
    expect(screen.getByText('当前页面：page-1')).toBeInTheDocument();
  });

  test('toggles design mode button only when frontstage.page.design is granted', () => {
    authenticate(['frontstage.page.design']);
    renderPage('page-1');

    const designButton = screen.getByRole('button', { name: '进入设计模式' });
    expect(screen.queryByRole('button', { name: '新增区块' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '页面管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '当前页面设置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'JS Block 试运行' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存设计' })).not.toBeInTheDocument();

    fireEvent.click(designButton);
    expect(screen.getByRole('button', { name: '退出设计模式' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增区块' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '页面管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '当前页面设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JS Block 试运行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存设计' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建分组' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    expect(screen.getByRole('button', { name: '进入设计模式' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增区块' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '页面管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '当前页面设置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'JS Block 试运行' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存设计' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建分组' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建页面' })).not.toBeInTheDocument();
  });

  test('shows save-state when design tree changes and clears it after save', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));

    const saveButton = screen.getByRole('button', { name: '保存设计' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('当前无未保存改动。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    expect(saveButton).toBeEnabled();
    expect(
      screen.getByText('当前有未保存改动，点击“保存设计”后同步到 schema storage。')
    ).toBeInTheDocument();

    fireEvent.click(saveButton);
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('当前无未保存改动。')).toBeInTheDocument();
  });

  test('supports adding and deleting page tree nodes in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    expect(screen.getByText('分组 1')).toBeInTheDocument();
    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();

    const pageItem = screen.getByText('页面 新建 1');
    const pageListItem = pageItem.closest('li');
    if (!pageListItem) {
      throw new Error('expected page list item to exist');
    }
    fireEvent.click(within(pageListItem).getByRole('button', { name: '删除' }));

    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
  });

  test('does not delete node when delete confirmation is canceled', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const pageItem = screen.getByText('页面 新建 1').closest('li');
    if (!pageItem) {
      throw new Error('expected page list item to exist');
    }

    confirmSpy.mockReturnValue(false);
    fireEvent.click(within(pageItem).getByRole('button', { name: '删除' }));

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

    expect(screen.getByText('页面 新建 2')).toBeInTheDocument();
  });

  test('adds page under group in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    const groupItem = screen.getByText('分组 1');
    const groupContainer = groupItem.closest('li');
    if (!groupContainer) {
      throw new Error('expected group list item to exist');
    }

    fireEvent.click(within(groupContainer).getByRole('button', { name: '组内新增页面' }));

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

    const rootGroupItem = screen.getByText('分组 一级').closest('li');
    const nestedGroupItem = screen.getByText('分组 二级').closest('li');

    if (!rootGroupItem || !nestedGroupItem) {
      throw new Error('expected group list items to exist');
    }

    expect(within(rootGroupItem).getByRole('button', { name: '组内新增页面' })).toBeInTheDocument();
    expect(within(nestedGroupItem).queryByRole('button', { name: '组内新增页面' })).not.toBeInTheDocument();
  });

  test('supports page order move controls in design mode', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const initialTreeRows = screen.getAllByRole('listitem');
    expect(initialTreeRows[0]).toHaveTextContent('页面 新建 1');
    expect(initialTreeRows[1]).toHaveTextContent('页面 新建 2');

    const secondRowUpButton = within(initialTreeRows[1]).getByRole('button', { name: '上移' });
    const firstRowDownButton = within(initialTreeRows[0]).getByRole('button', { name: '下移' });

    expect(secondRowUpButton).toBeEnabled();
    expect(firstRowDownButton).toBeEnabled();

    fireEvent.click(secondRowUpButton);

    const movedUpRows = screen.getAllByRole('listitem');
    expect(movedUpRows[0]).toHaveTextContent('页面 新建 2');
    expect(movedUpRows[1]).toHaveTextContent('页面 新建 1');

    const firstRowUpButton = within(movedUpRows[0]).getByRole('button', { name: '上移' });
    const secondRowDownButton = within(movedUpRows[1]).getByRole('button', { name: '下移' });

    expect(firstRowUpButton).toBeDisabled();
    expect(secondRowDownButton).toBeDisabled();

    const movedDownButton = within(movedUpRows[0]).getByRole('button', { name: '下移' });
    fireEvent.click(movedDownButton);

    const movedDownRows = screen.getAllByRole('listitem');
    expect(movedDownRows[0]).toHaveTextContent('页面 新建 1');
    expect(movedDownRows[1]).toHaveTextContent('页面 新建 2');
  });

  test('deletes group and cascades child pages', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    const groupItem = screen.getByText('分组 1').closest('li');
    if (!groupItem) {
      throw new Error('expected group list item to exist');
    }

    fireEvent.click(within(groupItem).getByRole('button', { name: '组内新增页面' }));
    expect(screen.getByText('页面 新建 1')).toBeInTheDocument();

    fireEvent.click(within(groupItem).getByRole('button', { name: '删除' }));

    expect(screen.queryByText('分组 1')).not.toBeInTheDocument();
    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
  });

  test('falls back to first available page when selected page is deleted by parent group', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage(undefined, onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));

    const groupItem = screen.getByText('分组 1').closest('li');
    if (!groupItem) {
      throw new Error('expected group list item to exist');
    }

    fireEvent.click(within(groupItem).getByRole('button', { name: '组内新增页面' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const groupItemForDelete = screen.getByText('分组 1').closest('li');
    if (!groupItemForDelete) {
      throw new Error('expected group list item to exist');
    }

    fireEvent.click(within(groupItemForDelete).getByRole('button', { name: '删除' }));

    expect(screen.queryByText('页面 新建 1')).not.toBeInTheDocument();
    expect(screen.getByText('当前页面：page-2')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenLastCalledWith('page-2');
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

    const rootGroup = screen.getByText('分组 一级').closest('li');
    if (!rootGroup) {
      throw new Error('expected root group list item to exist');
    }

    fireEvent.click(within(rootGroup).getByRole('button', { name: '删除' }));

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
      const pageItem = screen.getByText('页面 新建 1').closest('li');
      if (!pageItem) {
        throw new Error('expected page list item to exist');
      }

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

    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('');

    try {
      const pageItem = screen.getByText('页面 新建 1').closest('li');
      if (!pageItem) {
        throw new Error('expected page list item to exist');
      }

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

    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation((title, defaultValue) => {
      expect(title).toBe('重命名节点');
      expect(defaultValue).toBe('页面 新建 1');
      return '页面 新建 1';
    });

    try {
      const pageItem = screen.getByText('页面 新建 1').closest('li');
      if (!pageItem) {
        throw new Error('expected page list item to exist');
      }

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

    expect(onNavigatePage).toHaveBeenLastCalledWith('page-1');
  });

  test('falls back to first page when deleting selected page', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage(undefined, onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

    const secondPageItem = screen.getByText('页面 新建 2').closest('div');
    if (!secondPageItem) {
      throw new Error('expected second page item to exist');
    }

    fireEvent.click(within(secondPageItem).getByRole('button', { name: '删除' }));
    expect(screen.getByText('当前页面：page-1')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith('page-1');
  });

  test('navigates to workspace-level frontstage route when all pages are deleted', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPage('page-1', onNavigatePage);

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    const pageItem = screen.getByText('页面 page-1').closest('li');
    if (!pageItem) {
      throw new Error('expected page list item to exist');
    }
    fireEvent.click(within(pageItem).getByRole('button', { name: '删除' }));

    expect(onNavigatePage).toHaveBeenCalledWith(undefined);
  });

  test('falls back to first page when route pageId is missing from current tree', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    const renderResult = render(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="page-1"
          onNavigatePage={onNavigatePage}
        />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: '进入设计模式' }));
    fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
    expect(onNavigatePage).toHaveBeenLastCalledWith('page-1');

    onNavigatePage.mockReset();
    renderResult.rerender(
      <AppProviders>
        <FrontStagePage
          workspaceId="workspace-1"
          pageId="non-existent-page"
          onNavigatePage={onNavigatePage}
        />
      </AppProviders>
    );

    expect(screen.getByText('当前页面：page-1')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith('page-1');
  });

  test('navigates to workspace-level route when initial tree is empty and pageId is invalid', () => {
    authenticate(['frontstage.page.design']);
    const onNavigatePage = vi.fn();

    renderPageWithInitialTree([], 'invalid-page-id', onNavigatePage);

    expect(screen.getByText('当前未选中页面')).toBeInTheDocument();
    expect(onNavigatePage).toHaveBeenCalledWith(undefined);
  });

  test('shows manager shell and canvas placeholders', () => {
    authenticate(['frontstage.page.design']);
    renderPage('page-1');

    expect(screen.getByRole('heading', { name: '页面管理' })).toBeInTheDocument();
    expect(screen.getByText('当前页面：page-1')).toBeInTheDocument();
    expect(
      screen.getByText('当前页面尚未接入区块内容，浏览态仅展示空状态。请在设计态添加页面区块与内容。')
    ).toBeInTheDocument();
    expect(screen.getByText('页面 page-1')).toBeInTheDocument();
  });

  test('shows empty page tree state when pageId is absent', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    expect(screen.getByText('当前未选中页面')).toBeInTheDocument();
    expect(
      screen.getByText('当前工作区页面树为空。请在设计态创建页面后将显示树结构。')
    ).toBeInTheDocument();
    expect(screen.getByText('Workspace：workspace-1')).toBeInTheDocument();
  });
});
