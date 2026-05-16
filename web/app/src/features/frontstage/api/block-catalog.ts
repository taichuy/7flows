import {
  getDefaultApiBaseUrl,
  listConsoleFrontendBlocks,
  type ApiBaseUrlLocation,
  type ConsoleFrontendBlockCatalogEntry
} from '@1flowbase/api-client';

export type FrontstageBlockCatalogEntry = ConsoleFrontendBlockCatalogEntry;

export const frontstageBlockCatalogQueryKey = () =>
  ['frontstage', 'block-catalog'] as const;

export function getFrontstageBlockCatalogApiBaseUrl(
  locationLike: ApiBaseUrlLocation | undefined = typeof window !== 'undefined'
    ? window.location
    : undefined
): string {
  return (
    import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl(locationLike)
  );
}

export function fetchFrontstageBlockCatalog(): Promise<
  FrontstageBlockCatalogEntry[]
> {
  return listConsoleFrontendBlocks(getFrontstageBlockCatalogApiBaseUrl());
}
