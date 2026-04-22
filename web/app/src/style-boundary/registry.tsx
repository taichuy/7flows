import type { ReactNode } from 'react';
import { Menu } from 'antd';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { AppRouterProvider } from '../app/router';
import { AppShellFrame } from '../app-shell/AppShellFrame';
import { createAccountMenuItems } from '../app-shell/account-menu-items';
import { SignInPage } from '../features/auth/pages/SignInPage';
import { EmbeddedAppsPage } from '../features/embedded-apps/pages/EmbeddedAppsPage';
import { ToolsPage } from '../features/tools/pages/ToolsPage';
import { useAuthStore } from '../state/auth-store';
import {
  modelProviderCatalogContract,
  modelProviderOptionsContract,
  primaryContractProviderModels
} from '../test/model-provider-contract-fixtures';
import manifest from './scenario-manifest.json';
import type {
  StyleBoundaryManifestScene,
  StyleBoundaryRuntimeScene
} from './types';

const styleBoundaryProviderModels = primaryContractProviderModels;

const styleBoundaryProviderInstances = [
  {
    id: 'provider-openai-prod',
    installation_id: 'installation-openai-compatible',
    provider_code: 'openai_compatible',
    protocol: 'openai_responses',
    display_name: 'OpenAI Production',
    status: 'ready',
    config_json: {
      base_url: 'https://api.openai.com/v1',
      organization: 'workspace-prod',
      validate_model: true
    },
    last_validated_at: '2026-04-18T16:00:00Z',
    last_validation_status: 'succeeded',
    last_validation_message: '连接成功，模型目录已同步',
    catalog_refresh_status: 'succeeded',
    catalog_last_error_message: null,
    catalog_refreshed_at: '2026-04-18T16:01:00Z',
    model_count: styleBoundaryProviderModels.length
  }
];

const styleBoundaryNodeContributions = [
  {
    installation_id: 'installation-1',
    provider_code: 'prompt_pack',
    plugin_id: 'prompt_pack@0.1.0',
    plugin_version: '0.1.0',
    contribution_code: 'openai_prompt',
    node_shell: 'action',
    category: 'generation',
    title: 'OpenAI Prompt',
    description: 'Generate prompt output',
    dependency_status: 'ready',
    schema_version: '1flowbase.node-contribution/v1',
    experimental: false,
    icon: 'sparkles',
    schema_ui: {},
    output_schema: {},
    required_auth: [],
    visibility: 'public',
    dependency_installation_kind: 'model_provider',
    dependency_plugin_version_range: '^0.1.0'
  }
];

function expandDottedBundle(bundle: Record<string, string>) {
  const expanded: Record<string, unknown> = {};

  for (const [dottedKey, value] of Object.entries(bundle)) {
    const segments = dottedKey.split('.');
    let current = expanded;

    for (const segment of segments.slice(0, -1)) {
      const next = current[segment];
      if (typeof next === 'object' && next !== null) {
        current = next as Record<string, unknown>;
        continue;
      }

      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    }

    current[segments[segments.length - 1]!] = value;
  }

  return expanded;
}

const styleBoundaryPluginI18nCatalog = Object.fromEntries(
  Object.entries(modelProviderCatalogContract.i18n_catalog).map(
    ([namespace, locales]) => [
      namespace,
      Object.fromEntries(
        Object.entries(locales as Record<string, Record<string, string>>).map(
          ([locale, bundle]) => [locale, expandDottedBundle(bundle)]
        )
      )
    ]
  )
);

const styleBoundaryPluginFamiliesCatalog = {
  locale_meta: modelProviderCatalogContract.locale_meta,
  i18n_catalog: styleBoundaryPluginI18nCatalog,
  entries: modelProviderCatalogContract.entries.map((entry) => ({
    provider_code: entry.provider_code,
    plugin_type: 'model_provider',
    namespace: entry.namespace,
    label_key: entry.label_key,
    description_key: entry.description_key,
    provider_label_key: entry.label_key,
    protocol: entry.protocol,
    help_url: entry.help_url,
    default_base_url: entry.default_base_url,
    model_discovery_mode: entry.model_discovery_mode,
    current_installation_id: entry.installation_id,
    current_version: entry.plugin_version,
    latest_version: entry.plugin_version,
    has_update: false,
    installed_versions: [
      {
        installation_id: entry.installation_id,
        plugin_version: entry.plugin_version,
        source_kind: 'official_registry',
        trust_level: 'verified_official',
        created_at: '2026-04-20T10:00:00Z',
        is_current: true
      }
    ]
  }))
};

