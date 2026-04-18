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
import manifest from './scenario-manifest.json';
import type {
  StyleBoundaryManifestScene,
  StyleBoundaryRuntimeScene
} from './types';

const styleBoundaryProviderModels = [
  {
    model_id: 'gpt-4o-mini',
    display_name: 'GPT-4o Mini',
    source: 'runtime_catalog',
    supports_streaming: true,
    supports_tool_call: true,
    supports_multimodal: false,
    context_window: 128000,
    max_output_tokens: 16384,
    provider_metadata: {}
  },
  {
    model_id: 'gpt-4.1-mini',
    display_name: 'GPT-4.1 Mini',
    source: 'runtime_catalog',
    supports_streaming: true,
    supports_tool_call: true,
    supports_multimodal: false,
    context_window: 1048576,
    max_output_tokens: 32768,
    provider_metadata: {}
  }
];

const styleBoundaryProviderCatalog = [
  {
    installation_id: 'installation-openai-compatible',
    provider_code: 'openai_compatible',
    plugin_id: 'openai_compatible@0.1.0',
    plugin_version: '0.1.0',
    display_name: 'OpenAI Compatible',
    protocol: 'openai_responses',
    help_url: 'https://platform.openai.com/docs/api-reference/responses',
    default_base_url: 'https://api.openai.com/v1',
    model_discovery_mode: 'dynamic',
    supports_model_fetch_without_credentials: false,
    enabled: true,
    form_schema: [
      { key: 'base_url', field_type: 'string', required: true },
      { key: 'api_key', field_type: 'secret', required: true },
      { key: 'organization', field_type: 'string', required: false },
      { key: 'default_headers', field_type: 'json', required: false },
      { key: 'validate_model', field_type: 'boolean', required: false }
    ],
    predefined_models: styleBoundaryProviderModels
  }
];

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

const styleBoundaryProviderOptions = {
  instances: [
    {
      provider_instance_id: 'provider-openai-prod',
      provider_code: 'openai_compatible',
      protocol: 'openai_responses',
      display_name: 'OpenAI Production',
      models: styleBoundaryProviderModels
    }
  ]
};

const styleBoundaryOfficialPluginCatalog = [
  {
    plugin_id: '1flowbase.openai_compatible',
    provider_code: 'openai_compatible',
    display_name: 'OpenAI Compatible',
    protocol: 'openai_responses',
    latest_version: '0.1.0',
    help_url: 'https://github.com/taichuy/1flowbase-official-plugins/tree/main/models/openai_compatible',
    model_discovery_mode: 'hybrid',
    install_status: 'assigned'
  }
];

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
          data: styleBoundaryProviderOptions,
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
          data: styleBoundaryProviderCatalog,
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
      url.endsWith('/api/console/plugins/official-catalog')
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

    if (
      method.toUpperCase() === 'GET' &&
      url.endsWith('/api/console/model-providers/options')
    ) {
      return new Response(
        JSON.stringify({
          data: styleBoundaryProviderOptions,
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
