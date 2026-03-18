"use server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  fetchCallbackBlockerSnapshot,
  fetchCallbackBlockerSnapshots,
  formatCallbackBlockerDeltaSummary,
  summarizeBulkCallbackBlockerDelta
} from "@/lib/callback-blocker-follow-up";
import type {
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult,
  SensitiveAccessBulkSkipSummary
} from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
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
  revalidateOperatorFollowUpByRunIds,
  revalidateOperatorFollowUpPaths
} from "./operator-follow-up-revalidation";
import { fetchRunSnapshot, fetchRunSnapshots } from "./run-snapshot";

export type DecideSensitiveAccessApprovalTicketState = {
  status: "idle" | "success" | "error";
  message: string;
  ticketId: string;
};

export type RetrySensitiveAccessNotificationDispatchState = {
  status: "idle" | "success" | "error";
  message: string;
  dispatchId: string;
  target: string;
};

type ApprovalDecisionResponseBody = {
  detail?: string;
  outcome_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  request?: {
    decision_label?: string | null;
    reason_label?: string | null;
    policy_summary?: string | null;
  };
  approval_ticket?: {
    waiting_status?: "waiting" | "resumed" | "failed";
  };
  run_snapshot?: OperatorRunSnapshotBody | null;
};

type NotificationRetryResponseBody = {
  detail?: string;
  outcome_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  approval_ticket?: {
    waiting_status?: "waiting" | "resumed" | "failed";
  };
  notification?: {
    status?: "pending" | "delivered" | "failed";
    error?: string | null;
    target?: string | null;
  };
  run_snapshot?: OperatorRunSnapshotBody | null;
};

type OperatorRunSnapshotBody = {
  workflow_id?: string | null;
  status?: string | null;
  current_node_id?: string | null;
  waiting_reason?: string | null;
  execution_focus_reason?: string | null;
  execution_focus_node_id?: string | null;
  execution_focus_node_run_id?: string | null;
  execution_focus_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
};

type OperatorRunFollowUpBody = {
  affected_run_count?: number;
  sampled_run_count?: number;
  waiting_run_count?: number;
  running_run_count?: number;
  succeeded_run_count?: number;
  failed_run_count?: number;
  unknown_run_count?: number;
  sampled_runs?: Array<{
    run_id: string;
    snapshot?: OperatorRunSnapshotBody | null;
  }>;
};

type ApprovalTicketBulkDecisionResponseBody = {
  requested_count: number;
  decided_count: number;
  skipped_count: number;
  outcome_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  decided_items: Array<{
    id: string;
    run_id?: string | null;
  }>;
  skipped_reason_summary: SensitiveAccessBulkSkipSummary[];
  run_follow_up?: OperatorRunFollowUpBody | null;
};

