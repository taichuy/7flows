import { ApiClientError } from './errors';

export interface HealthResponse {
  service: string;
  status: 'ok';
  version: string;
}

export interface ApiBaseUrlLocation {
  protocol?: string;
  hostname?: string;
}

interface ApiSuccessEnvelope<T> {
  data: T;
  meta: unknown | null;
}

export interface ApiRequestOptions {
  path: string;
  method?: string;
  body?: unknown;
  csrfToken?: string | null;
  baseUrl?: string;
  expectJson?: boolean;
  unwrapSuccess?: boolean;
}

export function getDefaultApiBaseUrl(
  locationLike: ApiBaseUrlLocation | undefined =
    typeof window !== 'undefined' ? window.location : undefined
): string {
  const protocol = locationLike?.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = locationLike?.hostname || '127.0.0.1';

  return `${protocol}//${hostname}:7800`;
}

export function unwrapApiSuccess<T>(payload: ApiSuccessEnvelope<T>): T {
  return payload.data;
}

export async function apiFetch<T>({
  path,
  method = 'GET',
  body,
  csrfToken,
  baseUrl = getDefaultApiBaseUrl(),
  expectJson = true,
  unwrapSuccess = true
}: ApiRequestOptions): Promise<T> {
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw await ApiClientError.fromResponse(response);
  }

  if (!expectJson || response.status === 204) {
    return undefined as T;
  }

  if (unwrapSuccess === false) {
    return (await response.json()) as T;
  }

  return unwrapApiSuccess<T>((await response.json()) as ApiSuccessEnvelope<T>);
}

export async function apiFetchVoid(
  options: Omit<ApiRequestOptions, 'expectJson'>
): Promise<void> {
  await apiFetch<void>({
    ...options,
    expectJson: false
  });
}

export async function fetchApiHealth(
  baseUrl = getDefaultApiBaseUrl()
): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/health`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw await ApiClientError.fromResponse(response);
  }

  return (await response.json()) as HealthResponse;
}
