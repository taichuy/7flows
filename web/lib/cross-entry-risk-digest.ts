import { getCallbackWaitingAutomationHealthSnapshot } from "@/lib/callback-waiting-presenters";
import type {
  NotificationChannelCapabilityItem,
  SensitiveAccessInboxSummary
} from "@/lib/get-sensitive-access";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck,
  SystemOverviewRecommendedAction
} from "@/lib/get-system-overview";
import {
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  listSandboxAvailableClasses,
  listSandboxBlockedClasses
} from "@/lib/sandbox-readiness-presenters";
import type {
  WorkbenchEntryLinkKey,
  WorkbenchEntryLinkOverrides
} from "@/lib/workbench-entry-links";

export type CrossEntryRiskDigestTone = "healthy" | "degraded" | "blocked";

export type CrossEntryRiskDigestMetric = {
  label: string;
  value: string;
};

export type CrossEntryRiskDigestFocusArea = {
  id: "sandbox" | "callback" | "operator";
  title: string;
  tone: CrossEntryRiskDigestTone;
  summary: string;
  nextStep: string;
  entryKey: WorkbenchEntryLinkKey;
};

export type CrossEntryRiskDigest = {
  tone: CrossEntryRiskDigestTone;
  headline: string;
  detail: string;
  metrics: CrossEntryRiskDigestMetric[];
  focusAreas: CrossEntryRiskDigestFocusArea[];
  primaryEntryKey: WorkbenchEntryLinkKey;
  entryKeys: WorkbenchEntryLinkKey[];
  entryOverrides?: WorkbenchEntryLinkOverrides;
};

type BuildCrossEntryRiskDigestInput = {
  sandboxReadiness: SandboxReadinessCheck;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sensitiveAccessSummary: SensitiveAccessInboxSummary;
  channels: NotificationChannelCapabilityItem[];
};

function joinNonEmpty(parts: Array<string | null | undefined>, separator = "；") {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);
}

