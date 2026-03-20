import type {
  SandboxExecutionClassReadinessCheck,
  SandboxReadinessCheck
} from "./get-system-overview";
import type { RunExecutionNodeItem } from "./get-run-views";

type SandboxReadinessExecutionNode = {
  node_type: RunExecutionNodeItem["node_type"];
  execution_class?: RunExecutionNodeItem["execution_class"] | null;
  requested_execution_class?: RunExecutionNodeItem["requested_execution_class"] | null;
  effective_execution_class?: RunExecutionNodeItem["effective_execution_class"] | null;
  execution_blocking_reason?: RunExecutionNodeItem["execution_blocking_reason"] | null;
  execution_sandbox_backend_id?: RunExecutionNodeItem["execution_sandbox_backend_id"] | null;
  execution_blocked_count?: number;
  execution_unavailable_count?: number;
};

export type SandboxExecutionReadinessInsight = {
  executionClass: string;
  status: "blocked" | "ready" | "tool_capability_missing";
  headline: string;
  detail: string | null;
  chips: string[];
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const readinessCapabilityLabels = [
  {
    enabled: "supports_tool_execution",
    label: "tool execution"
  },
  {
    enabled: "supports_builtin_package_sets",
    label: "builtin package sets"
  },
  {
    enabled: "supports_backend_extensions",
    label: "backend extensions"
  },
  {
    enabled: "supports_network_policy",
    label: "network policy"
  },
  {
    enabled: "supports_filesystem_policy",
    label: "filesystem policy"
  }
] as const satisfies Array<{
  enabled: keyof Pick<
    SandboxReadinessCheck,
    | "supports_tool_execution"
    | "supports_builtin_package_sets"
    | "supports_backend_extensions"
    | "supports_network_policy"
    | "supports_filesystem_policy"
  >;
  label: string;
}>;

export function listSandboxAvailableClasses(readiness: SandboxReadinessCheck): string[] {
  return readiness.execution_classes
    .filter((entry) => entry.available)
    .map((entry) => entry.execution_class);
}

export function listSandboxBlockedClasses(
  readiness: SandboxReadinessCheck
): SandboxExecutionClassReadinessCheck[] {
  return readiness.execution_classes.filter((entry) => !entry.available);
}

export function listSandboxReadinessCapabilityChips(
  readiness: SandboxReadinessCheck
): string[] {
  return readinessCapabilityLabels
    .filter((entry) => readiness[entry.enabled])
    .map((entry) => entry.label);
}

export function buildSandboxExecutionClassCapabilityChips(
  entry: SandboxExecutionClassReadinessCheck
): string[] {
  const chips = [
    ...entry.supported_languages.map((language) => `language ${language}`),
    ...entry.supported_profiles.map((profile) => `profile ${profile}`),
    ...entry.supported_dependency_modes.map((mode) => `dependency ${mode}`)
  ];

  if (entry.supports_tool_execution) {
    chips.push("tool execution");
  }
  if (entry.supports_builtin_package_sets) {
    chips.push("builtin package sets");
  }
  if (entry.supports_backend_extensions) {
    chips.push("backend extensions");
  }
  if (entry.supports_network_policy) {
    chips.push("network policy");
  }
  if (entry.supports_filesystem_policy) {
    chips.push("filesystem policy");
  }

  return chips;
}

export function buildSandboxExecutionReadinessInsight(
  readiness: SandboxReadinessCheck,
  node: SandboxReadinessExecutionNode
): SandboxExecutionReadinessInsight | null {
  const blockingReason = trimOrNull(node.execution_blocking_reason);
  const hasExecutionFailure =
    Boolean(blockingReason) ||
    (node.execution_blocked_count ?? 0) > 0 ||
    (node.execution_unavailable_count ?? 0) > 0;

  if (!hasExecutionFailure) {
    return null;
  }

  const targetExecutionClass = [
    trimOrNull(node.requested_execution_class),
    trimOrNull(node.execution_class),
    trimOrNull(node.effective_execution_class)
  ].find((value) =>
    value ? readiness.execution_classes.some((entry) => entry.execution_class === value) : false
  );

  if (!targetExecutionClass) {
    return null;
  }

  const readinessEntry = readiness.execution_classes.find(
    (entry) => entry.execution_class === targetExecutionClass
  );
  if (!readinessEntry) {
    return null;
  }

  const capabilityChips = buildSandboxExecutionClassCapabilityChips(readinessEntry);
  const currentlyAvailableClasses = listSandboxAvailableClasses(readiness).filter(
    (executionClass) => executionClass !== targetExecutionClass
  );
  const historicalBackendId = trimOrNull(node.execution_sandbox_backend_id);
  const backendMismatch =
    historicalBackendId &&
    readinessEntry.backend_ids.length > 0 &&
    !readinessEntry.backend_ids.includes(historicalBackendId);

  if (!readinessEntry.available) {
    const detail = [
      trimOrNull(readinessEntry.reason) ??
        `当前还没有兼容 execution class '${targetExecutionClass}' 的 sandbox backend。`,
      currentlyAvailableClasses.length > 0
        ? `当前仍可复用的 execution class：${currentlyAvailableClasses.join(" / ")}。`
        : null,
      historicalBackendId
        ? `这次 run 记录的 backend 是 ${historicalBackendId}。`
        : null,
      "在此之前，同类强隔离路径重试仍会继续 fail-closed。"
    ]
      .filter((item): item is string => Boolean(item))
      .join(" ");

    return {
      executionClass: targetExecutionClass,
      status: "blocked",
      headline: `当前 live sandbox readiness 显示 ${targetExecutionClass} 仍 blocked。`,
      detail,
      chips: capabilityChips
    };
  }

  if (node.node_type === "tool" && !readinessEntry.supports_tool_execution) {
    const detail = [
      readinessEntry.backend_ids.length > 0
        ? `当前 ${targetExecutionClass} ready via ${readinessEntry.backend_ids.join(", ")}。`
        : null,
      "但这组 backend 还没有声明 sandbox-backed tool execution capability；tool 路径继续请求强隔离时仍应保持 fail-closed。",
      backendMismatch
        ? `历史 run 记录的 backend 是 ${historicalBackendId}，当前 ready backend 已变成 ${readinessEntry.backend_ids.join(", ")}。`
        : null
    ]
      .filter((item): item is string => Boolean(item))
      .join(" ");

    return {
      executionClass: targetExecutionClass,
      status: "tool_capability_missing",
      headline: `当前 live sandbox readiness 显示 ${targetExecutionClass} 已 ready，但还没有 sandbox-backed tool execution capability。`,
      detail,
      chips: capabilityChips
    };
  }

  const detail = [
    readinessEntry.backend_ids.length > 0
      ? `当前 ${targetExecutionClass} ready via ${readinessEntry.backend_ids.join(", ")}。`
      : null,
    backendMismatch
      ? `历史 run 记录的 backend 是 ${historicalBackendId}，当前 ready backend 已变成 ${readinessEntry.backend_ids.join(", ")}。`
      : null,
    "这说明当前阻断更可能来自 run 当时的 backend 健康度、节点配置或 capability 漂移，而不是此刻全局链路仍未恢复。"
  ]
    .filter((item): item is string => Boolean(item))
    .join(" ");

  return {
    executionClass: targetExecutionClass,
    status: "ready",
    headline: `当前 live sandbox readiness 显示 ${targetExecutionClass} 已 ready。`,
    detail,
    chips: capabilityChips
  };
}

export function formatSandboxReadinessHeadline(readiness: SandboxReadinessCheck): string {
  const availableClasses = listSandboxAvailableClasses(readiness);
  const blockedEntries = listSandboxBlockedClasses(readiness);
  const blockedClasses = blockedEntries.map((entry) => entry.execution_class);

  if (blockedClasses.length === 0) {
    if (readiness.offline_backend_count > 0) {
      return `强隔离执行链路当前可用，但仍有 ${readiness.offline_backend_count} 个已启用 backend 处于 offline。`;
    }
    if (readiness.degraded_backend_count > 0) {
      return `强隔离执行链路当前可用，但仍有 ${readiness.degraded_backend_count} 个已启用 backend 处于 degraded。`;
    }
    if (availableClasses.length > 0) {
      return `强隔离执行链路当前已具备 ${availableClasses.join(" / ")} 可用 backend。`;
    }
    return "当前还没有任何强隔离 execution class ready。";
  }

  if (readiness.enabled_backend_count === 0) {
    return `当前没有启用 sandbox backend；${blockedClasses.join(" / ")} 等强隔离 execution class 会 fail-closed。`;
  }

  return `强隔离路径会按 execution class fail-closed：${blockedClasses.join(" / ")} 当前 blocked。`;
}

export function formatSandboxReadinessDetail(
  readiness: SandboxReadinessCheck
): string | null {
  const availableClasses = listSandboxAvailableClasses(readiness);
  const blockedEntries = listSandboxBlockedClasses(readiness);
  const details: string[] = [];
  const blockedReasons = blockedEntries
    .map((entry) => entry.reason?.trim())
    .filter((reason): reason is string => Boolean(reason));

  if (blockedReasons.length > 0) {
    details.push(blockedReasons.join("；"));
  }

  if (availableClasses.length > 0) {
    details.push(`当前仍可复用的 execution class：${availableClasses.join(" / ")}。`);
  }

  if (readiness.offline_backend_count > 0) {
    details.push(
      `另有 ${readiness.offline_backend_count} 个已启用 backend 处于 offline，注册不等于强隔离链路真的可用。`
    );
  } else if (readiness.degraded_backend_count > 0) {
    details.push(
      `当前有 ${readiness.degraded_backend_count} 个已启用 backend 处于 degraded，发布前仍应核对健康度与 capability。`
    );
  }

  return details.length > 0 ? details.join(" ") : null;
}

export function formatSandboxReadinessPreflightHint(
  readiness?: SandboxReadinessCheck | null
): string | null {
  if (!readiness) {
    return null;
  }

  const blockedEntries = listSandboxBlockedClasses(readiness);
  if (
    blockedEntries.length === 0 &&
    readiness.offline_backend_count === 0 &&
    readiness.degraded_backend_count === 0
  ) {
    return null;
  }

  const headline = formatSandboxReadinessHeadline(readiness);
  const detail = formatSandboxReadinessDetail(readiness);
  return `当前 sandbox readiness：${headline}${detail ? ` ${detail}` : ""}`;
}
