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
  settingsApiDocSpecQueryKey: vi.fn((operationId: string) => [
    'settings',
    'docs',
    'operation',
    operationId
  ]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiDocsCategoryOperations: vi.fn(),
  fetchSettingsApiOperationSpec: vi.fn()
}));

vi.mock('../api/api-docs', () => docsApi);
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
    configuration: { content: unknown };
  }) => <div data-testid="scalar-viewer">{JSON.stringify(configuration.content)}</div>
}));

import { AppProviders } from '../../../app/AppProviders';
import { ApiDocsPanel } from '../components/ApiDocsPanel';

const catalogPayload = {
  title: '1Flowse API',
  version: '0.1.0',
  categories: [
    {
      id: 'console',
      label: 'console',
      operation_count: 1
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

const consoleCategoryPayload = {
  id: 'console',
  label: 'console',
  operations: [
    {
      id: 'patch_me',
      method: 'PATCH',
      path: '/api/console/me',
      summary: 'Update current profile',
      description: null,
      tags: ['identity'],
      group: 'console',
      deprecated: false
    }
  ]
};

const runtimeCategoryPayload = {
  id: 'runtime',
  label: 'runtime',
  operations: [
    {
      id: 'list_runtime_jobs',
      method: 'GET',
      path: '/api/runtime/jobs',
      summary: 'Enumerate runtime jobs',
      description: null,
      tags: ['runtime'],
      group: 'runtime',
      deprecated: false
    }
  ]
};

const singletonCategoryPayload = {
  id: 'single:health',
  label: '/health',
  operations: [
    {
      id: 'health',
      method: 'GET',
      path: '/health',
      summary: 'Health check',
      description: null,
      tags: [],
      group: '/health',
      deprecated: false
    }
  ]
};

const categoryPayloadById = {
  console: consoleCategoryPayload,
  runtime: runtimeCategoryPayload,
  'single:health': singletonCategoryPayload
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

const runtimeJobsSpec = {
  openapi: '3.1.0',
  info: { title: '1Flowse API', version: '0.1.0' },
  paths: {
    '/api/runtime/jobs': {
      get: {
        operationId: 'list_runtime_jobs',
        responses: {
          '200': { description: 'ok' }
        }
      }
    }
  },
  components: {}
};

const operationSpecById = {
  patch_me: patchMeSpec,
  list_runtime_jobs: runtimeJobsSpec,
  health: {
    openapi: '3.1.0',
    info: { title: '1Flowse API', version: '0.1.0' },
    paths: {
      '/health': {
        get: {
          operationId: 'health',
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

describe('ApiDocsPanel', () => {
  beforeEach(() => {
    docsApi.fetchSettingsApiDocsCatalog.mockResolvedValue(catalogPayload);
    docsApi.fetchSettingsApiDocsCategoryOperations.mockImplementation((categoryId: string) =>
      Promise.resolve(categoryPayloadById[categoryId as keyof typeof categoryPayloadById])
    );
    docsApi.fetchSettingsApiOperationSpec.mockImplementation((operationId: string) =>
      Promise.resolve(operationSpecById[operationId as keyof typeof operationSpecById])
    );
  });

  test('renders category select and the default category operations after catalog loads', async () => {
    renderApp('/settings/docs');

    expect(await screen.findByRole('combobox', { name: '接口分类' })).toBeInTheDocument();
    expect(await screen.findByText('Update current profile')).toBeInTheDocument();
    expect(
      await screen.findByText('选择一个接口查看详情', {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByText('console')).toBeInTheDocument();
    expect(docsApi.fetchSettingsApiDocsCategoryOperations).toHaveBeenCalledWith('console');
  });

  test('filters operations within the selected category by path method summary tags and id', async () => {
    renderApp('/settings/docs');

    await screen.findByText('Update current profile');
    const searchInput = screen.getByPlaceholderText('搜索接口');

    fireEvent.change(searchInput, { target: { value: 'PATCH' } });
    await waitFor(() => {
      expect(screen.getByText('Update current profile')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'console' } });
    await waitFor(() => {
      expect(screen.getByText('Update current profile')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'profile' } });
    await waitFor(() => {
      expect(screen.getByText('Update current profile')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'identity' } });
    await waitFor(() => {
      expect(screen.getByText('Update current profile')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'patch_me' } });
    await waitFor(() => {
      expect(screen.getByText('Update current profile')).toBeInTheDocument();
    });
  });

  test('does not request operation detail until an operation is selected', async () => {
    renderApp('/settings/docs');

    await screen.findByText('选择一个接口查看详情');
    expect(docsApi.fetchSettingsApiOperationSpec).not.toHaveBeenCalled();
  });

  test('loads operation detail from ?operation=patch_me and passes it to Scalar', async () => {
    renderApp('/settings/docs?category=console&operation=patch_me');

    expect(await screen.findByTestId('scalar-viewer')).toHaveTextContent('patch_me');
    expect(docsApi.fetchSettingsApiOperationSpec).toHaveBeenCalledWith('patch_me');
  });

  test('switches category from the dropdown and loads that category operations', async () => {
    renderApp('/settings/docs');

    const categorySelect = await screen.findByRole('combobox', { name: '接口分类' });
    fireEvent.mouseDown(categorySelect);

    const runtimeOption = await screen.findByText('runtime', {
      selector: '.ant-select-item-option-content'
    });
    fireEvent.click(runtimeOption);

    expect(await screen.findByText('Enumerate runtime jobs')).toBeInTheDocument();
    expect(docsApi.fetchSettingsApiDocsCategoryOperations).toHaveBeenCalledWith('runtime');
    expect(screen.queryByText('Update current profile')).not.toBeInTheDocument();
  });

  test('imports Scalar stylesheet for the detail renderer', async () => {
    const componentSource = await readFile(
      path.resolve(process.cwd(), 'src/features/settings/components/ApiDocsPanel.tsx'),
      'utf8'
    );

    expect(componentSource).toContain("import '@scalar/api-reference-react/style.css';");
  });

  test('uses a 2:8 desktop layout for catalog and detail panes', async () => {
    const cssSource = await readFile(
      path.resolve(process.cwd(), 'src/features/settings/components/api-docs-panel.css'),
      'utf8'
    );

    expect(cssSource).toContain(
      'grid-template-columns: minmax(280px, 2fr) minmax(0, 8fr);'
    );
  });
});
