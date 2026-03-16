"use server";

import { revalidatePath } from "next/cache";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type {
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult,
  SensitiveAccessBulkSkipSummary
} from "@/lib/get-sensitive-access";

export type DecideSensitiveAccessApprovalTicketState = {
  status: "idle" | "success" | "error";
  message: string;
  ticketId: string;
};

export type RetrySensitiveAccessNotificationDispatchState = {
  status: "idle" | "success" | "error";
  message: string;
  dispatchId: string;
};

type ApprovalTicketBulkDecisionResponseBody = {
  requested_count: number;
  decided_count: number;
  skipped_count: number;
  decided_items: Array<{
    id: string;
    run_id?: string | null;
  }>;
  skipped_reason_summary: SensitiveAccessBulkSkipSummary[];
};

type NotificationDispatchBulkRetryResponseBody = {
  requested_count: number;
  retried_count: number;
  skipped_count: number;
  retried_items: Array<{
    approval_ticket: {
      id: string;
      run_id?: string | null;
    };
  }>;
  skipped_reason_summary: SensitiveAccessBulkSkipSummary[];
};

function buildBulkSkipSummaryMessage(summary: SensitiveAccessBulkSkipSummary[]) {
  if (summary.length === 0) {
    return "";
  }

  return ` 跳过原因：${summary.map((item) => `${item.reason} ${item.count}`).join("、")}。`;
}

function revalidateSensitiveAccessPaths(runIds: Array<string | null | undefined>) {
  revalidatePath("/");
  revalidatePath("/sensitive-access");

  const uniqueRunIds = [...new Set(runIds.map((item) => item?.trim()).filter(Boolean))];
  for (const runId of uniqueRunIds) {
    revalidatePath(`/runs/${runId}`);
  }
}

export async function decideSensitiveAccessApprovalTicket(
  _: DecideSensitiveAccessApprovalTicketState,
  formData: FormData
): Promise<DecideSensitiveAccessApprovalTicketState> {
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
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

    const body = (await response.json().catch(() => null)) as { detail?: string } | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "审批决策失败。",
        ticketId
      };
    }

    revalidateSensitiveAccessPaths([runId]);

    return {
      status: "success",
      message:
        decision === "approved"
          ? "审批已通过，等待中的执行会按主链继续恢复。"
          : "审批已拒绝，对应等待中的执行将保持阻断/失败语义。",
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

  if (!dispatchId) {
    return {
      status: "error",
      message: "缺少通知重试所需的 dispatch 标识。",
      dispatchId
    };
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/sensitive-access/notification-dispatches/${encodeURIComponent(dispatchId)}/retry`,
      {
        method: "POST",
        cache: "no-store"
      }
    );

    const body = (await response.json().catch(() => null)) as
      | {
          detail?: string;
          notification?: {
            status?: "pending" | "delivered" | "failed";
            error?: string | null;
          };
        }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "通知重试失败。",
        dispatchId
      };
    }

    revalidateSensitiveAccessPaths([runId]);

    return {
      status: "success",
      message:
        body?.notification?.status === "delivered"
          ? "通知已重新投递到收件箱。"
          : body?.notification?.status === "pending"
            ? "通知已重新入队，等待 worker 投递。"
            : body?.notification?.error ?? "通知已重试，但当前通道仍未成功投递。",
      dispatchId
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端执行通知重试。",
      dispatchId
    };
  }
}

export async function bulkDecideSensitiveAccessApprovalTickets(input: {
  ticketIds: string[];
  status: Extract<SensitiveAccessBulkAction, "approved" | "rejected">;
  approvedBy: string;
}): Promise<SensitiveAccessBulkActionResult> {
  const ticketIds = [...new Set(input.ticketIds.map((item) => item.trim()).filter(Boolean))];
  const approvedBy = input.approvedBy.trim();

  if (ticketIds.length === 0 || !approvedBy) {
    return {
      action: input.status,
      status: "error",
      message: "缺少批量审批所需的信息。",
      requestedCount: ticketIds.length,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: []
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
        skippedReasonSummary: []
      };
    }

    revalidateSensitiveAccessPaths(body?.decided_items?.map((item) => item.run_id) ?? []);

    const updatedCount = body?.decided_count ?? 0;
    const skippedCount = body?.skipped_count ?? 0;
    const skippedReasonSummary = body?.skipped_reason_summary ?? [];
    const actionLabel = input.status === "approved" ? "批准" : "拒绝";

    return {
      action: input.status,
      status: "success",
      message: `批量${actionLabel} ${updatedCount} 条票据，跳过 ${skippedCount} 条。${buildBulkSkipSummaryMessage(skippedReasonSummary)}`.trim(),
      requestedCount: body?.requested_count ?? ticketIds.length,
      updatedCount,
      skippedCount,
      skippedReasonSummary
    };
  } catch {
    return {
      action: input.status,
      status: "error",
      message: "无法连接后端执行批量审批。",
      requestedCount: ticketIds.length,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: []
    };
  }
}

export async function bulkRetrySensitiveAccessNotificationDispatches(input: {
  dispatchIds: string[];
}): Promise<SensitiveAccessBulkActionResult> {
  const dispatchIds = [...new Set(input.dispatchIds.map((item) => item.trim()).filter(Boolean))];

  if (dispatchIds.length === 0) {
    return {
      action: "retry",
      status: "error",
      message: "缺少批量通知重试所需的信息。",
      requestedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: []
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
        skippedReasonSummary: []
      };
    }

    revalidateSensitiveAccessPaths(
      body?.retried_items?.map((item) => item.approval_ticket.run_id) ?? []
    );

    const updatedCount = body?.retried_count ?? 0;
    const skippedCount = body?.skipped_count ?? 0;
    const skippedReasonSummary = body?.skipped_reason_summary ?? [];

    return {
      action: "retry",
      status: "success",
      message: `批量重试 ${updatedCount} 条通知，跳过 ${skippedCount} 条。${buildBulkSkipSummaryMessage(skippedReasonSummary)}`.trim(),
      requestedCount: body?.requested_count ?? dispatchIds.length,
      updatedCount,
      skippedCount,
      skippedReasonSummary
    };
  } catch {
    return {
      action: "retry",
      status: "error",
      message: "无法连接后端执行批量通知重试。",
      requestedCount: dispatchIds.length,
      updatedCount: 0,
      skippedCount: 0,
      skippedReasonSummary: []
    };
  }
}
