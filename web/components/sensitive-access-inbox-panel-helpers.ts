import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

export type SensitiveAccessMessageTone = "idle" | "success" | "error";

export const DEFAULT_OPERATOR_ID = "studio-operator";

export const APPROVAL_STATUS_LABELS: Record<SensitiveAccessInboxEntry["ticket"]["status"], string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  expired: "已过期"
};

export const WAITING_STATUS_LABELS: Record<
  SensitiveAccessInboxEntry["ticket"]["waiting_status"],
  string
> = {
  waiting: "等待恢复",
  resumed: "已恢复",
  failed: "恢复失败"
};

export const ACTION_TYPE_LABELS: Record<
  NonNullable<SensitiveAccessInboxEntry["request"]>["action_type"],
  string
> = {
  read: "读取",
  use: "使用",
  export: "导出",
  write: "写入",
  invoke: "调用"
};

export const REQUESTER_TYPE_LABELS: Record<
  NonNullable<SensitiveAccessInboxEntry["request"]>["requester_type"],
  string
> = {
  human: "人类",
  ai: "AI",
  workflow: "工作流",
  tool: "工具"
};

export const NOTIFICATION_STATUS_LABELS: Record<
  SensitiveAccessInboxEntry["notifications"][number]["status"],
  string
> = {
  pending: "待投递",
  delivered: "已投递",
  failed: "投递失败"
};

export function pickLatestNotification(entry: SensitiveAccessInboxEntry) {
  return [...entry.notifications].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )[0];
}

export function isPendingWaitingTicket(entry: SensitiveAccessInboxEntry) {
  return entry.ticket.status === "pending" && entry.ticket.waiting_status === "waiting";
}

export function pickRetriableNotification(entry: SensitiveAccessInboxEntry) {
  const notification = pickLatestNotification(entry);
  if (!notification || !isPendingWaitingTicket(entry) || notification.status === "delivered") {
    return null;
  }

  return notification;
}
