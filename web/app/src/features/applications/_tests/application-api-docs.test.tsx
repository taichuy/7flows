import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const explorerState = vi.hoisted(() => ({
  lastProps: null as null | {
    queryState: { categoryId: string | null; operationId: string | null };
    showAllOperationsWhenNoCategory?: boolean;
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
        <ApplicationApiDocsPanel applicationId="app-1" />
      </AppProviders>
    );

    expect(screen.queryByText('Support Agent API 文档')).not.toBeInTheDocument();
    expect(screen.queryByText('active publication v3')).not.toBeInTheDocument();
    expect(explorerState.lastProps?.queryState).toEqual({
      categoryId: null,
      operationId: null
    });
    expect(explorerState.lastProps?.showAllOperationsWhenNoCategory).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'docs explorer' }));

    expect(window.location.pathname).toBe('/applications/app-1/api');
    expect(window.location.search).toBe('');
    expect(explorerState.lastProps?.queryState).toEqual({
      categoryId: 'openai-compatible-api',
      operationId: 'applicationOpenAiCreateChatCompletion'
    });
  });
});
