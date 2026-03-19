"use server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type {
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult,
  SensitiveAccessBulkSkipSummary
} from "@/lib/get-sensitive-access";
import {
  formatBulkOperatorOutcomeExplanationMessage,
  formatBulkApprovalDecisionResultMessage,
  formatBulkNotificationRetryResultMessage,
  formatOperatorOutcomeExplanationMessage,
  formatApprovalDecisionResultMessage,
  formatNotificationRetryResultMessage,
  summarizeBulkRunFollowUp
} from "@/lib/operator-action-result-presenters";
import {
  buildActionCallbackBlockerDeltaSummary,
  fetchScopedCallbackBlockerSnapshot
} from "./callback-blocker-action-summary";

import {
  revalidateOperatorFollowUpByRunIds,
  revalidateOperatorFollowUpPaths
} from "./operator-follow-up-revalidation";
import {
  fetchRunSnapshot,
  fetchRunSnapshots,
  normalizeOperatorRunSnapshot,
  type OperatorRunSnapshotBody
} from "./run-snapshot";
import type { OperatorInlineActionResultState } from "@/lib/operator-inline-action-feedback";

export type DecideSensitiveAccessApprovalTicketState = OperatorInlineActionResultState & {
  status: "idle" | "success" | "error";
  message: string;
  ticketId: string;
};

export type RetrySensitiveAccessNotificationDispatchState = OperatorInlineActionResultState & {
  status: "idle" | "success" | "error";
  message: string;
  dispatchId: string;
  target: string;
};

type OutcomeExplanationBody = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

type CallbackBlockerDeltaResponseBody = {
  sampled_scope_count?: number;
  changed_scope_count?: number;
  cleared_scope_count?: number;
  fully_cleared_scope_count?: number;
  still_blocked_scope_count?: number;
  summary?: string | null;
};

type ApprovalDecisionResponseBody = {
  detail?: string;
  outcome_explanation?: OutcomeExplanationBody | null;
  callback_blocker_delta?: CallbackBlockerDeltaResponseBody | null;
  request?: {
    decision_label?: string | null;
    reason_label?: string | null;
    policy_summary?: string | null;
  };
  approval_ticket?: {
    waiting_status?: "waiting" | "resumed" | "failed";
  };
  run_snapshot?: OperatorRunSnapshotBody | null;
  run_follow_up?: OperatorRunFollowUpBody | null;
};

type NotificationRetryResponseBody = {
  detail?: string;
  outcome_explanation?: OutcomeExplanationBody | null;
  callback_blocker_delta?: CallbackBlockerDeltaResponseBody | null;
  approval_ticket?: {
    waiting_status?: "waiting" | "resumed" | "failed";
  };
  notification?: {
    status?: "pending" | "delivered" | "failed";
    error?: string | null;
    target?: string | null;
  };
  run_snapshot?: OperatorRunSnapshotBody | null;
  run_follow_up?: OperatorRunFollowUpBody | null;
};

type OperatorRunFollowUpBody = {
  affected_run_count?: number;
  sampled_run_count?: number;
  waiting_run_count?: number;
  running_run_count?: number;
  succeeded_run_count?: number;
  failed_run_count?: number;
  unknown_run_count?: number;
  explanation?: OutcomeExplanationBody | null;
  sampled_runs?: Array<{
    run_id: string;
    snapshot?: OperatorRunSnapshotBody | null;
  }>;
};

type ApprovalTicketBulkDecisionResponseBody = {
  requested_count: number;
  decided_count: number;
  skipped_count: number;
  outcome_explanation?: OutcomeExplanationBody | null;
  callback_blocker_delta?: CallbackBlockerDeltaResponseBody | null;
  decided_items: Array<{
    id: string;
    run_id?: string | null;
    node_run_id?: string | null;
  }>;
  skipped_reason_summary: SensitiveAccessBulkSkipSummary[];
  run_follow_up?: OperatorRunFollowUpBody | null;
};

