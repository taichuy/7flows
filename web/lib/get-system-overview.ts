import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  normalizeWorkbenchEntryLinkKey,
  type WorkbenchEntryLinkKey
} from "@/lib/workbench-entry-links";

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
  supports_tool_execution: boolean;
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
  supported_languages: string[];
  supported_profiles: string[];
  supported_dependency_modes: string[];
  supports_tool_execution: boolean;
  supports_builtin_package_sets: boolean;
  supports_backend_extensions: boolean;
  supports_network_policy: boolean;
  supports_filesystem_policy: boolean;
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
  supports_tool_execution: boolean;
  supports_builtin_package_sets: boolean;
  supports_backend_extensions: boolean;
  supports_network_policy: boolean;
  supports_filesystem_policy: boolean;
  affected_run_count?: number;
  affected_workflow_count?: number;
  primary_blocker_kind?: string | null;
  recommended_action?: SystemOverviewRecommendedAction | null;
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

export type CallbackWaitingAutomationStepCheck = {
  key: string;
  label: string;
  task: string;
  source: string;
  enabled: boolean;
  interval_seconds?: number | null;
  detail: string;
  scheduler_health: CallbackWaitingAutomationStepSchedulerHealthCheck;
};

export type CallbackWaitingAutomationStepSchedulerHealthCheck = {
  health_status: string;
  detail: string;
  last_status?: string | null;
  last_started_at?: string | null;
  last_finished_at?: string | null;
  matched_count: number;
  affected_count: number;
};

export type CallbackWaitingAutomationCheck = {
  status: string;
  scheduler_required: boolean;
  detail: string;
  scheduler_health_status: string;
  scheduler_health_detail: string;
  steps: CallbackWaitingAutomationStepCheck[];
  affected_run_count?: number;
  affected_workflow_count?: number;
  primary_blocker_kind?: string | null;
  recommended_action?: SystemOverviewRecommendedAction | null;
};

export type SystemOverviewRecommendedAction = {
  kind: string;
  entry_key: WorkbenchEntryLinkKey;
  href: string | null;
  label: string | null;
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
  callback_waiting_automation: CallbackWaitingAutomationCheck;
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
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false,
    affected_run_count: 0,
    affected_workflow_count: 0,
    primary_blocker_kind: null,
    recommended_action: null
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
  },
  callback_waiting_automation: {
    status: "disabled",
    scheduler_required: true,
    detail: "`WAITING_CALLBACK` 后台补偿状态当前不可见，请先启动 api 服务。",
    scheduler_health_status: "unknown",
    scheduler_health_detail: "当前还拿不到 scheduler 最近执行事实。",
    steps: [],
    affected_run_count: 0,
    affected_workflow_count: 0,
    primary_blocker_kind: null,
    recommended_action: null
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

    return normalizeSystemOverview(await response.json());
  } catch {
    return fallback;
  }
}

function normalizeSystemOverview(input: unknown): SystemOverview {
  if (!isRecord(input)) {
    return fallback;
  }

  const raw = input as Partial<SystemOverview> & Record<string, unknown>;

  return {
    ...fallback,
    ...raw,
    sandbox_readiness: normalizeSandboxReadiness(raw.sandbox_readiness),
    callback_waiting_automation: normalizeCallbackWaitingAutomation(
      raw.callback_waiting_automation
    )
  };
}

function normalizeSandboxReadiness(input: unknown): SandboxReadinessCheck {
  if (!isRecord(input)) {
    return fallback.sandbox_readiness;
  }

  const raw = input as Partial<SandboxReadinessCheck> & Record<string, unknown>;

  return {
    ...fallback.sandbox_readiness,
    ...raw,
    recommended_action: normalizeSystemOverviewRecommendedAction(raw.recommended_action)
  };
}

function normalizeCallbackWaitingAutomation(input: unknown): CallbackWaitingAutomationCheck {
  if (!isRecord(input)) {
    return fallback.callback_waiting_automation;
  }

  const raw = input as Partial<CallbackWaitingAutomationCheck> & Record<string, unknown>;

  return {
    ...fallback.callback_waiting_automation,
    ...raw,
    recommended_action: normalizeSystemOverviewRecommendedAction(raw.recommended_action)
  };
}

function normalizeSystemOverviewRecommendedAction(
  input: unknown
): SystemOverviewRecommendedAction | null {
  if (!isRecord(input)) {
    return null;
  }

  const kind = asOptionalTrimmedString(input.kind);
  const entryKey = normalizeWorkbenchEntryLinkKey(
    asOptionalTrimmedString(input.entry_key)
  );

  if (!kind || !entryKey) {
    return null;
  }

  return {
    kind,
    entry_key: entryKey,
    href: asOptionalTrimmedString(input.href),
    label: asOptionalTrimmedString(input.label)
  };
}

function asOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
