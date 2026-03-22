import type { RunSnapshot } from "@/app/actions/run-snapshot";
import type {
  PublishedEndpointInvocationFacetItem,
  PublishedEndpointInvocationCallbackTicketItem,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationItem,
  PublishedEndpointInvocationListResponse,
  PublishedEndpointInvocationSummary,
  PublishedEndpointInvocationTimeBucketItem,
  OperatorRunFollowUpSnapshot,
  RunExecutionFocusExplanation
} from "@/lib/get-workflow-publish";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  CallbackWaitingDetailRow,
  formatCallbackLifecycleLabel,
  getCallbackWaitingHeadline,
  listCallbackTicketDetailRows,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips,
  listCallbackWaitingEventRows
} from "@/lib/callback-waiting-presenters";
import {
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineFocusArtifactPreview
} from "@/lib/operator-inline-action-feedback";
import {
  buildOperatorInboxSliceCandidate,
  buildOperatorInboxSliceLinkSurface,
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRecommendedNextStep,
  buildOperatorRunDetailCandidate,
  buildOperatorRunDetailLinkSurface
} from "@/lib/operator-follow-up-presenters";
import { formatRunSnapshotSummary } from "@/lib/operator-action-result-presenters";
import { formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";
import {
  buildCallbackWaitingAutomationFollowUpCandidate,
  buildSandboxReadinessFollowUpCandidate
} from "@/lib/system-overview-follow-up-presenters";
import {
  formatMetricSummary,
  type ExecutionFocusToolCallSummary
} from "@/lib/run-execution-focus-presenters";
import {
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  listSandboxBlockedClasses
} from "@/lib/sandbox-readiness-presenters";
import { resolveSensitiveAccessTimelineEntryRunId } from "@/lib/sensitive-access";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import {
  buildSensitiveAccessBlockedSurfaceCopy,
  buildSensitiveAccessTimelineSurfaceCopy
} from "@/lib/sensitive-access-presenters";
import { buildRunDetailExecutionFocusSurfaceCopy } from "@/lib/workbench-entry-surfaces";

type PublishedInvocationWaitingOverview = {
  activeWaitingCount: number;
  callbackWaitingCount: number;
  waitingInputCount: number;
  generalWaitingCount: number;
  syncWaitingRejectedCount: number;
  lastRunStatusLabel: string | null;
  headline: string;
  detail: string;
  chips: string[];
};

type PublishedInvocationSensitiveAccessSummary = NonNullable<
  NonNullable<PublishedEndpointInvocationItem["run_waiting_lifecycle"]>["sensitive_access_summary"]
>;

type PublishedInvocationRunFollowUpSummary = NonNullable<PublishedEndpointInvocationItem["run_follow_up"]>;
type PublishedInvocationRunFollowUpSample =
  PublishedInvocationRunFollowUpSummary["sampled_runs"][number];

export type PublishedInvocationRunFollowUpSampleView = {
  run_id: string;
  status: string | null;
  current_node_id: string | null;
  waiting_reason: string | null;
  run_snapshot: RunSnapshot;
  callback_tickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitive_access_entries: SensitiveAccessTimelineEntry[];
  explanation_source: "callback_waiting" | "execution_focus" | null;
  explanation: RunExecutionFocusExplanation | null;
  snapshot_summary: string | null;
  has_callback_waiting_summary: boolean;
  execution_focus_artifact_count: number;
  execution_focus_artifact_ref_count: number;
  execution_focus_tool_call_count: number;
  execution_focus_raw_ref_count: number;
  skill_reference_count: number;
  skill_reference_phase_summary: string | null;
  skill_reference_source_summary: string | null;
  focus_artifact_summary: string | null;
  focus_tool_call_summaries: ExecutionFocusToolCallSummary[];
  focus_artifacts: OperatorInlineFocusArtifactPreview[];
  focus_skill_reference_loads: NonNullable<RunSnapshot["executionFocusSkillTrace"]>["loads"];
};

export type PublishedInvocationCanonicalFollowUpCopy = {
  headline: string;
  follow_up: string | null;
  has_shared_callback_waiting_summary: boolean;
};

export type PublishedInvocationRecommendedNextStep = {
  label: string;
  detail: string;
  href: string | null;
  href_label: string | null;
};

export type PublishedInvocationInboxLinkSurface = {
  href: string;
  label: string;
};

export type PublishedInvocationMetaRow = {
  key: string;
  label: string;
  value: string;
  href: string | null;
};

export type PublishedInvocationDetailSurfaceCopy = {
  detailTitle: string;
  closeDetailLabel: string;
  openRunLabel: string;
  runDrilldownTitle: string;
  runLabel: string;
  runStatusLabel: string;
  currentNodeLabel: string;
  waitingReasonLabel: string;
  waitingNodeRunLabel: string;
  startedLabel: string;
  finishedLabel: string;
  cacheDrilldownTitle: string;
  cacheStatusLabel: string;
  cacheKeyLabel: string;
  cacheEntryLabel: string;
  cacheEntryHitsLabel: string;
  cacheLastHitLabel: string;
  cacheExpiresLabel: string;
  requestPreviewTitle: string;
  responsePreviewTitle: string;
  canonicalFollowUpTitle: string;
  canonicalFollowUpDescription: string;
  sampledRunFallback: string;
  sampledRunReasonCallbackWaitingLabel: string;
  sampledRunReasonExecutionFocusLabel: string;
  sampledRunReasonFallbackLabel: string;
  sampledRunFocusEvidenceTitle: string;
  sampledRunSkillTraceTitle: string;
  sampledRunSkillTraceDescription: string;
  sampledRunStatusLabel: string;
  sampledRunCurrentNodeLabel: string;
  sampledRunWaitingReasonLabel: string;
  recommendedNextStepTitle: string;
  executionFocusTitle: string;
  liveSandboxReadinessTitle: string;
  skillTraceTitle: string;
  injectedReferencesTitle: string;
  skillTraceDescription: string;
  injectedReferencesDescription: string;
  toolGovernanceTitle: string;
  toolGovernanceSummaryTitle: string;
  toolGovernanceDescription: string;
  blockingApprovalTimelineTitle: string;
  blockingApprovalTimelineDescription: string;
  blockingApprovalTimelineInboxLabel: string;
  blockingApprovalTimelineEmptyState: string;
  approvalTimelineTitle: string;
  approvalTimelineDescription: string;
  approvalTimelineInboxLabel: string;
  approvalTimelineEmptyState: string;
  unavailableValueLabel: string;
  notStartedValueLabel: string;
};

export type PublishedCacheInventorySurfaceCopy = {
  description: string;
  emptyState: string;
};

export type PublishedInvocationCallbackDrilldownSurfaceCopy = {
  title: string;
  description: string;
  inboxLinkLabel: string;
  blockersTitle: string;
  blockersEmptyHeadline: string;
  latestEventsTitle: string;
  ticketTitle: string;
  ticketInboxLinkLabel: string;
  payloadPreviewTitle: string;
  emptyState: string;
};

export type PublishedInvocationTrafficTimelineSurfaceCopy = {
  title: string;
  description: string;
  emptyState: string;
  totalCountLabel: string;
  succeededCountLabel: string;
  failedCountLabel: string;
  rejectedCountLabel: string;
  apiKeyLabelPrefix: string;
};

export type PublishedInvocationTrafficTimelineBucketSurface = {
  timeWindowLabel: string;
  surfaceLabels: string[];
  cacheLabels: string[];
  runStatusLabels: string[];
  reasonLabels: string[];
  apiKeyLabels: string[];
};

export type PublishedInvocationFailureMessageDiagnosis = {
  headline: string;
  detail: string;
};

export type PublishedInvocationUnavailableDetailSurfaceCopy = {
  title: string;
  summary: string;
  detail: string;
};

export type PublishedInvocationEntrySurfaceCopy = {
  waitingOverviewTitle: string;
  canonicalFollowUpTitle: string;
  canonicalFollowUpFallbackHeadline: string;
  apiKeyLabel: string;
  requestKeysLabel: string;
  runLabel: string;
  runStatusLabel: string;
  currentNodeLabel: string;
  waitingReasonLabel: string;
  callbackTicketsLabel: string;
  scheduledResumeLabel: string;
  waitingNodeRunLabel: string;
  waitingNodeStatusLabel: string;
  waitingCallbackTicketsLabel: string;
  waitingCallbackLifecycleLabel: string;
  canonicalFollowUpAffectedRunsLabel: string;
  canonicalFollowUpSampledRunsLabel: string;
  canonicalFollowUpStatusSummaryLabel: string;
  canonicalFollowUpSampleFocusLabel: string;
  canonicalFollowUpAffectedRunsChipPrefix: string;
  canonicalFollowUpSampledRunsChipPrefix: string;
  canonicalFollowUpStatusChipPrefix: string;
  liveSandboxReadinessTitle: string;
  sampledRunFocusEvidenceTitle: string;
  sampledRunSkillTraceTitle: string;
  sampledRunSkillTraceDescription: string;
  recommendedNextStepTitle: string;
  callbackLifecycleFallback: string;
  succeededDescription: string;
  detailActionLabel: string;
  detailActionActiveLabel: string;
  errorMessagePrefix: string;
  detailPanelDescription: string;
  unavailableValueLabel: string;
  notStartedValueLabel: string;
  emptyCountValueLabel: string;
};

export type PublishedInvocationWaitingCardSurface = {
  headline: string | null;
  followUp: string | null;
  waitingChips: string[];
  sensitiveAccessChips: string[];
  waitingRows: PublishedInvocationMetaRow[];
  blockerRows: CallbackWaitingDetailRow[];
  sensitiveAccessRows: CallbackWaitingDetailRow[];
};

export type PublishedInvocationCallbackBlockerSurface = {
  title: string;
  displayHeadline: string;
  latestEventsTitle: string;
  headline: string | null;
  followUp: string | null;
  chips: string[];
  blockerRows: CallbackWaitingDetailRow[];
  eventRows: CallbackWaitingDetailRow[];
};

export type PublishedInvocationCallbackTicketSurface = {
  title: string;
  ticketId: string;
  status: string;
  inboxHref: string | null;
  inboxLinkLabel: string;
  detailRows: CallbackWaitingDetailRow[];
  payloadPreviewTitle: string;
  payloadPreview: string | null;
};

export type PublishedInvocationActivityInsightsSurfaceCopy = {
  totalCallsLabel: string;
  succeededCallsLabel: string;
  failedCallsLabel: string;
  rejectedCallsLabel: string;
  lastRunStatusLabel: string;
  lastRunStatusEmptyLabel: string;
  waitingNowLabel: string;
  trafficMixTitle: string;
  trafficWorkflowLabel: string;
  trafficAliasLabel: string;
  trafficPathLabel: string;
  trafficCacheSurfaceLabel: string;
  trafficRunStatesLabel: string;
  trafficRunStatesEmptyLabel: string;
  waitingFollowUpTitle: string;
  activeWaitingLabel: string;
  callbackWaitsLabel: string;
  approvalInputWaitsLabel: string;
  genericWaitsLabel: string;
  syncWaitingRejectedLabel: string;
  latestRunStatusLabel: string;
  latestRunStatusEmptyLabel: string;
  rateLimitWindowTitle: string;
  rateLimitPolicyLabel: string;
  rateLimitUsedLabel: string;
  rateLimitRemainingLabel: string;
  rateLimitPressureLabel: string;
  rateLimitRejectedLabel: string;
  rateLimitWindowDescription: string;
  rateLimitDisabledEmptyState: string;
  issueSignalsTitle: string;
  issueSignalsDescription: string;
};

export type PublishedInvocationIssueSignalsSurface = {
  title: string;
  description: string;
  insight: string | null;
  chips: string[];
};

export type PublishedInvocationSkillTraceNodeSurface = {
  key: string;
  title: string;
  countChip: string;
  summary: string;
  loads: NonNullable<PublishedEndpointInvocationDetailResponse["skill_trace"]>["nodes"][number]["loads"];
};

export type PublishedInvocationSkillTraceSurface = {
  summaryChips: string[];
  nodes: PublishedInvocationSkillTraceNodeSurface[];
};

export type PublishedInvocationActivityTrafficMixSurface = {
  workflowCount: number;
  aliasCount: number;
  pathCount: number;
  cacheSurfaceSummary: string;
  runStatesSummary: string;
  requestSurfaceLabels: string[];
};

export type PublishedInvocationActivityDetailsSurfaceCopy = {
  selectedInvocationNextStepTitle: string;
  invocationAuditEmptyState: string;
  apiKeyUsageMissingPrefixLabel: string;
  apiKeyUsageInvocationCountLabel: string;
  apiKeyUsageStatusMixLabel: string;
  apiKeyUsageStatusLabel: string;
  apiKeyUsageStatusEmptyLabel: string;
  apiKeyUsageLastUsedLabel: string;
  failureReasonTitle: string;
  failureReasonCountLabelPrefix: string;
  blockedDetailSurfaceLabel: string;
  blockedDetailGuardedActionLabel: string;
  unavailableDetail: PublishedInvocationUnavailableDetailSurfaceCopy;
};

export type PublishedInvocationApiKeyUsageCardSurface = {
  title: string;
  chipLabel: string;
  rows: PublishedInvocationMetaRow[];
};

export type PublishedInvocationFailureReasonCardSurface = {
  title: string;
  countLabel: string;
  message: string;
  diagnosis: PublishedInvocationFailureMessageDiagnosis | null;
  lastSeenLabel: string;
};

export type PublishedInvocationSelectedNextStepSurface = {
  title: string;
  invocationId: string;
  label: string;
  detail: string;
  href: string | null;
  hrefLabel: string | null;
};

type PublishedInvocationFailureReasonItem = {
  message: string;
  count: number;
  last_invoked_at?: string | null;
};

function buildPublishedInvocationMetaRow(
  key: string,
  label: string,
  value: string,
  href: string | null = null
): PublishedInvocationMetaRow {
  return { key, label, value, href };
}

function normalizePublishedInvocationRunId(runId?: string | null) {
  const normalizedRunId = runId?.trim();

  return normalizedRunId ? normalizedRunId : null;
}

function buildPublishedInvocationRunMetaRow({
  key,
  label,
  runId,
  fallbackValue
}: {
  key: string;
  label: string;
  runId?: string | null;
  fallbackValue: string;
}): PublishedInvocationMetaRow {
  const normalizedRunId = normalizePublishedInvocationRunId(runId);
  const runDetailLink = buildOperatorRunDetailLinkSurface({ runId: normalizedRunId });

  return buildPublishedInvocationMetaRow(
    key,
    label,
    normalizedRunId ?? fallbackValue,
    runDetailLink?.href ?? null
  );
}

export function buildPublishedInvocationDetailSurfaceCopy({
  blockingNodeRunId,
  focusSkillTraceNodeRunId
}: {
  blockingNodeRunId?: string | null;
  focusSkillTraceNodeRunId?: string | null;
} = {}): PublishedInvocationDetailSurfaceCopy {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const blockingApprovalTimelineCopy = buildSensitiveAccessTimelineSurfaceCopy({
    surface: "publish_blocking_invocation",
    blockingNodeRunId
  });
  const approvalTimelineCopy = buildSensitiveAccessTimelineSurfaceCopy({
    surface: "publish_invocation"
  });

  return {
    detailTitle: "Invocation detail",
    closeDetailLabel: "关闭详情",
    openRunLabel: "打开 run",
    runDrilldownTitle: "Run drilldown",
    runLabel: "Run",
    runStatusLabel: "Status",
    currentNodeLabel: "Current node",
    waitingReasonLabel: "Waiting reason",
    waitingNodeRunLabel: "Waiting node run",
    startedLabel: "Started",
    finishedLabel: "Finished",
    cacheDrilldownTitle: "Cache drilldown",
    cacheStatusLabel: "Status",
    cacheKeyLabel: "Cache key",
    cacheEntryLabel: "Entry",
    cacheEntryHitsLabel: "Entry hits",
    cacheLastHitLabel: "Last hit",
    cacheExpiresLabel: "Expires",
    requestPreviewTitle: "Request preview",
    responsePreviewTitle: "Response preview",
    canonicalFollowUpTitle: "Canonical follow-up",
    canonicalFollowUpDescription:
      "publish invocation detail 现在直接复用 operator follow-up 的后端事实链，不再只给局部 waiting / execution 片段，方便从发布入口直接判断下一步该回看 run 还是 inbox。",
    sampledRunFallback: "该 sampled run 已回接 canonical follow-up 快照。",
    sampledRunReasonCallbackWaitingLabel: "callback waiting",
    sampledRunReasonExecutionFocusLabel: "execution focus",
    sampledRunReasonFallbackLabel: "run snapshot",
    sampledRunFocusEvidenceTitle: "Sampled run focus evidence",
    sampledRunSkillTraceTitle: operatorSurfaceCopy.focusedSkillTraceTitle,
    sampledRunSkillTraceDescription:
      "publish invocation detail 里的 sampled run 现在也直接复用 compact snapshot 的 skill trace，避免还要回跳 run detail 才能确认 focus node 实际加载了哪些参考资料。",
    sampledRunStatusLabel: "Status",
    sampledRunCurrentNodeLabel: "Current node",
    sampledRunWaitingReasonLabel: "Waiting reason",
    recommendedNextStepTitle: operatorSurfaceCopy.recommendedNextStepTitle,
    executionFocusTitle: "Execution focus",
    liveSandboxReadinessTitle: "Live sandbox readiness",
    skillTraceTitle: "Skill trace",
    injectedReferencesTitle: operatorSurfaceCopy.injectedReferencesTitle,
    skillTraceDescription: focusSkillTraceNodeRunId?.trim()
      ? `当前 invocation 已接入 canonical skill trace；当前优先聚焦 execution focus 节点 ${focusSkillTraceNodeRunId.trim()}。`
      : "当前 invocation 已接入 canonical skill trace；发布入口和 run detail 现在共享同一条 trace 事实。",
    injectedReferencesDescription:
      "当前节点真正加载到 agent phase 的 skill references。发布入口和 run detail 现在共享同一条 trace 事实。",
    toolGovernanceTitle: "Tool governance context",
    toolGovernanceSummaryTitle: "Execution and sensitivity",
    toolGovernanceDescription:
      "把 callback waiting 关联 tool 的默认执行边界和敏感级别一起带到 publish detail，避免 operator 只看到阻断结果却看不见治理原因。",
    blockingApprovalTimelineTitle: blockingApprovalTimelineCopy.title,
    blockingApprovalTimelineDescription: blockingApprovalTimelineCopy.description,
    blockingApprovalTimelineInboxLabel: blockingApprovalTimelineCopy.inboxLinkLabel,
    blockingApprovalTimelineEmptyState: blockingApprovalTimelineCopy.emptyState,
    approvalTimelineTitle: approvalTimelineCopy.title,
    approvalTimelineDescription: approvalTimelineCopy.description,
    approvalTimelineInboxLabel: approvalTimelineCopy.inboxLinkLabel,
    approvalTimelineEmptyState: approvalTimelineCopy.emptyState,
    unavailableValueLabel: "n/a",
    notStartedValueLabel: "not-started"
  };
}

export function buildPublishedCacheInventorySurfaceCopy({
  enabled,
  state
}: {
  enabled: boolean;
  state: "unavailable" | "empty" | "populated";
}): PublishedCacheInventorySurfaceCopy {
  return {
    description:
      "命中统计回答“被用了多少次”，inventory 回答“当前缓存里还留着什么”。",
    emptyState: !enabled
      ? "该 endpoint 没有启用 publish cache，当前不会保留 response cache entry。"
      : state === "unavailable"
        ? "当前暂时无法拉取 cache inventory，活动 summary 仍可继续使用。"
        : "当前还没有活跃缓存条目，首次命中前这里会保持为空。"
  };
}

export function buildPublishedInvocationCallbackDrilldownSurfaceCopy(): PublishedInvocationCallbackDrilldownSurfaceCopy {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  return {
    title: "Callback waiting drilldown",
    description:
      "Callback ticket lifecycle, approval blockers and resume scheduling stay together here so published-surface debugging does not need to jump between run detail, inbox and async tickets.",
    inboxLinkLabel: operatorSurfaceCopy.openInboxSliceLabel,
    blockersTitle: "Resume blockers",
    blockersEmptyHeadline: "Callback waiting is not active.",
    latestEventsTitle: "Latest callback events",
    ticketTitle: "Callback ticket",
    ticketInboxLinkLabel: "open ticket inbox slice",
    payloadPreviewTitle: "callback payload preview",
    emptyState: "当前这次 invocation 没有关联 callback ticket。"
  };
}

export function buildPublishedInvocationTrafficTimelineSurfaceCopy({
  timelineGranularity,
  timeWindowLabel
}: {
  timelineGranularity: "hour" | "day";
  timeWindowLabel: string;
}): PublishedInvocationTrafficTimelineSurfaceCopy {
  return {
    title: "Traffic timeline",
    description:
      `按${timelineGranularity === "hour" ? "小时" : "天"}聚合最近调用，补足 publish activity 的趋势视图，方便判断流量抬升、拒绝峰值和缓存命中变化。当前时间窗：${timeWindowLabel}。`,
    emptyState:
      "当前还没有足够的 invocation timeline 数据，后续命中 published endpoint 后这里会显示趋势桶。",
    totalCountLabel: "total",
    succeededCountLabel: "success",
    failedCountLabel: "failed",
    rejectedCountLabel: "rejected",
    apiKeyLabelPrefix: "key"
  };
}

export function buildPublishedInvocationTrafficTimelineBucketSurface({
  bucket,
  apiKeyLabelPrefix = "key",
  facetLimit = 2
}: {
  bucket: PublishedEndpointInvocationTimeBucketItem;
  apiKeyLabelPrefix?: string;
  facetLimit?: number;
}): PublishedInvocationTrafficTimelineBucketSurface {
  return {
    timeWindowLabel: `${formatTimestamp(bucket.bucket_start)} - ${formatTimestamp(bucket.bucket_end)}`,
    surfaceLabels: listPublishedInvocationFacetCountLabels(
      bucket.request_surface_counts,
      formatPublishedInvocationSurfaceLabel,
      facetLimit
    ),
    cacheLabels: listPublishedInvocationFacetCountLabels(
      bucket.cache_status_counts,
      formatPublishedInvocationCacheStatusLabel,
      facetLimit
    ),
    runStatusLabels: listPublishedInvocationFacetCountLabels(
      bucket.run_status_counts,
      formatPublishedRunStatusLabel,
      facetLimit
    ),
    reasonLabels: listPublishedInvocationFacetCountLabels(
      bucket.reason_counts,
      formatPublishedInvocationReasonLabel,
      facetLimit
    ),
    apiKeyLabels: listPublishedInvocationApiKeyCountLabels(bucket.api_key_counts, {
      limit: facetLimit,
      prefix: apiKeyLabelPrefix
    })
  };
}

export function buildPublishedInvocationEntrySurfaceCopy(): PublishedInvocationEntrySurfaceCopy {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  return {
    waitingOverviewTitle: "Waiting overview",
    canonicalFollowUpTitle: "Canonical follow-up",
    canonicalFollowUpFallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。",
    apiKeyLabel: "API key",
    requestKeysLabel: "Request keys",
    runLabel: "Run",
    runStatusLabel: "Run status",
    currentNodeLabel: "Current node",
    waitingReasonLabel: "Waiting reason",
    callbackTicketsLabel: "Callback tickets",
    scheduledResumeLabel: "Scheduled resume",
    waitingNodeRunLabel: "Node run",
    waitingNodeStatusLabel: "Node status",
    waitingCallbackTicketsLabel: "Callback tickets",
    waitingCallbackLifecycleLabel: "Callback lifecycle",
    canonicalFollowUpAffectedRunsLabel: "Affected runs",
    canonicalFollowUpSampledRunsLabel: "Sampled runs",
    canonicalFollowUpStatusSummaryLabel: "Status summary",
    canonicalFollowUpSampleFocusLabel: "Sample focus",
    canonicalFollowUpAffectedRunsChipPrefix: "affected",
    canonicalFollowUpSampledRunsChipPrefix: "sampled",
    canonicalFollowUpStatusChipPrefix: "status",
    liveSandboxReadinessTitle: "Live sandbox readiness",
    sampledRunFocusEvidenceTitle: "Sampled run focus evidence",
    sampledRunSkillTraceTitle: operatorSurfaceCopy.focusedSkillTraceTitle,
    sampledRunSkillTraceDescription:
      "发布活动卡片现在也会复用 compact snapshot 里的 skill trace，方便直接确认 sampled run 的 focus node 注入来源。",
    recommendedNextStepTitle: operatorSurfaceCopy.recommendedNextStepTitle,
    callbackLifecycleFallback: "tracked in detail panel",
    succeededDescription:
      "该请求已经走完整条 publish 调用链，run 已结束，可以直接对照 response preview 做回放。",
    detailActionLabel: "打开 invocation detail",
    detailActionActiveLabel: "查看当前详情",
    errorMessagePrefix: "error",
    detailPanelDescription:
      "详情面板会补 run / callback ticket / callback lifecycle / cache 四类稳定排障入口。",
    unavailableValueLabel: "n/a",
    notStartedValueLabel: "not-started",
    emptyCountValueLabel: "0"
  };
}

export function buildPublishedInvocationWaitingCardSurface({
  waitingLifecycle,
  waitingExplanation,
  callbackLifecycleFallback,
  surfaceCopy = buildPublishedInvocationEntrySurfaceCopy()
}: {
  waitingLifecycle?: PublishedEndpointInvocationItem["run_waiting_lifecycle"] | null;
  waitingExplanation?: RunExecutionFocusExplanation | null;
  callbackLifecycleFallback: string;
  surfaceCopy?: PublishedInvocationEntrySurfaceCopy;
}): PublishedInvocationWaitingCardSurface | null {
  if (!waitingLifecycle) {
    return null;
  }

  const callbackLifecycle = waitingLifecycle.callback_waiting_lifecycle ?? null;
  const fallbackHeadline = getCallbackWaitingHeadline({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: waitingLifecycle.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle.scheduled_resume_requeue_source
  });
  const waitingRows = listPublishedInvocationEntryWaitingRows({
    nodeRunId: waitingLifecycle.node_run_id ?? null,
    nodeStatus: waitingLifecycle.node_status ?? null,
    callbackTicketCount: waitingLifecycle.callback_ticket_count ?? 0,
    callbackTicketStatusCounts: waitingLifecycle.callback_ticket_status_counts,
    callbackLifecycleLabel: formatCallbackLifecycleLabel(callbackLifecycle),
    callbackLifecycleFallback,
    surfaceCopy
  });
  const waitingChips = listCallbackWaitingChips({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle.scheduled_resume_delay_seconds,
    scheduledResumeDueAt: waitingLifecycle.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: waitingLifecycle.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle.scheduled_resume_requeue_source
  });
  const blockerRows = listCallbackWaitingBlockerRows({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: waitingLifecycle.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle.scheduled_resume_requeue_source
  });
  const sensitiveAccessRows = listPublishedInvocationSensitiveAccessRows(
    waitingLifecycle.sensitive_access_summary
  ).map<CallbackWaitingDetailRow>((row) => ({
    label: row.label,
    value: row.value
  }));

  return {
    headline: formatPublishedInvocationWaitingHeadline({
      explanation: waitingExplanation,
      fallbackHeadline,
      nodeRunId: waitingLifecycle.node_run_id ?? null,
      nodeStatus: waitingLifecycle.node_status ?? null
    }),
    followUp: formatPublishedInvocationWaitingFollowUp(waitingExplanation),
    waitingChips,
    sensitiveAccessChips: listPublishedInvocationSensitiveAccessChips(
      waitingLifecycle.sensitive_access_summary
    ),
    waitingRows,
    blockerRows,
    sensitiveAccessRows
  };
}

export function buildPublishedInvocationCallbackBlockerSurface({
  invocation,
  callbackTickets,
  sensitiveAccessEntries,
  callbackWaitingAutomation,
  callbackWaitingExplanation,
  surfaceCopy = buildPublishedInvocationCallbackDrilldownSurfaceCopy()
}: {
  invocation: PublishedEndpointInvocationItem;
  callbackTickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  callbackWaitingExplanation?: RunExecutionFocusExplanation | null;
  surfaceCopy?: PublishedInvocationCallbackDrilldownSurfaceCopy;
}): PublishedInvocationCallbackBlockerSurface {
  const waitingLifecycle = invocation.run_waiting_lifecycle ?? null;
  const callbackLifecycle = waitingLifecycle?.callback_waiting_lifecycle ?? null;
  const fallbackHeadline = getCallbackWaitingHeadline({
    lifecycle: callbackLifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
  });

  return {
    title: surfaceCopy.blockersTitle,
    displayHeadline:
      formatPublishedInvocationWaitingHeadline({
        explanation: callbackWaitingExplanation,
        fallbackHeadline,
        nodeRunId: waitingLifecycle?.node_run_id ?? invocation.run_current_node_id ?? null,
        nodeStatus: waitingLifecycle?.node_status ?? null
      }) ?? surfaceCopy.blockersEmptyHeadline,
    latestEventsTitle: surfaceCopy.latestEventsTitle,
    headline: formatPublishedInvocationWaitingHeadline({
      explanation: callbackWaitingExplanation,
      fallbackHeadline,
      nodeRunId: waitingLifecycle?.node_run_id ?? invocation.run_current_node_id ?? null,
      nodeStatus: waitingLifecycle?.node_status ?? null
    }),
    followUp: formatPublishedInvocationWaitingFollowUp(callbackWaitingExplanation),
    chips: listCallbackWaitingChips({
      lifecycle: callbackLifecycle,
      callbackTickets,
      sensitiveAccessEntries,
      callbackWaitingAutomation,
      scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
      scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at,
      scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
      scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
    }),
    blockerRows: listCallbackWaitingBlockerRows(
      {
        lifecycle: callbackLifecycle,
        callbackTickets,
        sensitiveAccessEntries,
        callbackWaitingAutomation,
        scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
        scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
        scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
        scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
        scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at,
        scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
        scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
      },
      { includeRecommendedActionRow: true, includeTerminationRow: true }
    ),
    eventRows: listCallbackWaitingEventRows({
      lifecycle: callbackLifecycle,
      waitingReason: waitingLifecycle?.waiting_reason ?? invocation.run_waiting_reason,
      waitingNodeRunId: waitingLifecycle?.node_run_id ?? invocation.run_current_node_id ?? null,
      scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
      scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
    })
  };
}

export function buildPublishedInvocationCallbackTicketSurface({
  invocation,
  ticket,
  surfaceCopy = buildPublishedInvocationCallbackDrilldownSurfaceCopy()
}: {
  invocation: PublishedEndpointInvocationItem;
  ticket: PublishedEndpointInvocationCallbackTicketItem;
  surfaceCopy?: PublishedInvocationCallbackDrilldownSurfaceCopy;
}): PublishedInvocationCallbackTicketSurface {
  return {
    title: surfaceCopy.ticketTitle,
    ticketId: ticket.ticket,
    status: ticket.status,
    inboxHref: buildCallbackTicketInboxHref(ticket, {
      runId: invocation.run_id ?? null,
      nodeRunId: invocation.run_waiting_lifecycle?.node_run_id ?? null
    }),
    inboxLinkLabel: surfaceCopy.ticketInboxLinkLabel,
    detailRows: listCallbackTicketDetailRows(ticket, {
      mode: "detail",
      includeEmptyLifecycle: true
    }),
    payloadPreviewTitle: surfaceCopy.payloadPreviewTitle,
    payloadPreview: ticket.callback_payload
      ? formatPublishedInvocationPayloadPreview(ticket.callback_payload)
      : null
  };
}
export function formatPublishedInvocationSampleReasonLabel(
  source: "callback_waiting" | "execution_focus" | null,
  surfaceCopy = buildPublishedInvocationDetailSurfaceCopy()
) {
  if (source === "callback_waiting") {
    return surfaceCopy.sampledRunReasonCallbackWaitingLabel;
  }

  if (source === "execution_focus") {
    return surfaceCopy.sampledRunReasonExecutionFocusLabel;
  }

  return surfaceCopy.sampledRunReasonFallbackLabel;
}

export function buildPublishedInvocationActivityInsightsSurfaceCopy({
  rateLimitWindowStartedAt
}: {
  rateLimitWindowStartedAt?: string | null;
} = {}): PublishedInvocationActivityInsightsSurfaceCopy {
  return {
    totalCallsLabel: "Total calls",
    succeededCallsLabel: "Succeeded",
    failedCallsLabel: "Failed",
    rejectedCallsLabel: "Rejected",
    lastRunStatusLabel: "Last run status",
    lastRunStatusEmptyLabel: "n/a",
    waitingNowLabel: "Waiting now",
    trafficMixTitle: "Traffic mix",
    trafficWorkflowLabel: "Workflow",
    trafficAliasLabel: "Alias",
    trafficPathLabel: "Path",
    trafficCacheSurfaceLabel: "Cache surface",
    trafficRunStatesLabel: "Run states",
    trafficRunStatesEmptyLabel: "n/a",
    waitingFollowUpTitle: "Waiting follow-up",
    activeWaitingLabel: "Active waiting",
    callbackWaitsLabel: "Callback waits",
    approvalInputWaitsLabel: "Approval/input waits",
    genericWaitsLabel: "Generic waits",
    syncWaitingRejectedLabel: "Sync waiting rejected",
    latestRunStatusLabel: "Latest run status",
    latestRunStatusEmptyLabel: "n/a",
    rateLimitWindowTitle: "Rate limit window",
    rateLimitPolicyLabel: "Policy",
    rateLimitUsedLabel: "Used",
    rateLimitRemainingLabel: "Remaining",
    rateLimitPressureLabel: "Pressure",
    rateLimitRejectedLabel: "Rejected",
    rateLimitWindowDescription: rateLimitWindowStartedAt
      ? `当前窗口从 ${formatTimestamp(rateLimitWindowStartedAt)} 开始统计成功和失败调用，\`rejected\` 仅作为治理信号，不占配额。`
      : "当前窗口按当前筛选时间窗统计成功和失败调用，`rejected` 仅作为治理信号，不占配额。",
    rateLimitDisabledEmptyState: "当前 binding 没有启用 rate limit，开放调用不会按时间窗口限流。",
    issueSignalsTitle: "Issue signals",
    issueSignalsDescription:
      "将 `rejected / failed` 聚合为稳定原因码，便于区分限流、鉴权和当前同步协议边界。"
  };
}

export function buildPublishedInvocationActivityTrafficMixSurface({
  requestSourceCounts,
  requestSurfaceCounts,
  cacheStatusCounts,
  runStatusCounts,
  runStatesEmptyLabel
}: {
  requestSourceCounts?: PublishedEndpointInvocationFacetItem[] | null;
  requestSurfaceCounts?: PublishedEndpointInvocationFacetItem[] | null;
  cacheStatusCounts?: PublishedEndpointInvocationFacetItem[] | null;
  runStatusCounts?: PublishedEndpointInvocationFacetItem[] | null;
  runStatesEmptyLabel: string;
}): PublishedInvocationActivityTrafficMixSurface {
  return {
    workflowCount: getFacetCount(requestSourceCounts, "workflow"),
    aliasCount: getFacetCount(requestSourceCounts, "alias"),
    pathCount: getFacetCount(requestSourceCounts, "path"),
    cacheSurfaceSummary: formatPublishedInvocationCacheSurfaceMix(cacheStatusCounts ?? []),
    runStatesSummary: formatPublishedInvocationRunStatusMix(
      runStatusCounts ?? [],
      runStatesEmptyLabel
    ),
    requestSurfaceLabels: listPublishedInvocationFacetCountLabels(
      requestSurfaceCounts,
      formatPublishedInvocationSurfaceLabel
    )
  };
}

export function buildPublishedInvocationIssueSignalsSurface({
  reasonCounts,
  failureReasons,
  sandboxReadiness,
  surfaceCopy = buildPublishedInvocationActivityInsightsSurfaceCopy()
}: {
  reasonCounts?: PublishedEndpointInvocationFacetItem[] | null;
  failureReasons?: PublishedInvocationFailureReasonItem[] | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  surfaceCopy?: PublishedInvocationActivityInsightsSurfaceCopy;
}): PublishedInvocationIssueSignalsSurface | null {
  const chips = listPublishedInvocationIssueSignalChips(reasonCounts ?? []);
  if (chips.length === 0) {
    return null;
  }

  return {
    title: surfaceCopy.issueSignalsTitle,
    description: surfaceCopy.issueSignalsDescription,
    insight: buildPublishedInvocationFailureReasonInsight({
      reasonCounts,
      failureReasons,
      sandboxReadiness
    }),
    chips
  };
}

export function listPublishedInvocationIssueSignalChips(
  reasonCounts: PublishedEndpointInvocationFacetItem[]
): string[] {
  return reasonCounts.map((item) => `${formatPublishedInvocationReasonLabel(item.value)} ${item.count}`);
}

export function formatPublishedInvocationNodeRunLabel(nodeRunId: string): string {
  return `node run ${nodeRunId}`;
}

export function formatPublishedInvocationMissingToolCatalogEntry(toolId: string): string {
  return `missing catalog entry ${toolId}`;
}

export function buildPublishedInvocationSkillTraceSurface(
  skillTrace: NonNullable<PublishedEndpointInvocationDetailResponse["skill_trace"]>
): PublishedInvocationSkillTraceSurface {
  const phaseSummary = formatMetricSummary(skillTrace.phase_counts);
  const sourceSummary = formatMetricSummary(skillTrace.source_counts);

  return {
    summaryChips: [
      `refs ${skillTrace.reference_count}`,
      ...(phaseSummary ? [`phases ${phaseSummary}`] : []),
      ...(sourceSummary ? [`sources ${sourceSummary}`] : [])
    ],
    nodes: skillTrace.nodes.map((node) => ({
      key: node.node_run_id,
      title: node.node_name ?? node.node_id ?? node.node_run_id,
      countChip: `refs ${node.reference_count}`,
      summary: `${formatPublishedInvocationNodeRunLabel(node.node_run_id)}${node.node_id ? ` · node ${node.node_id}` : ""}`,
      loads: node.loads
    }))
  };
}

export function buildPublishedInvocationActivityDetailsSurfaceCopy(): PublishedInvocationActivityDetailsSurfaceCopy {
  return {
    selectedInvocationNextStepTitle: "Selected invocation next step",
    invocationAuditEmptyState:
      "当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。",
    apiKeyUsageMissingPrefixLabel: "no-prefix",
    apiKeyUsageInvocationCountLabel: "Calls",
    apiKeyUsageStatusMixLabel: "Status mix",
    apiKeyUsageStatusLabel: "Status",
    apiKeyUsageStatusEmptyLabel: "n/a",
    apiKeyUsageLastUsedLabel: "Last used",
    failureReasonTitle: "Failure reason",
    failureReasonCountLabelPrefix: "count",
    blockedDetailSurfaceLabel: "Invocation detail",
    blockedDetailGuardedActionLabel: "详情查看",
    unavailableDetail: buildPublishedInvocationUnavailableDetailSurfaceCopy()
  };
}

export function buildPublishedInvocationActivityBlockedDetailSurfaceCopy(
  payload: SensitiveAccessBlockingPayload
) {
  const detailsSurfaceCopy = buildPublishedInvocationActivityDetailsSurfaceCopy();

  return buildSensitiveAccessBlockedSurfaceCopy({
    surfaceLabel: detailsSurfaceCopy.blockedDetailSurfaceLabel,
    payload,
    guardedActionLabel: detailsSurfaceCopy.blockedDetailGuardedActionLabel
  });
}

export function formatPublishedInvocationApiKeyUsageMix({
  succeeded_count,
  failed_count,
  rejected_count
}: {
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
}) {
  return `ok ${succeeded_count} / failed ${failed_count} / rejected ${rejected_count}`;
}

export function buildPublishedInvocationApiKeyUsageCardSurface({
  item,
  surfaceCopy = buildPublishedInvocationActivityDetailsSurfaceCopy()
}: {
  item: NonNullable<PublishedEndpointInvocationListResponse["facets"]["api_key_usage"]>[number];
  surfaceCopy?: PublishedInvocationActivityDetailsSurfaceCopy;
}): PublishedInvocationApiKeyUsageCardSurface {
  return {
    title: item.name ?? item.api_key_id,
    chipLabel: item.key_prefix ?? surfaceCopy.apiKeyUsageMissingPrefixLabel,
    rows: [
      buildPublishedInvocationMetaRow(
        "calls",
        surfaceCopy.apiKeyUsageInvocationCountLabel,
        String(item.invocation_count)
      ),
      buildPublishedInvocationMetaRow(
        "status-mix",
        surfaceCopy.apiKeyUsageStatusMixLabel,
        formatPublishedInvocationApiKeyUsageMix(item)
      ),
      buildPublishedInvocationMetaRow(
        "status",
        surfaceCopy.apiKeyUsageStatusLabel,
        item.last_status ?? item.status ?? surfaceCopy.apiKeyUsageStatusEmptyLabel
      ),
      buildPublishedInvocationMetaRow(
        "last-used",
        surfaceCopy.apiKeyUsageLastUsedLabel,
        formatTimestamp(item.last_invoked_at)
      )
    ]
  };
}

export function buildPublishedInvocationFailureReasonCardSurface({
  item,
  reasonCounts,
  sandboxReadiness,
  surfaceCopy = buildPublishedInvocationActivityDetailsSurfaceCopy()
}: {
  item: PublishedInvocationFailureReasonItem;
  reasonCounts: PublishedEndpointInvocationFacetItem[];
  sandboxReadiness?: SandboxReadinessCheck | null;
  surfaceCopy?: PublishedInvocationActivityDetailsSurfaceCopy;
}): PublishedInvocationFailureReasonCardSurface {
  return {
    title: surfaceCopy.failureReasonTitle,
    countLabel: `${surfaceCopy.failureReasonCountLabelPrefix} ${item.count}`,
    message: item.message,
    diagnosis: buildPublishedInvocationFailureMessageDiagnosis({
      message: item.message,
      reasonCounts,
      sandboxReadiness
    }),
    lastSeenLabel: formatPublishedInvocationFailureReasonLastSeen(item.last_invoked_at)
  };
}

export function buildPublishedInvocationSelectedNextStepSurface({
  invocationId,
  nextStep,
  title,
  surfaceCopy = buildPublishedInvocationActivityDetailsSurfaceCopy()
}: {
  invocationId: string;
  nextStep: PublishedInvocationRecommendedNextStep;
  title?: string;
  surfaceCopy?: PublishedInvocationActivityDetailsSurfaceCopy;
}): PublishedInvocationSelectedNextStepSurface {
  return {
    title: title ?? surfaceCopy.selectedInvocationNextStepTitle,
    invocationId,
    label: nextStep.label,
    detail: nextStep.detail,
    href: nextStep.href,
    hrefLabel: nextStep.href_label
  };
}

export function formatPublishedInvocationFailureReasonLastSeen(lastInvokedAt?: string | null) {
  return `最近一次出现在 ${formatTimestamp(lastInvokedAt)}。`;
}

export function formatPublishedInvocationMetricCounts(
  metrics: Record<string, number> | null | undefined
): string {
  if (!metrics) {
    return "n/a";
  }

  const parts = Object.entries(metrics)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);

  return parts.length ? parts.join(" · ") : "0";
}

