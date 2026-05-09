import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const explorerState = vi.hoisted(() => ({
  lastProps: null as null | {
    queryState: { categoryId: string | null; operationId: string | null };
    onQueryStateChange: (next: {
      categoryId: string | null;
      operationId: string | null;
    }) => void;
  }
}));

vi.mock('../../../shared/ui/api-docs/ApiDocsExplorer', () => ({
  ApiDocsExplorer: (props: typeof explorerState.lastProps) => {
    explorerState.lastProps = props;
    return (
      <button
        type="button"
        onClick={() =>
          props?.onQueryStateChange({
            categoryId: 'openai-compatible-api',
            operationId: 'applicationOpenAiCreateChatCompletion'
          })
        }
      >
        docs explorer
      </button>
    );
  }
}));

import { AppProviders } from '../../../app/AppProviders';
import { ApplicationApiDocsPanel } from '../components/api/ApplicationApiDocsPanel';

describe('ApplicationApiDocsPanel', () => {
  test('uses app-local docs state without navigating to settings docs', () => {
    window.history.pushState({}, '', '/applications/app-1/api');

    render(
      <AppProviders>
        <ApplicationApiDocsPanel
          applicationId="app-1"
          applicationName="Support Agent"
          publication={{
            id: 'pub-1',
            application_id: 'app-1',
            flow_id: 'flow-1',
            flow_version_id: 'version-1',
            compiled_plan_id: 'compiled-1',
            version_sequence: 3,
            active: true,
            api_enabled: true,
            public_url: '/api/1flowbase/runs',
            created_by: 'user-1',
            created_at: '2026-05-09T00:00:00Z',
            mapping_snapshot: {
              input: {
                query_target: 'start.query',
                model_target: null,
                inputs_target: null,
                history_target: null,
                attachments_target: null
              },
              output: {
                answer_selector: 'answer',
                usage_selector: null,
                files_selector: null,
                error_selector: null
              }
            }
          }}
          defaultCategoryId="openai-compatible-api"
        />
      </AppProviders>
    );

    expect(screen.getByText('Support Agent API 文档')).toBeInTheDocument();
    expect(screen.getByText('active publication v3')).toBeInTheDocument();
    expect(explorerState.lastProps?.queryState).toEqual({
      categoryId: 'openai-compatible-api',
      operationId: null
    });

    fireEvent.click(screen.getByRole('button', { name: 'docs explorer' }));

    expect(window.location.pathname).toBe('/applications/app-1/api');
    expect(window.location.search).toBe('');
    expect(explorerState.lastProps?.queryState).toEqual({
      categoryId: 'openai-compatible-api',
      operationId: 'applicationOpenAiCreateChatCompletion'
    });
  });
});
