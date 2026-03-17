import { getApiBaseUrl } from "@/lib/api-base-url";

export type ServiceCheck = {
  name: string;
  status: string;
  detail?: string | null;
};

export type CompatibilityAdapterCheck = {
  id: string;
  ecosystem: string;
  endpoint: string;
  enabled: boolean;
  status: string;
  detail?: string | null;
};

export type SandboxBackendCapabilityCheck = {
  supported_execution_classes: string[];
  supported_languages: string[];
  supported_profiles: string[];
  supported_dependency_modes: string[];
  supports_builtin_package_sets: boolean;
  supports_backend_extensions: boolean;
  supports_network_policy: boolean;
  supports_filesystem_policy: boolean;
};

export type SandboxBackendCheck = {
  id: string;
  kind: string;
  endpoint: string;
  enabled: boolean;
  status: string;
  capability: SandboxBackendCapabilityCheck;
  detail?: string | null;
};

export type SandboxExecutionClassReadinessCheck = {
  execution_class: string;
  available: boolean;
  backend_ids: string[];
  reason?: string | null;
};

export type SandboxReadinessCheck = {
  enabled_backend_count: number;
  healthy_backend_count: number;
  degraded_backend_count: number;
  offline_backend_count: number;
  execution_classes: SandboxExecutionClassReadinessCheck[];
  supported_languages: string[];
  supported_profiles: string[];
  supported_dependency_modes: string[];
  supports_builtin_package_sets: boolean;
  supports_backend_extensions: boolean;
  supports_network_policy: boolean;
  supports_filesystem_policy: boolean;
};

export type PluginToolCheck = {
  id: string;
  name: string;
  ecosystem: string;
  source: string;
  callable: boolean;
};

export type RecentRunCheck = {
  id: string;
  workflow_id: string;
  workflow_version: string;
  status: string;
  created_at: string;
  finished_at?: string | null;
  event_count: number;
};

export type RecentRunEventCheck = {
  id: number;
  run_id: string;
  node_run_id?: string | null;
  event_type: string;
  payload_keys: string[];
  payload_preview: string;
  payload_size: number;
  created_at: string;
};

export type RuntimeActivitySummary = {
  recent_run_count: number;
  recent_event_count: number;
  run_statuses: Record<string, number>;
  event_types: Record<string, number>;
};

export type RuntimeActivityCheck = {
  summary: RuntimeActivitySummary;
  recent_runs: RecentRunCheck[];
  recent_events: RecentRunEventCheck[];
};

export type SystemOverview = {
  status: string;
  environment: string;
  services: ServiceCheck[];
  capabilities: string[];
  plugin_adapters: CompatibilityAdapterCheck[];
  sandbox_backends: SandboxBackendCheck[];
  sandbox_readiness: SandboxReadinessCheck;
  plugin_tools: PluginToolCheck[];
  runtime_activity: RuntimeActivityCheck;
};

const fallback: SystemOverview = {
  status: "offline",
  environment: "local",
  services: [
    {
      name: "api",
      status: "down",
      detail: "后端概览接口尚未连接，请先启动 api 服务。"
    }
  ],
  capabilities: ["frontend-shell-ready"],
  plugin_adapters: [],
  sandbox_backends: [],
  sandbox_readiness: {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false
  },
  plugin_tools: [],
  runtime_activity: {
    summary: {
      recent_run_count: 0,
      recent_event_count: 0,
      run_statuses: {},
      event_types: {}
    },
    recent_runs: [],
    recent_events: []
  }
};

export async function getSystemOverview(): Promise<SystemOverview> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/system/overview`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return fallback;
    }

    return (await response.json()) as SystemOverview;
  } catch {
    return fallback;
  }
}
