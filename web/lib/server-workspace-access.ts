import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { CredentialItem } from "@/lib/get-credentials";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointCacheInventoryResponse,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationListOptions,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem,
} from "@/lib/get-workflow-publish";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  RunEvidenceView,
  RunExecutionView,
} from "@/lib/get-run-views";
import type { WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type { WorkflowDetail } from "@/lib/get-workflows";
import type {
  WorkspaceModelProviderRegistryResponse,
  WorkspaceModelProviderSettingsResponse
} from "@/lib/model-provider-registry";
import {
  parseSensitiveAccessGuardedResponse,
  type SensitiveAccessGuardedResult,
} from "@/lib/sensitive-access";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  buildCookieHeader,
  CSRF_TOKEN_COOKIE_NAME,
  CSRF_TOKEN_HEADER_NAME,
  type PublicAuthOptionsResponse,
  REFRESH_TOKEN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AuthSessionResponse,
  type WorkspaceContextResponse,
  type WorkspaceMemberItem
} from "@/lib/workspace-access";
import {
  canAccessWorkflowStudioSurface,
  getWorkspaceConsolePageHref
} from "@/lib/workspace-console";
import type { WorkflowStudioSurface } from "@/lib/workbench-links";

type CookieEntry = {
  name: string;
  value: string;
};

type ServerSessionCookies = {
  accessToken: string;
  cookieEntries: CookieEntry[];
  csrfToken: string;
  refreshToken: string;
};

type ServerWorkspaceAccessResult<T> = {
  data: T | null;
  errorMessage: string | null;
  status: number | null;
};

function buildCookieEntries(
  entries: CookieEntry[],
  overrides: Record<string, string | null> = {}
): CookieEntry[] {
  const cookieMap = new Map(entries.map((entry) => [entry.name, entry.value]));
  for (const [name, value] of Object.entries(overrides)) {
    if (!value) {
      cookieMap.delete(name);
      continue;
    }
    cookieMap.set(name, value);
  }
  return Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));
}

function buildServerSessionCookies(cookieStore: Awaited<ReturnType<typeof cookies>>): ServerSessionCookies {
  const cookieEntries = cookieStore.getAll().map((item) => ({
    name: item.name,
    value: item.value
  }));

  return {
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? "",
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? "",
    csrfToken: cookieStore.get(CSRF_TOKEN_COOKIE_NAME)?.value ?? "",
    cookieEntries
  };
}

function buildServerRequestHeaders({
  accessToken,
  cookieEntries,
  csrfToken
}: {
  accessToken?: string;
  cookieEntries: CookieEntry[];
  csrfToken?: string;
}) {
  const headers = new Headers();
  const cookieHeader = buildCookieHeader(cookieEntries);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (csrfToken) {
    headers.set(CSRF_TOKEN_HEADER_NAME, csrfToken);
  }
  return headers;
}

async function readWorkspaceAccessError(response: Response, fallbackMessage: string) {
  const body = (await response.json().catch(() => null)) as
    | { detail?: string; message?: string }
    | null;

  if (body?.detail?.trim()) {
    return body.detail;
  }

  if (body?.message?.trim()) {
    return body.message;
  }

  return fallbackMessage;
}

async function fetchWorkspaceAccessResult<T>(
  path: string,
  session: ServerSessionCookies
): Promise<ServerWorkspaceAccessResult<T>> {
  const execute = async ({
    accessToken,
    cookieEntries,
    csrfToken
  }: {
    accessToken: string;
    cookieEntries: CookieEntry[];
    csrfToken: string;
  }) =>
    fetch(`${getApiBaseUrl()}${path}`, {
      cache: "no-store",
      headers: buildServerRequestHeaders({ accessToken, cookieEntries, csrfToken })
    });

  try {
    let response = await execute({
      accessToken: session.accessToken,
      cookieEntries: session.cookieEntries,
      csrfToken: session.csrfToken
    });

    if (response.status === 401 && session.refreshToken && session.csrfToken) {
      const refreshResponse = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
        method: "POST",
        headers: buildServerRequestHeaders({
          cookieEntries: session.cookieEntries,
          csrfToken: session.csrfToken
        }),
        body: "{}"
      });

      const refreshBody = (await refreshResponse.json().catch(() => null)) as
        | AuthSessionResponse
        | { detail?: string }
        | null;

      if (
        refreshResponse.ok &&
        refreshBody &&
        "access_token" in refreshBody &&
        typeof refreshBody.access_token === "string"
      ) {
        const authBody = refreshBody as AuthSessionResponse;
        const cookieEntries = buildCookieEntries(session.cookieEntries, {
          [authBody.cookie_contract?.access_token_cookie_name ?? ACCESS_TOKEN_COOKIE_NAME]:
            authBody.access_token ?? null,
          [authBody.cookie_contract?.refresh_token_cookie_name ?? REFRESH_TOKEN_COOKIE_NAME]:
            authBody.refresh_token ?? session.refreshToken,
          [authBody.cookie_contract?.csrf_token_cookie_name ?? CSRF_TOKEN_COOKIE_NAME]:
            authBody.csrf_token ?? session.csrfToken
        });

        response = await execute({
          accessToken: authBody.access_token ?? "",
          cookieEntries,
          csrfToken: authBody.csrf_token ?? session.csrfToken
        });
      }
    }

    if (!response.ok) {
      return {
        data: null,
        errorMessage: await readWorkspaceAccessError(
          response,
          `工作台请求失败（${response.status}）。`
        ),
        status: response.status
      };
    }

    return {
      data: (await response.json()) as T,
      errorMessage: null,
      status: response.status
    };
  } catch {
    return {
      data: null,
      errorMessage: "工作台请求失败，请确认 API 服务可用。",
      status: null
    };
  }
}

