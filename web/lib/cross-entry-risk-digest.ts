import { getCallbackWaitingAutomationHealthSnapshot } from "@/lib/callback-waiting-presenters";
import type {
  SensitiveAccessInboxEntry,
  NotificationChannelCapabilityItem,
  SensitiveAccessInboxSummary
} from "@/lib/get-sensitive-access";
import {
  formatPrimaryGovernedResourceChineseDetail,
  formatSensitiveResourceGovernanceSummary
} from "@/lib/credential-governance";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorInboxSliceLinkSurface,
  buildOperatorTraceSliceLinkSurface
} from "@/lib/operator-follow-up-presenters";
import {
  findSensitiveAccessPrimaryBacklogEntry,
  resolveSensitiveAccessPrimaryBacklog
} from "@/lib/sensitive-access-follow-up-presenters";
import { buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff } from "@/lib/sensitive-access-inbox-workflow-governance";
import { resolveSensitiveAccessInboxEntryScope } from "@/lib/sensitive-access-inbox-entry-scope";
import type {
  CallbackWaitingAutomationCheck,
  RecentRunEventCheck,
  SandboxReadinessCheck,
  SystemOverviewRecommendedAction
} from "@/lib/get-system-overview";
import {
  buildCallbackWaitingAutomationSystemFollowUp,
  buildSandboxReadinessSystemFollowUp
} from "@/lib/system-overview-follow-up-presenters";
import {
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  listSandboxAvailableClasses,
  listSandboxBlockedClasses
} from "@/lib/sandbox-readiness-presenters";
import type {
  WorkbenchEntryLinkKey,
  WorkbenchEntryLinkOverride,
  WorkbenchEntryLinkOverrides
} from "@/lib/workbench-entry-links";
import type { WorkflowGovernanceHandoff } from "@/lib/workflow-governance-handoff";

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
  entryOverride?: WorkbenchEntryLinkOverride;
  traceLink?: WorkbenchEntryLinkOverride;
};

export type CrossEntryRiskDigestFollowUpEntry = {
  entryKey: WorkbenchEntryLinkKey;
  entryOverride?: WorkbenchEntryLinkOverride;
};

export type CrossEntryRiskDigest = {
  tone: CrossEntryRiskDigestTone;
  headline: string;
  detail: string;
  metrics: CrossEntryRiskDigestMetric[];
  focusAreas: CrossEntryRiskDigestFocusArea[];
  operatorWorkflowGovernanceHandoff: WorkflowGovernanceHandoff | null;
  primaryFollowUpEntry: CrossEntryRiskDigestFollowUpEntry;
  primaryEntryKey: WorkbenchEntryLinkKey;
  entryKeys: WorkbenchEntryLinkKey[];
  entryOverrides?: WorkbenchEntryLinkOverrides;
};

type BuildCrossEntryRiskDigestInput = {
  sandboxReadiness: SandboxReadinessCheck;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  recentEvents?: RecentRunEventCheck[];
  sensitiveAccessSummary: SensitiveAccessInboxSummary;
  channels: NotificationChannelCapabilityItem[];
  sensitiveAccessEntries?: SensitiveAccessInboxEntry[];
};

