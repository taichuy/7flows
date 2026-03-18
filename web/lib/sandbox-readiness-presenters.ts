import type {
  SandboxExecutionClassReadinessCheck,
  SandboxReadinessCheck
} from "./get-system-overview";

const readinessCapabilityLabels = [
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
