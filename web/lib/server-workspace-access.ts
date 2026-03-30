import { cache } from "react";
import { cookies } from "next/headers";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  SESSION_COOKIE_NAME,
  type AuthSessionResponse,
  type WorkspaceContextResponse,
  type WorkspaceMemberItem
} from "@/lib/workspace-access";

function buildAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  };
}

async function fetchWorkspaceAccessJson<T>(path: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: "no-store",
      headers: buildAuthHeaders(token)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const getServerSessionToken = cache(async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
});

export const getServerAuthSession = cache(async (): Promise<AuthSessionResponse | null> => {
  const token = await getServerSessionToken();
  if (!token) {
    return null;
  }
  return fetchWorkspaceAccessJson<AuthSessionResponse>("/api/auth/session", token);
});

export const getServerWorkspaceContext = cache(async (): Promise<WorkspaceContextResponse | null> => {
  const token = await getServerSessionToken();
  if (!token) {
    return null;
  }
  return fetchWorkspaceAccessJson<WorkspaceContextResponse>("/api/workspace/context", token);
});

export async function getServerWorkspaceMembers(): Promise<WorkspaceMemberItem[]> {
  const token = await getServerSessionToken();
  if (!token) {
    return [];
  }
  return (await fetchWorkspaceAccessJson<WorkspaceMemberItem[]>("/api/workspace/members", token)) ?? [];
}
