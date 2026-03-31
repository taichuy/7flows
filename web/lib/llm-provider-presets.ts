import {
  resolveNativeModelProviderCatalog,
  type NativeModelProviderCatalogItem
} from "@/lib/model-provider-registry";

export type NativeLlmProviderPresetId = "openai" | "anthropic" | "openai-compatible";

export type NativeLlmProviderPreset = {
  id: NativeLlmProviderPresetId;
  providerValue: string;
  label: string;
  shortLabel: string;
  credentialType: string;
  compatibleCredentialTypes: string[];
  defaultBaseUrl: string;
  baseUrlPlaceholder: string;
  modelPlaceholder: string;
  protocolLabel: string;
  description: string;
};

const LEGACY_OPENAI_COMPATIBLE_PRESET: NativeLlmProviderPreset = {
  id: "openai-compatible",
  providerValue: "openai-compatible",
  label: "OpenAI-compatible",
  shortLabel: "兼容",
  credentialType: "openai_compatible_api_key",
  compatibleCredentialTypes: ["openai_compatible_api_key", "api_key"],
  defaultBaseUrl: "https://your-proxy.example/v1",
  baseUrlPlaceholder: "https://your-proxy.example/v1",
  modelPlaceholder: "自定义兼容模型，例如 kimi-k2 / local-proxy",
  protocolLabel: "OpenAI-compatible",
  description: "适用于自定义 base URL、代理、网关或自托管 OpenAI 兼容服务。"
};

function buildModelPlaceholder(defaultModels: string[]): string {
  if (defaultModels.length === 0) {
    return "例如 gpt-4.1 / claude-sonnet";
  }

  return defaultModels.slice(0, 2).join(" / ");
}

export function formatProtocolLabel(protocol: string): string {
  switch (protocol) {
    case "chat_completions":
      return "OpenAI Chat Completions";
    case "responses":
      return "OpenAI Responses";
    case "messages":
      return "Anthropic Messages";
    default:
      return protocol;
  }
}

function buildNativePresetFromCatalog(
  provider: NativeModelProviderCatalogItem
): NativeLlmProviderPreset | null {
  if (provider.id !== "openai" && provider.id !== "anthropic") {
    return null;
  }

  return {
    id: provider.id,
    providerValue: provider.id,
    label: provider.label,
    shortLabel: provider.label,
    credentialType: provider.credential_type,
    compatibleCredentialTypes: provider.compatible_credential_types,
    defaultBaseUrl: provider.default_base_url,
    baseUrlPlaceholder: provider.default_base_url,
    modelPlaceholder: buildModelPlaceholder(provider.default_models),
    protocolLabel: formatProtocolLabel(provider.default_protocol),
    description: provider.description
  };
}

export function listNativeLlmProviderPresets(
  catalog?: NativeModelProviderCatalogItem[] | null
): NativeLlmProviderPreset[] {
  const nativePresets = resolveNativeModelProviderCatalog(catalog)
    .map(buildNativePresetFromCatalog)
    .filter((preset): preset is NativeLlmProviderPreset => preset !== null);

  return [...nativePresets, LEGACY_OPENAI_COMPATIBLE_PRESET];
}

export const NATIVE_LLM_PROVIDER_PRESETS: NativeLlmProviderPreset[] =
  listNativeLlmProviderPresets();

const PROVIDER_ALIAS_TO_PRESET_ID: Record<string, NativeLlmProviderPresetId> = {
  openai: "openai",
  anthropic: "anthropic",
  "openai-compatible": "openai-compatible",
  openai_compatible: "openai-compatible",
  compatible: "openai-compatible"
};

export function getNativeLlmProviderPreset(
  provider: string | null | undefined,
  catalog?: NativeModelProviderCatalogItem[] | null
): NativeLlmProviderPreset | null {
  const presets = listNativeLlmProviderPresets(catalog);
  const normalizedProvider = provider?.trim().toLowerCase();
  if (!normalizedProvider) {
    return presets[0] ?? null;
  }

  const presetId = PROVIDER_ALIAS_TO_PRESET_ID[normalizedProvider];
  if (!presetId) {
    return null;
  }

  return presets.find((preset) => preset.id === presetId) ?? null;
}

export function formatCredentialTypeLabel(credentialType: string): string {
  switch (credentialType) {
    case "openai_api_key":
      return "OpenAI API Key";
    case "anthropic_api_key":
      return "Anthropic API Key";
    case "openai_compatible_api_key":
      return "OpenAI-compatible API Key";
    case "api_key":
      return "通用 API Key";
    default:
      return credentialType;
  }
}
