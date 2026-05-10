import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const publicApi = vi.hoisted(() => ({
  applicationApiKeysQueryKey: vi.fn((applicationId: string) => [
    'applications',
    applicationId,
    'public-api',
    'keys'
  ]),
  applicationApiMappingQueryKey: vi.fn((applicationId: string) => [
    'applications',
    applicationId,
    'public-api',
    'mapping'
  ]),
  applicationApiPublicationQueryKey: vi.fn((applicationId: string) => [
    'applications',
    applicationId,
    'public-api',
    'publication'
  ]),
  applicationApiDocsCatalogQueryKey: vi.fn(),
  applicationApiDocsCategoryOperationsQueryKey: vi.fn(),
  applicationApiDocsOperationSpecQueryKey: vi.fn(),
  fetchApplicationApiKeys: vi.fn(),
  createApplicationApiKey: vi.fn(),
  revokeApplicationApiKey: vi.fn(),
  fetchApplicationApiMapping: vi.fn(),
  saveApplicationApiMapping: vi.fn(),
  fetchApplicationApiPublication: vi.fn(),
  publishApplicationApiVersion: vi.fn(),
  setApplicationApiEnabled: vi.fn(),
  fetchApplicationApiDocsCatalog: vi.fn(),
  fetchApplicationApiDocsCategoryOperations: vi.fn(),
  fetchApplicationApiDocsOperationSpec: vi.fn()
}));

vi.mock('../api/public-api', () => publicApi);
vi.mock('../../../shared/ui/api-docs/ApiDocsExplorer', () => ({
  ApiDocsExplorer: () => <div>docs explorer</div>
}));

import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import type { ApplicationDetail } from '../api/applications';
import { ApplicationApiKeysPanel } from '../components/api/ApplicationApiKeysPanel';
import { ApplicationApiPage } from '../pages/ApplicationApiPage';

const mapping = {
  input: {
    query_target: 'start.query',
    model_target: null,
    inputs_target: 'start.inputs',
    history_target: 'start.history',
    attachments_target: 'start.attachments'
  },
  output: {
    answer_selector: 'answer',
    usage_selector: null,
    files_selector: null,
    error_selector: null
  }
};

const application: ApplicationDetail = {
  id: 'app-1',
  application_type: 'agent_flow',
  name: 'Support Agent',
  description: 'customer support',
  icon: null,
  icon_type: null,
  icon_background: null,
  created_by: 'user-1',
  updated_at: '2026-05-09T00:00:00Z',
  tags: [],
  sections: {
    orchestration: {
      status: 'ready',
      subject_kind: 'agent_flow',
      subject_status: 'ready',
      current_subject_id: 'flow-1',
      current_draft_id: 'draft-1'
    },
    api: {
      status: 'configured',
      credential_kind: 'application_api_key',
      invoke_routing_mode: 'api_key_bound_application',
      invoke_path_template: '/api/1flowbase/runs',
      api_capability_status: 'enabled',
      credentials_status: 'active'
    },
    logs: {
      status: 'ready',
      runs_capability_status: 'enabled',
      run_object_kind: 'application_run',
      log_retention_status: 'enabled'
    },
    monitoring: {
      status: 'planned',
      metrics_capability_status: 'planned',
      metrics_object_kind: 'application_metrics',
      tracing_config_status: 'not_configured'
    }
  }
};

function renderWithProviders(ui: ReactNode) {
  return render(<AppProviders>{ui}</AppProviders>);
}

