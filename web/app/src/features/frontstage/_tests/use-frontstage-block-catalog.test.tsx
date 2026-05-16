import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useFrontstageBlockCatalog } from '../hooks/use-frontstage-block-catalog';
import type { FrontstageBlockCatalogEntry } from '../api/block-catalog';
import type {
  FrontstageBlockCatalogDiagnostic,
  NormalizedFrontstageBlockCatalogEntry
} from '../lib/block-catalog';

const frontstageApi = vi.hoisted(() => ({
  fetchFrontstageBlockCatalog: vi.fn(),
  frontstageBlockCatalogQueryKey: vi.fn(
    () => ['frontstage', 'block-catalog'] as const
  )
}));

const blockCatalogLib = vi.hoisted(() => ({
  normalizeFrontstageBlockCatalog: vi.fn()
}));

vi.mock('../api/block-catalog', () => frontstageApi);
vi.mock('../lib/block-catalog', () => blockCatalogLib);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

function setupCatalog(queryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useFrontstageBlockCatalog(), { wrapper });
}

describe('useFrontstageBlockCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    frontstageApi.fetchFrontstageBlockCatalog.mockResolvedValue([]);
    blockCatalogLib.normalizeFrontstageBlockCatalog.mockReturnValue({
      items: [],
      diagnostics: []
    });
  });

  test('fetches the console catalog and exposes the normalized block catalog', async () => {
    const rawEntries: FrontstageBlockCatalogEntry[] = [
      {
        installation_id: 'installation-1',
        provider_code: 'official',
        plugin_id: 'official.blocks',
        plugin_version: '1.0.0',
        contribution_code: 'hero_banner',
        title: 'Hero Banner',
        runtime: 'iframe',
        entry: 'blocks/hero/index.html',
        context_contract: {
          primitives: ['text'],
          input_schema: { type: 'object' }
        },
        permissions: {
          network: 'outbound_only',
          storage: 'none',
          secrets: 'none'
        },
        ui_capabilities: ['responsive']
      }
    ];
    const items = [
      {
        id: 'official:hero_banner',
        runtimeKind: 'iframe',
        installationId: 'installation-1',
        providerCode: 'official',
        pluginId: 'official.blocks',
        pluginVersion: '1.0.0',
        contributionCode: 'hero_banner',
        title: 'Hero Banner',
        entry: 'blocks/hero/index.html',
        permissions: {
          network: 'outbound_only',
          storage: 'none',
          secrets: 'none'
        },
        contextContract: {
          primitives: ['text'],
          inputSchema: { type: 'object' }
        },
        uiCapabilities: ['responsive'],
        raw: rawEntries[0]
      }
    ] satisfies NormalizedFrontstageBlockCatalogEntry[];
    const diagnostics = [
      {
        severity: 'warning',
        code: 'unknown_capability',
        providerCode: 'official',
        pluginId: 'official.blocks',
        contributionCode: 'hero_banner',
        field: 'ui_capabilities',
        value: 'legacy',
        message: 'Unsupported capability.'
      }
    ] satisfies FrontstageBlockCatalogDiagnostic[];

    frontstageApi.fetchFrontstageBlockCatalog.mockResolvedValue(rawEntries);
    blockCatalogLib.normalizeFrontstageBlockCatalog.mockReturnValue({
      items,
      diagnostics
    });

    const { result } = setupCatalog();

    await waitFor(() => {
      expect(result.current.items).toBe(items);
    });

    expect(frontstageApi.fetchFrontstageBlockCatalog).toHaveBeenCalledTimes(1);
    expect(blockCatalogLib.normalizeFrontstageBlockCatalog).toHaveBeenCalledWith(
      rawEntries
    );
    expect(result.current.diagnostics).toBe(diagnostics);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('success');
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isSuccess).toBe(true);
  });

  test('returns empty items and diagnostics for an empty catalog', async () => {
    const { result } = setupCatalog();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(frontstageApi.fetchFrontstageBlockCatalog).toHaveBeenCalledTimes(1);
    expect(blockCatalogLib.normalizeFrontstageBlockCatalog).toHaveBeenCalledWith(
      []
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.diagnostics).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('exposes query errors and supports refetching', async () => {
    const initialError = new Error('catalog unavailable');
    frontstageApi.fetchFrontstageBlockCatalog.mockRejectedValueOnce(
      initialError
    );

    const { result } = setupCatalog();

    await waitFor(() => {
      expect(result.current.error).toBe(initialError);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.diagnostics).toEqual([]);
    expect(result.current.isError).toBe(true);

    frontstageApi.fetchFrontstageBlockCatalog.mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });

    expect(frontstageApi.fetchFrontstageBlockCatalog).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
    expect(result.current.diagnostics).toEqual([]);
  });
});