export function formatPublishedInvocationRequestKeysSummary(
  requestKeys: string[] | null | undefined
): string {
  return `request keys: ${formatKeyList(requestKeys ?? [])}`;
}

export function formatPublishedInvocationPayloadPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function listPublishedInvocationEntryMetaRows({
  invocation,
  runStatus,
  currentNodeId,
  waitingReason,
  scheduledResumeLabel,
  surfaceCopy = buildPublishedInvocationEntrySurfaceCopy()
}: {
  invocation: PublishedEndpointInvocationItem;
  runStatus: string | null;
  currentNodeId: string | null;
  waitingReason: string | null;
  scheduledResumeLabel: string;
  surfaceCopy?: PublishedInvocationEntrySurfaceCopy;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow(
      "api-key",
      surfaceCopy.apiKeyLabel,
      invocation.api_key_name ?? invocation.api_key_prefix ?? "internal"
    ),
    buildPublishedInvocationMetaRow(
      "request-keys",
      surfaceCopy.requestKeysLabel,
      formatKeyList(invocation.request_preview.keys ?? [])
    ),
    buildPublishedInvocationRunMetaRow({
      key: "run",
      label: surfaceCopy.runLabel,
      runId: invocation.run_id,
      fallbackValue: surfaceCopy.notStartedValueLabel
    }),
    buildPublishedInvocationMetaRow(
      "run-status",
      surfaceCopy.runStatusLabel,
      formatPublishedRunStatusLabel(runStatus)
    ),
    buildPublishedInvocationMetaRow(
      "current-node",
      surfaceCopy.currentNodeLabel,
      currentNodeId ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "waiting-reason",
      surfaceCopy.waitingReasonLabel,
      waitingReason ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "callback-tickets",
      surfaceCopy.callbackTicketsLabel,
      invocation.run_waiting_lifecycle
        ? `${invocation.run_waiting_lifecycle.callback_ticket_count} · ${formatPublishedInvocationMetricCounts(invocation.run_waiting_lifecycle.callback_ticket_status_counts)}`
        : surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "scheduled-resume",
      surfaceCopy.scheduledResumeLabel,
      scheduledResumeLabel
    )
  ];
}