describe('ApplicationApiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStore();
    useAuthStore.getState().setAuthenticated({
      csrfToken: 'csrf-123',
      actor: {
        id: 'user-1',
        account: 'root',
        effective_display_role: 'root',
        current_workspace_id: 'workspace-1'
      },
      me: null
    });
    publicApi.fetchApplicationApiPublication.mockRejectedValue(
      new Error('application_not_published')
    );
    publicApi.fetchApplicationApiMapping.mockResolvedValue(mapping);
    publicApi.fetchApplicationApiKeys.mockResolvedValue([]);
  });

  test('renders API section shell with status, tabs, and publish action', async () => {
    renderWithProviders(<ApplicationApiPage application={application} />);

    expect(await screen.findByText('需要先发布公开 API')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建 Key' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'API Keys' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Native API' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'OpenAI Compatible' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Anthropic Compatible' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mapping' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Debug' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布当前版本' })).toBeInTheDocument();
  });

  test('does not duplicate endpoint summaries above the API tabs', async () => {
    publicApi.fetchApplicationApiPublication.mockResolvedValue({
      id: 'publication-1',
      version_sequence: 1,
      api_enabled: true,
      mapping_snapshot: mapping,
      created_at: '2026-05-09T00:00:00Z',
      updated_at: '2026-05-09T00:00:00Z'
    });

    const { container } = renderWithProviders(<ApplicationApiPage application={application} />);

    const statusCard = await waitFor(() => {
      const node = container.querySelector('.application-api-status');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });

    expect(within(statusCard).queryByText('Native')).not.toBeInTheDocument();
    expect(within(statusCard).queryByText('OpenAI')).not.toBeInTheDocument();
    expect(within(statusCard).queryByText('Anthropic')).not.toBeInTheDocument();
    expect(within(statusCard).queryByText('/api/1flowbase/runs')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Native API' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'OpenAI Compatible' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Anthropic Compatible' })).toBeInTheDocument();
  });

  test('keeps API Keys inside the public API header card when published', async () => {
    publicApi.fetchApplicationApiPublication.mockResolvedValue({
      id: 'publication-1',
      version_sequence: 1,
      api_enabled: true,
      mapping_snapshot: mapping,
      created_at: '2026-05-09T00:00:00Z',
      updated_at: '2026-05-09T00:00:00Z'
    });
    publicApi.fetchApplicationApiKeys.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Server key',
        token_prefix: 'apk_',
        creator_user_id: 'user-1',
        enabled: true,
        expires_at: null,
        created_at: '2026-05-09T00:00:00Z',
        updated_at: '2026-05-09T00:00:00Z'
      }
    ]);

    const { container } = renderWithProviders(<ApplicationApiPage application={application} />);

    const statusCard = await waitFor(() => {
      const node = container.querySelector('.application-api-status');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });

    expect(within(statusCard).getByText('API Keys')).toBeInTheDocument();
    expect(await within(statusCard).findByText('Server key')).toBeInTheDocument();
    expect(
      within(statusCard).getByRole('button', { name: '创建 Key' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'API Keys' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Native API' })).toBeInTheDocument();
  });

  test('shows created token once without writing it to storage or URL', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    publicApi.createApplicationApiKey.mockResolvedValue({
      id: 'key-1',
      name: 'Server key',
      token: 'apk_full_secret',
      token_prefix: 'apk_',
      creator_user_id: 'user-1',
      enabled: true,
      expires_at: null,
      created_at: '2026-05-09T00:00:00Z',
      updated_at: '2026-05-09T00:00:00Z'
    });

    renderWithProviders(
      <ApplicationApiKeysPanel
        applicationId="app-1"
        csrfToken="csrf-123"
        onCreatedToken={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '创建 Key' }));
    fireEvent.change(screen.getByLabelText('Key 名称'), {
      target: { value: 'Server key' }
    });
    const createButtons = screen.getAllByRole('button', { name: /创\s*建/ });
    fireEvent.click(createButtons[createButtons.length - 1]);

    expect(await screen.findByText('apk_full_secret')).toBeInTheDocument();
    expect(publicApi.createApplicationApiKey).toHaveBeenCalledWith(
      'app-1',
      'Server key',
      'csrf-123'
    );
    expect(storageSpy).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('apk_full_secret');

    fireEvent.click(screen.getByRole('button', { name: /关\s*闭/ }));

    await waitFor(() => {
      expect(screen.queryByText('apk_full_secret')).not.toBeInTheDocument();
    });
  });
});
