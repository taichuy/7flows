import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { resetAuthStore, useAuthStore } from '../../../../../state/auth-store';

const api = vi.hoisted(() => ({
  settingsHostInfrastructureProvidersQueryKey: [
    'settings',
    'host-infrastructure',
    'providers'
  ],
  fetchSettingsHostInfrastructureProviders: vi.fn(),
  saveSettingsHostInfrastructureProviderConfig: vi.fn()
}));

vi.mock('../../../api/host-infrastructure', () => api);

import { HostInfrastructurePanel } from '../HostInfrastructurePanel';

function renderPanel(canManage = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

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

  return render(
    <QueryClientProvider client={queryClient}>
      <HostInfrastructurePanel canManage={canManage} />
    </QueryClientProvider>
  );
}

describe('HostInfrastructurePanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetAuthStore();
  });

  test('renders installed inactive provider config from manifest schema', async () => {
    api.fetchSettingsHostInfrastructureProviders.mockResolvedValue([
      {
        installation_id: 'installation-1',
        extension_id: 'redis-infra-host',
        provider_code: 'redis',
        display_name: 'Redis',
        description: 'Redis backed host infrastructure.',
        runtime_status: 'inactive',
        desired_state: 'disabled',
        config_ref: 'secret://system/redis-infra-host/config',
        contracts: ['storage-ephemeral', 'cache-store'],
        enabled_contracts: [],
        config_schema: [
          { key: 'host', label: 'Host', type: 'string', required: true },
          { key: 'port', label: 'Port', type: 'number', required: true }
        ],
        config_json: {},
        restart_required: false
      }
    ]);

    renderPanel();

    expect(
      await screen.findByRole('heading', { name: '基础设施', level: 3 })
    ).toBeInTheDocument();
    expect(await screen.findByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('disabled')).toBeInTheDocument();
    expect(screen.getByText('inactive')).toBeInTheDocument();
    expect(screen.getByText('storage-ephemeral')).toBeInTheDocument();
    expect(screen.getByText('cache-store')).toBeInTheDocument();
  });

  test('renders pending restart state without claiming provider is active', async () => {
    api.fetchSettingsHostInfrastructureProviders.mockResolvedValue([
      {
        installation_id: 'installation-1',
        extension_id: 'redis-infra-host',
        provider_code: 'redis',
        display_name: 'Redis',
        description: null,
        runtime_status: 'inactive',
        desired_state: 'pending_restart',
        config_ref: 'secret://system/redis-infra-host/config',
        contracts: ['storage-ephemeral'],
        enabled_contracts: ['storage-ephemeral'],
        config_schema: [],
        config_json: {},
        restart_required: true
      }
    ]);

    renderPanel();

    expect(await screen.findByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('pending_restart')).toBeInTheDocument();
    expect(screen.getByText('inactive')).toBeInTheDocument();
    expect(screen.getByText('重启后生效')).toBeInTheDocument();
  });

  test('saves config and contract selection as one pending restart change', async () => {
    api.fetchSettingsHostInfrastructureProviders.mockResolvedValue([
      {
        installation_id: 'installation-1',
        extension_id: 'redis-infra-host',
        provider_code: 'redis',
        display_name: 'Redis',
        description: null,
        runtime_status: 'inactive',
        desired_state: 'disabled',
        config_ref: 'secret://system/redis-infra-host/config',
        contracts: ['storage-ephemeral', 'cache-store'],
        enabled_contracts: [],
        config_schema: [
          { key: 'host', label: 'Host', type: 'string', required: true },
          {
            key: 'port',
            label: 'Port',
            type: 'number',
            required: true,
            default_value: 6379
          },
          {
            key: 'password_ref',
            label: 'Password Secret Ref',
            type: 'string',
            send_mode: 'secret_ref'
          }
        ],
        config_json: {},
        restart_required: false
      }
    ]);
    api.saveSettingsHostInfrastructureProviderConfig.mockResolvedValue({
      restart_required: true,
      installation_desired_state: 'pending_restart',
      provider_config_status: 'pending_restart'
    });

    renderPanel(true);

    fireEvent.click(await screen.findByRole('button', { name: '配置' }));
    fireEvent.change(screen.getByLabelText('Host'), {
      target: { value: 'localhost' }
    });
    fireEvent.change(screen.getByLabelText('Port'), {
      target: { value: '6379' }
    });
    fireEvent.click(screen.getByLabelText('storage-ephemeral'));
    fireEvent.click(screen.getByRole('button', { name: '保存并等待重启' }));

    await waitFor(() => {
      expect(api.saveSettingsHostInfrastructureProviderConfig).toHaveBeenCalledWith(
        'installation-1',
        'redis',
        {
          enabled_contracts: ['storage-ephemeral'],
          config_json: {
            host: 'localhost',
            port: 6379
          }
        },
        'csrf-123'
      );
    });
    expect(
      await screen.findByText('已保存，重启 api-server 一次后生效。')
    ).toBeInTheDocument();
  });
});
