import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const docsApi = vi.hoisted(() => ({
  settingsApiDocsCatalogQueryKey: ['settings', 'docs', 'catalog'],
  settingsApiDocsCategoryOperationsQueryKey: vi.fn((categoryId: string) => [
    'settings',
    'docs',
    'category',
    categoryId,
    'operations'
  ]),
  settingsApiDocsOperationSpecQueryKey: vi.fn((operationId: string) => [
    'settings',
    'docs',
    'operation',
    operationId,
    'openapi'
  ]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiDocsCategoryOperations: vi.fn(),
  fetchSettingsApiDocsOperationSpec: vi.fn()
}));

const authApi = vi.hoisted(() => ({
  fetchCurrentSession: vi.fn(),
  getAuthApiBaseUrl: vi.fn(() => 'http://127.0.0.1:7800'),
  getScalarApiBaseUrl: vi.fn(() => 'http://127.0.0.1:3100')
}));

vi.mock('../api/api-docs', () => docsApi);
vi.mock('../../auth/api/session', () => authApi);
vi.mock('@tanstack/react-router', async () => {
  const React = await import('react');

  return {
    useRouterState: ({
      select
    }: {
      select: (state: { location: { search: Record<string, string> } }) => unknown;
    }) => {
      const search = React.useSyncExternalStore(
        (onStoreChange) => {
          window.addEventListener('popstate', onStoreChange);
          return () => window.removeEventListener('popstate', onStoreChange);
        },
        () => window.location.search,
        () => window.location.search
      );

      return select({
        location: {
          search: Object.fromEntries(new URLSearchParams(search))
        }
      });
    }
  };
});
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({
    configuration
  }: {
    configuration: unknown;
  }) => <div data-testid="scalar-viewer">{JSON.stringify(configuration)}</div>
}));

import { AppProviders } from '../../../app/AppProviders';
import { ApiDocsPanel } from '../components/ApiDocsPanel';
import { normalizeScalarClipboardText } from '../lib/scalar-clipboard';

const catalogPayload = {
  title: '1Flowbase API',
  version: '0.1.0',
  categories: [
    {
      id: 'console',
      label: 'console',
      operation_count: 2
    },
    {
      id: 'runtime',
      label: 'runtime',
      operation_count: 1
    },
    {
      id: 'single:health',
      label: '/health',
      operation_count: 1
    }
  ]
};