type NotificationDispatchBulkRetryResponseBody = {
  requested_count: number;
  retried_count: number;
  skipped_count: number;
  outcome_explanation?: OutcomeExplanationBody | null;
  callback_blocker_delta?: CallbackBlockerDeltaResponseBody | null;
  retried_items: Array<{
    approval_ticket: {
      id: string;
      run_id?: string | null;
      node_run_id?: string | null;
    };
  }>;
  skipped_reason_summary: SensitiveAccessBulkSkipSummary[];
  run_follow_up?: OperatorRunFollowUpBody | null;
};

type BulkApprovalScopeItem = {
  ticketId: string;
  runId?: string | null;
  nodeRunId?: string | null;
};

type BulkNotificationScopeItem = {
  dispatchId: string;
  approvalTicketId?: string | null;
  runId?: string | null;
  nodeRunId?: string | null;
};

function buildBulkSkipSummaryMessage(summary: SensitiveAccessBulkSkipSummary[]) {
  if (summary.length === 0) {
    return null;
  }

  return `跳过原因：${summary.map((item) => `${item.reason} ${item.count}`).join("、")}。`;
}

function createEmptyBulkResultMetrics() {
  return {
    affectedRunCount: 0,
    sampledRunCount: 0,
    waitingRunCount: 0,
    runningRunCount: 0,
    succeededRunCount: 0,
    failedRunCount: 0,
    unknownRunCount: 0,
    blockerSampleCount: 0,
    blockerChangedCount: 0,
    blockerClearedCount: 0,
    blockerFullyClearedCount: 0,
    blockerStillBlockedCount: 0
  };
}

const toRunSnapshot = normalizeOperatorRunSnapshot;

function toBulkRunSamples(summary?: OperatorRunFollowUpBody | null) {
  return (summary?.sampled_runs ?? []).map((item) => ({
    runId: item.run_id,
    snapshot: toRunSnapshot(item.snapshot)
  }));
}

function toBulkRunFollowUpSummary(summary?: OperatorRunFollowUpBody | null) {
  if (!summary) {
    return null;
  }

  return {
    affectedRunCount: summary.affected_run_count ?? 0,
    sampledRunCount: summary.sampled_run_count ?? 0,
    waitingRunCount: summary.waiting_run_count ?? 0,
    runningRunCount: summary.running_run_count ?? 0,
    succeededRunCount: summary.succeeded_run_count ?? 0,
    failedRunCount: summary.failed_run_count ?? 0,
    unknownRunCount: summary.unknown_run_count ?? 0
  };
}

async function buildBulkRunFollowUpMetrics(runIds: Array<string | null | undefined>) {
  const normalizedRunIds = [...new Set(runIds.map((item) => item?.trim()).filter(Boolean))];
  const sampledRuns = await fetchRunSnapshots(normalizedRunIds);
  const followUpSummary = summarizeBulkRunFollowUp({
    affectedRunCount: normalizedRunIds.length,
    sampledRuns
  });

  return {
    sampledRuns,
    followUpSummary
  };
}

function normalizeBulkApprovalScopeItems(items: BulkApprovalScopeItem[]) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      ticketId: item.ticketId.trim(),
      runId: item.runId?.trim() || null,
      nodeRunId: item.nodeRunId?.trim() || null
    }))
    .filter((item) => {
      if (!item.ticketId || seen.has(item.ticketId)) {
        return false;
      }
      seen.add(item.ticketId);
      return true;
    });
}

function normalizeBulkNotificationScopeItems(items: BulkNotificationScopeItem[]) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      dispatchId: item.dispatchId.trim(),
      approvalTicketId: item.approvalTicketId?.trim() || null,
      runId: item.runId?.trim() || null,
      nodeRunId: item.nodeRunId?.trim() || null
    }))
    .filter((item) => {
      if (!item.dispatchId || seen.has(item.dispatchId)) {
        return false;
      }
      seen.add(item.dispatchId);
      return true;
    });
}

