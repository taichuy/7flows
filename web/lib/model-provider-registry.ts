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
  help?: string | null;
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

export type WorkspaceModelProviderSettingsResponse = {
  registry: WorkspaceModelProviderRegistryResponse;
  credentials: CredentialItem[];
};

export type WorkspaceModelProviderRegistryStatus = "idle" | "loading" | "ready" | "error";

export type ModelProviderDraftPreflightIssue = {
  code:
    | "missing_provider"
    | "missing_default_model"
    | "custom_default_model"
    | "missing_protocol"
    | "protocol_mismatch"
    | "missing_credential"
    | "credential_not_found"
    | "incompatible_credential"
    | "compatible_credential"
    | "missing_base_url"
    | "no_compatible_credentials";
  tone: "error" | "warning";
  message: string;
};

export const FALLBACK_NATIVE_MODEL_PROVIDER_CATALOG: NativeModelProviderCatalogItem[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "参考 Dify provider manifest 的原生 OpenAI 厂商定义，团队先配置 endpoint / credential，再由节点引用。",
    help_url: "https://platform.openai.com/account/api-keys",
    supported_model_types: ["llm"],
    configuration_methods: ["predefined-model", "customizable-model"],
    credential_type: "openai_api_key",
    compatible_credential_types: ["openai_api_key", "api_key"],
    default_base_url: "https://api.openai.com/v1",
    default_protocol: "chat_completions",
    default_models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
    credential_fields: [
      {
        variable: "api_protocol",
        label: "API Protocol",
        type: "select",
        required: false,
        placeholder: "",
        help:
          "选择 OpenAI Provider 使用的 API 协议。大多数模型使用 Chat Completions，Responses API 适用于 o3 / gpt-5 等新协议模型。",
        default: "chat_completions",
        options: [
          {
            value: "chat_completions",
            label: "Chat Completions"
          },
          {
            value: "responses",
            label: "Responses API"
          }
        ]
      }
    ]
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "参考 Dify provider manifest 的原生 Anthropic / Claude 厂商定义，默认走 Messages API。",
    help_url: "https://console.anthropic.com/account/keys",
    supported_model_types: ["llm"],
    configuration_methods: ["predefined-model", "customizable-model"],
    credential_type: "anthropic_api_key",
    compatible_credential_types: ["anthropic_api_key", "api_key"],
    default_base_url: "https://api.anthropic.com",
    default_protocol: "messages",
    default_models: ["claude-3-7-sonnet-latest", "claude-3-5-sonnet-latest"],
    credential_fields: []
  }
];

export function resolveNativeModelProviderCatalog(
  catalog: NativeModelProviderCatalogItem[] | null | undefined
) {
  if (catalog && catalog.length > 0) {
    return catalog;
  }

  return FALLBACK_NATIVE_MODEL_PROVIDER_CATALOG;
}

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
  const resolvedCatalog = resolveNativeModelProviderCatalog(catalog);
  const normalizedProviderId = providerId?.trim().toLowerCase();
  if (!normalizedProviderId) {
    return resolvedCatalog[0] ?? null;
  }

  return resolvedCatalog.find((item) => item.id === normalizedProviderId) ?? null;
}

export function getModelProviderCredentialField(
  provider: NativeModelProviderCatalogItem | null,
  variable: string
) {
  const normalizedVariable = variable.trim().toLowerCase();
  return (
    provider?.credential_fields.find(
      (field) => field.variable.trim().toLowerCase() === normalizedVariable
    ) ?? null
  );
}

export function getModelProviderProtocolOptions(provider: NativeModelProviderCatalogItem | null) {
  const protocolField = getModelProviderCredentialField(provider, "api_protocol");
  if (protocolField?.options.length) {
    return protocolField.options;
  }

  if (provider?.default_protocol) {
    return [
      {
        value: provider.default_protocol,
        label: provider.default_protocol
      }
    ];
  }

  return [];
}

