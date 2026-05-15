import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import { FrontStagePage } from '../pages/FrontStagePage';

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

describe('FrontStagePage', () => {
  beforeEach(() => {
    resetAuthStore();
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
