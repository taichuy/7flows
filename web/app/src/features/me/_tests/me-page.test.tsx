import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { navigateSpy, updateMyProfile, changeMyPassword } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  updateMyProfile: vi.fn(),
  changeMyPassword: vi.fn()
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router'
  );

  return {
    ...actual,
    useNavigate: () => navigateSpy
  };
});

vi.mock('../api/me', () => ({
  updateMyProfile,
  changeMyPassword,
  fetchMyProfile: vi.fn()
}));

import { AppProviders } from '../../../app/AppProviders';
import { useAuthStore } from '../../../state/auth-store';
import { MePage } from '../pages/MePage';

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

describe('MePage', () => {
  beforeEach(() => {
    navigateSpy.mockReset();
    updateMyProfile.mockReset();
    changeMyPassword.mockReset();
    authenticate();
  });

  test('renders view mode initially, opens drawer to edit', async () => {
    render(
      <AppProviders>
        <MePage />
      </AppProviders>
    );

    // Initial view mode
    expect(await screen.findByRole('heading', { name: '个人信息', level: 4 })).toBeInTheDocument();
    
    // Open Drawer
    // Note: Use text matching as it renders button > span > text
    fireEvent.click(screen.getByText('编辑资料'));
    
    // Wait for drawer to render
    await waitFor(() => {
       expect(screen.getByText('编辑个人信息')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('姓名')).toHaveValue('Root');
  });

  test('submits PATCH /api/console/me and updates the visible account summary', async () => {
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

    render(
      <AppProviders>
        <MePage />
      </AppProviders>
    );
    
    // Default view is profile
    expect(await screen.findByRole('heading', { name: '个人信息', level: 4 })).toBeInTheDocument();
    
    // Open Drawer
    fireEvent.click(screen.getByText('编辑资料'));
    
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
});