async function fetchWorkspaceAccessJson<T>(path: string, session: ServerSessionCookies): Promise<T | null> {
  const result = await fetchWorkspaceAccessResult<T>(path, session);
  return result.data;
}

async function fetchPublicAuthOptions(): Promise<PublicAuthOptionsResponse> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/options`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`auth-options-${response.status}`);
    }

    return (await response.json()) as PublicAuthOptionsResponse;
  } catch {
    return {
      provider: "unknown",
      recommended_method: "unavailable",
      password: {
        enabled: false,
        reason: "无法连接认证服务，请确认 API 服务可用。"
      },
      oidc_redirect: {
        enabled: false,
        reason: "无法连接认证服务，请确认 API 服务可用。"
      }
    };
  }
}

async function fetchWorkspaceAccessResponse(
  path: string,
  session: ServerSessionCookies,
  init?: RequestInit
): Promise<Response | null> {
  const execute = async ({
    accessToken,
    cookieEntries,
    csrfToken,
  }: {
    accessToken: string;
    cookieEntries: CookieEntry[];
    csrfToken: string;
  }) => {
    const headers = buildServerRequestHeaders({ accessToken, cookieEntries, csrfToken });
    const extraHeaders = new Headers(init?.headers ?? {});

    extraHeaders.forEach((value, key) => {
      headers.set(key, value);
    });

    return fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      cache: init?.cache ?? "no-store",
      headers,
    });
  };

  try {
    let response = await execute({
      accessToken: session.accessToken,
      cookieEntries: session.cookieEntries,
      csrfToken: session.csrfToken,
    });

    if (response.status === 401 && session.refreshToken && session.csrfToken) {
      const refreshResponse = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
        method: "POST",
        headers: buildServerRequestHeaders({
          cookieEntries: session.cookieEntries,
          csrfToken: session.csrfToken,
        }),
        body: "{}",
      });

      const refreshBody = (await refreshResponse.json().catch(() => null)) as
        | AuthSessionResponse
        | { detail?: string }
        | null;

      if (
        refreshResponse.ok &&
        refreshBody &&
        "access_token" in refreshBody &&
        typeof refreshBody.access_token === "string"
      ) {
        const authBody = refreshBody as AuthSessionResponse;
        const cookieEntries = buildCookieEntries(session.cookieEntries, {
          [authBody.cookie_contract?.access_token_cookie_name ?? ACCESS_TOKEN_COOKIE_NAME]:
            authBody.access_token ?? null,
          [authBody.cookie_contract?.refresh_token_cookie_name ?? REFRESH_TOKEN_COOKIE_NAME]:
            authBody.refresh_token ?? session.refreshToken,
          [authBody.cookie_contract?.csrf_token_cookie_name ?? CSRF_TOKEN_COOKIE_NAME]:
            authBody.csrf_token ?? session.csrfToken,
        });

        response = await execute({
          accessToken: authBody.access_token ?? "",
          cookieEntries,
          csrfToken: authBody.csrf_token ?? session.csrfToken,
        });
      }
    }

    return response;
  } catch {
    return null;
  }
}

export async function fetchServerWorkspaceAccessJson<T>(
  path: string,
  init?: RequestInit
): Promise<T | null> {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return null;
  }

  const response = await fetchWorkspaceAccessResponse(path, session, init);
  if (!response?.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function fetchServerWorkspaceAccessGuarded<T>(
  path: string,
  init?: RequestInit
): Promise<SensitiveAccessGuardedResult<T>> {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return null;
  }

  const response = await fetchWorkspaceAccessResponse(path, session, init);
  if (!response) {
    return null;
  }

  return parseSensitiveAccessGuardedResponse<T>(response);
}

function buildPublishedInvocationSearchParams(
  options: PublishedEndpointInvocationListOptions | undefined,
  limits: {
    defaultLimit: number;
    maxLimit: number;
  }
) {
  const searchParams = new URLSearchParams();
  searchParams.set(
    "limit",
    String(Math.min(Math.max(options?.limit ?? limits.defaultLimit, 1), limits.maxLimit))
  );
  if (options?.status) {
    searchParams.set("status", options.status);
  }
  if (options?.requestSource) {
    searchParams.set("request_source", options.requestSource);
  }
  if (options?.requestSurface) {
    searchParams.set("request_surface", options.requestSurface);
  }
  if (options?.cacheStatus) {
    searchParams.set("cache_status", options.cacheStatus);
  }
  if (options?.runStatus) {
    searchParams.set("run_status", options.runStatus);
  }
  if (options?.apiKeyId) {
    searchParams.set("api_key_id", options.apiKeyId);
  }
  if (options?.reasonCode) {
    searchParams.set("reason_code", options.reasonCode);
  }
  if (options?.createdFrom) {
    searchParams.set("created_from", options.createdFrom);
  }
  if (options?.createdTo) {
    searchParams.set("created_to", options.createdTo);
  }
  return searchParams;
}

export const getServerSessionToken = cache(async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
});

export const getServerAuthSession = cache(async (): Promise<AuthSessionResponse | null> => {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return null;
  }
  return fetchWorkspaceAccessJson<AuthSessionResponse>("/api/auth/session", session);
});

export const getServerWorkspaceContext = cache(async (): Promise<WorkspaceContextResponse | null> => {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return null;
  }
  return fetchWorkspaceAccessJson<WorkspaceContextResponse>("/api/workspace/context", session);
});

export const getServerPublicAuthOptions = cache(async (): Promise<PublicAuthOptionsResponse> => {
  return fetchPublicAuthOptions();
});

export const getServerWorkflowDetail = cache(
  async (workflowId: string | null | undefined): Promise<WorkflowDetail | null> => {
  const normalizedWorkflowId = workflowId?.trim();
  if (!normalizedWorkflowId) {
    return null;
  }

  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return null;
  }

  return fetchWorkspaceAccessJson<WorkflowDetail>(
    `/api/workflows/${encodeURIComponent(normalizedWorkflowId)}/detail`,
    session
  );
}
);

export async function getServerWorkflowPublishedEndpoints(
  workflowId: string | null | undefined,
  options?: {
    includeAllVersions?: boolean;
  }
): Promise<WorkflowPublishedEndpointItem[]> {
  const normalizedWorkflowId = workflowId?.trim();
  if (!normalizedWorkflowId) {
    return [];
  }

  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return [];
  }

  const searchParams = new URLSearchParams();
  if (options?.includeAllVersions ?? true) {
    searchParams.set("include_all_versions", "true");
  }

  return (
    (await fetchWorkspaceAccessJson<WorkflowPublishedEndpointItem[]>(
      `/api/workflows/${encodeURIComponent(normalizedWorkflowId)}/published-endpoints?${searchParams.toString()}`,
      session
    )) ?? []
  );
}

export async function getServerWorkflowRuns(
  workflowId: string | null | undefined,
  limit = 8
): Promise<WorkflowRunListItem[]> {
  const normalizedWorkflowId = workflowId?.trim();
  if (!normalizedWorkflowId) {
    return [];
  }

  const normalizedLimit = Math.min(Math.max(limit, 1), 20);
  return (
    (await fetchServerWorkspaceAccessJson<WorkflowRunListItem[]>(
      `/api/workflows/${encodeURIComponent(normalizedWorkflowId)}/runs?limit=${normalizedLimit}`
    )) ?? []
  );
}

export async function getServerRunDetail(runId: string): Promise<RunDetail | null> {
  return fetchServerWorkspaceAccessJson<RunDetail>(
    `/api/runs/${encodeURIComponent(runId)}/detail?include_events=false`
  );
}

export async function getServerRunExecutionView(
  runId: string
): Promise<RunExecutionView | null> {
  return fetchServerWorkspaceAccessJson<RunExecutionView>(
    `/api/runs/${encodeURIComponent(runId)}/execution-view`
  );
}

export async function getServerRunEvidenceView(runId: string): Promise<RunEvidenceView | null> {
  return fetchServerWorkspaceAccessJson<RunEvidenceView>(
    `/api/runs/${encodeURIComponent(runId)}/evidence-view`
  );
}

export async function getServerPublishedEndpointApiKeys(
  workflowId: string,
  bindingId: string
): Promise<PublishedEndpointApiKeyItem[]> {
  return (
    (await fetchServerWorkspaceAccessJson<PublishedEndpointApiKeyItem[]>(
      `/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/api-keys`
    )) ?? []
  );
}

export async function getServerPublishedEndpointCacheInventory(
  workflowId: string,
  bindingId: string,
  limit = 5
): Promise<SensitiveAccessGuardedResult<PublishedEndpointCacheInventoryResponse>> {
  return fetchServerWorkspaceAccessGuarded<PublishedEndpointCacheInventoryResponse>(
    `/api/workflows/${encodeURIComponent(
      workflowId
    )}/published-endpoints/${encodeURIComponent(bindingId)}/cache-entries?limit=${Math.min(
      Math.max(limit, 1),
      20
    )}`
  );
}

export async function getServerPublishedEndpointInvocations(
  workflowId: string,
  bindingId: string,
  options?: PublishedEndpointInvocationListOptions
): Promise<PublishedEndpointInvocationListResponse | null> {
  const searchParams = buildPublishedInvocationSearchParams(options, {
    defaultLimit: 5,
    maxLimit: 20,
  });

  return fetchServerWorkspaceAccessJson<PublishedEndpointInvocationListResponse>(
    `/api/workflows/${encodeURIComponent(
      workflowId
    )}/published-endpoints/${encodeURIComponent(bindingId)}/invocations?${searchParams.toString()}`
  );
}

export async function getServerPublishedEndpointInvocationDetail(
  workflowId: string,
  bindingId: string,
  invocationId: string
): Promise<SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>> {
  return fetchServerWorkspaceAccessGuarded<PublishedEndpointInvocationDetailResponse>(
    `/api/workflows/${encodeURIComponent(
      workflowId
    )}/published-endpoints/${encodeURIComponent(bindingId)}/invocations/${encodeURIComponent(invocationId)}`
  );
}

export async function requireServerWorkflowStudioSurfaceAccess({
  surface,
  requestedHref
}: {
  surface: WorkflowStudioSurface;
  requestedHref: string;
}) {
  const workspaceContext = await getServerWorkspaceContext();

  if (!workspaceContext) {
    redirect(`/login?next=${encodeURIComponent(requestedHref)}`);
  }

  if (!canAccessWorkflowStudioSurface(surface, workspaceContext)) {
    redirect(getWorkspaceConsolePageHref("workspace"));
  }

  return workspaceContext;
}

export async function getServerWorkspaceMembers(): Promise<WorkspaceMemberItem[]> {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return [];
  }
  return (await fetchWorkspaceAccessJson<WorkspaceMemberItem[]>("/api/workspace/members", session)) ?? [];
}

export async function getServerWorkspaceCredentials(): Promise<CredentialItem[]> {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return [];
  }
  return (await fetchWorkspaceAccessJson<CredentialItem[]>("/api/credentials", session)) ?? [];
}

export async function getServerWorkspaceModelProviderRegistry(): Promise<WorkspaceModelProviderRegistryResponse | null> {
  const state = await getServerWorkspaceModelProviderRegistryState();
  return state.registry;
}

export async function getServerWorkspaceModelProviderSettingsState(): Promise<{
  settings: WorkspaceModelProviderSettingsResponse | null;
  errorMessage: string | null;
  status: number | null;
}> {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return {
      settings: null,
      errorMessage: null,
      status: null
    };
  }

  const result = await fetchWorkspaceAccessResult<WorkspaceModelProviderSettingsResponse>(
    "/api/workspace/model-providers/settings",
    session
  );

  return {
    settings: result.data,
    errorMessage: result.errorMessage,
    status: result.status
  };
}

export async function getServerWorkspaceModelProviderRegistryState(): Promise<{
  registry: WorkspaceModelProviderRegistryResponse | null;
  errorMessage: string | null;
  status: number | null;
}> {
  const cookieStore = await cookies();
  const session = buildServerSessionCookies(cookieStore);
  if (!session.accessToken && !session.refreshToken) {
    return {
      registry: null,
      errorMessage: null,
      status: null
    };
  }
  const result = await fetchWorkspaceAccessResult<WorkspaceModelProviderRegistryResponse>(
    "/api/workspace/model-providers",
    session
  );

  return {
    registry: result.data,
    errorMessage: result.errorMessage,
    status: result.status
  };
}
