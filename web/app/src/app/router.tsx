import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState
} from '@tanstack/react-router';
import { Result } from 'antd';

import { AppShellFrame } from '../app-shell/AppShellFrame';
import { SignInPage } from '../features/auth/pages/SignInPage';
import { ApplicationDetailPage } from '../features/applications/pages/ApplicationDetailPage';
import type { ApplicationSectionKey } from '../features/applications/lib/application-sections';
import { EmbeddedAppsPage } from '../features/embedded-apps/pages/EmbeddedAppsPage';
import { HomePage } from '../features/home/pages/HomePage';
import type { MeSectionKey } from '../features/me/lib/me-sections';
import { MePage } from '../features/me/pages/MePage';
import type { SettingsSectionKey } from '../features/settings/lib/settings-sections';
import { SettingsPage } from '../features/settings/pages/SettingsPage';
import { ToolsPage } from '../features/tools/pages/ToolsPage';
import { RouteGuard } from '../routes/route-guards';

function NotFoundPage() {
  return <Result status="404" title="页面不存在" />;
}

function ShellLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  });

  return (
    <AppShellFrame pathname={pathname} useRouterLinks>
      <Outlet />
    </AppShellFrame>
  );
}

function ApplicationIndexRedirect() {
  const { applicationId } = applicationIndexRoute.useParams();

  return (
    <Navigate
      to="/applications/$applicationId/orchestration"
      params={{ applicationId }}
      replace
    />
  );
}

function ApplicationSectionRoute({
  applicationId,
  requestedSectionKey
}: {
  applicationId: string;
  requestedSectionKey: ApplicationSectionKey;
}) {
  return (
    <RouteGuard routeId="application-detail">
      <ApplicationDetailPage
        applicationId={applicationId}
        requestedSectionKey={requestedSectionKey}
      />
    </RouteGuard>
  );
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: ShellLayout,
  notFoundComponent: NotFoundPage
});

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: () => (
    <RouteGuard routeId="home">
      <HomePage />
    </RouteGuard>
  )
});

const applicationIndexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId',
  component: ApplicationIndexRedirect,
  notFoundComponent: NotFoundPage
});

const applicationOrchestrationRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/orchestration',
  notFoundComponent: NotFoundPage,
  component: () => {
    const { applicationId } = applicationOrchestrationRoute.useParams();

    return (
      <ApplicationSectionRoute
        applicationId={applicationId}
        requestedSectionKey="orchestration"
      />
    );
  }
});

const applicationApiRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/api',
  notFoundComponent: NotFoundPage,
  component: () => {
    const { applicationId } = applicationApiRoute.useParams();

    return (
      <ApplicationSectionRoute applicationId={applicationId} requestedSectionKey="api" />
    );
  }
});

const applicationLogsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/logs',
  notFoundComponent: NotFoundPage,
  component: () => {
    const { applicationId } = applicationLogsRoute.useParams();

    return (
      <ApplicationSectionRoute applicationId={applicationId} requestedSectionKey="logs" />
    );
  }
});

const applicationMonitoringRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/monitoring',
  notFoundComponent: NotFoundPage,
  component: () => {
    const { applicationId } = applicationMonitoringRoute.useParams();

    return (
      <ApplicationSectionRoute
        applicationId={applicationId}
        requestedSectionKey="monitoring"
      />
    );
  }
});

const embeddedAppsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/embedded-apps',
  notFoundComponent: NotFoundPage,
  component: () => (
    <RouteGuard routeId="embedded-apps">
      <EmbeddedAppsPage />
    </RouteGuard>
  )
});

const toolsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/tools',
  notFoundComponent: NotFoundPage,
  component: () => (
    <RouteGuard routeId="tools">
      <ToolsPage />
    </RouteGuard>
  )
});

function renderSettingsRoute(requestedSectionKey?: SettingsSectionKey) {
  return (
    <RouteGuard routeId="settings">
      <SettingsPage requestedSectionKey={requestedSectionKey} />
    </RouteGuard>
  );
}

function renderMeRoute(requestedSectionKey?: MeSectionKey) {
  return (
    <RouteGuard routeId="me">
      <MePage requestedSectionKey={requestedSectionKey} />
    </RouteGuard>
  );
}

const settingsIndexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute()
});

const settingsDocsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/docs',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('docs')
});

const settingsSystemRuntimeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/system-runtime',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('system-runtime')
});

const settingsModelProvidersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/model-providers',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('model-providers')
});

const settingsMembersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/members',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('members')
});

const settingsRolesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/roles',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('roles')
});

const meIndexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/me',
  notFoundComponent: NotFoundPage,
  component: () => renderMeRoute()
});

const meProfileRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/me/profile',
  notFoundComponent: NotFoundPage,
  component: () => renderMeRoute('profile')
});

const meSecurityRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/me/security',
  notFoundComponent: NotFoundPage,
  component: () => renderMeRoute('security')
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: () => (
    <RouteGuard routeId="sign-in">
      <SignInPage />
    </RouteGuard>
  )
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    homeRoute,
    applicationIndexRoute,
    applicationOrchestrationRoute,
    applicationApiRoute,
    applicationLogsRoute,
    applicationMonitoringRoute,
    embeddedAppsRoute,
    toolsRoute,
    settingsIndexRoute,
    settingsDocsRoute,
    settingsSystemRuntimeRoute,
    settingsModelProvidersRoute,
    settingsMembersRoute,
    settingsRolesRoute,
    meIndexRoute,
    meProfileRoute,
    meSecurityRoute
  ]),
  signInRoute
]);

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
  notFoundMode: 'root'
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
