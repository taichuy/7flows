import { fetchConsoleApiPath } from "@/lib/console-session-client";

export type CredentialItem = {
  id: string;
  name: string;
  credential_type: string;
  description: string;
  status: "active" | "revoked";
  sensitivity_level: "L0" | "L1" | "L2" | "L3" | null;
  sensitive_resource_id: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CredentialDetail = CredentialItem & {
  data_keys: string[];
};

export type CredentialAuditItem = {
  id: string;
  credential_id: string;
  credential_name: string;
  credential_type: string;
  action:
    | "created"
    | "updated"
    | "revoked"
    | "decrypted"
    | "masked_handle_issued"
    | "approval_pending"
    | "access_denied";
  actor_type: string;
  actor_id: string | null;
  run_id: string | null;
  node_run_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetchConsoleApiPath(path, {
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

export async function getCredentialActivity(
  limit = 12,
  credentialId?: string
): Promise<CredentialAuditItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (credentialId) {
    params.set("credential_id", credentialId);
  }
  return fetchJson<CredentialAuditItem[]>(`/api/credentials/activity?${params.toString()}`, []);
}