type NotificationDispatchBulkRetryResponseBody = {
  requested_count: number;
  retried_count: number;
  skipped_count: number;
  outcome_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  retried_items: Array<{
    approval_ticket: {
      id: string;
      run_id?: string | null;
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

function toRunSnapshot(snapshot?: OperatorRunSnapshotBody | null) {
  if (!snapshot) {
    return null;
  }

  return {
    status: snapshot.status ?? null,
    workflowId: snapshot.workflow_id ?? null,
    currentNodeId: snapshot.current_node_id ?? null,
    waitingReason: snapshot.waiting_reason ?? null,
    executionFocusReason: snapshot.execution_focus_reason ?? null,
    executionFocusNodeId: snapshot.execution_focus_node_id ?? null,
    executionFocusNodeRunId: snapshot.execution_focus_node_run_id ?? null,
    executionFocusExplanation: snapshot.execution_focus_explanation
      ? {
          primary_signal: snapshot.execution_focus_explanation.primary_signal ?? null,
          follow_up: snapshot.execution_focus_explanation.follow_up ?? null
        }
      : null
  };
}

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

function buildBlockerScopeKey(runId: string | null, nodeRunId: string | null) {
  return `${runId ?? ""}::${nodeRunId ?? ""}`;
}

function filterBlockerSnapshotsByScope(
  snapshots: Awaited<ReturnType<typeof fetchCallbackBlockerSnapshots>>,
  scopes: Array<{ runId?: string | null; nodeRunId?: string | null }>
) {
  const allowedKeys = new Set(
    scopes
      .map((scope) => buildBlockerScopeKey(scope.runId?.trim() || null, scope.nodeRunId?.trim() || null))
      .filter((key) => key !== "::")
  );
  return snapshots.filter((item) =>
    allowedKeys.has(buildBlockerScopeKey(item.runId, item.nodeRunId?.trim() || null))
  );
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
    const callbackWaitingAutomation = (await getSystemOverview()).callback_waiting_automation;
    const beforeBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation
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
    const afterBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation
    });

    return {
      status: "success",
      message: formatOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        blockerDeltaSummary: formatCallbackBlockerDeltaSummary({
          before: beforeBlockers,
          after: afterBlockers
        }),
        runSnapshot,
        fallback: formatApprovalDecisionResultMessage(decision as "approved" | "rejected", {
          waitingStatus: body?.approval_ticket?.waiting_status,
          decisionLabel: body?.request?.decision_label,
          reasonLabel: body?.request?.reason_label,
          policySummary: body?.request?.policy_summary,
          blockerDeltaSummary: formatCallbackBlockerDeltaSummary({
            before: beforeBlockers,
            after: afterBlockers
          }),
          runSnapshot
        })
      }),
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
    const callbackWaitingAutomation = (await getSystemOverview()).callback_waiting_automation;
    const beforeBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation
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
    const afterBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation
    });
    const effectiveTarget =
      typeof body?.notification?.target === "string" && body.notification.target.trim().length > 0
        ? body.notification.target.trim()
        : target;

    return {
      status: "success",
      message: formatOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        blockerDeltaSummary: formatCallbackBlockerDeltaSummary({
          before: beforeBlockers,
          after: afterBlockers
        }),
        runSnapshot,
        fallback: formatNotificationRetryResultMessage({
          status: body?.notification?.status,
          error: body?.notification?.error,
          target: effectiveTarget,
          waitingStatus: body?.approval_ticket?.waiting_status,
          blockerDeltaSummary: formatCallbackBlockerDeltaSummary({
            before: beforeBlockers,
            after: afterBlockers
          }),
          runSnapshot
        })
      }),
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
  const candidateBlockerScopes = tickets.map((item) => ({
    runId: item.runId,
    nodeRunId: item.nodeRunId
  }));
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
    const beforeAutomation = (await getSystemOverview()).callback_waiting_automation;
    const beforeCandidateBlockers = await fetchCallbackBlockerSnapshots(
      candidateBlockerScopes,
      3,
      beforeAutomation
    );
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
    const updatedTicketIds = new Set(body?.decided_items?.map((item) => item.id) ?? []);
    const blockerScopes = tickets
      .filter((item) => updatedTicketIds.has(item.ticketId))
      .map((item) => ({
        runId: item.runId,
        nodeRunId: item.nodeRunId
      }));
    const beforeBlockers = filterBlockerSnapshotsByScope(beforeCandidateBlockers, blockerScopes);
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
    const afterAutomation = (await getSystemOverview()).callback_waiting_automation;
    const afterBlockers = await fetchCallbackBlockerSnapshots(
      blockerScopes,
      3,
      afterAutomation
    );
    const blockerDelta = summarizeBulkCallbackBlockerDelta({
      before: beforeBlockers,
      after: afterBlockers
    });

    return {
      action: input.status,
      status: "success",
      message: formatBulkOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        blockerDeltaSummary: blockerDelta.summary,
        affectedRunCount: followUpSummary.affectedRunCount,
        sampledRuns,
        fallback: formatBulkApprovalDecisionResultMessage({
          decision: input.status,
          updatedCount,
          skippedCount,
          skippedSummary: buildBulkSkipSummaryMessage(skippedReasonSummary),
          affectedRunCount: followUpSummary.affectedRunCount,
          sampledRuns,
          blockerDeltaSummary: blockerDelta.summary
        })
      }),
      requestedCount: body?.requested_count ?? ticketIds.length,
      updatedCount,
      skippedCount,
      skippedReasonSummary,
      blockerSampleCount: blockerDelta.sampledScopeCount,
      blockerChangedCount: blockerDelta.changedScopeCount,
      blockerClearedCount: blockerDelta.clearedScopeCount,
      blockerFullyClearedCount: blockerDelta.fullyClearedScopeCount,
      blockerStillBlockedCount: blockerDelta.stillBlockedScopeCount,
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
  const candidateBlockerScopes = dispatches.map((item) => ({
    runId: item.runId,
    nodeRunId: item.nodeRunId
  }));

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
    const beforeAutomation = (await getSystemOverview()).callback_waiting_automation;
    const beforeCandidateBlockers = await fetchCallbackBlockerSnapshots(
      candidateBlockerScopes,
      3,
      beforeAutomation
    );
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
    const updatedTicketIds = new Set(
      body?.retried_items?.map((item) => item.approval_ticket.id) ?? []
    );
    const blockerScopes = dispatches
      .filter(
        (item) => item.approvalTicketId && updatedTicketIds.has(item.approvalTicketId)
      )
      .map((item) => ({
        runId: item.runId,
        nodeRunId: item.nodeRunId
      }));
    const beforeBlockers = filterBlockerSnapshotsByScope(beforeCandidateBlockers, blockerScopes);
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
    const afterAutomation = (await getSystemOverview()).callback_waiting_automation;
    const afterBlockers = await fetchCallbackBlockerSnapshots(
      blockerScopes,
      3,
      afterAutomation
    );
    const blockerDelta = summarizeBulkCallbackBlockerDelta({
      before: beforeBlockers,
      after: afterBlockers
    });

    return {
      action: "retry",
      status: "success",
      message: formatBulkOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        blockerDeltaSummary: blockerDelta.summary,
        affectedRunCount: followUpSummary.affectedRunCount,
        sampledRuns,
        fallback: formatBulkNotificationRetryResultMessage({
          updatedCount,
          skippedCount,
          skippedSummary: buildBulkSkipSummaryMessage(skippedReasonSummary),
          affectedRunCount: followUpSummary.affectedRunCount,
          sampledRuns,
          blockerDeltaSummary: blockerDelta.summary
        })
      }),
      requestedCount: body?.requested_count ?? dispatchIds.length,
      updatedCount,
      skippedCount,
      skippedReasonSummary,
      blockerSampleCount: blockerDelta.sampledScopeCount,
      blockerChangedCount: blockerDelta.changedScopeCount,
      blockerClearedCount: blockerDelta.clearedScopeCount,
      blockerFullyClearedCount: blockerDelta.fullyClearedScopeCount,
      blockerStillBlockedCount: blockerDelta.stillBlockedScopeCount,
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
