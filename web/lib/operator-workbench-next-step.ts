import type {
  CallbackWaitingAutomationCheck,
  RuntimeActivityCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type {
  SensitiveAccessInboxEntry,
  SensitiveAccessInboxSummary
} from "@/lib/get-sensitive-access";
import {
  buildOperatorInboxSliceCandidate,
  buildOperatorRecommendedNextStep,
  buildOperatorRunDetailCandidate,
  buildOperatorTraceSliceLinkSurface,
  type OperatorRecommendedNextStep,
  type OperatorRecommendedNextStepCandidate
} from "@/lib/operator-follow-up-presenters";
import {
  findSensitiveAccessPrimaryBacklogEntry,
  resolveSensitiveAccessPrimaryBacklog
} from "@/lib/sensitive-access-follow-up-presenters";
import { resolveSensitiveAccessInboxEntryActionScope } from "@/lib/sensitive-access-inbox-entry-scope";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import {
  buildCallbackWaitingAutomationFollowUpCandidate,
  buildSandboxReadinessFollowUpCandidate
} from "@/lib/system-overview-follow-up-presenters";

function normalizeRelativeHref(href?: string | null) {
  const normalized = href?.trim();
  if (!normalized) {
    return null;
  }

  const url = new URL(normalized, "https://sevenflows.local");
  const sortedParams = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }
    return leftKey.localeCompare(rightKey);
  });
  const params = new URLSearchParams();
  for (const [key, value] of sortedParams) {
    params.append(key, value);
  }

  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function isSelfHref(href?: string | null, currentHref?: string | null) {
  const normalizedHref = normalizeRelativeHref(href);
  const normalizedCurrentHref = normalizeRelativeHref(currentHref);

  return Boolean(normalizedHref && normalizedCurrentHref && normalizedHref === normalizedCurrentHref);
}

function dropSelfHrefCandidate(
  candidate: OperatorRecommendedNextStepCandidate | null,
  currentHref?: string | null
) {
  if (!candidate || !candidate.href || !isSelfHref(candidate.href, currentHref)) {
    return candidate;
  }
  return null;
}

function rehomeSelfHrefToRunDetail(
  candidate: OperatorRecommendedNextStepCandidate | null,
  {
    currentHref,
    runId,
    nodeRunId
  }: {
    currentHref?: string | null;
    runId?: string | null;
    nodeRunId?: string | null;
  }
) {
  if (!candidate) {
    return null;
  }
  if (!candidate.href || !isSelfHref(candidate.href, currentHref)) {
    return candidate;
  }
  if (!runId?.trim()) {
    return null;
  }

  const traceSliceLink = nodeRunId?.trim()
    ? buildOperatorTraceSliceLinkSurface({
        runId,
        nodeRunId,
        hrefLabel: "open focused trace slice"
      })
    : null;

  return buildOperatorRunDetailCandidate({
    active: candidate.active,
    runId,
    runHref: traceSliceLink?.href ?? null,
    label: candidate.label,
    detail: candidate.detail,
    fallbackDetail: candidate.fallback_detail,
    hrefLabel: traceSliceLink?.label ?? null
  });
}

function buildRunLibraryBacklogCandidate(
  summary: SensitiveAccessInboxSummary,
  currentHref: string
) {
  const backlog = resolveSensitiveAccessPrimaryBacklog({
    pendingApprovalCount: summary.pending_ticket_count,
    waitingResumeCount: summary.waiting_ticket_count,
    failedNotificationCount: summary.failed_notification_count,
    pendingNotificationCount: summary.pending_notification_count,
    rejectedApprovalCount: summary.rejected_ticket_count,
    expiredApprovalCount: summary.expired_ticket_count
  });
  if (!backlog) {
    return null;
  }

  const detail =
    backlog.kind === "pending_approval"
      ? `当前 ${backlog.count} 条 pending approval ticket 仍在 inbox；优先处理审批，再回到 run diagnostics 确认 waiting 是否恢复。`
      : backlog.kind === "waiting_resume"
        ? `当前 ${backlog.count} 条 waiting resume 仍在 inbox；先处理恢复链路，再回到 run diagnostics 观察 callback 进度。`
        : backlog.kind === "failed_notification"
          ? `当前 ${backlog.count} 条失败通知仍卡在 operator backlog；优先重试通知，再回到 run diagnostics 继续排障。`
          : backlog.kind === "pending_notification"
            ? `当前 ${backlog.count} 条 pending notification 仍待送达；先确认通知是否真正送出，再回到 run diagnostics 判断是否还要人工介入。`
            : `当前 ${backlog.count} 条 operator backlog 仍未收口；优先打开 inbox slice 继续处理。`;

  return dropSelfHrefCandidate(
    buildOperatorInboxSliceCandidate({
      active: true,
      href: backlog.href,
      label: backlog.countLabel,
      detail,
      fallbackDetail: detail
    }),
    currentHref
  );
}

