import { waitFor } from '@testing-library/react';
import type { MenuProps } from 'antd';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ConsoleMe, ConsoleSessionActor } from '@1flowbase/api-client';

import { resetAuthStore, useAuthStore } from '../../state/auth-store';
import {
  createAccountMenuClickHandler,
  selectAccountLabel
} from '../account-menu-actions';
import { createAccountMenuItems } from '../account-menu-items';

const sessionApi = vi.hoisted(() => ({
  signOut: vi.fn()
}));

vi.mock('../../features/auth/api/session', () => sessionApi);

const actor: ConsoleSessionActor = {
  id: 'user-1',
  current_workspace_id: 'workspace-1',
  account: 'root',
  effective_display_role: 'root'
};

function buildMe(overrides: Partial<ConsoleMe> = {}): ConsoleMe {
  return {
    id: 'user-1',
    account: 'root',
    email: 'root@example.com',
    phone: null,
    nickname: '',
    name: 'Root User',
    avatar_url: null,
    introduction: '',
    effective_display_role: 'root',
    permissions: [],
    ...overrides
  };
}

function menuClick(key: string): Parameters<NonNullable<MenuProps['onClick']>>[0] {
  return { key } as Parameters<NonNullable<MenuProps['onClick']>>[0];
}

beforeEach(() => {
  resetAuthStore();
  sessionApi.signOut.mockReset();
  sessionApi.signOut.mockResolvedValue(undefined);
});

describe('createAccountMenuItems', () => {
  test('uses native Ant menu icons for account actions', () => {
    const items = createAccountMenuItems() ?? [];
    const accountItem = items[0];
    const children = accountItem ? Reflect.get(accountItem, 'children') : [];
    const rawChildren =
      accountItem &&
      typeof accountItem === 'object' &&
      Array.isArray(children)
        ? children
        : [];

    expect(
      rawChildren.flatMap((item: unknown) => {
        if (
          !item ||
          typeof item !== 'object' ||
          !('key' in item) ||
          typeof item.key !== 'string' ||
          !('label' in item) ||
          typeof item.label !== 'string'
        ) {
          return [];
        }

        return [
          {
            key: item.key,
            label: item.label,
            hasIcon: 'icon' in item && Boolean(item.icon)
          }
        ];
      })
    ).toEqual([
      { key: 'profile', label: '个人资料', hasIcon: true },
      { key: 'sign-out', label: '退出登录', hasIcon: true }
    ]);
  });
});

describe('AccountMenuBase', () => {
  test('selects nickname, profile name, actor account, then fallback for the account label', () => {
    expect(
      selectAccountLabel({
        me: buildMe({ name: 'Ada Lovelace', nickname: 'Ada' }),
        actor
      })
    ).toBe('Ada');
    expect(
      selectAccountLabel({
        me: buildMe({ name: 'Ada Lovelace', nickname: '' }),
        actor
      })
    ).toBe('Ada Lovelace');
    expect(selectAccountLabel({ me: null, actor })).toBe('root');
    expect(selectAccountLabel({ me: null, actor: null })).toBe('用户');
  });

  test('navigates to the profile page from the account menu action', () => {
    const navigateTo = vi.fn();
    const onClick = createAccountMenuClickHandler({
      csrfToken: 'csrf-token',
      setAnonymous: vi.fn(),
      navigateTo
    });

    onClick?.(menuClick('profile'));

    expect(navigateTo).toHaveBeenCalledWith('/me');
  });

  test('signs out with csrf token, resets auth state, and redirects to sign in', async () => {
    useAuthStore.getState().setAuthenticated({
      csrfToken: 'csrf-token',
      actor,
      me: null
    });
    const navigateTo = vi.fn();
    const onClick = createAccountMenuClickHandler({
      csrfToken: 'csrf-token',
      setAnonymous: useAuthStore.getState().setAnonymous,
      navigateTo
    });

    onClick?.(menuClick('sign-out'));

    await waitFor(() => {
      expect(sessionApi.signOut).toHaveBeenCalledWith('csrf-token');
      expect(navigateTo).toHaveBeenCalledWith('/sign-in');
    });
    expect(useAuthStore.getState().sessionStatus).toBe('anonymous');
  });
});