function formatImpactedScope(
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

function formatImpactedMetricValue(
  affectedRunCount?: number | null,
  affectedWorkflowCount?: number | null
) {
  return `${Math.max(Number(affectedRunCount ?? 0), 0)} runs / ${Math.max(
    Number(affectedWorkflowCount ?? 0),
    0
  )} workflows`;
}

function resolveRecommendedEntryKey({
  action,
  fallback
}: {
  action?: SystemOverviewRecommendedAction | null;
  fallback: WorkbenchEntryLinkKey;
}) {
  return action?.entry_key ?? fallback;
}

function applyRecommendedActionOverride(
  overrides: WorkbenchEntryLinkOverrides,
  action?: SystemOverviewRecommendedAction | null
) {
  const entryKey = action?.entry_key;
  if (!entryKey) {
    return;
  }

  overrides[entryKey] = {
    href: action?.href?.trim() || undefined,
    label: action?.label?.trim() || undefined
  };
}

function getAutomationAttentionStepCount(automation: CallbackWaitingAutomationCheck) {
  return automation.steps.filter(
    (step) => step.enabled && step.scheduler_health.health_status !== "healthy"
  ).length;
}

function getChannelAttentionSummary(channels: NotificationChannelCapabilityItem[]) {
  const attentionChannels = channels.filter(
    (channel) =>
      channel.dispatch_summary.failed_count > 0 ||
      (channel.dispatch_summary.pending_count > 0 && channel.health_status !== "ready")
  );
  return {
    attentionCount: attentionChannels.length,
    names: attentionChannels.map((channel) => channel.channel)
  };
}

function getCallbackTone(
  automation: CallbackWaitingAutomationCheck,
  attentionStepCount: number
): CrossEntryRiskDigestTone {
  if (
    (automation.scheduler_required && automation.status === "disabled") ||
    automation.scheduler_health_status === "failed" ||
    automation.scheduler_health_status === "offline"
  ) {
    return "blocked";
  }

  if (
    automation.status !== "configured" ||
    automation.scheduler_health_status !== "healthy" ||
    attentionStepCount > 0
  ) {
    return "degraded";
  }

  return "healthy";
}

function getOperatorTone({
  blockers,
  channelAttentionCount
}: {
  blockers: NonNullable<SensitiveAccessInboxSummary["blockers"]>;
  channelAttentionCount: number;
}): CrossEntryRiskDigestTone {
  if (blockers.some((blocker) => blocker.tone === "blocked")) {
    return "blocked";
  }

  if (blockers.some((blocker) => blocker.tone === "degraded") || channelAttentionCount > 0) {
    return "degraded";
  }

  return "healthy";
}

function formatImpactedScopeSummary(summary: SensitiveAccessInboxSummary) {
  return formatImpactedScope(summary.affected_run_count, summary.affected_workflow_count);
}

function formatOperatorBlockerSummary(
  blocker: NonNullable<SensitiveAccessInboxSummary["blockers"]>[number]
) {
  const impactedScope = joinNonEmpty(
    [
      blocker.affected_run_count > 0 ? `${blocker.affected_run_count} 个 run` : null,
      blocker.affected_workflow_count > 0
        ? `${blocker.affected_workflow_count} 个 workflow`
        : null
    ],
    " / "
  );

  switch (blocker.kind) {
    case "pending_approval":
      return joinNonEmpty([
        `${blocker.item_count} 个审批待处理`,
        impactedScope ? `影响 ${impactedScope}` : null
      ], "，");
    case "waiting_resume":
      return joinNonEmpty([
        `${blocker.item_count} 个 waiting 恢复仍被阻塞`,
        impactedScope ? `影响 ${impactedScope}` : null
      ], "，");
    case "failed_notification":
      return joinNonEmpty([
        `${blocker.item_count} 条通知投递失败`,
        impactedScope ? `影响 ${impactedScope}` : null
      ], "，");
    case "pending_notification":
      return joinNonEmpty([
        `${blocker.item_count} 条通知仍在排队`,
        impactedScope ? `影响 ${impactedScope}` : null
      ], "，");
    default:
      return null;
  }
}

function buildLegacyOperatorBlockers(
  summary: SensitiveAccessInboxSummary
): NonNullable<SensitiveAccessInboxSummary["blockers"]> {
  return [
    {
      kind: "pending_approval" as const,
      tone: "blocked" as const,
      item_count: summary.pending_ticket_count,
      affected_run_count: summary.affected_run_count ?? 0,
      affected_workflow_count: summary.affected_workflow_count ?? 0
    },
    {
      kind: "waiting_resume" as const,
      tone: "blocked" as const,
      item_count: summary.waiting_ticket_count,
      affected_run_count: summary.affected_run_count ?? 0,
      affected_workflow_count: summary.affected_workflow_count ?? 0
    },
    {
      kind: "failed_notification" as const,
      tone: "blocked" as const,
      item_count: summary.failed_notification_count,
      affected_run_count: summary.affected_run_count ?? 0,
      affected_workflow_count: summary.affected_workflow_count ?? 0
    },
    {
      kind: "pending_notification" as const,
      tone: "degraded" as const,
      item_count: summary.pending_notification_count,
      affected_run_count: summary.affected_run_count ?? 0,
      affected_workflow_count: summary.affected_workflow_count ?? 0
    }
  ].filter((blocker) => blocker.item_count > 0);
}

function getOverallTone(
  focusAreas: CrossEntryRiskDigestFocusArea[]
): CrossEntryRiskDigestTone {
  if (focusAreas.some((area) => area.tone === "blocked")) {
    return "blocked";
  }

  if (focusAreas.some((area) => area.tone === "degraded")) {
    return "degraded";
  }

  return "healthy";
}

function pickPrimaryEntryKey(
  focusAreas: CrossEntryRiskDigestFocusArea[]
): WorkbenchEntryLinkKey {
  const operatorArea = focusAreas.find((area) => area.id === "operator");
  if (operatorArea && operatorArea.tone !== "healthy") {
    return operatorArea.entryKey;
  }

  const sandboxArea = focusAreas.find((area) => area.id === "sandbox");
  if (sandboxArea && sandboxArea.tone !== "healthy") {
    return sandboxArea.entryKey;
  }

  const callbackArea = focusAreas.find((area) => area.id === "callback");
  if (callbackArea && callbackArea.tone !== "healthy") {
    return callbackArea.entryKey;
  }

  return "workflowLibrary";
}

function buildEntryKeys(primaryEntryKey: WorkbenchEntryLinkKey): WorkbenchEntryLinkKey[] {
  return Array.from(
    new Set<WorkbenchEntryLinkKey>([
      primaryEntryKey,
      "operatorInbox",
      "workflowLibrary",
      "runLibrary"
    ])
  );
}

export function buildCrossEntryRiskDigest({
  sandboxReadiness,
  callbackWaitingAutomation,
  sensitiveAccessSummary,
  channels
}: BuildCrossEntryRiskDigestInput): CrossEntryRiskDigest {
  const blockedClasses = listSandboxBlockedClasses(sandboxReadiness);
  const availableClasses = listSandboxAvailableClasses(sandboxReadiness);
  const backendAttentionCount =
    sandboxReadiness.degraded_backend_count + sandboxReadiness.offline_backend_count;
  const sandboxTone: CrossEntryRiskDigestTone = blockedClasses.length
    ? "blocked"
    : backendAttentionCount > 0
      ? "degraded"
      : "healthy";
  const sandboxSummary = joinNonEmpty(
    [
      formatSandboxReadinessHeadline(sandboxReadiness),
      formatSandboxReadinessDetail(sandboxReadiness)
    ],
    " "
  );

  const automationAttentionStepCount = getAutomationAttentionStepCount(
    callbackWaitingAutomation
  );
  const callbackTone = getCallbackTone(
    callbackWaitingAutomation,
    automationAttentionStepCount
  );
  const callbackSummary =
    getCallbackWaitingAutomationHealthSnapshot({
      callbackWaitingAutomation
    })?.summary ??
    callbackWaitingAutomation.scheduler_health_detail ??
    callbackWaitingAutomation.detail;

  const pendingApprovalCount = sensitiveAccessSummary.pending_ticket_count;
  const waitingResumeCount = sensitiveAccessSummary.waiting_ticket_count;
  const failedNotificationCount = sensitiveAccessSummary.failed_notification_count;
  const pendingNotificationCount = sensitiveAccessSummary.pending_notification_count;
  const operatorBlockers = sensitiveAccessSummary.blockers ?? buildLegacyOperatorBlockers(sensitiveAccessSummary);
  const channelAttention = getChannelAttentionSummary(channels);
  const operatorTone = getOperatorTone({
    blockers: operatorBlockers,
    channelAttentionCount: channelAttention.attentionCount
  });
  const operatorSummary =
    joinNonEmpty([
      formatImpactedScopeSummary(sensitiveAccessSummary)
        ? `当前 operator backlog 影响 ${formatImpactedScopeSummary(sensitiveAccessSummary)}。`
        : null,
      ...operatorBlockers.map((blocker) => formatOperatorBlockerSummary(blocker)),
      channelAttention.attentionCount > 0
        ? `${channelAttention.attentionCount} 个通知渠道需要关注（${channelAttention.names.join(" / ")}）`
        : null
    ]) || "审批、恢复与通知投递目前保持一致，没有新的 operator backlog。";

  const focusAreas: CrossEntryRiskDigestFocusArea[] = [
    {
      id: "sandbox",
      title: "Sandbox execution chain",
      tone: sandboxTone,
      summary:
        sandboxSummary ||
        "当前还没有足够的 sandbox readiness 事实，请优先核对 backend 健康与 execution class 可用性。",
      nextStep:
        "先确认 workflow 需要的 execution class 是否仍被 live readiness 覆盖，再继续处理运行阻塞。",
      entryKey: resolveRecommendedEntryKey({
        action: sandboxReadiness.recommended_action,
        fallback: "workflowLibrary"
      })
    },
    {
      id: "callback",
      title: "Callback recovery automation",
      tone: callbackTone,
      summary:
        callbackSummary ||
        "当前还拿不到 callback waiting automation 摘要，先核对 scheduler 与 waiting 恢复步骤是否真正接管。",
      nextStep:
        "先看 waiting resume / cleanup 是否由 scheduler 正常接管，再进入单条 run 继续排障。",
      entryKey: resolveRecommendedEntryKey({
        action: callbackWaitingAutomation.recommended_action,
        fallback: "runLibrary"
      })
    },
    {
      id: "operator",
      title: "Approval & notification backlog",
      tone: operatorTone,
      summary: operatorSummary,
      nextStep:
        "优先在 sensitive access inbox 收掉 pending approval、waiting resume 和失败通知，再回到具体 run。",
      entryKey: "operatorInbox"
    }
  ];

  const tone = getOverallTone(focusAreas);
  const attentionAreas = focusAreas.filter((area) => area.tone !== "healthy");
  const headline = attentionAreas.length
    ? `当前最需要优先收口的是 ${attentionAreas.map((area) => area.title).join("、")}。`
    : "当前跨入口风险已收敛，operator 可以直接沿 workflow、run 或 inbox 继续处理具体问题。";
  const detail = attentionAreas.length
    ? attentionAreas.map((area) => area.summary).join(" ")
    : "sandbox readiness、callback recovery 与审批/通知健康目前口径一致，不需要再跨多个入口拼装恢复事实。";
  const primaryEntryKey = pickPrimaryEntryKey(focusAreas);
  const entryKeys = buildEntryKeys(primaryEntryKey);

  const entryOverrides: WorkbenchEntryLinkOverrides = {};
  switch (sensitiveAccessSummary.primary_blocker_kind ?? operatorBlockers[0]?.kind ?? null) {
    case "pending_approval":
      entryOverrides.operatorInbox = {
        href: "/sensitive-access?status=pending",
        label: "打开待处理 inbox"
      };
      break;
    case "waiting_resume":
      entryOverrides.operatorInbox = {
        href: "/sensitive-access?waiting_status=waiting",
        label: "查看 waiting resume"
      };
      break;
    case "failed_notification":
      entryOverrides.operatorInbox = {
        href: "/sensitive-access?notification_status=failed",
        label: "查看失败通知"
      };
      break;
    case "pending_notification":
      entryOverrides.operatorInbox = {
        href: "/sensitive-access?notification_status=pending",
        label: "查看通知队列"
      };
      break;
    default:
      break;
  }

  applyRecommendedActionOverride(entryOverrides, sandboxReadiness.recommended_action);
  applyRecommendedActionOverride(entryOverrides, callbackWaitingAutomation.recommended_action);

  return {
    tone,
    headline,
    detail,
    metrics: [
      {
        label: "Sandbox",
        value: blockedClasses.length
          ? `${blockedClasses.length} blocked / ${availableClasses.length} ready`
          : backendAttentionCount > 0
            ? `${backendAttentionCount} backend attention / ${availableClasses.length} ready`
            : `${availableClasses.length} ready`
      },
      {
        label: "Callback",
        value:
          callbackWaitingAutomation.steps.length > 0
            ? `${automationAttentionStepCount} steps attention / ${callbackWaitingAutomation.steps.filter((step) => step.enabled).length} enabled`
            : callbackWaitingAutomation.scheduler_health_status
      },
      {
        label: "Approval",
        value: `${pendingApprovalCount} pending / ${waitingResumeCount} waiting`
      },
      {
        label: "Notifications",
        value: `${failedNotificationCount} failed / ${channelAttention.attentionCount} channels attention`
      },
      {
        label: "Impacted",
        value: `${sensitiveAccessSummary.affected_run_count ?? 0} runs / ${sensitiveAccessSummary.affected_workflow_count ?? 0} workflows`
      }
    ],
    focusAreas,
    primaryEntryKey,
    entryKeys,
    entryOverrides: Object.keys(entryOverrides).length > 0 ? entryOverrides : undefined
  };
}