function pickLatestWaitingRun(runtimeActivity: RuntimeActivityCheck) {
  return (
    runtimeActivity.recent_runs.find((run) =>
      ["waiting", "waiting_callback", "waiting_input", "running"].includes(run.status)
    ) ?? runtimeActivity.recent_runs[0] ?? null
  );
}

export function buildRunLibraryRecommendedNextStep({
  runtimeActivity,
  callbackWaitingAutomation,
  sandboxReadiness,
  sensitiveAccessSummary,
  currentHref = "/runs"
}: {
  runtimeActivity: RuntimeActivityCheck;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sensitiveAccessSummary: SensitiveAccessInboxSummary;
  currentHref?: string;
}): OperatorRecommendedNextStep | null {
  const latestWaitingRun = pickLatestWaitingRun(runtimeActivity);
  const backlogCandidate = buildRunLibraryBacklogCandidate(sensitiveAccessSummary, currentHref);
  const callbackCandidate = rehomeSelfHrefToRunDetail(
    buildCallbackWaitingAutomationFollowUpCandidate(
      callbackWaitingAutomation,
      "callback recovery"
    ),
    {
      currentHref,
      runId: latestWaitingRun?.id ?? null
    }
  );
  const sandboxCandidate = dropSelfHrefCandidate(
    buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
    currentHref
  );
  const latestRunCandidate = latestWaitingRun
    ? buildOperatorRunDetailCandidate({
        active: true,
        runId: latestWaitingRun.id,
        label: "latest run",
        detail:
          "当前没有新的 operator backlog 上浮；优先打开最新 run，确认 execution focus、waiting reason 与 callback 事实是否一致。",
        fallbackDetail:
          "优先打开最新 run，继续沿 execution focus、waiting reason 与 callback 事实排障。"
      })
    : null;

  return buildOperatorRecommendedNextStep({
    callback: backlogCandidate ?? callbackCandidate ?? latestRunCandidate,
    execution: sandboxCandidate
  });
}

function buildInboxEntryBacklogDetail(
  entry: SensitiveAccessInboxEntry,
  backlogKind: NonNullable<ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>>["kind"]
) {
  const resourceLabel = entry.resource?.label ?? entry.request?.resource_id ?? entry.ticket.id;

  switch (backlogKind) {
    case "pending_approval":
      return `当前 ${resourceLabel} 的审批票据仍是 operator backlog 首要阻断；先处理该票据，再确认 run 是否恢复。`;
    case "waiting_resume":
      return `当前 ${resourceLabel} 仍停在 waiting resume；优先打开对应 slice 观察 callback / resume 是否继续推进。`;
    case "failed_notification":
      return `当前 ${resourceLabel} 的通知仍失败；先处理该票据 slice 的通知补链，再确认 run follow-up。`;
    case "pending_notification":
      return `当前 ${resourceLabel} 的通知仍在排队；先确认派发状态，再判断是否需要人工介入。`;
    case "rejected_approval":
      return `当前 ${resourceLabel} 的审批已被拒绝；优先回看对应 slice，确认后续 run 或 workflow 的处置路径。`;
    case "expired_approval":
      return `当前 ${resourceLabel} 的审批票据已过期；优先回看对应 slice，决定是否重新发起审批或改走其他恢复路径。`;
    default:
      return `当前 ${resourceLabel} 仍在 operator backlog；优先打开对应 slice 继续处理。`;
  }
}