type CrossEntryRiskDigestFollowUpSurface = {
  entryKey: WorkbenchEntryLinkKey;
  entryOverride?: WorkbenchEntryLinkOverride;
  nextStep?: string;
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

function buildEntryOverride({
  href,
  label
}: {
  href?: string | null;
  label?: string | null;
}): WorkbenchEntryLinkOverride | undefined {
  const normalizedHref = href?.trim() || undefined;
  const normalizedLabel = label?.trim() || undefined;

  if (!normalizedHref && !normalizedLabel) {
    return undefined;
  }

  return {
    href: normalizedHref,
    label: normalizedLabel
  };
}

function setEntryOverride(
  overrides: WorkbenchEntryLinkOverrides,
  entryKey: WorkbenchEntryLinkKey,
  entryOverride?: WorkbenchEntryLinkOverride
) {
  if (!entryOverride || overrides[entryKey]) {
    return;
  }

  overrides[entryKey] = entryOverride;
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

function buildOperatorBacklogNextStep(
  primaryBacklog: ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>,
  primaryResourceSummary?: string | null
) {
  const primaryResourcePrefix = primaryResourceSummary ? `${primaryResourceSummary} 的` : null;

  switch (primaryBacklog?.kind) {
    case "pending_approval":
      return primaryResourcePrefix
        ? `优先先收掉 ${primaryResourcePrefix}审批票据，再回到具体 run。`
        : "优先先收掉 pending approval ticket 对应的审批票据，再回到具体 run。";
    case "waiting_resume":
      return primaryResourcePrefix
        ? `优先回到 inbox 处理 ${primaryResourcePrefix}恢复等待，再确认 run 是否真正继续推进。`
        : "优先回到 inbox 处理 waiting resume，再确认 run 是否真正继续推进。";
    case "failed_notification":
      return primaryResourcePrefix
        ? `优先重试 ${primaryResourcePrefix}失败通知或更换目标，再回到具体 run 继续排障。`
        : "优先重试失败通知或更换目标，再回到具体 run 继续排障。";
    case "pending_notification":
      return primaryResourcePrefix
        ? `先确认 ${primaryResourcePrefix}通知是否送达，再回到具体 run 判断是否还有真实阻塞。`
        : "先确认通知是否送达，再回到具体 run 判断是否还有真实阻塞。";
    default:
      return primaryResourcePrefix
        ? `优先在 sensitive access inbox 处理 ${primaryResourcePrefix}审批、恢复等待和失败通知，再回到具体 run。`
        : "优先在 sensitive access inbox 收掉 pending approval、waiting resume 和失败通知，再回到具体 run。";
  }
}

function buildFocusedTraceBacklogNextStep(
  entry: SensitiveAccessInboxEntry,
  backlogKind: NonNullable<ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>>["kind"],
  focusedTraceSliceLabel: string
) {
  const resourceLabel =
    formatSensitiveResourceGovernanceSummary(entry.resource ?? null) ??
    entry.request?.resource_id ??
    entry.ticket.id;

  switch (backlogKind) {
    case "pending_approval":
      return `当前 ${resourceLabel} 的审批票据仍是 operator backlog 首要阻断；先打开对应 ${focusedTraceSliceLabel}，对齐审批票据、waiting 原因与 execution focus，再回 inbox 完成审批。`;
    case "waiting_resume":
      return `当前 ${resourceLabel} 仍停在 waiting resume；先打开对应 ${focusedTraceSliceLabel}，确认 callback / resume 与 focus node 是否继续推进。`;
    case "failed_notification":
      return `当前 ${resourceLabel} 的通知仍失败；先打开对应 ${focusedTraceSliceLabel}，对齐通知补链与 run follow-up，再决定是否重试。`;
    case "pending_notification":
      return `当前 ${resourceLabel} 的通知仍在排队；先打开对应 ${focusedTraceSliceLabel}，确认事件是否已经推进到无需人工介入。`;
    case "rejected_approval":
      return `当前 ${resourceLabel} 的审批已被拒绝；先打开对应 ${focusedTraceSliceLabel}，确认当前 focus node 与后续处置路径是否一致。`;
    case "expired_approval":
      return `当前 ${resourceLabel} 的审批票据已过期；先打开对应 ${focusedTraceSliceLabel}，决定是否重新发起审批或改走其他恢复路径。`;
    default:
      return `当前 ${resourceLabel} 仍在 operator backlog；先打开对应 ${focusedTraceSliceLabel}，再决定后续处理路径。`;
  }
}

function buildFocusedTraceFollowUpSurface(
  primaryBacklog: ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>,
  entries: SensitiveAccessInboxEntry[]
): CrossEntryRiskDigestFollowUpSurface | null {
  if (!primaryBacklog) {
    return null;
  }

  const primaryEntry = findSensitiveAccessPrimaryBacklogEntry(entries, primaryBacklog.kind);
  if (!primaryEntry) {
    return null;
  }

  const displayScope = resolveSensitiveAccessInboxEntryScope(primaryEntry);
  if (!displayScope.runId?.trim() || !displayScope.nodeRunId?.trim()) {
    return null;
  }

  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  const traceLinkSurface = buildOperatorTraceSliceLinkSurface({
    runId: displayScope.runId,
    nodeRunId: displayScope.nodeRunId,
    hrefLabel: operatorSurfaceCopy.focusedTraceSliceLinkLabel
  });

  if (!traceLinkSurface) {
    return null;
  }

  return {
    entryKey: "runLibrary",
    entryOverride: buildEntryOverride({
      href: traceLinkSurface.href,
      label: traceLinkSurface.label
    }),
    nextStep: buildFocusedTraceBacklogNextStep(
      primaryEntry,
      primaryBacklog.kind,
      operatorSurfaceCopy.focusedTraceSliceLinkLabel
    )
  };
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

function pickPrimaryFocusArea(
  focusAreas: CrossEntryRiskDigestFocusArea[]
): CrossEntryRiskDigestFocusArea | null {
  const operatorArea = focusAreas.find((area) => area.id === "operator");
  if (operatorArea && operatorArea.tone !== "healthy") {
    return operatorArea;
  }

  const sandboxArea = focusAreas.find((area) => area.id === "sandbox");
  if (sandboxArea && sandboxArea.tone !== "healthy") {
    return sandboxArea;
  }

  const callbackArea = focusAreas.find((area) => area.id === "callback");
  if (callbackArea && callbackArea.tone !== "healthy") {
    return callbackArea;
  }

  return null;
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
  recentEvents = [],
  sensitiveAccessSummary,
  channels,
  sensitiveAccessEntries = []
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
  const sandboxFollowUpSurface = buildSandboxReadinessSystemFollowUp(sandboxReadiness, {
    recentEvents
  });
  const callbackFollowUpSurface = buildCallbackWaitingAutomationSystemFollowUp(
    callbackWaitingAutomation,
    {
      recentEvents
    }
  );

  const pendingApprovalCount = sensitiveAccessSummary.pending_ticket_count;
  const waitingResumeCount = sensitiveAccessSummary.waiting_ticket_count;
  const failedNotificationCount = sensitiveAccessSummary.failed_notification_count;
  const pendingNotificationCount = sensitiveAccessSummary.pending_notification_count;
  const operatorBlockers = sensitiveAccessSummary.blockers ?? buildLegacyOperatorBlockers(sensitiveAccessSummary);
  const operatorPrimaryBacklog = resolveSensitiveAccessPrimaryBacklog({
    pendingApprovalCount,
    waitingResumeCount,
    failedNotificationCount,
    pendingNotificationCount
  });
  const channelAttention = getChannelAttentionSummary(channels);
  const operatorTone = getOperatorTone({
    blockers: operatorBlockers,
    channelAttentionCount: channelAttention.attentionCount
  });
  const primaryOperatorEntry = operatorPrimaryBacklog
    ? findSensitiveAccessPrimaryBacklogEntry(sensitiveAccessEntries, operatorPrimaryBacklog.kind)
    : null;
  const primaryOperatorResource = sensitiveAccessSummary.primary_resource ?? primaryOperatorEntry?.resource ?? null;
  const primaryOperatorResourceSummary = formatSensitiveResourceGovernanceSummary(
    primaryOperatorResource
  );
  const operatorFocusedTraceSurface = buildFocusedTraceFollowUpSurface(
    operatorPrimaryBacklog,
    sensitiveAccessEntries
  );
  const operatorWorkflowGovernanceHandoff = primaryOperatorEntry
    ? buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff({
        entry: primaryOperatorEntry,
        runSnapshot: primaryOperatorEntry.runSnapshot ?? null,
        subjectLabel: "operator backlog",
        returnDetail:
          "先对齐当前审批、恢复与通知 backlog，再回到 workflow 编辑器补齐 binding / publish auth contract，避免同类请求继续落回同一条 backlog。"
      })
    : null;
  const operatorInboxLinkSurface = buildOperatorInboxSliceLinkSurface({
    href: operatorPrimaryBacklog?.href ?? null
  });
  const operatorSummary =
    joinNonEmpty([
      formatPrimaryGovernedResourceChineseDetail(primaryOperatorResource),
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
        sandboxFollowUpSurface?.detail ??
        "先确认 workflow 需要的 execution class 是否仍被 live readiness 覆盖，再继续处理运行阻塞。",
      entryKey:
        sandboxFollowUpSurface?.entryKey ??
        resolveRecommendedEntryKey({
          action: sandboxReadiness.recommended_action,
          fallback: "workflowLibrary"
        }),
      entryOverride: buildEntryOverride({
        href: sandboxFollowUpSurface?.href,
        label: sandboxFollowUpSurface?.hrefLabel
      }),
      traceLink: buildEntryOverride({
        href: sandboxFollowUpSurface?.traceLink?.href,
        label: sandboxFollowUpSurface?.traceLink?.label
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
        callbackFollowUpSurface?.detail ??
        "先看 waiting resume / cleanup 是否由 scheduler 正常接管，再进入单条 run 继续排障。",
      entryKey:
        callbackFollowUpSurface?.entryKey ??
        resolveRecommendedEntryKey({
          action: callbackWaitingAutomation.recommended_action,
          fallback: "runLibrary"
        }),
      entryOverride: buildEntryOverride({
        href: callbackFollowUpSurface?.href,
        label: callbackFollowUpSurface?.hrefLabel
      }),
      traceLink: buildEntryOverride({
        href: callbackFollowUpSurface?.traceLink?.href,
        label: callbackFollowUpSurface?.traceLink?.label
      })
    },
    {
      id: "operator",
      title: "Approval & notification backlog",
      tone: operatorTone,
      summary: operatorSummary,
      nextStep:
        operatorFocusedTraceSurface?.nextStep ??
        buildOperatorBacklogNextStep(operatorPrimaryBacklog, primaryOperatorResourceSummary),
      entryKey: operatorFocusedTraceSurface?.entryKey ?? "operatorInbox",
      entryOverride:
        operatorFocusedTraceSurface?.entryOverride ??
        buildEntryOverride({
          href: operatorInboxLinkSurface?.href,
          label: operatorInboxLinkSurface?.label
        })
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
  const primaryFocusArea = pickPrimaryFocusArea(focusAreas);
  const primaryEntryKey = primaryFocusArea?.entryKey ?? "workflowLibrary";
  const entryKeys = buildEntryKeys(primaryEntryKey);

  const entryOverrides: WorkbenchEntryLinkOverrides = {};
  if (primaryFocusArea) {
    setEntryOverride(entryOverrides, primaryFocusArea.entryKey, primaryFocusArea.entryOverride);
  }
  setEntryOverride(
    entryOverrides,
    "operatorInbox",
    buildEntryOverride({
      href: operatorInboxLinkSurface?.href,
      label: operatorInboxLinkSurface?.label
    })
  );
  for (const area of focusAreas) {
    setEntryOverride(entryOverrides, area.entryKey, area.entryOverride);
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
      },
      {
        label: "Impacted",
        value: `${sensitiveAccessSummary.affected_run_count ?? 0} runs / ${sensitiveAccessSummary.affected_workflow_count ?? 0} workflows`
      }
    ],
    focusAreas,
    operatorWorkflowGovernanceHandoff,
    primaryFollowUpEntry: {
      entryKey: primaryEntryKey,
      entryOverride: primaryFocusArea?.entryOverride
    },
    primaryEntryKey,
    entryKeys,
    entryOverrides: Object.keys(entryOverrides).length > 0 ? entryOverrides : undefined
  };
}
