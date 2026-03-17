import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";

const EXECUTION_CLASS_ORDER: Record<string, number> = {
  inline: 0,
  subprocess: 1,
  sandbox: 2,
  microvm: 3
};

const SENSITIVITY_ORDER: Record<string, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3
};

export type ToolGovernanceSummary = {
  sensitivityLevel: "L0" | "L1" | "L2" | "L3" | null;
  defaultExecutionClass: string | null;
  supportedExecutionClasses: string[];
  strongestExecutionClass: string | null;
  governedBySensitivity: boolean;
  requiresStrongIsolationByDefault: boolean;
  summary: string;
};

export function getToolGovernanceSummary(
  tool: PluginToolRegistryItem
): ToolGovernanceSummary {
  const sensitivityLevel = normalizeSensitivityLevel(tool.sensitivity_level);
  const defaultExecutionClass = normalizeExecutionClass(tool.default_execution_class);
  const supportedExecutionClasses = normalizeExecutionClassList(
    tool.supported_execution_classes,
    tool.ecosystem === "native" ? ["inline"] : ["subprocess"]
  );
  const strongestExecutionClass = supportedExecutionClasses.reduce<string | null>(
    (strongest, executionClass) => {
      if (!strongest) {
        return executionClass;
      }
      return EXECUTION_CLASS_ORDER[executionClass] > EXECUTION_CLASS_ORDER[strongest]
        ? executionClass
        : strongest;
    },
    null
  );
  const governedBySensitivity =
    (sensitivityLevel === "L2" && defaultExecutionClass === "sandbox") ||
    (sensitivityLevel === "L3" && defaultExecutionClass === "microvm");
  const requiresStrongIsolationByDefault =
    defaultExecutionClass === "sandbox" || defaultExecutionClass === "microvm";

  return {
    sensitivityLevel,
    defaultExecutionClass,
    supportedExecutionClasses,
    strongestExecutionClass,
    governedBySensitivity,
    requiresStrongIsolationByDefault,
    summary: buildToolGovernanceCopy({
      sensitivityLevel,
      defaultExecutionClass,
      supportedExecutionClasses,
      governedBySensitivity,
      strongestExecutionClass
    })
  };
}

export function compareToolsByGovernance(
  left: PluginToolRegistryItem,
  right: PluginToolRegistryItem
) {
  const leftSummary = getToolGovernanceSummary(left);
  const rightSummary = getToolGovernanceSummary(right);
  const defaultExecutionDelta =
    executionClassRank(rightSummary.defaultExecutionClass) -
    executionClassRank(leftSummary.defaultExecutionClass);
  if (defaultExecutionDelta !== 0) {
    return defaultExecutionDelta;
  }
  const sensitivityDelta =
    sensitivityRank(rightSummary.sensitivityLevel) - sensitivityRank(leftSummary.sensitivityLevel);
  if (sensitivityDelta !== 0) {
    return sensitivityDelta;
  }
  return (left.name || left.id).localeCompare(right.name || right.id);
}

function buildToolGovernanceCopy({
  sensitivityLevel,
  defaultExecutionClass,
  supportedExecutionClasses,
  governedBySensitivity,
  strongestExecutionClass
}: {
  sensitivityLevel: ToolGovernanceSummary["sensitivityLevel"];
  defaultExecutionClass: string | null;
  supportedExecutionClasses: string[];
  governedBySensitivity: boolean;
  strongestExecutionClass: string | null;
}) {
  const supportedCopy = supportedExecutionClasses.length
    ? `支持 ${supportedExecutionClasses.join(" / ")}。`
    : "当前目录项还没有声明执行能力。";

  if (governedBySensitivity && sensitivityLevel && defaultExecutionClass) {
    return `敏感级别 ${sensitivityLevel} 已把默认执行级别收口到 ${defaultExecutionClass}。${supportedCopy}`;
  }
  if (defaultExecutionClass) {
    return `默认执行级别为 ${defaultExecutionClass}。${supportedCopy}`;
  }
  if (strongestExecutionClass) {
    return `未声明默认执行级别；当前最高可用执行边界是 ${strongestExecutionClass}。${supportedCopy}`;
  }
  return supportedCopy;
}

function normalizeExecutionClassList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }
  const normalized = value.flatMap((item) => {
    const executionClass = normalizeExecutionClass(item);
    return executionClass ? [executionClass] : [];
  });
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function normalizeExecutionClass(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized in EXECUTION_CLASS_ORDER ? normalized : null;
}

function normalizeSensitivityLevel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized in SENSITIVITY_ORDER
    ? (normalized as ToolGovernanceSummary["sensitivityLevel"])
    : null;
}

function executionClassRank(value: string | null) {
  return value ? EXECUTION_CLASS_ORDER[value] ?? -1 : -1;
}

function sensitivityRank(value: ToolGovernanceSummary["sensitivityLevel"]) {
  return value ? SENSITIVITY_ORDER[value] : -1;
}
