import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Grid } from 'antd';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiClientError } from '@1flowbase/api-client';
import { AppProviders } from '../../app/AppProviders';
import { AppRouterProvider } from '../../app/router';
import { resetAuthStore, useAuthStore } from '../../state/auth-store';

const applicationApi = vi.hoisted(() => ({
  applicationsQueryKey: ['applications'],
  applicationCatalogQueryKey: ['applications', 'catalog'],
  applicationDetailQueryKey: (applicationId: string) => ['applications', applicationId],
  fetchApplications: vi.fn(),
  fetchApplicationCatalog: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  createApplicationTag: vi.fn(),
  fetchApplicationDetail: vi.fn()
}));

vi.mock('../../features/applications/api/applications', () => applicationApi);

const orchestrationApi = vi.hoisted(() => ({
  orchestrationQueryKey: (applicationId: string) => [
    'applications',
    applicationId,
    'orchestration'
  ],
  fetchOrchestrationState: vi.fn(),
  saveDraft: vi.fn(),
  restoreVersion: vi.fn()
}));

vi.mock('../../features/agent-flow/api/orchestration', () => orchestrationApi);

const nodeContributionsApi = vi.hoisted(() => ({
  nodeContributionsQueryKey: (applicationId: string) => [
    'applications',
    applicationId,
    'node-contributions'
  ],
  fetchNodeContributions: vi.fn()
}));

vi.mock(
  '../../features/agent-flow/api/node-contributions',
  () => nodeContributionsApi
);

function authenticate() {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: {
      id: 'user-1',
      account: 'manager',
      effective_display_role: 'manager',
      current_workspace_id: 'workspace-1'
    },
    me: {
      id: 'user-1',
      account: 'manager',
      email: 'manager@example.com',
      phone: null,
      nickname: 'Manager',
      name: 'Manager',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'manager',
      permissions: ['route_page.view.all', 'application.view.all']
    }
  });
}

describe('application shell routing', () => {
  beforeEach(() => {
    resetAuthStore();
    authenticate();
    applicationApi.fetchApplications.mockReset();
    applicationApi.fetchApplications.mockResolvedValue([]);
    applicationApi.fetchApplicationCatalog.mockReset();
    applicationApi.fetchApplicationCatalog.mockResolvedValue({
      types: [{ value: 'agent_flow', label: 'AgentFlow' }],
      tags: []
    });
    applicationApi.fetchApplicationDetail.mockReset();
    applicationApi.fetchApplicationDetail.mockResolvedValue({
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
    });
    orchestrationApi.fetchOrchestrationState.mockReset();
    orchestrationApi.fetchOrchestrationState.mockResolvedValue({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-1',
        flow_id: 'flow-1',
        updated_at: '2026-04-15T09:00:00Z',
        document: {
          schemaVersion: '1flowbase.flow/v1',
          meta: {
            flowId: 'flow-1',
            name: 'Untitled agentFlow',
            description: '',
            tags: []
          },
          graph: {
            nodes: [],
            edges: []
          },
          editor: {
            viewport: { x: 0, y: 0, zoom: 1 },
            annotations: [],
            activeContainerPath: []
          }
        }
      },
      versions: [],
      autosave_interval_seconds: 30
    });
    nodeContributionsApi.fetchNodeContributions.mockReset();
    nodeContributionsApi.fetchNodeContributions.mockResolvedValue([]);
    orchestrationApi.saveDraft.mockReset();
    orchestrationApi.saveDraft.mockResolvedValue({
      flow_id: 'flow-1',
      draft: {
        id: 'draft-1',
        flow_id: 'flow-1',
        updated_at: '2026-04-15T09:10:00Z',
        document: {
          schemaVersion: '1flowbase.flow/v1',
          meta: {
            flowId: 'flow-1',
            name: 'Untitled agentFlow',
            description: '',
            tags: []
          },
          graph: {
            nodes: [],
            edges: []
          },
          editor: {
            viewport: { x: 0, y: 0, zoom: 1 },
            annotations: [],
            activeContainerPath: []
          }
        }
      },
      versions: [],
      autosave_interval_seconds: 30
    });
  });

  test('redirects /applications/:id to orchestration', async () => {
    window.history.pushState({}, '', '/applications/app-1');
    render(
      <AppProviders>
        <AppRouterProvider />
      </AppProviders>
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe('/applications/app-1/orchestration');
    });
  });

  test('renders section navigation and planned API copy', async () => {
    window.history.pushState({}, '', '/applications/app-1/api');
    render(
      <AppProviders>
        <AppRouterProvider />
      </AppProviders>
    );

    expect(
      await screen.findByRole('heading', { name: 'Support Agent', level: 4 })
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Section navigation' })).toBeInTheDocument();
    expect(screen.getByText(/API Key 绑定应用/i)).toBeInTheDocument();
  });

  test('renders the editor page inside orchestration', async () => {
    const desktopBreakpoints = vi
      .spyOn(Grid, 'useBreakpoint')
      .mockReturnValue({ lg: true } as never);

    window.history.pushState({}, '', '/applications/app-1/orchestration');

    try {
      render(
        <AppProviders>
          <AppRouterProvider />
        </AppProviders>
      );

      expect(await screen.findByText('30 秒自动保存')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Issues' })).toBeInTheDocument();
    } finally {
      desktopBreakpoints.mockRestore();
    }
  });

  test('keeps orchestration draft save enabled when application api capability is planned', async () => {
    const desktopBreakpoints = vi
      .spyOn(Grid, 'useBreakpoint')
      .mockReturnValue({ lg: true } as never);

    window.history.pushState({}, '', '/applications/app-1/orchestration');

    try {
      render(
        <AppProviders>
          <AppRouterProvider />
        </AppProviders>
      );

      fireEvent.click(await screen.findByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(orchestrationApi.saveDraft).toHaveBeenCalledTimes(1);
      });
    } finally {
      desktopBreakpoints.mockRestore();
    }
  });

  test('renders formal 403 state for inaccessible applications', async () => {
    applicationApi.fetchApplicationDetail.mockRejectedValue(
      new ApiClientError({ status: 403, message: 'forbidden' })
    );

    window.history.pushState({}, '', '/applications/app-1/logs');
    render(
      <AppProviders>
        <AppRouterProvider />
      </AppProviders>
    );

    expect(await screen.findByText('无权限访问')).toBeInTheDocument();
  });
});