export function listPublishedInvocationEntryWaitingRows({
  nodeRunId,
  nodeStatus,
  callbackTicketCount,
  callbackTicketStatusCounts,
  callbackLifecycleLabel,
  callbackLifecycleFallback,
  surfaceCopy = buildPublishedInvocationEntrySurfaceCopy()
}: {
  nodeRunId: string | null;
  nodeStatus: string | null;
  callbackTicketCount: number;
  callbackTicketStatusCounts: Record<string, number> | null | undefined;
  callbackLifecycleLabel: string | null;
  callbackLifecycleFallback: string;
  surfaceCopy?: PublishedInvocationEntrySurfaceCopy;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow(
      "node-run",
      surfaceCopy.waitingNodeRunLabel,
      nodeRunId ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "node-status",
      surfaceCopy.waitingNodeStatusLabel,
      nodeStatus ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "callback-tickets",
      surfaceCopy.waitingCallbackTicketsLabel,
      callbackTicketCount
        ? `${callbackTicketCount} · ${formatPublishedInvocationMetricCounts(callbackTicketStatusCounts)}`
        : surfaceCopy.emptyCountValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "callback-lifecycle",
      surfaceCopy.waitingCallbackLifecycleLabel,
      callbackLifecycleLabel ?? callbackLifecycleFallback
    )
  ];
}

