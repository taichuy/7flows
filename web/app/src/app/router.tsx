import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState
} from '@tanstack/react-router';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';

import { AppShell } from '@1flowse/ui';

import { AgentFlowPage } from '../features/agent-flow/AgentFlowPage';
import { EmbeddedAppDetailPage } from '../features/embedded-apps/EmbeddedAppDetailPage';
import { EmbeddedAppsPage } from '../features/embedded-apps/EmbeddedAppsPage';
import { EmbeddedMountPage } from '../features/embedded-runtime/EmbeddedMountPage';
import { HomePage } from '../features/home/HomePage';

function AppNavigation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  });

  const selectedKey = pathname.startsWith('/agent-flow')
    ? 'agent-flow'
    : pathname.startsWith('/embedded-apps') || pathname.startsWith('/embedded/')
      ? 'embedded-apps'
      : 'home';

  const items: MenuProps['items'] = [
    {
      key: 'home',
      label: (
        <Link to="/" className="app-shell-menu-link">
          工作台
        </Link>
      )
    },
    {
      key: 'embedded-apps',
      label: (
        <Link to="/embedded-apps" className="app-shell-menu-link">
          团队
        </Link>
      )
    },
    {
      key: 'agent-flow',
      label: (
        <Link to="/agent-flow" className="app-shell-menu-link">
          前台
        </Link>
      )
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
    {
      key: 'account',
      label: (
        <span className="app-shell-account-block">
          <span className="app-shell-account-label">Taichu</span>
        </span>
      ),
      popupClassName: 'app-shell-account-popup',
      children: [
        {
          key: 'profile',
          label: <span className="app-shell-account-popup-label">Profile</span>
        },
        {
          key: 'settings',
          label: <span className="app-shell-account-popup-label">Settings</span>
        },
        { type: 'divider' },
        {
          key: 'sign-out',
          label: <span className="app-shell-account-popup-label">Sign out</span>
        }
      ]
    }
  ];

  return (
    <Menu
      className="app-shell-account-menu"
      mode="horizontal"
      selectable={false}
      items={items}
      disabledOverflow
    />
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
  component: RootLayout
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
