"use server";

import { revalidatePath } from "next/cache";

import { getApiBaseUrl } from "@/lib/api-base-url";

export type DecideSensitiveAccessApprovalTicketState = {
  status: "idle" | "success" | "error";
  message: string;
  ticketId: string;
};

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

    revalidatePath("/");
    revalidatePath("/sensitive-access");
    if (runId) {
      revalidatePath(`/runs/${runId}`);
    }

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
