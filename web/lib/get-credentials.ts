import { getApiBaseUrl } from "@/lib/api-base-url";

export type CredentialItem = {
  id: string;
  name: string;
  credential_type: string;
  description: string;
  status: "active" | "revoked";
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CredentialDetail = CredentialItem & {
  data_keys: string[];
};

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getCredentials(
  includeRevoked = false
): Promise<CredentialItem[]> {
  const qs = includeRevoked ? "?include_revoked=true" : "";
  return fetchJson<CredentialItem[]>(`/api/credentials${qs}`, []);
}

export async function getCredentialDetail(
  id: string
): Promise<CredentialDetail | null> {
  return fetchJson<CredentialDetail | null>(`/api/credentials/${id}`, null);
}
