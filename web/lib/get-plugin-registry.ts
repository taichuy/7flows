import { getApiBaseUrl } from "@/lib/api-base-url";
import { getPluginRegistryFetchOptions } from "@/lib/authoring-snapshot-cache";

export type PluginAdapterRegistryItem = {
  id: string;
  ecosystem: string;
  endpoint: string;
  enabled: boolean;
  healthcheck_path: string;
  workspace_ids: string[];
  plugin_kinds: string[];
  supported_execution_classes: string[];
  status: string;
  detail?: string | null;
  mode?: string | null;
};

export type PluginToolRegistryItem = {
  id: string;
  name: string;
  ecosystem: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  source: string;
  plugin_meta?: Record<string, unknown> | null;
  callable: boolean;
  supported_execution_classes: string[];
  default_execution_class?: string | null;
  sensitivity_level?: "L0" | "L1" | "L2" | "L3" | null;
};

export type PluginRegistrySnapshot = {
  adapters: PluginAdapterRegistryItem[];
  tools: PluginToolRegistryItem[];
};

const fallback: PluginRegistrySnapshot = {
  adapters: [],
  tools: []
};

async function fetchJson<T>(path: string, fallbackValue: T): Promise<T> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, getPluginRegistryFetchOptions());
    if (!response.ok) {
      return fallbackValue;
    }

    return (await response.json()) as T;
  } catch {
    return fallbackValue;
  }
}

export async function getPluginRegistrySnapshot(): Promise<PluginRegistrySnapshot> {
  const [adapters, tools] = await Promise.all([
    fetchJson<PluginAdapterRegistryItem[]>("/api/plugins/adapters", fallback.adapters),
    fetchJson<PluginToolRegistryItem[]>("/api/plugins/tools", fallback.tools)
  ]);

  return {
    adapters,
    tools
  };
}
