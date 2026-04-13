import { Suspense, lazy, useState } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState
} from '@tanstack/react-router';
import { Button, Card, Drawer, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';

import { AppShell } from '@1flowse/ui';

const primaryRoutes = [
  {
    key: 'home',
    label: '工作台',
    to: '/',
    description: '查看团队工作台与应用列表'
  },
  {
    key: 'application',
    label: '当前应用',
    to: '/application',
    description: '进入当前应用工作区与应用概览'
  },
  {
    key: 'tools',
    label: '工具',
    to: '/tools',
    description: '统一收口事件队列与接口治理'
  },
  {
    key: 'settings',
    label: '设置',
    to: '/settings',
    description: '管理账户、安全策略与权限矩阵'
  }
] as const;

const HomePage = lazy(async () => {
  const module = await import('../features/home/HomePage');
  return { default: module.HomePage };
});

const ApplicationOverviewPage = lazy(async () => {
  const module = await import('../features/application/ApplicationOverviewPage');
  return { default: module.ApplicationOverviewPage };
});

const AgentFlowPage = lazy(async () => {
  const module = await import('../features/agent-flow/AgentFlowPage');
  return { default: module.AgentFlowPage };
});

const EmbeddedAppsPage = lazy(async () => {
  const module = await import('../features/embedded-apps/EmbeddedAppsPage');
  return { default: module.EmbeddedAppsPage };
});

const ToolsPage = lazy(async () => {
  const module = await import('../features/tools/ToolsPage');
  return { default: module.ToolsPage };
});

const SettingsPage = lazy(async () => {
  const module = await import('../features/settings/SettingsPage');
  return { default: module.SettingsPage };
});

function getSelectedKey(pathname: string) {
  if (
    pathname.startsWith('/application') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/subsystems')
  ) {
    return 'application';
  }

  if (pathname.startsWith('/tools')) {
    return 'tools';
  }

  if (pathname.startsWith('/settings')) {
    return 'settings';
  }

  return 'home';
}

function RouteFallback() {
  return (
    <div className="demo-page">
      <Card className="demo-card route-loading-card">
        <Typography.Text>正在加载页面模块...</Typography.Text>
      </Card>
    </div>
  );
}

function RouteView({
  Page
}: {
  Page: LazyExoticComponent<ComponentType>;
}) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Page />
    </Suspense>
  );
}

function AppNavigation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  });

  const selectedKey = getSelectedKey(pathname);
  const items: MenuProps['items'] = primaryRoutes.map((route) => ({
    key: route.key,
    label: (
      <Link
        to={route.to}
        className="app-shell-menu-link"
        aria-current={route.key === selectedKey ? 'page' : undefined}
      >
        {route.label}
      </Link>
    )
  }));

  return (
    <nav className="app-shell-navigation" aria-label="Primary">
      <Menu
        className="app-shell-menu"
        mode="horizontal"
        selectedKeys={[selectedKey]}
        items={items}
        disabledOverflow
      />
    </nav>
  );
}

function AppHeaderActions() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  });
  const selectedKey = getSelectedKey(pathname);

  return (
    <>
      <Space size={12} className="demo-shell-actions demo-shell-actions-desktop">
        <Tag className="demo-shell-status" bordered={false}>
          平台健康 99.94%
        </Tag>
        <Link to="/settings" className="demo-shell-profile" aria-label="打开账户与设置">
          <span className="demo-shell-profile-name">Mina Chen</span>
          <span className="demo-shell-profile-separator">·</span>
          <span className="demo-shell-profile-meta">增长实验室</span>
        </Link>
      </Space>

      <Button
        className="demo-shell-mobile-trigger"
        aria-label="打开导航菜单"
        onClick={() => setIsDrawerOpen(true)}
      >
        导航
      </Button>

      <Drawer
        title="控制台导航"
        placement="right"
        width={320}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <div className="demo-shell-mobile-stack">
          <div className="demo-shell-mobile-summary">
            <Typography.Text strong>Mina Chen</Typography.Text>
            <Typography.Text className="demo-shell-mobile-meta">增长实验室</Typography.Text>
            <Typography.Text className="demo-shell-mobile-meta">平台负责人</Typography.Text>
          </div>

          <Tag className="demo-shell-status demo-shell-status-mobile" bordered={false}>
            平台健康 99.94%
          </Tag>

          <div className="demo-shell-mobile-links">
            {primaryRoutes.map((route) => (
              <Link
                key={route.key}
                to={route.to}
                className={`demo-shell-mobile-link ${
                  route.key === selectedKey ? 'is-active' : ''
                }`}
                onClick={() => setIsDrawerOpen(false)}
              >
                <span className="demo-shell-mobile-link-label">{route.label}</span>
                <Typography.Text className="demo-shell-mobile-link-note">
                  {route.description}
                </Typography.Text>
              </Link>
            ))}
          </div>
        </div>
      </Drawer>
    </>
  );
}

function RootLayout() {
  return (
    <AppShell title="1Flowse" navigation={<AppNavigation />} actions={<AppHeaderActions />}>
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <Typography.Paragraph>未找到对应的演示页面。</Typography.Paragraph>
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <RouteView Page={HomePage} />
});

const applicationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/application',
  component: () => <RouteView Page={ApplicationOverviewPage} />
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/studio',
  component: () => <RouteView Page={AgentFlowPage} />
});

const subsystemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/subsystems',
  component: () => <RouteView Page={EmbeddedAppsPage} />
});

const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools',
  component: () => <RouteView Page={ToolsPage} />
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => <RouteView Page={SettingsPage} />
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  applicationRoute,
  studioRoute,
  subsystemRoute,
  toolsRoute,
  settingsRoute
]);

const router = createRouter({
  routeTree
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