export function listPublishedInvocationDetailRunRows({
  runId,
  runStatus,
  currentNodeId,
  waitingReason,
  waitingNodeRunId,
  startedAt,
  finishedAt,
  surfaceCopy = buildPublishedInvocationDetailSurfaceCopy()
}: {
  runId: string | null;
  runStatus: string | null;
  currentNodeId: string | null;
  waitingReason: string | null;
  waitingNodeRunId: string | null;
  startedAt: string | null | undefined;
  finishedAt: string | null | undefined;
  surfaceCopy?: PublishedInvocationDetailSurfaceCopy;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationRunMetaRow({
      key: "run",
      label: surfaceCopy.runLabel,
      runId,
      fallbackValue: surfaceCopy.notStartedValueLabel
    }),
    buildPublishedInvocationMetaRow(
      "status",
      surfaceCopy.runStatusLabel,
      runStatus ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "current-node",
      surfaceCopy.currentNodeLabel,
      currentNodeId ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "waiting-reason",
      surfaceCopy.waitingReasonLabel,
      waitingReason ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "waiting-node-run",
      surfaceCopy.waitingNodeRunLabel,
      waitingNodeRunId ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow("started", surfaceCopy.startedLabel, formatTimestamp(startedAt)),
    buildPublishedInvocationMetaRow("finished", surfaceCopy.finishedLabel, formatTimestamp(finishedAt))
  ];
}

export function listPublishedInvocationCacheDrilldownRows({
  cache,
  surfaceCopy = buildPublishedInvocationDetailSurfaceCopy()
}: {
  cache: PublishedEndpointInvocationDetailResponse["cache"];
  surfaceCopy?: PublishedInvocationDetailSurfaceCopy;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow("status", surfaceCopy.cacheStatusLabel, cache.cache_status),
    buildPublishedInvocationMetaRow(
      "cache-key",
      surfaceCopy.cacheKeyLabel,
      cache.cache_key ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "entry",
      surfaceCopy.cacheEntryLabel,
      cache.cache_entry_id ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "entry-hits",
      surfaceCopy.cacheEntryHitsLabel,
      String(cache.inventory_entry?.hit_count ?? 0)
    ),
    buildPublishedInvocationMetaRow(
      "last-hit",
      surfaceCopy.cacheLastHitLabel,
      formatTimestamp(cache.inventory_entry?.last_hit_at)
    ),
    buildPublishedInvocationMetaRow(
      "expires",
      surfaceCopy.cacheExpiresLabel,
      formatTimestamp(cache.inventory_entry?.expires_at)
    )
  ];
}

export function listPublishedInvocationCanonicalFollowUpChips({
  affectedRunCount,
  sampledRunCount,
  statusSummary,
  surfaceCopy = buildPublishedInvocationEntrySurfaceCopy()
}: {
  affectedRunCount: number;
  sampledRunCount: number;
  statusSummary: string | null;
  surfaceCopy?: PublishedInvocationEntrySurfaceCopy;
}): string[] {
  return [
    `${surfaceCopy.canonicalFollowUpAffectedRunsChipPrefix} ${affectedRunCount}`,
    `${surfaceCopy.canonicalFollowUpSampledRunsChipPrefix} ${sampledRunCount}`,
    ...(statusSummary ? [`${surfaceCopy.canonicalFollowUpStatusChipPrefix} ${statusSummary}`] : [])
  ];
}

export function listPublishedInvocationRunFollowUpEvidenceChips(
  sample: PublishedInvocationRunFollowUpSampleView
): string[] {
  return [
    ...(sample.execution_focus_artifact_count > 0
      ? [`artifacts ${sample.execution_focus_artifact_count}`]
      : []),
    ...(sample.execution_focus_artifact_ref_count > 0
      ? [`artifact refs ${sample.execution_focus_artifact_ref_count}`]
      : []),
    ...(sample.execution_focus_tool_call_count > 0
      ? [`tool calls ${sample.execution_focus_tool_call_count}`]
      : []),
    ...(sample.execution_focus_raw_ref_count > 0
      ? [`raw refs ${sample.execution_focus_raw_ref_count}`]
      : []),
    ...(sample.skill_reference_count > 0 ? [`skill refs ${sample.skill_reference_count}`] : []),
    ...(sample.skill_reference_phase_summary
      ? [`phases ${sample.skill_reference_phase_summary}`]
      : []),
    ...(sample.skill_reference_source_summary
      ? [`sources ${sample.skill_reference_source_summary}`]
      : [])
  ];
}

export function listPublishedInvocationRunFollowUpSampleMetaRows(
  sample: PublishedInvocationRunFollowUpSampleView,
  surfaceCopy = buildPublishedInvocationDetailSurfaceCopy()
): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow(
      "status",
      surfaceCopy.sampledRunStatusLabel,
      sample.status ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "current-node",
      surfaceCopy.sampledRunCurrentNodeLabel,
      sample.current_node_id ?? surfaceCopy.unavailableValueLabel
    ),
    buildPublishedInvocationMetaRow(
      "waiting-reason",
      surfaceCopy.sampledRunWaitingReasonLabel,
      sample.waiting_reason ?? surfaceCopy.unavailableValueLabel
    )
  ];
}

