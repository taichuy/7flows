import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Grid } from 'antd';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { updateMyProfile, changeMyPassword, fetchMyProfile } = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
  changeMyPassword: vi.fn(),
  fetchMyProfile: vi.fn()
}));

vi.mock('../api/me', () => ({
  updateMyProfile,
  changeMyPassword,
  fetchMyProfile
}));

import { AppProviders } from '../../../app/AppProviders';
import { AppRouterProvider } from '../../../app/router';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';

const useBreakpointSpy = vi.spyOn(Grid, 'useBreakpoint');

function authenticate() {
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
      nickname: 'Root',
      name: 'Root',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'manager',
      permissions: ['route_page.view.all']
    }
  });
}

function renderApp(pathname: string) {
  window.history.pushState({}, '', pathname);

  return render(
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  );
}

describe('MePage', () => {
  beforeEach(() => {
    resetAuthStore();
    useBreakpointSpy.mockReturnValue({
      xs: true,
      sm: true,
      md: true,
      lg: true,
      xl: false,
      xxl: false
    });
    updateMyProfile.mockReset();
    changeMyPassword.mockReset();
    fetchMyProfile.mockReset();
    authenticate();
  });

  test('redirects /me to /me/profile', async () => {
    renderApp('/me');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/me/profile');
    });
    expect(await screen.findByRole('heading', { name: '个人资料', level: 2 })).toBeInTheDocument();
  });

  test('does not render sign-out inside the /me sidebar', async () => {
    renderApp('/me/profile');

    expect(await screen.findByRole('heading', { name: '个人资料', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Section navigation' })).toBeInTheDocument();
    expect(screen.queryByText('退出登录')).not.toBeInTheDocument();
  });

  test('keeps profile update flow working on /me/profile', async () => {
    updateMyProfile.mockResolvedValue({
      id: 'user-1',
      account: 'root',
      email: 'root-next@example.com',
      phone: '13900000000',
      nickname: 'Captain Root',
      name: 'Root Next',
      avatar_url: null,
      introduction: 'updated intro',
      effective_display_role: 'manager',
      permissions: ['route_page.view.all']
    });

    renderApp('/me/profile');

    expect(await screen.findByRole('heading', { name: '个人资料', level: 2 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /编辑资料/ }));

    await waitFor(() => {
      expect(screen.getByText('编辑个人信息')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('姓名'), {
      target: { value: 'Root Next' }
    });
    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: 'Captain Root' }
    });
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'root-next@example.com' }
    });
    fireEvent.change(screen.getByLabelText('手机号'), {
      target: { value: '13900000000' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }));

    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith(
        {
          name: 'Root Next',
          nickname: 'Captain Root',
          email: 'root-next@example.com',
          phone: '13900000000',
          avatar_url: null,
          introduction: ''
        },
        'csrf-123'
      )
    );
  });

  test('submits password change on /me/security and navigates to /sign-in after success', async () => {
    changeMyPassword.mockResolvedValue(undefined);

    renderApp('/me/security');

    expect(await screen.findByRole('heading', { name: '安全设置', level: 3 })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'old-password' }
    });
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'new-password-123' }
    });
    fireEvent.change(screen.getByLabelText('确认新密码'), {
      target: { value: 'new-password-123' }
    });
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }));

    await waitFor(() => {
      expect(changeMyPassword).toHaveBeenCalledWith(
        {
          old_password: 'old-password',
          new_password: 'new-password-123'
        },
        'csrf-123'
      );
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/sign-in');
    });
  });
});
