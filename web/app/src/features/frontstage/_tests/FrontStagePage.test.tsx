import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

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

function renderPage() {
  return render(
    <AppProviders>
      <FrontStagePage workspaceId="workspace-1" pageId="page-1" />
    </AppProviders>
  );
}

describe('FrontStagePage', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  test('shows page context and design mode is unavailable without permission', () => {
    authenticate(['route_page.view.all']);
    renderPage();

    expect(screen.getByText('Workspace：workspace-1')).toBeInTheDocument();
    expect(screen.getByText('页面 page-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入设计模式' })).not.toBeInTheDocument();
  });

  test('toggles design mode button only when frontstage.page.design is granted', () => {
    authenticate(['frontstage.page.design']);
    renderPage();

    const designButton = screen.getByRole('button', { name: '进入设计模式' });
    fireEvent.click(designButton);
    expect(screen.getByRole('button', { name: '退出设计模式' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出设计模式' }));
    expect(screen.getByRole('button', { name: '进入设计模式' })).toBeInTheDocument();
  });
});