export function listPublishedInvocationActivitySummaryRows({
  summary,
  waitingOverview,
  surfaceCopy
}: {
  summary?: PublishedEndpointInvocationSummary | null;
  waitingOverview: PublishedInvocationWaitingOverview;
  surfaceCopy: Pick<
    PublishedInvocationActivityInsightsSurfaceCopy,
    | "totalCallsLabel"
    | "succeededCallsLabel"
    | "failedCallsLabel"
    | "rejectedCallsLabel"
    | "lastRunStatusLabel"
    | "lastRunStatusEmptyLabel"
    | "waitingNowLabel"
  >;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow("total-calls", surfaceCopy.totalCallsLabel, String(summary?.total_count ?? 0)),
    buildPublishedInvocationMetaRow(
      "succeeded-calls",
      surfaceCopy.succeededCallsLabel,
      String(summary?.succeeded_count ?? 0)
    ),
    buildPublishedInvocationMetaRow(
      "failed-calls",
      surfaceCopy.failedCallsLabel,
      String(summary?.failed_count ?? 0)
    ),
    buildPublishedInvocationMetaRow(
      "rejected-calls",
      surfaceCopy.rejectedCallsLabel,
      String(summary?.rejected_count ?? 0)
    ),
    buildPublishedInvocationMetaRow(
      "last-run-status",
      surfaceCopy.lastRunStatusLabel,
      formatPublishedInvocationOptionalRunStatus(
        summary?.last_run_status,
        surfaceCopy.lastRunStatusEmptyLabel
      ) ?? surfaceCopy.lastRunStatusEmptyLabel
    ),
    buildPublishedInvocationMetaRow(
      "waiting-now",
      surfaceCopy.waitingNowLabel,
      String(waitingOverview.activeWaitingCount)
    )
  ];
}

export function listPublishedInvocationActivityWaitingRows({
  waitingOverview,
  surfaceCopy
}: {
  waitingOverview: PublishedInvocationWaitingOverview;
  surfaceCopy: Pick<
    PublishedInvocationActivityInsightsSurfaceCopy,
    | "activeWaitingLabel"
    | "callbackWaitsLabel"
    | "approvalInputWaitsLabel"
    | "genericWaitsLabel"
    | "syncWaitingRejectedLabel"
    | "latestRunStatusLabel"
    | "latestRunStatusEmptyLabel"
  >;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow(
      "active-waiting",
      surfaceCopy.activeWaitingLabel,
      String(waitingOverview.activeWaitingCount)
    ),
    buildPublishedInvocationMetaRow(
      "callback-waits",
      surfaceCopy.callbackWaitsLabel,
      String(waitingOverview.callbackWaitingCount)
    ),
    buildPublishedInvocationMetaRow(
      "approval-input-waits",
      surfaceCopy.approvalInputWaitsLabel,
      String(waitingOverview.waitingInputCount)
    ),
    buildPublishedInvocationMetaRow(
      "generic-waits",
      surfaceCopy.genericWaitsLabel,
      String(waitingOverview.generalWaitingCount)
    ),
    buildPublishedInvocationMetaRow(
      "sync-waiting-rejected",
      surfaceCopy.syncWaitingRejectedLabel,
      String(waitingOverview.syncWaitingRejectedCount)
    ),
    buildPublishedInvocationMetaRow(
      "latest-run-status",
      surfaceCopy.latestRunStatusLabel,
      waitingOverview.lastRunStatusLabel ?? surfaceCopy.latestRunStatusEmptyLabel
    )
  ];
}

export function listPublishedInvocationRateLimitRows({
  rateLimitPolicy,
  windowUsed,
  remainingQuota,
  pressureLabel,
  windowRejected,
  surfaceCopy
}: {
  rateLimitPolicy: { requests: number; windowSeconds: number };
  windowUsed: number;
  remainingQuota: number | null;
  pressureLabel: string;
  windowRejected: number;
  surfaceCopy: Pick<
    PublishedInvocationActivityInsightsSurfaceCopy,
    | "rateLimitPolicyLabel"
    | "rateLimitUsedLabel"
    | "rateLimitRemainingLabel"
    | "rateLimitPressureLabel"
    | "rateLimitRejectedLabel"
  >;
}): PublishedInvocationMetaRow[] {
  return [
    buildPublishedInvocationMetaRow(
      "rate-limit-policy",
      surfaceCopy.rateLimitPolicyLabel,
      `${rateLimitPolicy.requests} / ${rateLimitPolicy.windowSeconds}s`
    ),
    buildPublishedInvocationMetaRow(
      "rate-limit-used",
      surfaceCopy.rateLimitUsedLabel,
      String(windowUsed)
    ),
    buildPublishedInvocationMetaRow(
      "rate-limit-remaining",
      surfaceCopy.rateLimitRemainingLabel,
      String(remainingQuota ?? 0)
    ),
    buildPublishedInvocationMetaRow(
      "rate-limit-pressure",
      surfaceCopy.rateLimitPressureLabel,
      pressureLabel
    ),
    buildPublishedInvocationMetaRow(
      "rate-limit-rejected",
      surfaceCopy.rateLimitRejectedLabel,
      String(windowRejected)
    )
  ];
}

export function buildPublishedInvocationRateLimitWindowInsight({
  pressure,
  remainingQuota,
  windowRejected,
  failedCount,
  timeWindowLabel
}: {
  pressure:
    | {
        percentage: number;
        label: string;
      }
    | null;
  remainingQuota: number | null;
  windowRejected: number;
  failedCount: number;
  timeWindowLabel: string;
}) {
  if (!pressure || remainingQuota === null) {
    return null;
  }

  if (windowRejected > 0) {
    return `当前窗口已经出现 ${windowRejected} 次限流拒绝；如果失败面板同时看到 runtime failed，先把 quota hit 与执行链路异常拆开排查。`;
  }

  if (pressure.percentage >= 80) {
    return `当前${timeWindowLabel}切片里已用掉 ${pressure.label} 配额，只剩 ${remainingQuota} 次；继续放量前先观察是否开始转成 rate_limit_exceeded。`;
  }

  if (failedCount > 0) {
    return `当前窗口还剩 ${remainingQuota} 次配额，说明这段时间里的 failed 更可能来自运行时、鉴权或协议边界，而不是 rate limit 本身。`;
  }

  return `当前窗口还剩 ${remainingQuota} 次配额，rate limit 现在还不是这条 binding 的主阻塞面。`;
}

export function formatPublishedInvocationWaitingRuntimeFallback({
  currentNodeId,
  waitingReason
}: {
  currentNodeId?: string | null;
  waitingReason?: string | null;
}) {
  return `该请求已成功接入 durable runtime，当前仍处于 waiting；可直接打开 run detail 继续追踪${
    currentNodeId ? `，当前节点 ${currentNodeId}` : ""
  }${waitingReason ? `，等待原因 ${waitingReason}` : ""}。`;
}

export function buildPublishedInvocationUnavailableDetailSurfaceCopy(): PublishedInvocationUnavailableDetailSurfaceCopy {
  return {
    title: "Invocation detail unavailable",
    summary: "当前未能拉取该 invocation 的详情 payload。",
    detail: "审计列表仍可继续使用；如果问题可复现，优先回到 run detail 或稍后重试该详情入口。"
  };
}

export function buildPublishedInvocationFailureReasonInsight({
  reasonCounts,
  failureReasons,
  sandboxReadiness
}: {
  reasonCounts?: PublishedEndpointInvocationFacetItem[] | null;
  failureReasons?: PublishedInvocationFailureReasonItem[] | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
}): string | null {
  const runtimeFailedCount = getFacetCount(reasonCounts, "runtime_failed");
  const rateLimitExceededCount = getFacetCount(reasonCounts, "rate_limit_exceeded");
  const authRejectedCount =
    getFacetCount(reasonCounts, "api_key_invalid") + getFacetCount(reasonCounts, "api_key_required");

  if (runtimeFailedCount > 0) {
    if (sandboxReadiness) {
      const readinessHeadline = formatSandboxReadinessHeadline(sandboxReadiness);
      const readinessDetail = formatSandboxReadinessDetail(sandboxReadiness);
      const hasLiveReadinessPressure =
        listSandboxBlockedClasses(sandboxReadiness).length > 0 ||
        sandboxReadiness.offline_backend_count > 0 ||
        sandboxReadiness.degraded_backend_count > 0;

      return hasLiveReadinessPressure
        ? `当前 reason code 里已有 ${runtimeFailedCount} 条 Runtime failed；结合 live sandbox readiness：${readinessHeadline}${readinessDetail ? ` ${readinessDetail}` : ""}，要优先判断是不是强隔离 backend / capability 仍 blocked。`
        : `当前 reason code 里已有 ${runtimeFailedCount} 条 Runtime failed；live sandbox readiness 现在没有继续报警，失败更可能来自 run 当时的 backend 健康度、节点配置或协议转换。`;
    }

    return `当前 reason code 里已有 ${runtimeFailedCount} 条 Runtime failed；需要继续结合 run diagnostics 区分执行链路、节点配置和协议转换问题。`;
  }

  if (rateLimitExceededCount > 0) {
    return `当前 reason code 里已有 ${rateLimitExceededCount} 条 Rate limit exceeded；优先对照上面的 rate limit window，而不是把拒绝误当成 runtime 故障。`;
  }

  if (authRejectedCount > 0) {
    return `当前拒绝更集中在 API key / auth 边界，先检查 key 轮换、binding 暴露方式与调用方鉴权，再回头看执行层。`;
  }

  const latestFailure = failureReasons?.[0]?.message?.trim();
  if (latestFailure) {
    return `最近失败明细集中在：${latestFailure}`;
  }

  return null;
}

export function buildPublishedInvocationFailureMessageDiagnosis({
  message,
  reasonCounts,
  sandboxReadiness
}: {
  message: string;
  reasonCounts?: PublishedEndpointInvocationFacetItem[] | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
}): PublishedInvocationFailureMessageDiagnosis | null {
  const normalizedMessage = message.toLowerCase();
  const runtimeFailedCount = getFacetCount(reasonCounts, "runtime_failed");
  const rateLimitExceededCount = getFacetCount(reasonCounts, "rate_limit_exceeded");
  const authRejectedCount =
    getFacetCount(reasonCounts, "api_key_invalid") + getFacetCount(reasonCounts, "api_key_required");
  const mentionsQuota =
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("429");
  const mentionsAuth =
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("unauthor") ||
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("auth");
  const mentionsSandbox =
    normalizedMessage.includes("sandbox") ||
    normalizedMessage.includes("microvm") ||
    normalizedMessage.includes("execution class") ||
    normalizedMessage.includes("backend offline") ||
    normalizedMessage.includes("tool execution");

  if (mentionsSandbox || runtimeFailedCount > 0) {
    if (!sandboxReadiness) {
      return {
        headline: "这条 failure 很可能落在执行链路或强隔离能力上。",
        detail: "继续结合 invocation detail / run diagnostics 查看 execution focus，区分 live blockage 与历史故障。"
      };
    }

    const hasLiveReadinessPressure =
      listSandboxBlockedClasses(sandboxReadiness).length > 0 ||
      sandboxReadiness.offline_backend_count > 0 ||
      sandboxReadiness.degraded_backend_count > 0;
    const readinessHeadline = formatSandboxReadinessHeadline(sandboxReadiness);
    const readinessDetail = formatSandboxReadinessDetail(sandboxReadiness);

    return hasLiveReadinessPressure
      ? {
          headline: "当前 live sandbox readiness 仍在报警。",
          detail: `${readinessHeadline}${readinessDetail ? ` ${readinessDetail}` : ""} 这说明这条 failure 不能只按历史 message 处理，先确认强隔离 backend / capability 是否仍 blocked。`
        }
      : {
          headline: "当前 live sandbox readiness 已恢复。",
          detail:
            "这更像 run 当时的 backend 健康度、definition capability 不匹配或协议转换历史故障；继续看 invocation detail / run diagnostics 的 execution focus。"
        };
  }

  if (mentionsQuota || rateLimitExceededCount > 0) {
    return {
      headline: "这条 failure 更像 quota / rate limit 侧信号。",
      detail:
        runtimeFailedCount > 0
          ? "先看上面的 rate limit window，再把 quota hit 与 execution/runtime failed 拆成两条链路排查，避免误把拒绝当成执行链路故障。"
          : "优先回看上面的 rate limit window，而不是直接把这条 message 当成 runtime 故障。"
    };
  }

  if (mentionsAuth || authRejectedCount > 0) {
    return {
      headline: "这条 failure 更像鉴权 / API key 边界问题。",
      detail: "先检查调用方 key 是否过期、binding 暴露方式是否匹配，再决定是否继续深挖执行链路。"
    };
  }

  return null;
}