const styleBoundaryOfficialPluginCatalog = {
  source_kind: 'official_registry',
  source_label: '官方源',
  registry_url:
    'https://github.com/taichuy/1flowbase-official-plugins/releases/latest/download/official-registry.json',
  locale_meta: modelProviderCatalogContract.locale_meta,
  i18n_catalog: styleBoundaryPluginI18nCatalog,
  entries: [
    {
      plugin_id: '1flowbase.openai_compatible',
      provider_code: 'openai_compatible',
      plugin_type: 'model_provider',
      namespace: 'plugin.openai_compatible',
      label_key: 'provider.label',
      description_key: 'provider.description',
      provider_label_key: 'provider.label',
      protocol: 'openai_responses',
      latest_version: '0.1.0',
      selected_artifact: {
        os: 'linux',
        arch: 'x64',
        libc: 'gnu',
        rust_target: 'x86_64-unknown-linux-gnu',
        download_url: 'https://example.com/openai-compatible.tar.gz',
        checksum: 'openai-compatible-checksum',
        signature_algorithm: null,
        signing_key_id: null
      },
      help_url:
        'https://github.com/taichuy/1flowbase-official-plugins/tree/main/models/openai_compatible',
      model_discovery_mode: 'hybrid',
      install_status: 'assigned'
    }
  ]
};

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
        'application.view.all',
        'application.edit.own',
        'application.create.all',
        'embedded_app.view.all',
        'api_reference.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]
    }
  });
}

let styleBoundaryOriginalFetch: typeof globalThis.fetch | null = null;

function createStyleBoundaryAgentFlowDocument() {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
  const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

  if (llmNode) {
    llmNode.config = {
      ...llmNode.config,
      provider_instance_id: 'provider-openai-prod',
      model: 'gpt-4o-mini',
      temperature: 0.7
    };
  }

  return document;
}

