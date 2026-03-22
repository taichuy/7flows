import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck,
  SystemOverviewRecommendedAction
} from "@/lib/get-system-overview";
import type { OperatorRecommendedNextStepCandidate } from "@/lib/operator-follow-up-presenters";

export type SystemOverviewFollowUpSurface = {
  kind: string;
  detail: string;
  href: string | null;
  hrefLabel: string | null;
  impactedScope: string | null;
  entryKey: string | null;
};

function joinNonEmpty(parts: Array<string | null | undefined>, separator = "；") {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);
}

function normalizeRecommendedAction(
  action?: SystemOverviewRecommendedAction | null
): SystemOverviewRecommendedAction | null {
  if (!action?.kind?.trim()) {
    return null;
  }

  return {
    kind: action.kind.trim(),
    entry_key: action.entry_key?.trim() || "",
    href: action.href?.trim() || "",
    label: action.label?.trim() || ""
  };
}

export function formatSystemOverviewImpactedScope(
  affectedRunCount?: number | null,
  affectedWorkflowCount?: number | null
) {
  const normalizedRunCount = Math.max(Number(affectedRunCount ?? 0), 0);
  const normalizedWorkflowCount = Math.max(Number(affectedWorkflowCount ?? 0), 0);
  if (normalizedRunCount <= 0 && normalizedWorkflowCount <= 0) {
    return null;
  }

  return joinNonEmpty(
    [
      normalizedRunCount > 0 ? `${normalizedRunCount} 个 run` : null,
      normalizedWorkflowCount > 0 ? `${normalizedWorkflowCount} 个 workflow` : null
    ],
    " / "
  );
}

export function buildSandboxReadinessSystemFollowUp(
  readiness?: Pick<
    SandboxReadinessCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null
): SystemOverviewFollowUpSurface | null {
  const action = normalizeRecommendedAction(readiness?.recommended_action);
  if (!action) {
    return null;
  }

  const impactedScope = formatSystemOverviewImpactedScope(
    readiness?.affected_run_count,
    readiness?.affected_workflow_count
  );
  const kind = readiness?.primary_blocker_kind ?? action.kind;
  const detail =
    kind === "execution_class_blocked"
      ? joinNonEmpty([
          impactedScope ? `当前 live sandbox readiness 仍影响 ${impactedScope}` : null,
          "优先回到 workflow library 处理强隔离 execution class 与隔离需求。"
        ])
      : kind === "backend_offline"
        ? joinNonEmpty([
            impactedScope ? `当前 live sandbox readiness 仍影响 ${impactedScope}` : null,
            "至少一个 sandbox backend 仍 offline，优先回到 workflow library 评估受影响的强隔离链路。"
          ])
        : joinNonEmpty([
            impactedScope ? `当前 live sandbox readiness 仍影响 ${impactedScope}` : null,
            "sandbox backend 仍处于 degraded，优先回到 workflow library 检查强隔离 workflow 的受影响范围。"
          ]);

  return {
    kind,
    detail,
    href: action.href || null,
    hrefLabel: action.label || null,
    impactedScope,
    entryKey: action.entry_key || null
  };
}

export function buildCallbackWaitingAutomationSystemFollowUp(
  automation?: Pick<
    CallbackWaitingAutomationCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null
): SystemOverviewFollowUpSurface | null {
  const action = normalizeRecommendedAction(automation?.recommended_action);
  if (!action) {
    return null;
  }

  const impactedScope = formatSystemOverviewImpactedScope(
    automation?.affected_run_count,
    automation?.affected_workflow_count
  );
  const kind = automation?.primary_blocker_kind ?? action.kind;
  const detail =
    kind === "automation_disabled"
      ? joinNonEmpty([
          impactedScope ? `当前 callback recovery 仍影响 ${impactedScope}` : null,
          "自动恢复链路尚未启用，优先回到 run library 检查 waiting callback runs 与恢复队列。"
        ])
      : kind === "scheduler_unhealthy"
        ? joinNonEmpty([
            impactedScope ? `当前 callback recovery 仍影响 ${impactedScope}` : null,
            "scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。"
          ])
        : joinNonEmpty([
            impactedScope ? `当前 callback recovery 仍影响 ${impactedScope}` : null,
            "callback recovery 自动化仍处于 degraded，优先回到 run library 检查 waiting callback runs。"
          ]);

  return {
    kind,
    detail,
    href: action.href || null,
    hrefLabel: action.label || null,
    impactedScope,
    entryKey: action.entry_key || null
  };
}

export function buildSandboxReadinessFollowUpCandidate(
  readiness?: Pick<
    SandboxReadinessCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null,
  label = "sandbox readiness"
): OperatorRecommendedNextStepCandidate | null {
  const surface = buildSandboxReadinessSystemFollowUp(readiness);
  if (!surface) {
    return null;
  }

  return {
    active: true,
    label,
    detail: surface.detail,
    href: surface.href,
    href_label: surface.hrefLabel,
    fallback_detail: surface.detail
  };
}

export function buildCallbackWaitingAutomationFollowUpCandidate(
  automation?: Pick<
    CallbackWaitingAutomationCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null,
  label = "callback recovery"
): OperatorRecommendedNextStepCandidate | null {
  const surface = buildCallbackWaitingAutomationSystemFollowUp(automation);
  if (!surface) {
    return null;
  }

  return {
    active: true,
    label,
    detail: surface.detail,
    href: surface.href,
    href_label: surface.hrefLabel,
    fallback_detail: surface.detail
  };
}
