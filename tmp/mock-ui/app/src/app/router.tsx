import { UserOutlined } from '@ant-design/icons';
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState
} from '@tanstack/react-router';
import { Avatar, Button, Dropdown, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';

import { AppShell } from '@1flowse/ui';

import { AgentFlowPage } from '../features/agent-flow/AgentFlowPage';
import { EmbeddedAppDetailPage } from '../features/embedded-apps/EmbeddedAppDetailPage';
import { EmbeddedAppsPage } from '../features/embedded-apps/EmbeddedAppsPage';
import { EmbeddedMountPage } from '../features/embedded-runtime/EmbeddedMountPage';
import { HomePage } from '../features/home/HomePage';
import { ThemePreviewPage } from '../features/theme-preview/ThemePreviewPage';

function AppNavigation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  });

  const selectedKey = pathname.startsWith('/theme-preview')
    ? 'theme-preview'
    : pathname.startsWith('/agent-flow')
      ? 'agent-flow'
      : 'home';

  const items: MenuProps['items'] = [
    {
      key: 'home',
      label: <Link to="/" className="app-shell-menu-link">Home</Link>
    },
    {
      key: 'theme-preview',
      label: <Link to="/theme-preview" className="app-shell-menu-link">Theme Preview</Link>
    },
    {
      key: 'agent-flow',
      label: <Link to="/agent-flow" className="app-shell-menu-link">Agent Flow</Link>
    }
  ];

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
  const items: MenuProps['items'] = [
    { key: 'profile', label: 'Profile' },
    { key: 'settings', label: 'Settings' },
    { type: 'divider' },
    { key: 'sign-out', label: 'Sign out' }
  ];

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button className="app-shell-user-trigger" aria-label="Workspace settings" type="text">
        <UserOutlined className="app-shell-user-icon" />
      </Button>
    </Dropdown>
  );
}

function RootLayout() {
  return (
    <AppShell
      title="1Flowse Bootstrap"
      navigation={<AppNavigation />}
      actions={<AppHeaderActions />}
    >
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <Typography.Paragraph>Preview route not found.</Typography.Paragraph>
  )
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage
});

const agentFlowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agent-flow',
  component: AgentFlowPage
});

const themePreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/theme-preview',
  component: ThemePreviewPage
});

const embeddedAppsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/embedded-apps',
  component: EmbeddedAppsPage
});

const embeddedAppDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/embedded-apps/$embeddedAppId',
  component: EmbeddedAppDetailPage
});

const embeddedMountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/embedded/$embeddedAppId',
  component: EmbeddedMountPage
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  themePreviewRoute,
  agentFlowRoute,
  embeddedAppsRoute,
  embeddedAppDetailRoute,
  embeddedMountRoute
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