export function hasPublishedInvocationBlockingSensitiveAccessSummary(
  summary?: PublishedInvocationSensitiveAccessSummary | null
) {
  if (!summary) {
    return false;
  }

  return Boolean(
    summary.pending_approval_count > 0 ||
      summary.rejected_approval_count > 0 ||
      summary.expired_approval_count > 0 ||
      summary.pending_notification_count > 0 ||
      summary.failed_notification_count > 0
  );
}

export function buildPublishedInvocationRecommendedNextStep({
  runId,
  canonicalFollowUp,
  callbackWaitingFollowUp,
  callbackWaitingAutomation,
  executionFocusFollowUp,
  sandboxReadiness,
  blockingInboxHref,
  approvalInboxHref
}: {
  runId?: string | null;
  canonicalFollowUp?: PublishedInvocationCanonicalFollowUpCopy | null;
  callbackWaitingFollowUp?: string | null;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  executionFocusFollowUp?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  blockingInboxHref?: string | null;
  approvalInboxHref?: string | null;
}): PublishedInvocationRecommendedNextStep | null {
  const executionSurfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();
  const hasExplicitCallbackFollowUp = Boolean(
    (callbackWaitingFollowUp && callbackWaitingFollowUp.trim()) ||
      canonicalFollowUp?.has_shared_callback_waiting_summary
  );
  const callbackCandidate = hasExplicitCallbackFollowUp
    ? buildOperatorInboxSliceCandidate({
        active: true,
        href: blockingInboxHref ?? approvalInboxHref ?? null,
        label: blockingInboxHref ? "approval blocker" : "callback waiting",
        detail: callbackWaitingFollowUp,
        hrefLabel: blockingInboxHref
          ? "open blocker inbox slice"
          : approvalInboxHref
            ? "open approval inbox slice"
            : null,
        fallbackDetail:
          "当前 invocation 的下一步仍落在 callback waiting / approval 事实链；优先确认票据、回调和自动 resume 是否正在推进。"
      })
    : buildCallbackWaitingAutomationFollowUpCandidate(callbackWaitingAutomation, "callback recovery");
  const executionCandidate = executionFocusFollowUp?.trim()
    ? buildOperatorRunDetailCandidate({
        active: true,
        runId,
        label: "execution focus",
        detail: executionFocusFollowUp,
        fallbackDetail: executionSurfaceCopy.recommendedNextStepFallbackDetail
      })
    : buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness") ??
      buildOperatorRunDetailCandidate({
        active: Boolean(runId),
        runId,
        label: "execution focus",
        detail: executionFocusFollowUp,
        fallbackDetail: executionSurfaceCopy.recommendedNextStepFallbackDetail
      });

  return buildOperatorRecommendedNextStep({
    callback: callbackCandidate,
    execution: executionCandidate,
    operatorFollowUp: canonicalFollowUp?.follow_up ?? null
  });
}

export function buildPublishedInvocationEntryInboxLinkSurface({
  blockingInboxHref,
  waitingInboxHref
}: {
  blockingInboxHref?: string | null;
  waitingInboxHref?: string | null;
}): PublishedInvocationInboxLinkSurface | null {
  return (
    buildOperatorInboxSliceLinkSurface({
      href: blockingInboxHref,
      hrefLabel: "open blocker inbox slice"
    }) ??
    buildOperatorInboxSliceLinkSurface({
      href: waitingInboxHref,
      hrefLabel: "open waiting inbox"
    })
  );
}

function buildPublishedInvocationRunFollowUpSampleSnapshot(
  sample?: PublishedInvocationRunFollowUpSample | null,
  explanationSource?: PublishedInvocationRunFollowUpSampleView["explanation_source"]
): RunSnapshot {
  return buildPublishedInvocationRunSnapshot(sample?.snapshot, explanationSource);
}

function buildPublishedInvocationRunSnapshot(
  snapshot?: OperatorRunFollowUpSnapshot | null,
  explanationSource?: PublishedInvocationRunFollowUpSampleView["explanation_source"]
): RunSnapshot {
  return {
    status: snapshot?.status ?? null,
    currentNodeId: snapshot?.current_node_id ?? null,
    waitingReason: snapshot?.waiting_reason ?? null,
    executionFocusNodeId: snapshot?.execution_focus_node_id ?? null,
    executionFocusNodeRunId: snapshot?.execution_focus_node_run_id ?? null,
    executionFocusNodeName: snapshot?.execution_focus_node_name ?? null,
    executionFocusNodeType: snapshot?.execution_focus_node_type ?? null,
    executionFocusExplanation:
      explanationSource === "callback_waiting"
        ? null
        : normalizeExplanation(snapshot?.execution_focus_explanation),
    callbackWaitingExplanation:
      explanationSource === "execution_focus"
        ? null
        : normalizeExplanation(snapshot?.callback_waiting_explanation),
    callbackWaitingLifecycle: snapshot?.callback_waiting_lifecycle ?? null,
    scheduledResumeDelaySeconds:
      typeof snapshot?.scheduled_resume_delay_seconds === "number"
        ? snapshot.scheduled_resume_delay_seconds
        : null,
    scheduledResumeReason: snapshot?.scheduled_resume_reason ?? null,
    scheduledResumeSource: snapshot?.scheduled_resume_source ?? null,
    scheduledWaitingStatus: snapshot?.scheduled_waiting_status ?? null,
    scheduledResumeScheduledAt: snapshot?.scheduled_resume_scheduled_at ?? null,
    scheduledResumeDueAt: snapshot?.scheduled_resume_due_at ?? null,
    scheduledResumeRequeuedAt: snapshot?.scheduled_resume_requeued_at ?? null,
    scheduledResumeRequeueSource: snapshot?.scheduled_resume_requeue_source ?? null,
    executionFocusArtifactCount: snapshot?.execution_focus_artifact_count ?? 0,
    executionFocusArtifactRefCount: snapshot?.execution_focus_artifact_ref_count ?? 0,
    executionFocusToolCallCount: snapshot?.execution_focus_tool_call_count ?? 0,
    executionFocusRawRefCount: snapshot?.execution_focus_raw_ref_count ?? 0,
    executionFocusArtifactRefs: snapshot?.execution_focus_artifact_refs ?? [],
    executionFocusArtifacts:
      snapshot?.execution_focus_artifacts?.map((artifact) => ({
        artifact_kind: artifact.artifact_kind ?? null,
        content_type: artifact.content_type ?? null,
        summary: artifact.summary ?? null,
        uri: artifact.uri ?? null
      })) ?? [],
    executionFocusToolCalls:
      snapshot?.execution_focus_tool_calls?.map((toolCall) => ({
        id: toolCall.id ?? null,
        tool_id: toolCall.tool_id ?? null,
        tool_name: toolCall.tool_name ?? null,
        phase: toolCall.phase ?? null,
        status: toolCall.status ?? null,
        ...(toolCall.requested_execution_class != null
          ? { requested_execution_class: toolCall.requested_execution_class }
          : {}),
        ...(toolCall.requested_execution_source != null
          ? { requested_execution_source: toolCall.requested_execution_source }
          : {}),
        ...(toolCall.requested_execution_profile != null
          ? { requested_execution_profile: toolCall.requested_execution_profile }
          : {}),
        ...(typeof toolCall.requested_execution_timeout_ms === "number"
          ? { requested_execution_timeout_ms: toolCall.requested_execution_timeout_ms }
          : {}),
        ...(toolCall.requested_execution_network_policy != null
          ? { requested_execution_network_policy: toolCall.requested_execution_network_policy }
          : {}),
        ...(toolCall.requested_execution_filesystem_policy != null
          ? { requested_execution_filesystem_policy: toolCall.requested_execution_filesystem_policy }
          : {}),
        ...(toolCall.requested_execution_dependency_mode != null
          ? { requested_execution_dependency_mode: toolCall.requested_execution_dependency_mode }
          : {}),
        ...(toolCall.requested_execution_builtin_package_set != null
          ? {
              requested_execution_builtin_package_set:
                toolCall.requested_execution_builtin_package_set
            }
          : {}),
        ...(toolCall.requested_execution_dependency_ref != null
          ? { requested_execution_dependency_ref: toolCall.requested_execution_dependency_ref }
          : {}),
        ...(toolCall.requested_execution_backend_extensions != null
          ? {
              requested_execution_backend_extensions:
                toolCall.requested_execution_backend_extensions
            }
          : {}),
        effective_execution_class: toolCall.effective_execution_class ?? null,
        ...(toolCall.execution_executor_ref != null
          ? { execution_executor_ref: toolCall.execution_executor_ref }
          : {}),
        execution_sandbox_backend_id: toolCall.execution_sandbox_backend_id ?? null,
        ...(toolCall.execution_sandbox_backend_executor_ref != null
          ? {
              execution_sandbox_backend_executor_ref:
                toolCall.execution_sandbox_backend_executor_ref
            }
          : {}),
        execution_sandbox_runner_kind: toolCall.execution_sandbox_runner_kind ?? null,
        ...(toolCall.adapter_request_trace_id != null
          ? { adapter_request_trace_id: toolCall.adapter_request_trace_id }
          : {}),
        ...(toolCall.adapter_request_execution != null
          ? { adapter_request_execution: toolCall.adapter_request_execution }
          : {}),
        ...(toolCall.adapter_request_execution_class != null
          ? { adapter_request_execution_class: toolCall.adapter_request_execution_class }
          : {}),
        ...(toolCall.adapter_request_execution_source != null
          ? { adapter_request_execution_source: toolCall.adapter_request_execution_source }
          : {}),
        ...(toolCall.adapter_request_execution_contract != null
          ? {
              adapter_request_execution_contract:
                toolCall.adapter_request_execution_contract
            }
          : {}),
        execution_blocking_reason: toolCall.execution_blocking_reason ?? null,
        execution_fallback_reason: toolCall.execution_fallback_reason ?? null,
        response_summary: toolCall.response_summary ?? null,
        response_content_type: toolCall.response_content_type ?? null,
        raw_ref: toolCall.raw_ref ?? null
      })) ?? [],
    executionFocusSkillTrace: snapshot?.execution_focus_skill_trace
      ? {
          reference_count: snapshot.execution_focus_skill_trace.reference_count ?? 0,
          phase_counts: snapshot.execution_focus_skill_trace.phase_counts ?? {},
          source_counts: snapshot.execution_focus_skill_trace.source_counts ?? {},
          loads: snapshot.execution_focus_skill_trace.loads ?? []
        }
      : null
  };
}

export function normalizePublishedInvocationRunSnapshot(
  snapshot?: OperatorRunFollowUpSnapshot | null
): RunSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return buildPublishedInvocationRunSnapshot(snapshot);
}

export const PUBLISHED_INVOCATION_REASON_CODES = [
  "api_key_invalid",
  "api_key_required",
  "auth_mode_unsupported",
  "binding_inactive",
  "compiled_blueprint_missing",
  "protocol_mismatch",
  "rate_limit_exceeded",
  "rejected_other",
  "run_status_unsupported",
  "runtime_failed",
  "streaming_unsupported",
  "sync_waiting_unsupported",
  "target_version_missing",
  "unknown",
  "workflow_missing"
] as const;

export const PUBLISHED_INVOCATION_REQUEST_SURFACES = [
  "native.workflow",
  "native.workflow.async",
  "native.alias",
  "native.alias.async",
  "native.path",
  "native.path.async",
  "openai.chat.completions",
  "openai.chat.completions.async",
  "openai.responses",
  "openai.responses.async",
  "openai.unknown",
  "anthropic.messages",
  "anthropic.messages.async",
  "unknown"
] as const;
export const PUBLISHED_INVOCATION_CACHE_STATUSES = ["hit", "miss", "bypass"] as const;
export const PUBLISHED_RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "waiting_input",
  "waiting_callback",
  "succeeded",
  "failed",
  "canceled",
  "timed_out"
] as const;