function seedStyleBoundarySettingsFetch() {
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
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');
    const requestUrl = new URL(url, 'http://127.0.0.1:7800');

    if (url.includes('/api/console/docs/catalog')) {
      return new Response(
        JSON.stringify({
          data: {
            title: '1flowbase API',
            version: '0.1.0',
            categories: [
              {
                id: 'console',
                label: 'console',
                operation_count: 2
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

    if (url.includes('/api/console/docs/categories/console/operations')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'console',
            label: 'console',
            operations: [
              {
                id: 'patch_me',
                method: 'PATCH',
                path: '/api/console/me',
                summary: 'Update current profile',
                description: 'Update current profile',
                tags: ['console'],
                group: 'console',
                deprecated: false
              },
              {
                id: 'list_members',
                method: 'GET',
                path: '/api/console/members',
                summary: 'List members',
                description: 'List members',
                tags: ['console'],
                group: 'console',
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
          info: { title: '1flowbase API', version: '0.1.0' },
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

    if (
      method.toUpperCase() === 'GET' &&
      url.endsWith('/api/console/model-providers/options')
    ) {
      return new Response(
        JSON.stringify({
          data: modelProviderOptionsContract,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'GET' &&
      url.endsWith('/api/console/model-providers/catalog')
    ) {
      return new Response(
        JSON.stringify({
          data: modelProviderCatalogContract,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'GET' &&
      url.includes('/api/console/plugins/families')
    ) {
      return new Response(
        JSON.stringify({
          data: styleBoundaryPluginFamiliesCatalog,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'GET' &&
      url.includes('/api/console/plugins/official-catalog')
    ) {
      return new Response(
        JSON.stringify({
          data: styleBoundaryOfficialPluginCatalog,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'GET' &&
      url.endsWith('/api/console/model-providers')
    ) {
      return new Response(
        JSON.stringify({
          data: styleBoundaryProviderInstances,
          meta: null
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

function seedStyleBoundaryApplicationFetch() {
  if (typeof globalThis.fetch !== 'function') {
    return;
  }

  styleBoundaryOriginalFetch ??= globalThis.fetch.bind(globalThis);
  const originalFetch = styleBoundaryOriginalFetch;
  let currentDraftDocument = createStyleBoundaryAgentFlowDocument();

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');
    const requestUrl = new URL(url, 'http://127.0.0.1:7800');

    if (
      method.toUpperCase() === 'GET' &&
      url.endsWith('/api/console/model-providers/options')
    ) {
      return new Response(
        JSON.stringify({
          data: modelProviderOptionsContract,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'GET' &&
      requestUrl.pathname === '/api/console/node-contributions' &&
      requestUrl.searchParams.get('application_id') === 'app-1'
    ) {
      return new Response(
        JSON.stringify({
          data: styleBoundaryNodeContributions,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'GET' &&
      url.includes('/api/console/applications/app-1/orchestration/nodes/') &&
      url.endsWith('/last-run')
    ) {
      return new Response(
        JSON.stringify({
          data: null,
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (
      method.toUpperCase() === 'PUT' &&
      url.includes('/api/console/applications/app-1/orchestration/draft')
    ) {
      const requestBody =
        typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : init?.body && typeof init.body === 'object'
            ? init.body
            : null;

      if (
        requestBody &&
        'document' in requestBody &&
        requestBody.document &&
        typeof requestBody.document === 'object'
      ) {
        currentDraftDocument = requestBody.document as ReturnType<
          typeof createDefaultAgentFlowDocument
        >;
      }

      return new Response(
        JSON.stringify({
          data: {
            flow_id: 'flow-1',
            draft: {
              id: 'draft-1',
              flow_id: 'flow-1',
              updated_at: '2026-04-15T09:10:00Z',
              document: currentDraftDocument
            },
            versions: [],
            autosave_interval_seconds: 30
          },
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (url.endsWith('/api/console/applications/app-1/orchestration')) {
      return new Response(
        JSON.stringify({
          data: {
            flow_id: 'flow-1',
            draft: {
              id: 'draft-1',
              flow_id: 'flow-1',
              updated_at: '2026-04-15T09:00:00Z',
              document: currentDraftDocument
            },
            versions: [],
            autosave_interval_seconds: 30
          },
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (url.endsWith('/api/console/applications/catalog')) {
      return new Response(
        JSON.stringify({
          data: {
            types: [{ value: 'agent_flow', label: 'AgentFlow' }],
            tags: []
          },
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (url.includes('/api/console/applications/app-1')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'app-1',
            application_type: 'agent_flow',
            name: 'Support Agent',
            description: 'customer support',
            icon: 'RobotOutlined',
            icon_type: 'iconfont',
            icon_background: '#E6F7F2',
            created_by: 'user-1',
            updated_at: '2026-04-15T09:00:00Z',
            tags: [],
            sections: {
              orchestration: {
                status: 'planned',
                subject_kind: 'agent_flow',
                subject_status: 'unconfigured',
                current_subject_id: null,
                current_draft_id: null
              },
              api: {
                status: 'planned',
                credential_kind: 'application_api_key',
                invoke_routing_mode: 'api_key_bound_application',
                invoke_path_template: null,
                api_capability_status: 'planned',
                credentials_status: 'planned'
              },
              logs: {
                status: 'planned',
                runs_capability_status: 'planned',
                run_object_kind: 'application_run',
                log_retention_status: 'planned'
              },
              monitoring: {
                status: 'planned',
                metrics_capability_status: 'planned',
                metrics_object_kind: 'application_metrics',
                tracing_config_status: 'planned'
              }
            }
          },
          meta: null
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (url.endsWith('/api/console/applications')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'app-1',
              application_type: 'agent_flow',
              name: 'Support Agent',
              description: 'customer support',
              icon: 'RobotOutlined',
              icon_type: 'iconfont',
              icon_background: '#E6F7F2',
              created_by: 'user-1',
              updated_at: '2026-04-15T09:00:00Z',
              tags: []
            }
          ],
          meta: null
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
  'page.home': () => {
    seedStyleBoundaryApplicationFetch();
    return renderRouterScene('/');
  },
  'page.application-detail': () => {
    seedStyleBoundaryApplicationFetch();
    return renderRouterScene('/applications/app-1/orchestration');
  },
  'page.embedded-apps': () => renderShellScene('/embedded-apps', <EmbeddedAppsPage />),
  'page.tools': () => renderShellScene('/tools', <ToolsPage />),
  'page.settings': () => {
    seedStyleBoundarySettingsFetch();
    return renderRouterScene('/settings/model-providers');
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
