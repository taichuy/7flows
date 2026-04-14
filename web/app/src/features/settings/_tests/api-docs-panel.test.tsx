import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const docsApi = vi.hoisted(() => ({
  settingsApiDocsCatalogQueryKey: ['settings', 'docs', 'catalog'],
  settingsApiDocSpecQueryKey: vi.fn((operationId: string) => [
    'settings',
    'docs',
    'operation',
    operationId
  ]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiOperationSpec: vi.fn()
}));

vi.mock('../api/api-docs', () => docsApi);
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({
    configuration
  }: {
    configuration: { content: unknown };
  }) => <div data-testid="scalar-viewer">{JSON.stringify(configuration.content)}</div>
}));

import { AppProviders } from '../../../app/AppProviders';
import { AppRouterProvider } from '../../../app/router';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';

const catalogPayload = {
  title: '1Flowse API',
  version: '0.1.0',
  operations: [
    {
      id: 'patch_me',
      method: 'PATCH',
      path: '/api/console/me',
      summary: 'Update current profile',
      description: null,
      tags: ['identity'],
      group: 'identity',
      deprecated: false
    },
    {
      id: 'list_members',
      method: 'GET',
      path: '/api/console/members',
      summary: 'Enumerate workspace staff',
      description: null,
      tags: ['directory'],
      group: 'members',
      deprecated: false
    }
  ]
};

const patchMeSpec = {
  openapi: '3.1.0',
  info: { title: '1Flowse API', version: '0.1.0' },
  paths: {
    '/api/console/me': {
      patch: {
        operationId: 'patch_me',
        responses: {
          '200': { description: 'ok' }
        }
      }
    }
  },
  components: {}
};

function authenticateDocsViewer() {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: {
      id: 'user-1',
      account: 'docs-viewer',
      effective_display_role: 'manager',
      current_workspace_id: 'workspace-1'
    },
    me: {
      id: 'user-1',
      account: 'docs-viewer',
      email: 'docs@example.com',
      phone: null,
      nickname: 'Docs',
      name: 'Docs',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'manager',
      permissions: ['api_reference.view.all']
    }
  });
}

function renderApp(pathname: string) {
  window.history.pushState({}, '', pathname);

  return render(
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  );
}

describe('ApiDocsPanel', () => {
  beforeEach(() => {
    resetAuthStore();
    authenticateDocsViewer();
    docsApi.fetchSettingsApiDocsCatalog.mockResolvedValue(catalogPayload);
    docsApi.fetchSettingsApiOperationSpec.mockResolvedValue(patchMeSpec);
  });

  test('renders the internal-docs empty state after catalog loads', async () => {
    renderApp('/settings/docs');

    expect(await screen.findByText('选择一个接口查看详情')).toBeInTheDocument();
    expect(screen.getByText('Update current profile')).toBeInTheDocument();
    expect(screen.getByText('Enumerate workspace staff')).toBeInTheDocument();
  });

  test('filters catalog rows by path method summary tags and id', async () => {
    renderApp('/settings/docs');

    await screen.findByText('Enumerate workspace staff');
    const searchInput = screen.getByPlaceholderText('搜索接口');

    fireEvent.change(searchInput, { target: { value: 'GET' } });
    await waitFor(() => {
      expect(screen.getByText('Enumerate workspace staff')).toBeInTheDocument();
      expect(screen.queryByText('Update current profile')).not.toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'members' } });
    await waitFor(() => {
      expect(screen.getByText('Enumerate workspace staff')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'staff' } });
    await waitFor(() => {
      expect(screen.getByText('Enumerate workspace staff')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'directory' } });
    await waitFor(() => {
      expect(screen.getByText('Enumerate workspace staff')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'list_members' } });
    await waitFor(() => {
      expect(screen.getByText('Enumerate workspace staff')).toBeInTheDocument();
    });
  });

  test('does not request operation detail until an operation is selected', async () => {
    renderApp('/settings/docs');

    await screen.findByText('选择一个接口查看详情');
    expect(docsApi.fetchSettingsApiOperationSpec).not.toHaveBeenCalled();
  });

  test('loads operation detail from ?operation=patch_me and passes it to Scalar', async () => {
    renderApp('/settings/docs?operation=patch_me');

    expect(await screen.findByTestId('scalar-viewer')).toHaveTextContent('patch_me');
    expect(docsApi.fetchSettingsApiOperationSpec).toHaveBeenCalledWith('patch_me');
  });
});