export async function decideSensitiveAccessApprovalTicket(
  _: DecideSensitiveAccessApprovalTicketState,
  formData: FormData
): Promise<DecideSensitiveAccessApprovalTicketState> {
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  const nodeRunId = String(formData.get("nodeRunId") ?? "").trim();
  const decision = String(formData.get("status") ?? "").trim();
  const approvedBy = String(formData.get("approvedBy") ?? "").trim();

  if (!ticketId || (decision !== "approved" && decision !== "rejected") || !approvedBy) {
    return {
      status: "error",
      message: "缺少审批决策所需信息。",
      ticketId
    };
  }

  try {
    const beforeBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const response = await fetch(
      `${getApiBaseUrl()}/api/sensitive-access/approval-tickets/${encodeURIComponent(ticketId)}/decision`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: decision,
          approved_by: approvedBy
        }),
        cache: "no-store"
      }
    );

    const body = (await response.json().catch(() => null)) as ApprovalDecisionResponseBody | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "审批决策失败。",
        ticketId
      };
    }

    const runSnapshot = toRunSnapshot(body?.run_snapshot) ?? (await fetchRunSnapshot(runId));
    revalidateOperatorFollowUpPaths({
      runIds: [runId],
      workflowIds: [runSnapshot?.workflowId]
    });
    const afterBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const blockerDeltaSummary = buildActionCallbackBlockerDeltaSummary({
      backendSummary: body?.callback_blocker_delta?.summary,
      before: beforeBlockers,
      after: afterBlockers
    });

    return {
      status: "success",
      message: formatOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        blockerDeltaSummary,
        runSnapshot,
        fallback: formatApprovalDecisionResultMessage(decision as "approved" | "rejected", {
          waitingStatus: body?.approval_ticket?.waiting_status,
          decisionLabel: body?.request?.decision_label,
          reasonLabel: body?.request?.reason_label,
          policySummary: body?.request?.policy_summary,
          blockerDeltaSummary,
          runSnapshot
        })
      }),
      outcomeExplanation: body?.outcome_explanation ?? null,
      runFollowUpExplanation: body?.run_follow_up?.explanation ?? null,
      blockerDeltaSummary,
      runSnapshot,
      ticketId
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端提交审批决策。",
      ticketId
    };
  }
}

