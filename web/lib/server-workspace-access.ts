import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { CredentialItem } from "@/lib/get-credentials";
import type {
  WorkspaceModelProviderRegistryResponse,
  WorkspaceModelProviderSettingsResponse
} from "@/lib/model-provider-registry";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  buildCookieHeader,
  CSRF_TOKEN_COOKIE_NAME,
  CSRF_TOKEN_HEADER_NAME,
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