const categoryOperationsById = {
  console: {
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
  runtime: {
    id: 'runtime',
    label: 'runtime',
    operations: [
      {
        id: 'list_runtime_jobs',
        method: 'GET',
        path: '/api/runtime/jobs',
        summary: 'Enumerate runtime jobs',
        description: 'Enumerate runtime jobs',
        tags: ['runtime'],
        group: 'runtime',
        deprecated: false
      }
    ]
  },
  'single:health': {
    id: 'single:health',
    label: '/health',
    operations: [
      {
        id: 'health',
        method: 'GET',
        path: '/health',
        summary: 'Health check',
        description: 'Health check',
        tags: ['health'],
        group: '/health',
        deprecated: false
      }
    ]
  }
};

const operationSpecById = {
  patch_me: {
    openapi: '3.1.0',
    info: { title: '1Flowbase API', version: '0.1.0' },
    servers: [{ url: '/' }],
    security: [{ sessionCookie: [], csrfHeader: [] }],
    paths: {
      '/api/console/me': {
        patch: {
          operationId: 'patch_me',
          summary: 'Update current profile',
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '200': { description: 'ok' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'flowse_console_session'
        },
        csrfHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'x-csrf-token'
        }
      }
    }
  },
  list_members: {
    openapi: '3.1.0',
    info: { title: '1Flowbase API', version: '0.1.0' },
    servers: [{ url: '/' }],
    security: [{ sessionCookie: [] }],
    paths: {
      '/api/console/members': {
        get: {
          operationId: 'list_members',
          summary: 'List members',
          security: [{ sessionCookie: [] }],
          responses: {
            '200': { description: 'ok' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'flowse_console_session'
        },
        csrfHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'x-csrf-token'
        }
      }
    }
  },
  list_runtime_jobs: {
    openapi: '3.1.0',
    info: { title: '1Flowbase API', version: '0.1.0' },
    paths: {
      '/api/runtime/jobs': {
        get: {
          operationId: 'list_runtime_jobs',
          summary: 'Enumerate runtime jobs',
          responses: {
            '200': { description: 'ok' }
          }
        }
      }
    },
    components: {}
  },
  health: {
    openapi: '3.1.0',
    info: { title: '1Flowbase API', version: '0.1.0' },
    paths: {
      '/health': {
        get: {
          operationId: 'health',
          summary: 'Health check',
          responses: {
            '200': { description: 'ok' }
          }
        }
      }
    },
    components: {}
  }
};

function renderApp(pathname: string) {
  window.history.pushState({}, '', pathname);

  return render(
    <AppProviders>
      <ApiDocsPanel />
    </AppProviders>
  );
}

async function selectCategory(label: string) {
  const combobox = await screen.findByRole('combobox', { name: '接口分类' });

  fireEvent.mouseDown(combobox);

  const [option] = await screen.findAllByText((_, element) => {
    if (!element) {
      return false;
    }

    return (
      element.matches('.ant-select-item-option-content') &&
      Boolean(element.textContent?.includes(label))
    );
  });

  fireEvent.click(option);
}

describe('ApiDocsPanel', () => {
  beforeEach(() => {
    docsApi.fetchSettingsApiDocsCatalog.mockResolvedValue(catalogPayload);
    docsApi.fetchSettingsApiDocsCategoryOperations.mockImplementation((categoryId: string) =>
      Promise.resolve(
        categoryOperationsById[categoryId as keyof typeof categoryOperationsById]
      )
    );
    docsApi.fetchSettingsApiDocsOperationSpec.mockImplementation((operationId: string) =>
      Promise.resolve(operationSpecById[operationId as keyof typeof operationSpecById])
    );
    authApi.fetchCurrentSession.mockResolvedValue({
      actor: {
        id: 'user-1',
        account: 'root',
        effective_display_role: 'root',
        current_workspace_id: 'workspace-1'
      },
      session: {
        id: 'session-123',
        user_id: 'user-1',
        tenant_id: 'tenant-1',
        current_workspace_id: 'workspace-1'
      },
      csrf_token: 'csrf-123',
      cookie_name: 'flowse_console_session'
    });
  });

  test('renders a header category selector and keeps the detail empty until an operation is chosen', async () => {
    renderApp('/settings/docs');

    expect(await screen.findByRole('combobox', { name: '接口分类' })).toBeInTheDocument();
    expect(screen.getByText('选择一个分类后查看接口列表')).toBeInTheDocument();
    expect(screen.getByText('选择接口后查看详情')).toBeInTheDocument();
    expect(docsApi.fetchSettingsApiDocsCategoryOperations).not.toHaveBeenCalled();
    expect(docsApi.fetchSettingsApiDocsOperationSpec).not.toHaveBeenCalled();
  });

  test('loads operations after selecting a category and keeps detail blank until an operation is chosen', async () => {
    renderApp('/settings/docs');

    await selectCategory('console');

    await waitFor(() => {
      expect(window.location.search).toBe('?category=console');
    });

    expect(await screen.findByRole('button', { name: /patch \/api\/console\/me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get \/api\/console\/members/i })).toBeInTheDocument();
    expect(screen.getByText('选择接口后查看详情')).toBeInTheDocument();
    expect(docsApi.fetchSettingsApiDocsCategoryOperations).toHaveBeenCalledWith('console');
    expect(docsApi.fetchSettingsApiDocsOperationSpec).not.toHaveBeenCalled();
  });

  test('loads a single operation detail after choosing an operation and keeps scalar features enabled', async () => {
    renderApp('/settings/docs?category=console');

    fireEvent.click(await screen.findByRole('button', { name: /get \/api\/console\/members/i }));

    await waitFor(() => {
      expect(window.location.search).toBe('?category=console&operation=list_members');
    });

    expect(await screen.findByTestId('scalar-viewer')).toHaveTextContent('/api/console/members');
    expect(screen.getByTestId('scalar-viewer')).not.toHaveTextContent('"operationId":"patch_me"');
    expect(screen.getByTestId('scalar-viewer')).toHaveTextContent('"baseServerURL":"http://127.0.0.1:3100"');
    expect(screen.getByTestId('scalar-viewer')).toHaveTextContent('"preferredSecurityScheme":["sessionCookie"]');
    expect(screen.getByTestId('scalar-viewer')).toHaveTextContent('"value":"session-123"');
    expect(screen.getByTestId('scalar-viewer')).toHaveTextContent('"value":"csrf-123"');
    expect(screen.getByTestId('scalar-viewer')).not.toHaveTextContent(
      '"hideTestRequestButton":true'
    );
    expect(screen.getByTestId('scalar-viewer')).not.toHaveTextContent('"hiddenClients":true');
    expect(screen.getByTestId('scalar-viewer')).not.toHaveTextContent(
      '"documentDownloadType":"none"'
    );
    expect(docsApi.fetchSettingsApiDocsOperationSpec).toHaveBeenCalledWith('list_members');
    expect(authApi.fetchCurrentSession).toHaveBeenCalled();
    expect(authApi.getScalarApiBaseUrl).toHaveBeenCalled();
  });

  test('uses the dedicated Scalar base URL override when provided', async () => {
    authApi.getScalarApiBaseUrl.mockReturnValueOnce('https://docs.flowse.test');

    renderApp('/settings/docs?category=console');

    fireEvent.click(await screen.findByRole('button', { name: /get \/api\/console\/members/i }));

    await waitFor(() => {
      expect(window.location.search).toBe('?category=console&operation=list_members');
    });

    expect(await screen.findByTestId('scalar-viewer')).toHaveTextContent(
      '"baseServerURL":"https://docs.flowse.test"'
    );
  });

  test('uses cookie plus csrf authentication defaults for mutating console operations', async () => {
    renderApp('/settings/docs?category=console');

    fireEvent.click(await screen.findByRole('button', { name: /patch \/api\/console\/me/i }));

    await waitFor(() => {
      expect(window.location.search).toBe('?category=console&operation=patch_me');
    });

    expect(await screen.findByTestId('scalar-viewer')).toHaveTextContent(
      '"preferredSecurityScheme":["sessionCookie","csrfHeader"]'
    );
    expect(screen.getByTestId('scalar-viewer')).toHaveTextContent(
      '"name":"flowse_console_session"'
    );
    expect(screen.getByTestId('scalar-viewer')).toHaveTextContent('"name":"x-csrf-token"');
  });

  test('loads the deep-linked category and operation into the list-detail flow', async () => {
    renderApp('/settings/docs?category=single%3Ahealth&operation=health');

    expect(await screen.findByRole('combobox', { name: '接口分类' })).toBeInTheDocument();
    expect(screen.getByText('/health')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /get \/health/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await screen.findByTestId('scalar-viewer')).toHaveTextContent('/health');
    expect(docsApi.fetchSettingsApiDocsCategoryOperations).toHaveBeenCalledWith('single:health');
    expect(docsApi.fetchSettingsApiDocsOperationSpec).toHaveBeenCalledWith('health');
  });

  test('imports Scalar stylesheet for the detail renderer', async () => {
    const componentSource = await readFile(
      path.resolve(process.cwd(), 'src/features/settings/components/ApiDocsPanel.tsx'),
      'utf8'
    );

    expect(componentSource).toContain("import '@scalar/api-reference-react/style.css';");
  });

  test('removes the old fixed-height and clipped detail wrapper styles', async () => {
    const cssSource = await readFile(
      path.resolve(process.cwd(), 'src/features/settings/components/api-docs-panel.css'),
      'utf8'
    );

    expect(cssSource).not.toContain('min-height: 720px');
    expect(cssSource).not.toContain('.api-docs-panel__detail-viewer {\n  overflow: hidden;');
    expect(cssSource).toContain('.api-docs-panel__detail-viewer {\n  min-width: 0;\n  height: 100%;\n}');
  });

  test('normalizes Scalar deep links into raw endpoint paths before copying', () => {
    expect(
      normalizeScalarClipboardText(
        'http://192.168.184.130:3100/settings/docs?category=runtime&operation=create_record#tag/crateroutesruntime_models/POST/api/runtime/models/{model_code}/records'
      )
    ).toBe('/api/runtime/models/{model_code}/records');
    expect(
      normalizeScalarClipboardText(
        'http://192.168.184.130:3100/settings/docs?category=runtime#GET/api/runtime/jobs'
      )
    ).toBe('/api/runtime/jobs');
  });
});
