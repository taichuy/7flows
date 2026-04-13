import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';
import { Typography } from 'antd';

import { AppShell } from '@1flowse/ui';

import { AgentFlowPage } from '../features/agent-flow/AgentFlowPage';
import { EmbeddedAppDetailPage } from '../features/embedded-apps/EmbeddedAppDetailPage';
import { EmbeddedAppsPage } from '../features/embedded-apps/EmbeddedAppsPage';
import { EmbeddedMountPage } from '../features/embedded-runtime/EmbeddedMountPage';
import { HomePage } from '../features/home/HomePage';
import { ThemePreviewPage } from '../features/theme-preview/ThemePreviewPage';

function AppNavigation() {
  return (
    <div className="app-shell-links">
      <Link
        to="/"
        activeOptions={{ exact: true }}
        activeProps={{ className: 'app-shell-link is-active' }}
        inactiveProps={{ className: 'app-shell-link' }}
      >
        Home
      </Link>
      <Link
        to="/theme-preview"
        activeProps={{ className: 'app-shell-link is-active' }}
        inactiveProps={{ className: 'app-shell-link' }}
      >
        Theme Preview
      </Link>
      <Link
        to="/agent-flow"
        activeProps={{ className: 'app-shell-link is-active' }}
        inactiveProps={{ className: 'app-shell-link' }}
      >
        agentFlow
      </Link>
    </div>
  );
}

function RootLayout() {
  return (
    <AppShell
      title="1Flowse Bootstrap"
      subtitle="Light shell mock with emerald signal accents"
      navigation={<AppNavigation />}
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