export type PublishedInvocationReasonCode =
  (typeof PUBLISHED_INVOCATION_REASON_CODES)[number];
export type PublishedInvocationRequestSurface =
  (typeof PUBLISHED_INVOCATION_REQUEST_SURFACES)[number];
export type PublishedInvocationCacheStatus =
  (typeof PUBLISHED_INVOCATION_CACHE_STATUSES)[number];
export type PublishedRunStatus = (typeof PUBLISHED_RUN_STATUSES)[number];

const REASON_LABELS: Record<string, string> = {
  api_key_invalid: "Invalid API key",
  api_key_required: "Missing API key",
  auth_mode_unsupported: "Unsupported auth mode",
  binding_inactive: "Inactive binding",
  compiled_blueprint_missing: "Missing blueprint",
  protocol_mismatch: "Protocol mismatch",
  rate_limit_exceeded: "Rate limit exceeded",
  rejected_other: "Rejected (other)",
  run_status_unsupported: "Unsupported run status",
  runtime_failed: "Runtime failed",
  streaming_unsupported: "Streaming not ready",
  sync_waiting_unsupported: "Sync waiting not supported",
  target_version_missing: "Missing workflow version",
  unknown: "Unknown issue",
  workflow_missing: "Workflow missing"
};

const REQUEST_SURFACE_LABELS: Record<string, string> = {
  "native.workflow": "Native workflow route",
  "native.workflow.async": "Native workflow async route",
  "native.alias": "Native alias route",
  "native.alias.async": "Native alias async route",
  "native.path": "Native path route",
  "native.path.async": "Native path async route",
  "openai.chat.completions": "OpenAI chat.completions",
  "openai.chat.completions.async": "OpenAI chat.completions async route",
  "openai.responses": "OpenAI responses",
  "openai.responses.async": "OpenAI responses async route",
  "openai.unknown": "OpenAI unknown surface",
  "anthropic.messages": "Anthropic messages",
  "anthropic.messages.async": "Anthropic messages async route",
  unknown: "Unknown surface"
};
const CACHE_STATUS_LABELS: Record<string, string> = {
  hit: "Cache hit",
  miss: "Cache miss",
  bypass: "Cache bypass"
};
const RUN_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  waiting_input: "Waiting input",
  waiting_callback: "Waiting callback",
  succeeded: "Run succeeded",
  failed: "Run failed",
  canceled: "Run canceled",
  timed_out: "Run timed out"
};

function getFacetCount(
  facets: PublishedEndpointInvocationFacetItem[] | null | undefined,
  value: string
) {
  return facets?.find((item) => item.value === value)?.count ?? 0;
}
function formatCountLabel(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}
function joinFragments(fragments: string[]) {
  if (fragments.length === 0) {
    return null;
  }

  if (fragments.length === 1) {
    return fragments[0];
  }

  if (fragments.length === 2) {
    return `${fragments[0]} and ${fragments[1]}`;
  }

  return `${fragments.slice(0, -1).join(", ")}, and ${fragments[fragments.length - 1]}`;
}

function normalizeExplanation(
  explanation?: RunExecutionFocusExplanation | null
): RunExecutionFocusExplanation | null {
  const primarySignal = explanation?.primary_signal?.trim() || null;
  const followUp = explanation?.follow_up?.trim() || null;
  if (!primarySignal && !followUp) {
    return null;
  }

  return {
    primary_signal: primarySignal,
    follow_up: followUp
  };
}

function resolvePublishedInvocationSampleSnapshot(
  item: PublishedEndpointInvocationItem
) {
  const normalizedRunId = item.run_id?.trim() || null;
  const sampledRuns = item.run_follow_up?.sampled_runs ?? [];

  if (normalizedRunId) {
    const matchedSample = sampledRuns.find((sample) => sample.run_id === normalizedRunId);
    if (matchedSample?.snapshot) {
      return matchedSample.snapshot;
    }
  }

  return sampledRuns.find((sample) => sample.snapshot)?.snapshot ?? null;
}

export function resolvePublishedInvocationExecutionFocusExplanation(
  item: PublishedEndpointInvocationItem
): RunExecutionFocusExplanation | null {
  return (
    normalizeExplanation(item.execution_focus_explanation) ??
    normalizeExplanation(item.run_snapshot?.execution_focus_explanation) ??
    normalizeExplanation(resolvePublishedInvocationSampleSnapshot(item)?.execution_focus_explanation)
  );
}

export function resolvePublishedInvocationCallbackWaitingExplanation(
  item: PublishedEndpointInvocationItem
): RunExecutionFocusExplanation | null {
  return (
    normalizeExplanation(item.callback_waiting_explanation) ??
    normalizeExplanation(item.run_snapshot?.callback_waiting_explanation) ??
    normalizeExplanation(item.run_waiting_lifecycle?.callback_waiting_explanation) ??
    normalizeExplanation(resolvePublishedInvocationSampleSnapshot(item)?.callback_waiting_explanation)
  );
}

export function resolvePublishedInvocationRunFollowUpSampleExplanation(
  sample?: PublishedInvocationRunFollowUpSample | null
): PublishedInvocationRunFollowUpSampleView["explanation"] {
  return (
    normalizeExplanation(sample?.snapshot?.callback_waiting_explanation) ??
    normalizeExplanation(sample?.snapshot?.execution_focus_explanation)
  );
}

export function resolvePublishedInvocationRunFollowUpSampleExplanationSource(
  sample?: PublishedInvocationRunFollowUpSample | null
): PublishedInvocationRunFollowUpSampleView["explanation_source"] {
  if (normalizeExplanation(sample?.snapshot?.callback_waiting_explanation)) {
    return "callback_waiting";
  }
  if (normalizeExplanation(sample?.snapshot?.execution_focus_explanation)) {
    return "execution_focus";
  }
  return null;
}

export function listPublishedInvocationRunFollowUpSampleViews(
  runFollowUp?: PublishedInvocationRunFollowUpSummary | null
): PublishedInvocationRunFollowUpSampleView[] {
  return (runFollowUp?.sampled_runs ?? []).map((sample) => {
    const explanationSource = resolvePublishedInvocationRunFollowUpSampleExplanationSource(sample);
    const explanation = resolvePublishedInvocationRunFollowUpSampleExplanation(sample);
    const runSnapshot = buildPublishedInvocationRunFollowUpSampleSnapshot(sample, explanationSource);
    const snapshotSummary = formatRunSnapshotSummary(runSnapshot);
    const focusEvidenceModel = buildOperatorInlineActionFeedbackModel({ runSnapshot });

    return {
      run_id: sample.run_id,
      status: sample.snapshot?.status?.trim() || null,
      current_node_id: sample.snapshot?.current_node_id?.trim() || null,
      waiting_reason: sample.snapshot?.waiting_reason?.trim() || null,
      run_snapshot: runSnapshot,
      callback_tickets: sample.callback_tickets ?? [],
      sensitive_access_entries: sample.sensitive_access_entries ?? [],
      explanation_source: explanationSource,
      explanation,
      snapshot_summary: snapshotSummary,
      has_callback_waiting_summary: hasCallbackWaitingSummaryFacts(runSnapshot),
      execution_focus_artifact_count: sample.snapshot?.execution_focus_artifact_count ?? 0,
      execution_focus_artifact_ref_count: sample.snapshot?.execution_focus_artifact_ref_count ?? 0,
      execution_focus_tool_call_count: sample.snapshot?.execution_focus_tool_call_count ?? 0,
      execution_focus_raw_ref_count: sample.snapshot?.execution_focus_raw_ref_count ?? 0,
      skill_reference_count: focusEvidenceModel.skillReferenceCount,
      skill_reference_phase_summary: focusEvidenceModel.skillReferencePhaseSummary,
      skill_reference_source_summary: focusEvidenceModel.skillReferenceSourceSummary,
      focus_artifact_summary: focusEvidenceModel.focusArtifactSummary,
      focus_tool_call_summaries: focusEvidenceModel.focusToolCallSummaries,
      focus_artifacts: focusEvidenceModel.focusArtifacts,
      focus_skill_reference_loads: focusEvidenceModel.focusSkillReferenceLoads
    };
  });
}

export function resolvePublishedInvocationRunFollowUpSampleView(
  item: PublishedEndpointInvocationItem
): PublishedInvocationRunFollowUpSampleView | null {
  const sampleViews = listPublishedInvocationRunFollowUpSampleViews(item.run_follow_up);
  const normalizedRunId = item.run_id?.trim() || null;

  if (normalizedRunId) {
    return sampleViews.find((sample) => sample.run_id === normalizedRunId) ?? sampleViews[0] ?? null;
  }

  return sampleViews[0] ?? null;
}

export function buildPublishedInvocationRunFollowUpSampleInboxHref(
  sample?: PublishedInvocationRunFollowUpSampleView | null
) {
  if (!sample) {
    return null;
  }

  const latestApprovalEntry = findLatestApprovalEntry(sample.sensitive_access_entries);
  if (latestApprovalEntry) {
    return buildSensitiveAccessTimelineInboxHref(latestApprovalEntry, sample.run_id);
  }

  const firstCallbackTicket = sample.callback_tickets[0] ?? null;
  if (!firstCallbackTicket) {
    return null;
  }

  return buildCallbackTicketInboxHref(firstCallbackTicket, {
    runId: sample.run_id,
    nodeRunId: firstCallbackTicket.node_run_id ?? null
  });
}

export function buildPublishedInvocationCanonicalFollowUpCopy({
  explanation,
  sharedCallbackWaitingExplanations,
  fallbackHeadline
}: {
  explanation?: RunExecutionFocusExplanation | null;
  sharedCallbackWaitingExplanations?: Array<RunExecutionFocusExplanation | null | undefined>;
  fallbackHeadline: string;
}): PublishedInvocationCanonicalFollowUpCopy {
  const normalizedExplanation = normalizeExplanation(explanation);
  const sharedPrimarySignals = new Set<string>();
  const sharedFollowUps = new Set<string>();

  for (const sharedExplanation of sharedCallbackWaitingExplanations ?? []) {
    const normalizedSharedExplanation = normalizeExplanation(sharedExplanation);
    if (normalizedSharedExplanation?.primary_signal) {
      sharedPrimarySignals.add(normalizedSharedExplanation.primary_signal);
    }
    if (normalizedSharedExplanation?.follow_up) {
      sharedFollowUps.add(normalizedSharedExplanation.follow_up);
    }
  }

  const hasSharedCallbackWaitingSummary =
    sharedPrimarySignals.size > 0 || sharedFollowUps.size > 0;

  return {
    headline:
      normalizedExplanation?.primary_signal &&
      !sharedPrimarySignals.has(normalizedExplanation.primary_signal)
        ? normalizedExplanation.primary_signal
        : fallbackHeadline,
    follow_up:
      normalizedExplanation?.follow_up &&
      !hasSharedCallbackWaitingSummary &&
      !sharedFollowUps.has(normalizedExplanation.follow_up)
        ? normalizedExplanation.follow_up
        : null,
    has_shared_callback_waiting_summary: hasSharedCallbackWaitingSummary
  };
}

export function listPublishedInvocationRunFollowUpSampleSummaries(
  runFollowUp?: PublishedInvocationRunFollowUpSummary | null
): string[] {
  return listPublishedInvocationRunFollowUpSampleViews(runFollowUp).map((sample) => {
    const shortRunId = sample.run_id.slice(0, 8);
    return sample.snapshot_summary
      ? `run ${shortRunId}：${sample.snapshot_summary}`
      : `run ${shortRunId}：暂未读取到最新快照。`;
  });
}
export function listPublishedInvocationSensitiveAccessChips(
  summary?: PublishedInvocationSensitiveAccessSummary | null
) {
  if (!summary) {
    return [];
  }

  const chips: string[] = [];
  if (summary.pending_approval_count > 0) {
    chips.push(`${formatCountLabel(summary.pending_approval_count, "approval pending")}`);
  }
  if (summary.rejected_approval_count > 0) {
    chips.push(`${formatCountLabel(summary.rejected_approval_count, "approval rejected")}`);
  }
  if (summary.expired_approval_count > 0) {
    chips.push(`${formatCountLabel(summary.expired_approval_count, "approval expired")}`);
  }
  if (summary.failed_notification_count > 0) {
    chips.push(`${formatCountLabel(summary.failed_notification_count, "notification retry")}`);
  }
  if (summary.pending_notification_count > 0) {
    chips.push(`${formatCountLabel(summary.pending_notification_count, "notification pending")}`);
  }
  return chips;
}