export function getModelProviderProtocolLabel(
  provider: NativeModelProviderCatalogItem | null,
  protocol: string | null | undefined
) {
  const normalizedProtocol = protocol?.trim();
  if (!normalizedProtocol) {
    return provider?.default_protocol ?? "";
  }

  return (
    getModelProviderProtocolOptions(provider).find((option) => option.value === normalizedProtocol)
      ?.label ?? normalizedProtocol
  );
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

function findCredentialByRef(credentials: CredentialItem[], credentialRef: string) {
  const normalizedCredentialRef = credentialRef.trim();
  if (!normalizedCredentialRef.startsWith("credential://")) {
    return null;
  }

  const credentialId = normalizedCredentialRef.slice("credential://".length).trim();
  if (!credentialId) {
    return null;
  }

  return credentials.find((credential) => credential.id === credentialId) ?? null;
}

export function getModelProviderDraftPreflight(
  provider: NativeModelProviderCatalogItem | null,
  credentials: CredentialItem[],
  draft: WorkspaceModelProviderConfigDraft
): ModelProviderDraftPreflightIssue[] {
  if (!provider) {
    return [
      {
        code: "missing_provider",
        tone: "error",
        message: "当前 provider catalog 不可用，无法继续配置团队模型供应商。"
      }
    ];
  }

  const issues: ModelProviderDraftPreflightIssue[] = [];
  const compatibleCredentials = getCompatibleCredentials(provider, credentials);
  const protocolOptions = getModelProviderProtocolOptions(provider);
  const selectedCredential = findCredentialByRef(credentials, draft.credential_ref);
  const normalizedDefaultModel = draft.default_model.trim();
  const normalizedProtocol = draft.protocol.trim();

  if (!normalizedDefaultModel) {
    issues.push({
      code: "missing_default_model",
      tone: "error",
      message: `请先选择默认模型；可直接使用 ${provider.default_models.slice(0, 2).join(" / ")}。`
    });
  } else if (
    provider.default_models.length > 0 &&
    !provider.default_models.includes(normalizedDefaultModel)
  ) {
    issues.push({
      code: "custom_default_model",
      tone: "warning",
      message: `${normalizedDefaultModel} 不在 ${provider.label} 的推荐模型列表里，将按自定义模型保存。`
    });
  }

  if (!normalizedProtocol) {
    issues.push({
      code: "missing_protocol",
      tone: "error",
      message: `请先选择 ${provider.label} 的 API 协议。`
    });
  } else if (
    protocolOptions.length > 0 &&
    !protocolOptions.some((option) => option.value === normalizedProtocol)
  ) {
    issues.push({
      code: "protocol_mismatch",
      tone: "error",
      message: `${provider.label} 仅支持 ${protocolOptions.map((option) => option.label).join(" / ")}。`
    });
  }

  if (!compatibleCredentials.length) {
    issues.push({
      code: "no_compatible_credentials",
      tone: "error",
      message: `当前 workspace 没有 ${provider.label} 可兼容的凭据，请先创建 ${provider.credential_type}。`
    });
  } else if (!draft.credential_ref.trim()) {
    issues.push({
      code: "missing_credential",
      tone: "error",
      message: `请先选择 ${provider.label} 可兼容的 credential:// 记录。`
    });
  } else if (!selectedCredential) {
    issues.push({
      code: "credential_not_found",
      tone: "error",
      message: "当前所选 credential:// 记录不在可用列表里，请重新选择。"
    });
  } else if (!provider.compatible_credential_types.includes(selectedCredential.credential_type)) {
    issues.push({
      code: "incompatible_credential",
      tone: "error",
      message: `${provider.label} 仅接受 ${provider.compatible_credential_types.join(" / ")} 凭据。`
    });
  } else if (selectedCredential.credential_type !== provider.credential_type) {
    issues.push({
      code: "compatible_credential",
      tone: "warning",
      message: `当前使用的是兼容凭据 ${selectedCredential.credential_type}；如条件允许，建议改用 ${provider.credential_type}。`
    });
  }

  if (!draft.base_url.trim()) {
    issues.push({
      code: "missing_base_url",
      tone: "warning",
      message: `Endpoint 留空时会回退到 ${provider.default_base_url}。`
    });
  }

  return issues;
}

export function createDefaultModelProviderDraft(
  catalog: NativeModelProviderCatalogItem[],
  credentials: CredentialItem[]
): WorkspaceModelProviderConfigDraft {
  const provider = resolveNativeModelProviderCatalog(catalog)[0] ?? null;
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
