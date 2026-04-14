import type { ReactNode } from 'react';
import { Menu } from 'antd';

import { AppRouterProvider } from '../app/router';
import { AppShellFrame } from '../app-shell/AppShellFrame';
import { createAccountMenuItems } from '../app-shell/account-menu-items';
import { SignInPage } from '../features/auth/pages/SignInPage';
import { EmbeddedAppsPage } from '../features/embedded-apps/pages/EmbeddedAppsPage';
import { HomePage } from '../features/home/pages/HomePage';
import { ToolsPage } from '../features/tools/pages/ToolsPage';
import { useAuthStore } from '../state/auth-store';
import manifest from './scenario-manifest.json';
import type {
  StyleBoundaryManifestScene,
  StyleBoundaryRuntimeScene
} from './types';

function getAccountPopupChildren() {
  const items = createAccountMenuItems() ?? [];
  const firstItem = items[0];

  if (
    !firstItem ||
    typeof firstItem !== 'object' ||
    !('children' in firstItem) ||
    !Array.isArray(firstItem.children)
  ) {
    return [];
  }

  return firstItem.children;
}

function seedStyleBoundaryAuth() {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'style-boundary-csrf',
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
      nickname: 'Captain Root',
      name: 'Root',
      avatar_url: null,
      introduction: 'Boundary user',
      effective_display_role: 'manager',
      permissions: [
        'route_page.view.all',
        'embedded_app.view.all',
        'api_reference.view.all'
      ]
    }
  });
}

let styleBoundaryOriginalFetch: typeof globalThis.fetch | null = null;

function seedStyleBoundaryDocsFetch() {
  if (typeof globalThis.fetch !== 'function') {
    return;
  }

  styleBoundaryOriginalFetch ??= globalThis.fetch.bind(globalThis);
  const originalFetch = styleBoundaryOriginalFetch;

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    if (url.includes('/api/console/docs/catalog')) {
      return new Response(
        JSON.stringify({
          data: {
            title: '1Flowse API',
            version: '0.1.0',
            operations: [
              {
                id: 'list_members',
                method: 'GET',
                path: '/api/console/members',
                summary: 'List members',
                description: null,
                tags: ['members'],
                group: 'members',
                deprecated: false
              }
            ]
          },
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (url.includes('/api/console/docs/operations/list_members/openapi.json')) {
      return new Response(
        JSON.stringify({
          openapi: '3.1.0',
          info: { title: '1Flowse API', version: '0.1.0' },
          paths: {
            '/api/console/members': {
              get: {
                operationId: 'list_members',
                responses: {
                  '200': { description: 'ok' }
                }
              }
            }
          },
          components: {}
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return originalFetch(input as RequestInfo, init);
  };
}

function renderShellScene(pathname: string, page: ReactNode) {
  seedStyleBoundaryAuth();

  return <AppShellFrame pathname={pathname}>{page}</AppShellFrame>;
}

function renderRouterScene(pathname: string) {
  seedStyleBoundaryAuth();
  window.history.replaceState({}, '', pathname);

  return <AppRouterProvider />;
}

const renderers: Record<string, StyleBoundaryRuntimeScene['render']> = {
  'component.account-popup': () => (
    <div className="app-shell-account-popup">
      <Menu mode="vertical" selectable={false} items={getAccountPopupChildren()} />
    </div>
  ),
  'component.account-trigger': () => (
    <Menu
      className="app-shell-account-menu"
      mode="horizontal"
      selectable={false}
      items={createAccountMenuItems()}
      openKeys={['account']}
    />
  ),
  'page.home': () => renderShellScene('/', <HomePage />),
  'page.embedded-apps': () => renderShellScene('/embedded-apps', <EmbeddedAppsPage />),
  'page.tools': () => renderShellScene('/tools', <ToolsPage />),
  'page.settings': () => {
    seedStyleBoundaryDocsFetch();
    return renderRouterScene('/settings/docs');
  },
  'page.me': () => renderRouterScene('/me/profile'),
  'page.sign-in': () => <SignInPage />
};

export function getSceneManifest(): StyleBoundaryManifestScene[] {
  return manifest as StyleBoundaryManifestScene[];
}

export function getSceneIdsForFiles(files: string[]): string[] {
  const fileSet = new Set(files);

  return getSceneManifest()
    .filter((scene) => scene.impactFiles.some((file) => fileSet.has(file)))
    .map((scene) => scene.id);
}

export function getRuntimeScene(sceneId: string): StyleBoundaryRuntimeScene {
  const scene = getSceneManifest().find((entry) => entry.id === sceneId);

  if (!scene || !renderers[scene.id]) {
    throw new Error(`Unknown style boundary scene: ${sceneId}`);
  }

  return {
    ...scene,
    render: renderers[scene.id]
  };
}
