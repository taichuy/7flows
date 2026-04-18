import {
  fetchApiHealth,
  getDefaultApiBaseUrl,
  type ApiBaseUrlLocation
} from '@1flowbase/api-client';

export function getHomeApiBaseUrl(
  locationLike: ApiBaseUrlLocation | undefined =
    typeof window !== 'undefined' ? window.location : undefined
): string {
  return import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl(locationLike);
}

export function getApiHealthQueryOptions(
  locationLike: ApiBaseUrlLocation | undefined =
    typeof window !== 'undefined' ? window.location : undefined
) {
  const apiBaseUrl = getHomeApiBaseUrl(locationLike);

  return {
    queryKey: ['api-health', apiBaseUrl] as const,
    queryFn: () => fetchApiHealth(apiBaseUrl)
  };
}
