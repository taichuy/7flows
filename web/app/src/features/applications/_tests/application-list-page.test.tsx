import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const applicationsApi = vi.hoisted(() => ({
  applicationsQueryKey: ['applications'],
  applicationCatalogQueryKey: ['applications', 'catalog'],
  fetchApplications: vi.fn(),
  fetchApplicationCatalog: vi.fn(),
  createApplication: vi.fn(),
  createApplicationTag: vi.fn(),
  updateApplication: vi.fn()
}));

vi.mock('../api/applications', () => applicationsApi);

import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import { ApplicationListPage } from '../pages/ApplicationListPage';

function authenticate() {
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
      permissions: ['application.create.all', 'application.edit.own', 'application.view.all']
    }
  });
}

function renderPage() {
  return render(
    <AppProviders>
      <ApplicationListPage />
    </AppProviders>
  );
}

describe('ApplicationListPage', () => {
  beforeEach(() => {
    resetAuthStore();
    authenticate();
    applicationsApi.fetchApplicationCatalog.mockResolvedValue({
      types: [
        { value: 'agent_flow', label: 'AgentFlow' },
        { value: 'workflow', label: '工作流' }
      ],
      tags: [{ id: 'tag-1', name: '客服', application_count: 1 }]
    });
    applicationsApi.fetchApplications.mockResolvedValue([
      {
        id: 'app-1',
        application_type: 'agent_flow',
        name: '客服助手',
        description: '处理客服',
        icon: null,
        icon_type: null,
        icon_background: null,
        updated_at: '2026-04-16T12:00:00.000Z',
        created_by: 'user-1',
        tags: [{ id: 'tag-1', name: '客服' }]
      },
      {
        id: 'app-2',
        application_type: 'workflow',
        name: '审批流',
        description: '处理审批',
        icon: null,
        icon_type: null,
        icon_background: null,
        updated_at: '2026-04-16T13:00:00.000Z',
        created_by: 'user-2',
        tags: []
      }
    ]);
    applicationsApi.createApplication.mockResolvedValue({ id: 'app-3' });
    applicationsApi.createApplicationTag.mockResolvedValue({
      id: 'tag-2',
      name: '内部',
      application_count: 0
    });
    applicationsApi.updateApplication.mockResolvedValue(undefined);
  });

  test('renders backend-driven type tabs and filters the list', async () => {
    renderPage();

    expect(await screen.findByText('客服助手', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText('AgentFlow')).toBeInTheDocument();
    expect(screen.getByText('工作流')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '工作流' }));

    await waitFor(
      () => {
        expect(screen.queryByText('客服助手')).not.toBeInTheDocument();
      },
      { timeout: 10_000 }
    );
    expect(screen.getByText('审批流')).toBeInTheDocument();
  }, 15_000);

  test('creates a new tag from the card dialog and saves it back to the application', async () => {
    renderPage();

    expect(await screen.findByText('客服助手', {}, { timeout: 10_000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '管理标签-客服助手' }));

    const dialog = await screen.findByRole('dialog', undefined, { timeout: 10_000 });
    expect(within(dialog).getByText('管理应用标签')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('新标签名称'), {
      target: { value: '内部' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '创建标签' }));

    await waitFor(
      () => {
        expect(applicationsApi.createApplicationTag).toHaveBeenCalledWith(
          { name: '内部' },
          'csrf-123'
        );
      },
      { timeout: 10_000 }
    );

    fireEvent.click(within(dialog).getByRole('checkbox', { name: '内部' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '保存标签' }));

    await waitFor(
      () => {
        expect(applicationsApi.updateApplication).toHaveBeenCalledWith(
          'app-1',
          {
            name: '客服助手',
            description: '处理客服',
            tag_ids: ['tag-1', 'tag-2']
          },
          'csrf-123'
        );
      },
      { timeout: 10_000 }
    );
  }, 15_000);

  test('edits application name and description from the card action', async () => {
    renderPage();

    expect(await screen.findByText('客服助手', {}, { timeout: 10_000 })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: '更多操作-客服助手' }));
    fireEvent.click(await screen.findByText('编辑信息'));

    const dialog = await screen.findByRole('dialog', undefined, { timeout: 10_000 });
    expect(within(dialog).getByText('编辑应用信息')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('应用名称'), {
      target: { value: '客服助手 Pro' }
    });
    fireEvent.change(within(dialog).getByLabelText('应用简介'), {
      target: { value: '升级后的客服描述' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    await waitFor(
      () => {
        expect(applicationsApi.updateApplication).toHaveBeenCalledWith(
          'app-1',
          {
            name: '客服助手 Pro',
            description: '升级后的客服描述',
            tag_ids: ['tag-1']
          },
          'csrf-123'
        );
      },
      { timeout: 10_000 }
    );
  }, 15_000);

  test('opens the application from the card link instead of a dedicated button', async () => {
    renderPage();

    expect(await screen.findByText('客服助手', {}, { timeout: 10_000 })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: '进入应用' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入应用-客服助手' })).toHaveAttribute(
      'href',
      '/applications/app-1/orchestration'
    );
    expect(screen.getByRole('button', { name: '更多操作-客服助手' })).toBeInTheDocument();
  }, 15_000);
});
