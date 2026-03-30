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

export const NATIVE_LLM_PROVIDER_PRESETS: NativeLlmProviderPreset[] = [
  {
    id: "openai",
    providerValue: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    credentialType: "openai_api_key",
    compatibleCredentialTypes: ["openai_api_key", "api_key"],
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4.1 / gpt-4o",
    protocolLabel: "OpenAI Chat Completions",
    description: "官方 OpenAI 厂商预设，默认走 `/chat/completions`。"
  },
  {
    id: "anthropic",
    providerValue: "anthropic",
    label: "Anthropic",
    shortLabel: "Anthropic",
    credentialType: "anthropic_api_key",
    compatibleCredentialTypes: ["anthropic_api_key", "api_key"],
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlPlaceholder: "https://api.anthropic.com",
    modelPlaceholder: "claude-3-7-sonnet-latest",
    protocolLabel: "Anthropic Messages",
    description: "官方 Anthropic 厂商预设，默认走 `/v1/messages`。"
  },
  {
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
  }
];

const PROVIDER_ALIAS_TO_PRESET_ID: Record<string, NativeLlmProviderPresetId> = {
  openai: "openai",
  anthropic: "anthropic",
  "openai-compatible": "openai-compatible",
  openai_compatible: "openai-compatible",
  compatible: "openai-compatible"
};

export function getNativeLlmProviderPreset(
  provider: string | null | undefined
): NativeLlmProviderPreset | null {
  const normalizedProvider = provider?.trim().toLowerCase();
  if (!normalizedProvider) {
    return NATIVE_LLM_PROVIDER_PRESETS[0];
  }

  const presetId = PROVIDER_ALIAS_TO_PRESET_ID[normalizedProvider];
  if (!presetId) {
    return null;
  }

  return NATIVE_LLM_PROVIDER_PRESETS.find((preset) => preset.id === presetId) ?? null;
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
