import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({ configuration }: { configuration: unknown }) => (
    <div data-testid="scalar-viewer">{JSON.stringify(configuration)}</div>
  )
}));

import { AppProviders } from '../../../../app/AppProviders';
import { ApiDocsExplorer } from '../ApiDocsExplorer';

const catalog = {
  title: 'Application API',
  version: '1.0.0',
  categories: [
    { id: 'application-native-api', label: 'Application Native API', operation_count: 2 },
    { id: 'openai-compatible-api', label: 'OpenAI Compatible', operation_count: 1 }
  ]
};

const operationsByCategory = {
  'application-native-api': {
    id: 'application-native-api',
    label: 'Application Native API',
    operations: [
      {
        id: 'create_native_run',
        method: 'POST',
        path: '/api/1flowbase/runs',
        summary: 'Create Native public run',
        description: 'Create Native public run',
        tags: ['native'],
        group: 'application-native-api',
        deprecated: false
      },
      {
        id: 'get_native_run',
        method: 'GET',
        path: '/api/1flowbase/runs/{run_id}',
        summary: 'Get Native public run',
        description: 'Get Native public run',
        tags: ['native'],
        group: 'application-native-api',
        deprecated: false
      }
    ]
  },
  'openai-compatible-api': {
    id: 'openai-compatible-api',
    label: 'OpenAI Compatible',
    operations: [
      {
        id: 'create_chat_completion',
        method: 'POST',
        path: '/v1/chat/completions',
        summary: 'Create chat completion',
        description: 'Create chat completion',
        tags: ['openai'],
        group: 'openai-compatible-api',
        deprecated: false
      }
    ]
  }
};

describe('ApiDocsExplorer', () => {
  test('shows all operations by default when no category is selected and aggregation is enabled', async () => {
    const fetchCategoryOperations = vi.fn((categoryId: string) =>
      Promise.resolve(
        operationsByCategory[categoryId as keyof typeof operationsByCategory]
      )
    );

    render(
      <AppProviders>
        <ApiDocsExplorer
          queryState={{ categoryId: null, operationId: null }}
          onQueryStateChange={vi.fn()}
          catalogQueryKey={['api-docs', 'catalog']}
          fetchCatalog={() => Promise.resolve(catalog)}
          categoryOperationsQueryKey={(categoryId) => [
            'api-docs',
            'category',
            categoryId
          ]}
          fetchCategoryOperations={fetchCategoryOperations}
          operationSpecQueryKey={(operationId) => [
            'api-docs',
            'operation',
            operationId
          ]}
          fetchOperationSpec={() => Promise.resolve({})}
          baseServerUrl="http://127.0.0.1:3100"
          showAllOperationsWhenNoCategory
        />
      </AppProviders>
    );

    expect(await screen.findByRole('combobox', { name: '接口分类' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchCategoryOperations).toHaveBeenCalledWith('application-native-api');
      expect(fetchCategoryOperations).toHaveBeenCalledWith('openai-compatible-api');
    });
    expect(await screen.findByText('全部分类 共 3 个接口')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post \/api\/1flowbase\/runs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get \/api\/1flowbase\/runs\/\{run_id\}/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post \/v1\/chat\/completions/i })).toBeInTheDocument();
    expect(screen.queryByText('选择一个分类后查看接口列表')).not.toBeInTheDocument();
  });
});
