import { getApiBaseUrl } from "@/lib/api-base-url";
import { buildConsoleCsrfHeaders } from "@/lib/workspace-access";

type ConsoleFetchOptions = {
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
  redirectOnUnauthorized?: boolean;
  refreshPath?: string;
  retryOnUnauthorized?: boolean;
};

function mergeHeaders(
  headersInit: HeadersInit | undefined,
  extraHeaders: Record<string, string>
) {
  const headers = new Headers(headersInit ?? {});
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (!headers.has(key) && value) {
      headers.set(key, value);
    }
  }
  return headers;
}

function buildLoginHref(nextHref?: string) {
  const normalizedNext = nextHref && nextHref.startsWith("/") ? nextHref : "/workspace";
  return `/login?next=${encodeURIComponent(normalizedNext)}`;
}

function normalizeConsoleApiPath(path: string) {
  const normalizedPath = path.trim();
  return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
}

export function redirectToConsoleLogin(nextHref?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const fallbackNext = `${window.location.pathname}${window.location.search}` || "/workspace";
  window.location.assign(buildLoginHref(nextHref ?? fallbackNext));
}

export function resolveConsoleApiUrl(path: string) {
  const normalizedPath = normalizeConsoleApiPath(path);
  return typeof window === "undefined" ? `${getApiBaseUrl()}${normalizedPath}` : normalizedPath;
}

async function refreshConsoleSession({
  fetchImpl,
  refreshPath
}: {
  fetchImpl: typeof fetch;
  refreshPath: string;
}) {
  return fetchImpl(refreshPath, {
    method: "POST",
    credentials: "include",
    headers: mergeHeaders(
      {
        "Content-Type": "application/json"
      },
      buildConsoleCsrfHeaders()
    ),
    body: "{}"
  });
}

export async function fetchConsoleApi(
  input: string,
  init: RequestInit = {},
  {
    fetchImpl = fetch,
    onUnauthorized,
    redirectOnUnauthorized = true,
    refreshPath = "/api/auth/refresh",
    retryOnUnauthorized = true
  }: ConsoleFetchOptions = {}
) {
  const execute = () =>
    fetchImpl(input, {
      ...init,
      credentials: "include",
      headers: mergeHeaders(init.headers, buildConsoleCsrfHeaders())
    });

  let response = await execute();
  if (response.status !== 401 || !retryOnUnauthorized || input === refreshPath) {
    if (response.status === 401 && redirectOnUnauthorized) {
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        redirectToConsoleLogin();
      }
    }
    return response;
  }

  const refreshResponse = await refreshConsoleSession({ fetchImpl, refreshPath });
  if (!refreshResponse.ok) {
    if (redirectOnUnauthorized) {
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        redirectToConsoleLogin();
      }
    }
    return response;
  }

  response = await fetchImpl(input, {
    ...init,
    credentials: "include",
    headers: mergeHeaders(init.headers, buildConsoleCsrfHeaders())
  });

  if (response.status === 401 && redirectOnUnauthorized) {
    if (onUnauthorized) {
      onUnauthorized();
    } else {
      redirectToConsoleLogin();
    }
  }

  return response;
}

export async function fetchConsoleApiPath(
  path: string,
  init: RequestInit = {},
  options: ConsoleFetchOptions = {}
) {
  const normalizedPath = normalizeConsoleApiPath(path);
  const fetchImpl = options.fetchImpl ?? fetch;
  if (typeof window === "undefined") {
    return fetchImpl(resolveConsoleApiUrl(normalizedPath), init);
  }

  return fetchConsoleApi(normalizedPath, init, {
    ...options,
    fetchImpl
  });
}
