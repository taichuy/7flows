import type { CredentialItem } from "@/lib/get-credentials";
import { fetchConsoleApi } from "@/lib/console-session-client";

export type NativeModelProviderCredentialFieldOption = {
  value: string;
  label: string;
};

export type NativeModelProviderCredentialField = {
  variable: string;
  label: string;
  type: "secret-input" | "text-input" | "select";
  required: boolean;
  placeholder: string;
  default?: string | null;
  options: NativeModelProviderCredentialFieldOption[];
};

export type NativeModelProviderCatalogItem = {
  id: "openai" | "anthropic" | string;
  label: string;
  description: string;
  help_url?: string | null;
  supported_model_types: string[];
  configuration_methods: Array<"predefined-model" | "customizable-model">;
  credential_type: string;
  compatible_credential_types: string[];
  default_base_url: string;
  default_protocol: string;
  default_models: string[];
  credential_fields: NativeModelProviderCredentialField[];
};

export type WorkspaceModelProviderConfigStatus = "active" | "inactive";

export type WorkspaceModelProviderConfigItem = {
  id: string;
  workspace_id: string;
  provider_id: string;
  provider_label: string;
  label: string;
  description: string;
  credential_id: string;
  credential_ref: string;
  credential_name: string;
  credential_type: string;
  base_url: string;
  default_model: string;
  protocol: string;
  status: WorkspaceModelProviderConfigStatus;
  supported_model_types: string[];
  created_at: string;
  updated_at: string;
  disabled_at?: string | null;
};

export type WorkspaceModelProviderRegistryResponse = {
  catalog: NativeModelProviderCatalogItem[];
  items: WorkspaceModelProviderConfigItem[];
};

export type WorkspaceModelProviderRegistryStatus = "idle" | "loading" | "ready" | "error";

export async function getWorkspaceModelProviderRegistry(): Promise<WorkspaceModelProviderRegistryResponse | null> {
  try {
    const response = await fetchConsoleApi("/api/workspace/model-providers", {
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as WorkspaceModelProviderRegistryResponse;
  } catch {
    return null;
  }
}

export type WorkspaceModelProviderConfigDraft = {
  provider_id: string;
  label: string;
  description: string;
  credential_ref: string;
  base_url: string;
  default_model: string;
  protocol: string;
  status: WorkspaceModelProviderConfigStatus;
};

type WorkspaceModelProviderMutationResult =
  | {
      status: "success";
      item: WorkspaceModelProviderConfigItem;
    }
  | {
      status: "error";
      message: string;
    };

function isWorkspaceModelProviderConfigItem(value: unknown): value is WorkspaceModelProviderConfigItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && "provider_id" in value && "credential_ref" in value;
}

export function getModelProviderCatalogItem(
  catalog: NativeModelProviderCatalogItem[],
  providerId: string | null | undefined
) {
  const normalizedProviderId = providerId?.trim().toLowerCase();
  if (!normalizedProviderId) {
    return catalog[0] ?? null;
  }

  return catalog.find((item) => item.id === normalizedProviderId) ?? null;
}

export function getCompatibleCredentials(
  provider: NativeModelProviderCatalogItem | null,
  credentials: CredentialItem[]
) {
  if (!provider) {
    return credentials;
  }

  return credentials.filter((credential) =>
    provider.compatible_credential_types.includes(credential.credential_type)
  );
}

export function createDefaultModelProviderDraft(
  catalog: NativeModelProviderCatalogItem[],
  credentials: CredentialItem[]
): WorkspaceModelProviderConfigDraft {
  const provider = catalog[0] ?? null;
  const compatibleCredential = getCompatibleCredentials(provider, credentials)[0] ?? null;

  return {
    provider_id: provider?.id ?? "openai",
    label: provider ? `${provider.label} Team` : "OpenAI Team",
    description: "",
    credential_ref: compatibleCredential ? `credential://${compatibleCredential.id}` : "",
    base_url: provider?.default_base_url ?? "",
    default_model: provider?.default_models[0] ?? "",
    protocol: provider?.default_protocol ?? "",
    status: "active"
  };
}

async function submitProviderMutation(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  draft?: WorkspaceModelProviderConfigDraft
): Promise<WorkspaceModelProviderMutationResult> {
  try {
    const response = await fetchConsoleApi(path, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: method === "DELETE" ? undefined : JSON.stringify(draft ?? {})
    });

    const body = (await response.json().catch(() => null)) as
      | WorkspaceModelProviderConfigItem
      | { detail?: string }
      | null;

    if (!response.ok || !isWorkspaceModelProviderConfigItem(body)) {
      return {
        status: "error",
        message:
          body && "detail" in body
            ? body.detail ?? "模型供应商配置保存失败。"
            : "模型供应商配置保存失败。"
      };
    }

    return {
      status: "success",
      item: body
    };
  } catch {
    return {
      status: "error",
      message: "模型供应商配置保存失败，请确认工作台代理接口已连接。"
    };
  }
}

export function createWorkspaceModelProviderConfig(draft: WorkspaceModelProviderConfigDraft) {
  return submitProviderMutation("/api/workspace/model-providers", "POST", draft);
}

export function updateWorkspaceModelProviderConfig(
  providerConfigId: string,
  draft: WorkspaceModelProviderConfigDraft
) {
  return submitProviderMutation(
    `/api/workspace/model-providers/${encodeURIComponent(providerConfigId)}`,
    "PUT",
    draft
  );
}

export function deactivateWorkspaceModelProviderConfig(providerConfigId: string) {
  return submitProviderMutation(
    `/api/workspace/model-providers/${encodeURIComponent(providerConfigId)}`,
    "DELETE"
  );
}