export async function retrySensitiveAccessNotificationDispatch(
  _: RetrySensitiveAccessNotificationDispatchState,
  formData: FormData
): Promise<RetrySensitiveAccessNotificationDispatchState> {
  const dispatchId = String(formData.get("dispatchId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  const nodeRunId = String(formData.get("nodeRunId") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();

  if (!dispatchId) {
    return {
      status: "error",
      message: "缺少通知重试所需的 dispatch 标识。",
      dispatchId,
      target
    };
  }

  try {
    const beforeBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const response = await fetch(
      `${getApiBaseUrl()}/api/sensitive-access/notification-dispatches/${encodeURIComponent(dispatchId)}/retry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          target: target || null
        }),
        cache: "no-store"
      }
    );

    const body = (await response.json().catch(() => null)) as NotificationRetryResponseBody | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "通知重试失败。",
        dispatchId,
        target
      };
    }

    const runSnapshot = toRunSnapshot(body?.run_snapshot) ?? (await fetchRunSnapshot(runId));
    revalidateOperatorFollowUpPaths({
      runIds: [runId],
      workflowIds: [runSnapshot?.workflowId]
    });
    const afterBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const blockerDeltaSummary = buildActionCallbackBlockerDeltaSummary({
      backendSummary: body?.callback_blocker_delta?.summary,
      before: beforeBlockers,
      after: afterBlockers
    });
    const effectiveTarget =
      typeof body?.notification?.target === "string" && body.notification.target.trim().length > 0
        ? body.notification.target.trim()
        : target;

    return {
      status: "success",
      message: formatOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        blockerDeltaSummary,
        runSnapshot,
        fallback: formatNotificationRetryResultMessage({
          status: body?.notification?.status,
          error: body?.notification?.error,
          target: effectiveTarget,
          waitingStatus: body?.approval_ticket?.waiting_status,
          blockerDeltaSummary,
          runSnapshot
        })
      }),
      outcomeExplanation: body?.outcome_explanation ?? null,
      runFollowUpExplanation: body?.run_follow_up?.explanation ?? null,
      blockerDeltaSummary,
      runSnapshot,
      dispatchId,
      target: effectiveTarget
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端执行通知重试。",
      dispatchId,
      target
    };
  }
}

export async function bulkDecideSensitiveAccessApprovalTickets(input: {
  tickets: BulkApprovalScopeItem[];
  status: Extract<SensitiveAccessBulkAction, "approved" | "rejected">;
  approvedBy: string;
}): Promise<SensitiveAccessBulkActionResult> {
  const tickets = normalizeBulkApprovalScopeItems(input.tickets);
  const ticketIds = tickets.map((item) => item.ticketId);
  const approvedBy = input.approvedBy.trim();

  if (ticketIds.length === 0 || !approvedBy) {
    return {
      action: input.status,
      status: "error",
      message: "缺少批量审批所需的信息。",
      requestedCount: ticketIds.length,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: [],
      ...createEmptyBulkResultMetrics()
    };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/sensitive-access/approval-tickets/bulk-decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: input.status,
        approved_by: approvedBy,
        ticket_ids: ticketIds
      }),
      cache: "no-store"
    });

    const body = (await response.json().catch(() => null)) as
      | ({ detail?: string } & Partial<ApprovalTicketBulkDecisionResponseBody>)
      | null;

    if (!response.ok) {
      return {
        action: input.status,
        status: "error",
        message: body?.detail ?? "批量审批失败。",
        requestedCount: ticketIds.length,
        updatedCount: 0,
        skippedCount: 0,
        skippedReasonSummary: [],
        ...createEmptyBulkResultMetrics()
      };
    }

    const updatedCount = body?.decided_count ?? 0;
    const skippedCount = body?.skipped_count ?? 0;
    const skippedReasonSummary = body?.skipped_reason_summary ?? [];
    const affectedRunIds = body?.decided_items?.map((item) => item.run_id) ?? [];
    await revalidateOperatorFollowUpByRunIds(affectedRunIds);
    const backendSampledRuns = toBulkRunSamples(body?.run_follow_up);
    const backendFollowUpSummary = toBulkRunFollowUpSummary(body?.run_follow_up);
    const { sampledRuns, followUpSummary } = body?.run_follow_up
      ? {
          sampledRuns: backendSampledRuns,
          followUpSummary:
            backendFollowUpSummary ??
            summarizeBulkRunFollowUp({
              affectedRunCount: body.run_follow_up.affected_run_count ?? affectedRunIds.length,
              sampledRuns: backendSampledRuns
            })
        }
      : await buildBulkRunFollowUpMetrics(affectedRunIds);
    const blockerDelta = body?.callback_blocker_delta;

    return {
      action: input.status,
      status: "success",
      message: formatBulkOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        blockerDeltaSummary: blockerDelta?.summary,
        affectedRunCount: followUpSummary.affectedRunCount,
        sampledRuns,
        fallback: formatBulkApprovalDecisionResultMessage({
          decision: input.status,
          updatedCount,
          skippedCount,
          skippedSummary: buildBulkSkipSummaryMessage(skippedReasonSummary),
          affectedRunCount: followUpSummary.affectedRunCount,
          sampledRuns,
          blockerDeltaSummary: blockerDelta?.summary
        })
      }),
      outcomeExplanation: body?.outcome_explanation ?? null,
      runFollowUpExplanation: body?.run_follow_up?.explanation ?? null,
      blockerDeltaSummary: blockerDelta?.summary ?? null,
      requestedCount: body?.requested_count ?? ticketIds.length,
      updatedCount,
      skippedCount,
      skippedReasonSummary,
      blockerSampleCount: blockerDelta?.sampled_scope_count ?? 0,
      blockerChangedCount: blockerDelta?.changed_scope_count ?? 0,
      blockerClearedCount: blockerDelta?.cleared_scope_count ?? 0,
      blockerFullyClearedCount: blockerDelta?.fully_cleared_scope_count ?? 0,
      blockerStillBlockedCount: blockerDelta?.still_blocked_scope_count ?? 0,
      sampledRuns,
      ...followUpSummary
    };
  } catch {
    return {
      action: input.status,
      status: "error",
      message: "无法连接后端执行批量审批。",
      requestedCount: ticketIds.length,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: [],
      ...createEmptyBulkResultMetrics()
    };
  }
}

export async function bulkRetrySensitiveAccessNotificationDispatches(input: {
  dispatches: BulkNotificationScopeItem[];
}): Promise<SensitiveAccessBulkActionResult> {
  const dispatches = normalizeBulkNotificationScopeItems(input.dispatches);
  const dispatchIds = dispatches.map((item) => item.dispatchId);

  if (dispatchIds.length === 0) {
    return {
      action: "retry",
      status: "error",
      message: "缺少批量通知重试所需的信息。",
      requestedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: [],
      ...createEmptyBulkResultMetrics()
    };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/sensitive-access/notification-dispatches/bulk-retry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ dispatch_ids: dispatchIds }),
      cache: "no-store"
    });

    const body = (await response.json().catch(() => null)) as
      | ({ detail?: string } & Partial<NotificationDispatchBulkRetryResponseBody>)
      | null;

    if (!response.ok) {
      return {
        action: "retry",
        status: "error",
        message: body?.detail ?? "批量通知重试失败。",
        requestedCount: dispatchIds.length,
        updatedCount: 0,
        skippedCount: 0,
        skippedReasonSummary: [],
        ...createEmptyBulkResultMetrics()
      };
    }

    const updatedCount = body?.retried_count ?? 0;
    const skippedCount = body?.skipped_count ?? 0;
    const skippedReasonSummary = body?.skipped_reason_summary ?? [];
    const affectedRunIds = body?.retried_items?.map((item) => item.approval_ticket.run_id) ?? [];
    await revalidateOperatorFollowUpByRunIds(affectedRunIds);
    const backendSampledRuns = toBulkRunSamples(body?.run_follow_up);
    const backendFollowUpSummary = toBulkRunFollowUpSummary(body?.run_follow_up);
    const { sampledRuns, followUpSummary } = body?.run_follow_up
      ? {
          sampledRuns: backendSampledRuns,
          followUpSummary:
            backendFollowUpSummary ??
            summarizeBulkRunFollowUp({
              affectedRunCount: body.run_follow_up.affected_run_count ?? affectedRunIds.length,
              sampledRuns: backendSampledRuns
            })
        }
      : await buildBulkRunFollowUpMetrics(affectedRunIds);
    const blockerDelta = body?.callback_blocker_delta;

    return {
      action: "retry",
      status: "success",
      message: formatBulkOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        blockerDeltaSummary: blockerDelta?.summary,
        affectedRunCount: followUpSummary.affectedRunCount,
        sampledRuns,
        fallback: formatBulkNotificationRetryResultMessage({
          updatedCount,
          skippedCount,
          skippedSummary: buildBulkSkipSummaryMessage(skippedReasonSummary),
          affectedRunCount: followUpSummary.affectedRunCount,
          sampledRuns,
          blockerDeltaSummary: blockerDelta?.summary
        })
      }),
      outcomeExplanation: body?.outcome_explanation ?? null,
      runFollowUpExplanation: body?.run_follow_up?.explanation ?? null,
      blockerDeltaSummary: blockerDelta?.summary ?? null,
      requestedCount: body?.requested_count ?? dispatchIds.length,
      updatedCount,
      skippedCount,
      skippedReasonSummary,
      blockerSampleCount: blockerDelta?.sampled_scope_count ?? 0,
      blockerChangedCount: blockerDelta?.changed_scope_count ?? 0,
      blockerClearedCount: blockerDelta?.cleared_scope_count ?? 0,
      blockerFullyClearedCount: blockerDelta?.fully_cleared_scope_count ?? 0,
      blockerStillBlockedCount: blockerDelta?.still_blocked_scope_count ?? 0,
      sampledRuns,
      ...followUpSummary
    };
  } catch {
    return {
      action: "retry",
      status: "error",
      message: "无法连接后端执行批量通知重试。",
      requestedCount: dispatchIds.length,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: [],
      ...createEmptyBulkResultMetrics()
    };
  }
}
