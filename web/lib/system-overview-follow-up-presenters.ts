import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck,
  SystemOverviewRecommendedAction
} from "@/lib/get-system-overview";
import type { OperatorRecommendedNextStepCandidate } from "@/lib/operator-follow-up-presenters";
import { type WorkbenchEntryLinkKey } from "@/lib/workbench-entry-links";

export type SystemOverviewFollowUpSource =
  | "sandbox_readiness"
  | "callback_waiting_automation";

export type SystemOverviewFollowUpSurface = {
  source: SystemOverviewFollowUpSource;
  kind: string;
  detail: string;
  href: string | null;
  hrefLabel: string | null;
  impactedScope: string | null;
  entryKey: WorkbenchEntryLinkKey | null;
};

type NormalizedSystemOverviewRecommendedAction = {
  kind: string;
  entryKey: WorkbenchEntryLinkKey;
  href: string | null;
  label: string | null;
};

type SystemOverviewFollowUpShape = {
  source: SystemOverviewFollowUpSource;
  affectedRunCount?: number | null;
  affectedWorkflowCount?: number | null;
  primaryBlockerKind?: string | null;
  recommendedAction?: SystemOverviewRecommendedAction | null;
  buildDetail: (args: { kind: string; impactedScope: string | null }) => string;
};

function joinNonEmpty(parts: Array<string | null | undefined>, separator = "；") {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);
}

export function messageMentionsSandboxExecution(message?: string | null) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("sandbox") ||
    normalizedMessage.includes("microvm") ||
    normalizedMessage.includes("execution class") ||
    normalizedMessage.includes("backend offline") ||
    normalizedMessage.includes("tool execution")
  );
}

export function messageMentionsCallbackAutomation(message?: string | null) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("callback") ||
    normalizedMessage.includes("resume") ||
    normalizedMessage.includes("scheduler")
  );
}

function normalizeRecommendedAction(
  action?: SystemOverviewRecommendedAction | null
): NormalizedSystemOverviewRecommendedAction | null {
  if (!action?.kind?.trim()) {
    return null;
  }

  return {
    kind: action.kind.trim(),
    entryKey: action.entry_key,
    href: action.href?.trim() || null,
    label: action.label?.trim() || null
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

function buildSystemOverviewFollowUpSurface({
  source,
  affectedRunCount,
  affectedWorkflowCount,
  primaryBlockerKind,
  recommendedAction,
  buildDetail
}: SystemOverviewFollowUpShape): SystemOverviewFollowUpSurface | null {
  const action = normalizeRecommendedAction(recommendedAction);
  if (!action) {
    return null;
  }

  const impactedScope = formatSystemOverviewImpactedScope(affectedRunCount, affectedWorkflowCount);
  const kind = primaryBlockerKind ?? action.kind;

  return {
    source,
    kind,
    detail: buildDetail({ kind, impactedScope }),
    href: action.href,
    hrefLabel: action.label,
    impactedScope,
    entryKey: action.entryKey
  };
}

function buildSystemOverviewFollowUpCandidate(
  surface: SystemOverviewFollowUpSurface | null,
  label: string
): OperatorRecommendedNextStepCandidate | null {
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

export function buildSandboxReadinessSystemFollowUp(
  readiness?: Pick<
    SandboxReadinessCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null
): SystemOverviewFollowUpSurface | null {
  return buildSystemOverviewFollowUpSurface({
    source: "sandbox_readiness",
    affectedRunCount: readiness?.affected_run_count,
    affectedWorkflowCount: readiness?.affected_workflow_count,
    primaryBlockerKind: readiness?.primary_blocker_kind,
    recommendedAction: readiness?.recommended_action,
    buildDetail: ({ kind, impactedScope }) =>
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
            ])
  });
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
  return buildSystemOverviewFollowUpSurface({
    source: "callback_waiting_automation",
    affectedRunCount: automation?.affected_run_count,
    affectedWorkflowCount: automation?.affected_workflow_count,
    primaryBlockerKind: automation?.primary_blocker_kind,
    recommendedAction: automation?.recommended_action,
    buildDetail: ({ kind, impactedScope }) =>
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
            ])
  });
}

export function resolvePreferredSystemOverviewFollowUpSurface({
  callbackActive = false,
  callbackWaitingAutomation,
  sandboxActive = false,
  sandboxReadiness
}: {
  callbackActive?: boolean;
  callbackWaitingAutomation?: Pick<
    CallbackWaitingAutomationCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null;
  sandboxActive?: boolean;
  sandboxReadiness?: Pick<
    SandboxReadinessCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null;
}): SystemOverviewFollowUpSurface | null {
  if (callbackActive) {
    const callbackSurface = buildCallbackWaitingAutomationSystemFollowUp(callbackWaitingAutomation);
    if (callbackSurface) {
      return callbackSurface;
    }
  }

  if (sandboxActive) {
    return buildSandboxReadinessSystemFollowUp(sandboxReadiness);
  }

  return null;
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
  return buildSystemOverviewFollowUpCandidate(buildSandboxReadinessSystemFollowUp(readiness), label);
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
  return buildSystemOverviewFollowUpCandidate(
    buildCallbackWaitingAutomationSystemFollowUp(automation),
    label
  );
}
