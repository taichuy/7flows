import { getCallbackWaitingAutomationHealthSnapshot } from "@/lib/callback-waiting-presenters";
import type {
  NotificationChannelCapabilityItem,
  SensitiveAccessInboxSummary
} from "@/lib/get-sensitive-access";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
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
  pendingApprovalCount,
  waitingResumeCount,
  failedNotificationCount,
  pendingNotificationCount,
  channelAttentionCount
}: {
  pendingApprovalCount: number;
  waitingResumeCount: number;
  failedNotificationCount: number;
  pendingNotificationCount: number;
  channelAttentionCount: number;
}): CrossEntryRiskDigestTone {
  if (pendingApprovalCount > 0 || waitingResumeCount > 0 || failedNotificationCount > 0) {
    return "blocked";
  }

  if (pendingNotificationCount > 0 || channelAttentionCount > 0) {
    return "degraded";
  }

  return "healthy";
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
  const channelAttention = getChannelAttentionSummary(channels);
  const operatorTone = getOperatorTone({
    pendingApprovalCount,
    waitingResumeCount,
    failedNotificationCount,
    pendingNotificationCount,
    channelAttentionCount: channelAttention.attentionCount
  });
  const operatorSummary =
    joinNonEmpty([
      pendingApprovalCount > 0 ? `${pendingApprovalCount} 个审批待处理` : null,
      waitingResumeCount > 0 ? `${waitingResumeCount} 个 waiting 恢复仍被阻塞` : null,
      failedNotificationCount > 0 ? `${failedNotificationCount} 条通知投递失败` : null,
      pendingNotificationCount > 0 ? `${pendingNotificationCount} 条通知仍在排队` : null,
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
      entryKey: "workflowLibrary"
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
      entryKey: "runLibrary"
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
  if (pendingApprovalCount > 0) {
    entryOverrides.operatorInbox = {
      href: "/sensitive-access?status=pending",
      label: "打开待处理 inbox"
    };
  } else if (waitingResumeCount > 0) {
    entryOverrides.operatorInbox = {
      href: "/sensitive-access?waiting_status=waiting",
      label: "查看 waiting resume"
    };
  }

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
      }
    ],
    focusAreas,
    primaryEntryKey,
    entryKeys,
    entryOverrides: Object.keys(entryOverrides).length > 0 ? entryOverrides : undefined
  };
}
