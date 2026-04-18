import fs from 'node:fs';
import path from 'node:path';

import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@1flowbase/api-client', () => ({
  getDefaultApiBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:7800'),
  getConsoleApplicationCatalog: vi.fn().mockResolvedValue({
    types: [{ value: 'agent_flow', label: 'AgentFlow' }],
    tags: []
  }),
  listConsoleApplications: vi.fn().mockResolvedValue([
    {
      id: 'app-1',
      application_type: 'agent_flow',
      name: 'Support Agent',
      description: 'customer support',
      icon: 'RobotOutlined',
      icon_type: 'iconfont',
      icon_background: '#E6F7F2',
      created_by: 'user-1',
      updated_at: '2026-04-15T09:00:00Z',
      tags: []
    }
  ])
}));

vi.mock('../../features/auth/components/AuthBootstrap', () => ({
  AuthBootstrap: ({ children }: { children: ReactNode }) => children
}));

import { useAuthStore } from '../../state/auth-store';
import { App } from '../App';

describe('App shell', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    useAuthStore.getState().setAuthenticated({
      csrfToken: 'csrf-123',
      actor: {
        id: 'user-1',
        account: 'root',
        effective_display_role: 'manager',
        current_workspace_id: 'workspace-1'
      },
      me: {
        id: 'user-1',
        account: 'root',
        email: 'root@example.com',
        phone: null,
        nickname: 'Captain Root',
        name: 'Root',
        avatar_url: null,
        introduction: '',
        effective_display_role: 'manager',
        permissions: ['route_page.view.all', 'embedded_app.view.all']
      }
    });
  });

  test(
    'renders the formal console shell with application workspace content',
    async () => {
      render(<App />);

      expect(await screen.findByRole('heading', { name: '1Flowbase' })).toBeInTheDocument();

      const header = screen.getByRole('banner');
      const primaryNavigation = screen.getByRole('navigation', { name: 'Primary' });

      expect(header).toHaveStyle('--app-shell-edge-gap: 5%');
      expect(within(primaryNavigation).getByRole('menu')).toBeInTheDocument();
      expect(
        within(primaryNavigation).getByRole('link', { name: '工作台' })
      ).toBeInTheDocument();
      expect(
        within(primaryNavigation).getByRole('link', { name: '子系统' })
      ).toBeInTheDocument();
      expect(
        within(primaryNavigation).getByRole('link', { name: '工具' })
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Captain Root' })).toBeInTheDocument();
      expect(
        within(primaryNavigation).queryByRole('link', { name: 'Home' })
      ).not.toBeInTheDocument();
      expect(
        within(primaryNavigation).queryByRole('link', { name: 'Embedded Apps' })
      ).not.toBeInTheDocument();
      expect(
        within(primaryNavigation).queryByRole('link', { name: 'Agent Flow' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Workspace Bootstrap')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Theme Preview' })).not.toBeInTheDocument();
      expect(await screen.findByText('Support Agent')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '进入应用' })).toBeInTheDocument();
      expect(screen.queryByText(/api-server/i)).not.toBeInTheDocument();
    },
    15000
  );

  test('renders the embedded apps route', async () => {
    window.history.pushState({}, '', '/embedded-apps');

    render(<App />);

    expect(await screen.findByText('子系统')).toBeInTheDocument();
  });

  test('keeps the shell content container full width instead of capping to 1200px', () => {
    const appShellCss = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../app-shell/app-shell.css'),
      'utf8'
    );

    expect(appShellCss).not.toContain('width: min(1200px, calc(100% - 48px));');
    expect(appShellCss).toContain('width: 100%;');
    expect(appShellCss).toContain('padding: 0;');
    expect(appShellCss).toContain('box-sizing: border-box;');
    expect(appShellCss).not.toContain('padding: 28px 24px 64px;');
    expect(appShellCss).not.toContain('margin: 0 auto;');
  });

  test.each(['/agent-flow', '/embedded/demo-app', '/embedded-apps/demo-app'])(
    'no longer resolves legacy console route %s',
    async (pathname) => {
      window.history.pushState({}, '', pathname);

      render(<App />);

      expect(await screen.findByText('页面不存在')).toBeInTheDocument();
    }
  );
});
