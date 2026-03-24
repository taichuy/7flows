import type {
  CallbackWaitingAutomationCheck,
  RecentRunEventCheck,
  SandboxReadinessCheck,
  SystemOverviewRecommendedAction
} from "@/lib/get-system-overview";
import type {
  OperatorFollowUpLinkSurface,
  OperatorRecommendedNextStepCandidate
} from "@/lib/operator-follow-up-presenters";
import { buildRuntimeActivityEventTraceLinkSurface } from "@/lib/runtime-activity-trace-links";
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
  traceLink: OperatorFollowUpLinkSurface | null;
  traceEventType: string | null;
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
  recentEvents?: RecentRunEventCheck[] | null;
  currentHref?: string | null;
  buildTraceEventTypes: (kind: string) => string[];
  traceHrefLabel: string;
  buildDetail: (args: { kind: string; impactedScope: string | null }) => string;
};

const SANDBOX_TRACE_EVENT_TYPES_BY_KIND: Record<string, string[]> = {
  execution_class_blocked: [
    "tool.execution.blocked",
    "node.execution.unavailable",
    "tool.execution.fallback",
    "node.execution.fallback",
    "tool.execution.dispatched",
    "node.execution.dispatched"
  ],
  backend_offline: [
    "tool.execution.blocked",
    "node.execution.unavailable",
    "tool.execution.fallback",
    "node.execution.fallback",
    "tool.execution.dispatched",
    "node.execution.dispatched"
  ],
  backend_degraded: [
    "tool.execution.fallback",
    "node.execution.fallback",
    "tool.execution.dispatched",
    "node.execution.dispatched",
    "tool.execution.blocked",
    "node.execution.unavailable"
  ],
  default: [
    "tool.execution.blocked",
    "node.execution.unavailable",
    "tool.execution.fallback",
    "node.execution.fallback",
    "tool.execution.dispatched",
    "node.execution.dispatched"
  ]
};

const CALLBACK_TRACE_EVENT_TYPES_BY_KIND: Record<string, string[]> = {
  automation_disabled: [
    "run.callback.ticket.issued",
    "tool.waiting",
    "run.resume.scheduled",
    "run.resume.requeued",
    "run.callback.ticket.expired",
    "run.callback.waiting.terminated"
  ],
  scheduler_unhealthy: [
    "run.resume.requeued",
    "run.resume.scheduled",
    "run.callback.ticket.expired",
    "run.callback.waiting.terminated",
    "run.callback.ticket.issued",
    "tool.waiting"
  ],
  default: [
    "run.callback.ticket.expired",
    "run.callback.waiting.terminated",
    "run.resume.requeued",
    "run.resume.scheduled",
    "run.callback.ticket.issued",
    "tool.waiting"
  ]
};

function joinNonEmpty(parts: Array<string | null | undefined>, separator = "；") {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);
}

function trimOrNull(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

function pickRecentTraceEvent(
  recentEvents: RecentRunEventCheck[] | null | undefined,
  prioritizedEventTypes: string[]
) {
  const normalizedRecentEvents = recentEvents ?? [];

  for (const eventType of prioritizedEventTypes) {
    const matchingEvent = normalizedRecentEvents.find(
      (event) =>
        trimOrNull(event.event_type) === eventType && trimOrNull(event.run_id)
    );

    if (matchingEvent) {
      return matchingEvent;
    }
  }

  return null;
}

function resolveSandboxTraceEventTypes(kind: string) {
  return (
    SANDBOX_TRACE_EVENT_TYPES_BY_KIND[kind] ?? SANDBOX_TRACE_EVENT_TYPES_BY_KIND.default
  );
}

function resolveCallbackTraceEventTypes(kind: string) {
  return (
    CALLBACK_TRACE_EVENT_TYPES_BY_KIND[kind] ?? CALLBACK_TRACE_EVENT_TYPES_BY_KIND.default
  );
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

export function shouldPreferSharedSandboxReadinessFollowUp({
  blockedExecution = false,
  hasExecutionBlockingReason = false,
  signals = []
}: {
  blockedExecution?: boolean;
  hasExecutionBlockingReason?: boolean;
  signals?: Array<string | null | undefined>;
}) {
  return (
    blockedExecution ||
    hasExecutionBlockingReason ||
    signals.some((signal) => messageMentionsSandboxExecution(signal))
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
  recentEvents,
  currentHref,
  buildTraceEventTypes,
  traceHrefLabel,
  buildDetail
}: SystemOverviewFollowUpShape): SystemOverviewFollowUpSurface | null {
  const action = normalizeRecommendedAction(recommendedAction);
  if (!action) {
    return null;
  }

  const impactedScope = formatSystemOverviewImpactedScope(affectedRunCount, affectedWorkflowCount);
  const kind = primaryBlockerKind ?? action.kind;
  const sampledTraceEvent = pickRecentTraceEvent(recentEvents, buildTraceEventTypes(kind));
  const traceLink = sampledTraceEvent
    ? buildRuntimeActivityEventTraceLinkSurface(sampledTraceEvent, {
        currentHref,
        hrefLabel: traceHrefLabel
      })
    : null;

  return {
    source,
    kind,
    detail: buildDetail({ kind, impactedScope }),
    href: action.href,
    hrefLabel: action.label,
    impactedScope,
    entryKey: action.entryKey,
    traceLink,
    traceEventType: sampledTraceEvent?.event_type ?? null
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
  > | null,
  options: {
    recentEvents?: RecentRunEventCheck[] | null;
    currentHref?: string | null;
  } = {}
): SystemOverviewFollowUpSurface | null {
  return buildSystemOverviewFollowUpSurface({
    source: "sandbox_readiness",
    affectedRunCount: readiness?.affected_run_count,
    affectedWorkflowCount: readiness?.affected_workflow_count,
    primaryBlockerKind: readiness?.primary_blocker_kind,
    recommendedAction: readiness?.recommended_action,
    recentEvents: options.recentEvents,
    currentHref: options.currentHref,
    buildTraceEventTypes: resolveSandboxTraceEventTypes,
    traceHrefLabel: "open sampled sandbox trace",
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
  > | null,
  options: {
    recentEvents?: RecentRunEventCheck[] | null;
    currentHref?: string | null;
  } = {}
): SystemOverviewFollowUpSurface | null {
  return buildSystemOverviewFollowUpSurface({
    source: "callback_waiting_automation",
    affectedRunCount: automation?.affected_run_count,
    affectedWorkflowCount: automation?.affected_workflow_count,
    primaryBlockerKind: automation?.primary_blocker_kind,
    recommendedAction: automation?.recommended_action,
    recentEvents: options.recentEvents,
    currentHref: options.currentHref,
    buildTraceEventTypes: resolveCallbackTraceEventTypes,
    traceHrefLabel: "open sampled callback trace",
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
  currentHref,
  recentEvents,
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
  currentHref?: string | null;
  recentEvents?: RecentRunEventCheck[] | null;
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
    const callbackSurface = buildCallbackWaitingAutomationSystemFollowUp(
      callbackWaitingAutomation,
      {
        currentHref,
        recentEvents
      }
    );
    if (callbackSurface) {
      return callbackSurface;
    }
  }

  if (sandboxActive) {
    return buildSandboxReadinessSystemFollowUp(sandboxReadiness, {
      currentHref,
      recentEvents
    });
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