export function listPublishedInvocationSensitiveAccessRows(
  summary?: PublishedInvocationSensitiveAccessSummary | null
) {
  if (!summary || summary.request_count <= 0) {
    return [];
  }

  const approvalParts = [
    summary.pending_approval_count > 0
      ? `${formatCountLabel(summary.pending_approval_count, "pending")}`
      : null,
    summary.approved_approval_count > 0
      ? `${formatCountLabel(summary.approved_approval_count, "approved")}`
      : null,
    summary.rejected_approval_count > 0
      ? `${formatCountLabel(summary.rejected_approval_count, "rejected")}`
      : null,
    summary.expired_approval_count > 0
      ? `${formatCountLabel(summary.expired_approval_count, "expired")}`
      : null
  ].filter((value): value is string => Boolean(value));
  const notificationParts = [
    summary.pending_notification_count > 0
      ? `${formatCountLabel(summary.pending_notification_count, "pending")}`
      : null,
    summary.delivered_notification_count > 0
      ? `${formatCountLabel(summary.delivered_notification_count, "delivered")}`
      : null,
    summary.failed_notification_count > 0
      ? `${formatCountLabel(summary.failed_notification_count, "failed")}`
      : null
  ].filter((value): value is string => Boolean(value));

  return [
    {
      label: "Sensitive access",
      value:
        `${formatCountLabel(summary.request_count, "request")} · ` +
        `${formatCountLabel(summary.approval_ticket_count, "approval ticket")}`
    },
    ...(approvalParts.length
      ? [
          {
            label: "Approval blockers",
            value: approvalParts.join(" · ")
          }
        ]
      : []),
    ...(notificationParts.length
      ? [
          {
            label: "Notification delivery",
            value: notificationParts.join(" · ")
          }
        ]
      : [])
  ];
}

export function formatPublishedInvocationWaitingHeadline({
  explanation,
  fallbackHeadline,
  nodeRunId,
  nodeStatus
}: {
  explanation?: RunExecutionFocusExplanation | null;
  fallbackHeadline?: string | null;
  nodeRunId?: string | null;
  nodeStatus?: string | null;
}) {
  const primarySignal = explanation?.primary_signal?.trim();
  if (primarySignal) {
    return primarySignal;
  }
  if (fallbackHeadline) {
    return fallbackHeadline;
  }
  if (nodeRunId && nodeStatus) {
    return `node run ${nodeRunId} is still ${nodeStatus}.`;
  }
  return null;
}

export function formatPublishedInvocationWaitingFollowUp(
  explanation?: RunExecutionFocusExplanation | null
) {
  const followUp = explanation?.follow_up?.trim();
  return followUp || null;
}

export function formatPublishedInvocationReasonLabel(
  reasonCode: string | null | undefined
) {
  if (!reasonCode) {
    return "No issue";
  }

  return REASON_LABELS[reasonCode] ?? reasonCode.replaceAll("_", " ");
}

export function formatPublishedInvocationSurfaceLabel(
  requestSurface: string | null | undefined
) {
  if (!requestSurface) {
    return "Unknown surface";
  }

  return REQUEST_SURFACE_LABELS[requestSurface] ?? requestSurface;
}

export function formatPublishedInvocationCacheStatusLabel(
  cacheStatus: string | null | undefined
) {
  if (!cacheStatus) {
    return "Unknown cache state";
  }

  return CACHE_STATUS_LABELS[cacheStatus] ?? cacheStatus;
}

export function formatPublishedRunStatusLabel(runStatus: string | null | undefined) {
  if (!runStatus) {
    return "Unknown run state";
  }

  return RUN_STATUS_LABELS[runStatus] ?? runStatus.replaceAll("_", " ");
}

export function formatPublishedInvocationOptionalRunStatus(
  runStatus: string | null | undefined,
  emptyLabel: string | null = "n/a"
) {
  return runStatus ? formatPublishedRunStatusLabel(runStatus) : emptyLabel;
}

export function listPublishedInvocationFacetCountLabels(
  items: PublishedEndpointInvocationFacetItem[] | null | undefined,
  formatter: (value: string) => string,
  limit?: number
) {
  const limitedItems = typeof limit === "number" ? (items ?? []).slice(0, limit) : (items ?? []);
  return limitedItems.map((item) => `${formatter(item.value)} ${item.count}`);
}

export function listPublishedInvocationApiKeyCountLabels(
  items: PublishedEndpointInvocationTimeBucketItem["api_key_counts"],
  {
    limit,
    prefix
  }: {
    limit?: number;
    prefix?: string | null;
  } = {}
) {
  const limitedItems = typeof limit === "number" ? items.slice(0, limit) : items;

  return limitedItems.map((item) => {
    const label = `${item.name ?? item.key_prefix ?? item.api_key_id} ${item.count}`;
    return prefix?.trim() ? `${prefix.trim()} ${label}` : label;
  });
}

export function formatPublishedInvocationCacheSurfaceMix(
  cacheStatusCounts: PublishedEndpointInvocationFacetItem[] | null | undefined
) {
  return ["hit", "miss", "bypass"]
    .map((cacheStatus) => {
      return `${formatPublishedInvocationCacheStatusLabel(cacheStatus)} ${getFacetCount(
        cacheStatusCounts,
        cacheStatus
      )}`;
    })
    .join(" / ");
}

export function formatPublishedInvocationRunStatusMix(
  runStatusCounts: PublishedEndpointInvocationFacetItem[] | null | undefined,
  emptyLabel = "n/a"
) {
  if (!runStatusCounts?.length) {
    return emptyLabel;
  }

  return runStatusCounts
    .map((item) => `${formatPublishedRunStatusLabel(item.value)} ${item.count}`)
    .join(" / ");
}

export function buildPublishedInvocationWaitingOverview({
  summary,
  runStatusCounts,
  reasonCounts
}: {
  summary?: PublishedEndpointInvocationSummary | null;
  runStatusCounts?: PublishedEndpointInvocationFacetItem[] | null;
  reasonCounts?: PublishedEndpointInvocationFacetItem[] | null;
}): PublishedInvocationWaitingOverview {
  const generalWaitingCount = getFacetCount(runStatusCounts, "waiting");
  const waitingInputCount = getFacetCount(runStatusCounts, "waiting_input");
  const callbackWaitingCount = getFacetCount(runStatusCounts, "waiting_callback");
  const activeWaitingCount = generalWaitingCount + waitingInputCount + callbackWaitingCount;
  const syncWaitingRejectedCount = getFacetCount(reasonCounts, "sync_waiting_unsupported");
  const lastRunStatusLabel = formatPublishedInvocationOptionalRunStatus(summary?.last_run_status, null);

  const chips: string[] = [];
  if (activeWaitingCount > 0) {
    chips.push(`${formatCountLabel(activeWaitingCount, "active waiting run")}`);
  }
  if (callbackWaitingCount > 0) {
    chips.push(`${formatCountLabel(callbackWaitingCount, "callback wait")}`);
  }
  if (waitingInputCount > 0) {
    chips.push(`${formatCountLabel(waitingInputCount, "approval/input wait")}`);
  }
  if (syncWaitingRejectedCount > 0) {
    chips.push(`${formatCountLabel(syncWaitingRejectedCount, "sync waiting rejection")}`);
  }
  if (lastRunStatusLabel) {
    chips.push(`latest ${lastRunStatusLabel}`);
  }

  if (activeWaitingCount > 0) {
    const blockers = joinFragments(
      [
        callbackWaitingCount > 0
          ? `${formatCountLabel(callbackWaitingCount, "run")} are still waiting on callback tickets or external tool responses`
          : null,
        waitingInputCount > 0
          ? `${formatCountLabel(waitingInputCount, "run")} are paused on approval or operator input`
          : null,
        generalWaitingCount > 0
          ? `${formatCountLabel(generalWaitingCount, "run")} are marked as generic waiting and should be checked in the latest invocation detail`
          : null
      ].filter((value): value is string => Boolean(value))
    );
    const detailParts = [
      blockers,
      syncWaitingRejectedCount > 0
        ? `${formatCountLabel(syncWaitingRejectedCount, "sync invocation")} were rejected because synchronous publish surfaces cannot stay in waiting.`
        : null,
      lastRunStatusLabel ? `Latest run status: ${lastRunStatusLabel}.` : null
    ].filter((value): value is string => Boolean(value));
    return {
      activeWaitingCount,
      callbackWaitingCount,
      waitingInputCount,
      generalWaitingCount,
      syncWaitingRejectedCount,
      lastRunStatusLabel,
      headline: `${formatCountLabel(activeWaitingCount, "publish invocation")} are still attached to the durable runtime waiting path.`,
      detail: detailParts.join(" "),
      chips
    };
  }

  if (syncWaitingRejectedCount > 0) {
    return {
      activeWaitingCount,
      callbackWaitingCount,
      waitingInputCount,
      generalWaitingCount,
      syncWaitingRejectedCount,
      lastRunStatusLabel,
      headline: `No active waiting runs remain, but ${formatCountLabel(syncWaitingRejectedCount, "sync publish invocation")} hit the waiting boundary.`,
      detail:
        "These requests reached a workflow that wanted to pause, but the synchronous publish surface could only reject the call. Prefer async routes or open a recent invocation detail to inspect the waiting lifecycle.",
      chips
    };
  }

  return {
    activeWaitingCount,
    callbackWaitingCount,
    waitingInputCount,
    generalWaitingCount,
    syncWaitingRejectedCount,
    lastRunStatusLabel,
    headline: "Current publish traffic does not show active waiting pressure.",
    detail: lastRunStatusLabel
      ? `The latest filtered run status is ${lastRunStatusLabel}, and no synchronous waiting boundary was hit in this slice.`
      : "The current audit slice has no waiting runs or synchronous waiting rejections to triage.",
    chips
  };
}

export function formatRateLimitPressure(
  requests: number,
  used: number
) {
  if (requests <= 0) {
    return {
      percentage: 0,
      label: "0%"
    };
  }

  const percentage = Math.min(Math.round((used / requests) * 100), 100);
  return {
    percentage,
    label: `${percentage}%`
  };
}

function findLatestApprovalEntry(entries: SensitiveAccessTimelineEntry[]) {
  return entries.find((entry) => entry.approval_ticket) ?? null;
}

export function buildPublishedInvocationInboxHref({
  invocation,
  callbackTickets,
  sensitiveAccessEntries
}: {
  invocation: PublishedEndpointInvocationItem;
  callbackTickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
}) {
  const latestApprovalEntry = findLatestApprovalEntry(sensitiveAccessEntries);
  if (
    callbackTickets.length === 0 &&
    sensitiveAccessEntries.length === 0 &&
    !invocation.run_waiting_lifecycle?.node_run_id
  ) {
    return null;
  }

  const resolvedRunId = latestApprovalEntry
    ? resolveSensitiveAccessTimelineEntryRunId(latestApprovalEntry, invocation.run_id ?? null)
    : invocation.run_id ?? null;

  return buildSensitiveAccessInboxHref({
    runId: resolvedRunId,
    nodeRunId:
      invocation.run_waiting_lifecycle?.node_run_id ??
      latestApprovalEntry?.request.node_run_id ??
      latestApprovalEntry?.approval_ticket?.node_run_id ??
      callbackTickets[0]?.node_run_id ??
      null,
    status: latestApprovalEntry?.approval_ticket?.status ?? null,
    waitingStatus: latestApprovalEntry?.approval_ticket?.waiting_status ?? null,
    accessRequestId: latestApprovalEntry?.request.id ?? null,
    approvalTicketId: latestApprovalEntry?.approval_ticket?.id ?? null
  });
}
export function buildBlockingPublishedInvocationInboxHref({
  runId,
  blockingNodeRunId,
  blockingSensitiveAccessEntries
}: {
  runId?: string | null;
  blockingNodeRunId?: string | null;
  blockingSensitiveAccessEntries: SensitiveAccessTimelineEntry[];
}) {
  const latestBlockingEntry = findLatestApprovalEntry(blockingSensitiveAccessEntries);
  if (!blockingNodeRunId && latestBlockingEntry === null) {
    return null;
  }

  const resolvedRunId = latestBlockingEntry
    ? resolveSensitiveAccessTimelineEntryRunId(latestBlockingEntry, runId ?? null)
    : runId ?? null;

  return buildSensitiveAccessInboxHref({
    runId: resolvedRunId,
    nodeRunId:
      blockingNodeRunId ??
      latestBlockingEntry?.request.node_run_id ??
      latestBlockingEntry?.approval_ticket?.node_run_id ??
      null,
    status: latestBlockingEntry?.approval_ticket?.status ?? null,
    waitingStatus: latestBlockingEntry?.approval_ticket?.waiting_status ?? null,
    accessRequestId: latestBlockingEntry?.request.id ?? null,
    approvalTicketId: latestBlockingEntry?.approval_ticket?.id ?? null
  });
}