function buildInboxEntryBacklogLabel(
  backlogKind: NonNullable<ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>>["kind"]
) {
  switch (backlogKind) {
    case "pending_approval":
      return "approval blocker";
    case "waiting_resume":
      return "callback waiting";
    case "failed_notification":
      return "failed notification";
    case "pending_notification":
      return "pending notification";
    case "rejected_approval":
      return "rejected approval";
    case "expired_approval":
      return "expired approval";
    default:
      return "operator backlog";
  }
}

function buildSensitiveAccessInboxEntryCandidate({
  entry,
  backlogKind,
  currentHref
}: {
  entry: SensitiveAccessInboxEntry;
  backlogKind: NonNullable<ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>>["kind"];
  currentHref: string;
}) {
  const actionScope = resolveSensitiveAccessInboxEntryActionScope(entry);
  const detail = buildInboxEntryBacklogDetail(entry, backlogKind);
  const label = buildInboxEntryBacklogLabel(backlogKind);
  const specificInboxHref = buildSensitiveAccessInboxHref({
    status: entry.ticket.status,
    waitingStatus: entry.ticket.waiting_status,
    notificationStatus:
      backlogKind === "failed_notification"
        ? "failed"
        : backlogKind === "pending_notification"
          ? "pending"
          : null,
    runId: actionScope.runId,
    nodeRunId: actionScope.nodeRunId,
    accessRequestId: entry.request?.id ?? null,
    approvalTicketId: entry.ticket.id
  });

  return rehomeSelfHrefToRunDetail(
    buildOperatorInboxSliceCandidate({
      active: true,
      href: specificInboxHref,
      label,
      detail,
      fallbackDetail: detail,
      hrefLabel: "open exact inbox slice"
    }),
    {
      currentHref,
      runId: actionScope.runId,
      nodeRunId: actionScope.nodeRunId
    }
  );
}

export function buildSensitiveAccessInboxRecommendedNextStep({
  entries,
  summary,
  callbackWaitingAutomation,
  sandboxReadiness,
  currentHref = "/sensitive-access"
}: {
  entries: SensitiveAccessInboxEntry[];
  summary: SensitiveAccessInboxSummary;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  currentHref?: string;
}): OperatorRecommendedNextStep | null {
  const backlog = resolveSensitiveAccessPrimaryBacklog({
    pendingApprovalCount: summary.pending_ticket_count,
    waitingResumeCount: summary.waiting_ticket_count,
    failedNotificationCount: summary.failed_notification_count,
    pendingNotificationCount: summary.pending_notification_count,
    rejectedApprovalCount: summary.rejected_ticket_count,
    expiredApprovalCount: summary.expired_ticket_count
  });

  if (!backlog && entries.length === 0) {
    return null;
  }

  const backlogEntry = backlog
    ? findSensitiveAccessPrimaryBacklogEntry(entries, backlog.kind)
    : null;
  const backlogEntryCandidate = backlogEntry && backlog
    ? buildSensitiveAccessInboxEntryCandidate({
        entry: backlogEntry,
        backlogKind: backlog.kind,
        currentHref
      })
    : null;
  const summaryBacklogCandidate = backlog
    ? dropSelfHrefCandidate(
        buildOperatorInboxSliceCandidate({
          active: true,
          href: backlog.href,
          label: backlog.countLabel,
          detail: `当前 ${backlog.count} 条 ${backlog.countLabel} 仍在 operator inbox；优先收掉这批 backlog，再回到 run 诊断或 workflow 列表继续排障。`,
          fallbackDetail:
            "优先收掉当前 operator backlog，再回到 run 诊断或 workflow 列表继续排障。"
        }),
        currentHref
      )
    : null;
  const callbackCandidate = dropSelfHrefCandidate(
    buildCallbackWaitingAutomationFollowUpCandidate(
      callbackWaitingAutomation,
      "callback recovery"
    ),
    currentHref
  );
  const sandboxCandidate = dropSelfHrefCandidate(
    buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
    currentHref
  );

  return buildOperatorRecommendedNextStep({
    callback: backlogEntryCandidate ?? summaryBacklogCandidate ?? callbackCandidate,
    execution: sandboxCandidate
  });
}
