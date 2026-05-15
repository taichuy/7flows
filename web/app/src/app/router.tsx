import {
  Navigate,
  Outlet,
  RouterProvider,
  useNavigate,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState
} from '@tanstack/react-router';
import { listFrontstagePages } from '@1flowbase/api-client';
import { useQuery } from '@tanstack/react-query';
import { Button, Result } from 'antd';
import { Suspense, lazy, useState, type ReactNode } from 'react';

import { AppShellFrame } from '../app-shell/AppShellFrame';
import { SignInPage } from '../features/auth/pages/SignInPage';
import type { ApplicationSectionKey } from '../features/applications/lib/application-sections';
import { EmbeddedAppsPage } from '../features/embedded-apps/pages/EmbeddedAppsPage';
import { HomePage } from '../features/home/pages/HomePage';
import { FrontStagePage } from '../features/frontstage/pages/FrontStagePage';
import type { MeSectionKey } from '../features/me/lib/me-sections';
import { MePage } from '../features/me/pages/MePage';
import type { SettingsSectionKey } from '../features/settings/lib/settings-sections';
import { ToolsPage } from '../features/tools/pages/ToolsPage';
import { RouteGuard } from '../routes/route-guards';
import { LoadingState } from '../shared/ui/loading-state/LoadingState';
import { useAuthStore } from '../state/auth-store';

const ApplicationDetailPage = lazy(() =>
  import('../features/applications/pages/ApplicationDetailPage').then((module) => ({
    default: module.ApplicationDetailPage
  }))
);
const SettingsPage = lazy(() =>
  import('../features/settings/pages/SettingsPage').then((module) => ({
    default: module.SettingsPage
  }))
);

function NotFoundPage() {
  return <Result status="404" title="页面不存在" />;
}

function RouteLoadingFallback() {
  return <LoadingState fullscreen />;
}

function LazyRouteBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>;
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
      <LazyRouteBoundary>
        <ApplicationDetailPage
          applicationId={applicationId}
          requestedSectionKey={requestedSectionKey}
        />
      </LazyRouteBoundary>
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
      <LazyRouteBoundary>
        <SettingsPage requestedSectionKey={requestedSectionKey} />
      </LazyRouteBoundary>
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

function renderFrontStageRoute({
  workspaceId,
  pageId
}: {
  workspaceId: string;
  pageId?: string;
}) {
  const navigate = useNavigate();
  const pageTreeQuery = useQuery({
    queryKey: ['frontstage-page-tree', workspaceId],
    queryFn: () => listFrontstagePages(workspaceId),
    retry: false
  });
  const pageTreeFromApi = pageTreeQuery.data;
  const shouldRenderErrorState = pageTreeQuery.isError && pageTreeFromApi === undefined;

  if (shouldRenderErrorState) {
    return (
      <RouteGuard routeId="frontstage">
        <Result
          status="error"
          title="前台页面树加载失败"
          subTitle="请稍后重试。"
          extra={
            <Button
              onClick={() => {
                void pageTreeQuery.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard routeId="frontstage">
      <LazyRouteBoundary>
        <FrontStagePage
          workspaceId={workspaceId}
          pageId={pageId}
          initialPageTree={pageTreeFromApi}
          isPageTreeLoading={pageTreeQuery.isLoading}
          hasPageTreeLoadError={pageTreeQuery.isError}
          onRetryLoadPageTree={() => {
            void pageTreeQuery.refetch();
          }}
          onNavigatePage={(nextPageId) => {
            if (nextPageId) {
              void navigate({
                to: '/frontstage/$workspaceId/$pageId',
                params: { workspaceId, pageId: nextPageId }
              });
            } else {
              void navigate({
                to: '/frontstage/$workspaceId',
                params: { workspaceId }
              });
            }
          }}
        />
      </LazyRouteBoundary>
    </RouteGuard>
  );
}

function FrontStageWorkspaceRedirect() {
  const workspaceId = useAuthStore((state) => state.actor?.current_workspace_id);

  if (!workspaceId) {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      to="/frontstage/$workspaceId"
      params={{ workspaceId }}
      replace
    />
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

const settingsHostInfrastructureRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/host-infrastructure',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('host-infrastructure')
});

const settingsFilesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/files',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('files')
});

const settingsDataModelsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/data-models',
  notFoundComponent: NotFoundPage,
  component: () => renderSettingsRoute('data-models')
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

const frontstageWorkspaceRootRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/frontstage',
  component: () => (
    <RouteGuard routeId="frontstage">
      <FrontStageWorkspaceRedirect />
    </RouteGuard>
  ),
  notFoundComponent: NotFoundPage
});

const frontstageWorkspaceRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/frontstage/$workspaceId',
  notFoundComponent: NotFoundPage,
  component: () => {
    const { workspaceId } = frontstageWorkspaceRoute.useParams();

    return renderFrontStageRoute({ workspaceId });
  }
});

const frontstageWorkspacePageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/frontstage/$workspaceId/$pageId',
  notFoundComponent: NotFoundPage,
  component: () => {
    const { pageId, workspaceId } = frontstageWorkspacePageRoute.useParams();

    return renderFrontStageRoute({ workspaceId, pageId });
  }
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
    settingsHostInfrastructureRoute,
    settingsFilesRoute,
    settingsDataModelsRoute,
    settingsModelProvidersRoute,
    settingsMembersRoute,
    settingsRolesRoute,
    meIndexRoute,
    meProfileRoute,
    meSecurityRoute,
    frontstageWorkspaceRootRoute,
    frontstageWorkspaceRoute,
    frontstageWorkspacePageRoute
  ]),
  signInRoute
]);

function createAppRouter() {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFoundPage,
    notFoundMode: 'root'
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

export function AppRouterProvider() {
  const [router] = useState(createAppRouter);

  return <RouterProvider router={router} />;
}
