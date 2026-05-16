import { useQuery } from '@tanstack/react-query';

import {
  fetchFrontstageBlockCatalog,
  frontstageBlockCatalogQueryKey
} from '../api/block-catalog';
import {
  normalizeFrontstageBlockCatalog,
  type FrontstageBlockCatalogDiagnostic,
  type NormalizedFrontstageBlockCatalogEntry
} from '../lib/block-catalog';

const emptyCatalog = {
  items: [] as NormalizedFrontstageBlockCatalogEntry[],
  diagnostics: [] as FrontstageBlockCatalogDiagnostic[]
};

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('frontstage block catalog request failed');
}

export function useFrontstageBlockCatalog() {
  const blockCatalogQuery = useQuery({
    queryKey: frontstageBlockCatalogQueryKey(),
    queryFn: fetchFrontstageBlockCatalog,
    select: normalizeFrontstageBlockCatalog
  });

  const catalog = blockCatalogQuery.data ?? emptyCatalog;

  return {
    items: catalog.items,
    diagnostics: catalog.diagnostics,
    loading: blockCatalogQuery.isLoading,
    error: blockCatalogQuery.error ? toError(blockCatalogQuery.error) : null,
    refetch: blockCatalogQuery.refetch,
    status: blockCatalogQuery.status,
    fetchStatus: blockCatalogQuery.fetchStatus,
    isLoading: blockCatalogQuery.isLoading,
    isFetching: blockCatalogQuery.isFetching,
    isRefetching: blockCatalogQuery.isRefetching,
    isError: blockCatalogQuery.isError,
    isSuccess: blockCatalogQuery.isSuccess,
    dataUpdatedAt: blockCatalogQuery.dataUpdatedAt
  };
}
