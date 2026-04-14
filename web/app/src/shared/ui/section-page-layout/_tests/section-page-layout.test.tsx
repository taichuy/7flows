import type { ReactElement } from 'react';

import { render, screen } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';
import { Grid } from 'antd';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SectionPageLayout, type SectionNavItem } from '../SectionPageLayout';

const useBreakpointSpy = vi.spyOn(Grid, 'useBreakpoint');

const navItems: SectionNavItem[] = [
  { key: 'profile', label: '个人信息', to: '/me/profile' },
  { key: 'security', label: '安全设置', to: '/me/security' },
  { key: 'notifications', label: '通知偏好', to: '/me/notifications' },
  { key: 'devices', label: '登录设备', to: '/me/devices' },
  { key: 'tokens', label: '访问令牌', to: '/me/tokens' }
];

function renderInRouter(layout: ReactElement, pathname = '/') {
  window.history.pushState({}, '', pathname);

  const rootRoute = createRootRoute({
    component: () => <Outlet />
  });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => layout
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute])
  });

  return render(<RouterProvider router={router} />);
}

describe('SectionPageLayout', () => {
  beforeEach(() => {
    useBreakpointSpy.mockReturnValue({
      xs: true,
      sm: true,
      md: true,
      lg: true,
      xl: false,
      xxl: false
    });
  });

  test('renders desktop rail navigation and sidebar footer', async () => {
    renderInRouter(
      <SectionPageLayout
        pageTitle="个人资料"
        pageDescription="管理个人资料与安全设置"
        navItems={navItems.slice(0, 2)}
        activeKey="profile"
        sidebarFooter={<button type="button">退出登录</button>}
      >
        <section>个人资料内容</section>
      </SectionPageLayout>
    );

    expect(await screen.findByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('个人资料内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument();
  });

  test('renders empty state instead of broken navigation when navItems is empty', async () => {
    renderInRouter(
      <SectionPageLayout
        pageTitle="设置"
        navItems={[]}
        activeKey=""
        emptyState={<div>当前账号暂无可访问内容</div>}
      >
        <section>不会显示的内容</section>
      </SectionPageLayout>
    );

    expect(await screen.findByText('当前账号暂无可访问内容')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('不会显示的内容')).not.toBeInTheDocument();
  });

  test('switches to compact mobile navigation when breakpoint is below lg', async () => {
    useBreakpointSpy.mockReturnValue({
      xs: true,
      sm: true,
      md: true,
      lg: false,
      xl: false,
      xxl: false
    });

    const firstRender = renderInRouter(
      <SectionPageLayout
        pageTitle="个人资料"
        navItems={navItems.slice(0, 4)}
        activeKey="profile"
      >
        <section>四个以内的移动导航</section>
      </SectionPageLayout>
    );

    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更多分区' })).not.toBeInTheDocument();

    firstRender.unmount();

    renderInRouter(
      <SectionPageLayout
        pageTitle="个人资料"
        navItems={navItems}
        activeKey="profile"
      >
        <section>超过四个的移动导航</section>
      </SectionPageLayout>
    );

    expect(await screen.findByRole('button', { name: '更多分区' })).toBeInTheDocument();
  });
});
