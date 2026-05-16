import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const pageTreeApi = vi.hoisted(() => ({
  createFrontstagePageGroupNode: vi.fn(),
  createFrontstagePageNode: vi.fn(),
  deleteFrontstageNode: vi.fn(),
  fetchFrontstagePageTree: vi.fn(),
  frontstagePageTreeQueryKey: vi.fn((workspaceId: string) => [
    'frontstage',
    workspaceId,
    'page-tree'
  ]),
  moveFrontstageNode: vi.fn(),
  renameFrontstagePageNode: vi.fn()
}));

const pageContentApi = vi.hoisted(() => ({
  fetchFrontstagePageContent: vi.fn(),
  frontstagePageContentQueryKey: vi.fn((workspaceId: string, pageId: string) => [
    'frontstage',
    workspaceId,
    'pages',
    pageId,
    'content'
  ])
}));

vi.mock('../api/page-tree', () => pageTreeApi);
vi.mock('../api/page-content', () => pageContentApi);

import { AppProviders } from '../../../app/AppProviders';
import { AppRouterProvider } from '../../../app/router';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';

function authenticate() {
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
      permissions: []
    }
  });
}

function createPageNode(pageId: string, title = `页面 ${pageId}`) {
  return {
    id: pageId,
    title,
    kind: 'page' as const,
    parent_id: null,
    rank: '001000',
    schema_root_uid: `root-${pageId}`
  };
}

function createPageContent(pageId: string) {
  return {
    page: {
      id: pageId,
      title: `页面 ${pageId}`,
      kind: 'page' as const,
      parentId: null,
      rank: '001000',
      schemaRootUid: `root-${pageId}`
    },
    schema: {
      rootUid: `root-${pageId}`,
      payload: { blocks: [] }
    },
    root: {
      uid: `root-${pageId}`,
      payload: { kind: 'frontstage.page.root' }
    }
  };
}

function renderApp(pathname: string) {
  window.history.pushState({}, '', pathname);

  return render(
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  );
}

describe('frontstage page content query route wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStore();
    authenticate();
  });

  test('loads page detail content after resolving a route pageId to the selected page', async () => {
    pageTreeApi.fetchFrontstagePageTree.mockResolvedValue([
      createPageNode('page-1')
    ]);
    pageContentApi.fetchFrontstagePageContent.mockResolvedValue(
      createPageContent('page-1')
    );

    renderApp('/frontstage/workspace-1/page-1');

    await waitFor(() => {
      expect(pageContentApi.fetchFrontstagePageContent).toHaveBeenCalledWith(
        'workspace-1',
        'page-1'
      );
    });
    expect(await screen.findByText('页面 page-1')).toBeInTheDocument();
    expect(screen.getByText('Root root-page-1')).toBeInTheDocument();
    expect(screen.getByText('页面内容为空')).toBeInTheDocument();
  });

  test('passes page detail loading state to the frontstage page container', async () => {
    pageTreeApi.fetchFrontstagePageTree.mockResolvedValue([
      createPageNode('page-1')
    ]);
    pageContentApi.fetchFrontstagePageContent.mockReturnValue(
      new Promise(() => {})
    );

    renderApp('/frontstage/workspace-1/page-1');

    expect(await screen.findByText('页面内容加载中')).toBeInTheDocument();
    expect(pageContentApi.fetchFrontstagePageContent).toHaveBeenCalledWith(
      'workspace-1',
      'page-1'
    );
  });

  test('passes page detail error state to the frontstage page container', async () => {
    pageTreeApi.fetchFrontstagePageTree.mockResolvedValue([
      createPageNode('page-1')
    ]);
    pageContentApi.fetchFrontstagePageContent.mockRejectedValue(
      new Error('load failed')
    );

    renderApp('/frontstage/workspace-1/page-1');

    expect(await screen.findByText('页面内容加载失败')).toBeInTheDocument();
    expect(
      screen.getByText('请检查网络后重试，画布不会使用过期内容进行渲染。')
    ).toBeInTheDocument();
  });

  test('does not request page detail when no route pageId or selected page exists', async () => {
    pageTreeApi.fetchFrontstagePageTree.mockResolvedValue([]);
    pageContentApi.fetchFrontstagePageContent.mockResolvedValue(
      createPageContent('page-1')
    );

    renderApp('/frontstage/workspace-1');

    await screen.findByText('当前未选中页面');
    expect(pageContentApi.fetchFrontstagePageContent).not.toHaveBeenCalled();
  });
});
