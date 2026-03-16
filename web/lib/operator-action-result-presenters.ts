type NotificationDeliveryStatus = "pending" | "delivered" | "failed";

type RunSnapshotInput = {
  status?: string | null;
  currentNodeId?: string | null;
  waitingReason?: string | null;
};

type ApprovalDecisionSnapshotInput = {
  waitingStatus?: string | null;
  decisionLabel?: string | null;
  reasonLabel?: string | null;
  policySummary?: string | null;
};

type CleanupRunCallbackTicketsSummary = {
  matchedCount: number;
  expiredCount: number;
  scheduledResumeCount: number;
  terminatedCount: number;
};

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" ");
}

function formatRunSnapshot({ status, currentNodeId, waitingReason }: RunSnapshotInput) {
  const normalizedStatus = status?.trim() || null;
  if (!normalizedStatus) {
    return null;
  }

  return joinParts([
    `当前 run 状态：${normalizedStatus}。`,
    currentNodeId ? `当前节点：${currentNodeId}。` : null,
    waitingReason ? `waiting reason：${waitingReason}。` : null
  ]);
}

function formatApprovalSnapshot({
  waitingStatus,
  decisionLabel,
  reasonLabel,
  policySummary
}: ApprovalDecisionSnapshotInput) {
  return joinParts([
    waitingStatus ? `当前 waiting 链路：${waitingStatus}。` : null,
    decisionLabel ? `访问决策：${decisionLabel}。` : null,
    reasonLabel ? `原因：${reasonLabel}。` : null,
    policySummary ? `策略摘要：${policySummary}` : null
  ]);
}

export function getManualResumeExpectationCopy() {
  return "手动恢复会立即重试当前 run；如果结果仍停在 waiting，请继续回看 callback / approval 时间线，而不是假定恢复已经完成。";
}

export function formatManualResumeResultMessage(snapshot?: RunSnapshotInput) {
  const runStatus = snapshot?.status;
  if (!runStatus) {
    return "已发起恢复尝试，请立即回看当前 run 时间线，确认是否真正离开 waiting 状态。";
  }

  const snapshotSummary = formatRunSnapshot(snapshot);

  if (runStatus === "waiting") {
    return joinParts([
      "已发起恢复尝试，但 run 仍处于 waiting。请继续检查 callback ticket、审批进度或定时恢复是否仍在阻塞。",
      snapshotSummary
    ]);
  }

  if (runStatus === "running") {
    return joinParts([
      "已发起恢复尝试，run 已重新进入 running。接下来重点确认节点是否继续推进，而不只是停留在恢复事件。",
      snapshotSummary
    ]);
  }

  if (runStatus === "succeeded") {
    return joinParts([
      "已发起恢复尝试，run 已完成 succeeded。当前阻塞链路已经解除。",
      snapshotSummary
    ]);
  }

  if (runStatus === "failed") {
    return joinParts([
      "已发起恢复尝试，但 run 已落到 failed。请结合 blocker timeline 与节点错误继续排障。",
      snapshotSummary
    ]);
  }

  return joinParts([
    `已发起恢复尝试，当前 run 状态：${runStatus}。请继续回看时间线确认这次恢复是否真正推动了执行。`,
    snapshotSummary
  ]);
}

export function getCleanupExpectationCopy() {
  return "cleanup 只处理当前 run / node slice 内已过期的 callback ticket；它会安排恢复或终止等待链路，但不代表业务已经自动完成。";
}

export function formatCleanupResultMessage({
  matchedCount,
  expiredCount,
  scheduledResumeCount,
  terminatedCount
}: CleanupRunCallbackTicketsSummary) {
  if (matchedCount === 0) {
    return "当前 slice 没有发现已过期的 callback ticket；如果 run 仍在等待，问题更可能在未完成审批、外部 callback 未到达，或尚未到定时恢复窗口。";
  }

  return joinParts([
    `已处理 ${expiredCount} 条过期 ticket。`,
    scheduledResumeCount > 0
      ? `系统已安排 ${scheduledResumeCount} 次恢复，请回看 run 是否从 waiting 继续推进。`
      : "本次没有新增恢复调度。",
    terminatedCount > 0
      ? `另有 ${terminatedCount} 条等待链路被终止，需要按失败路径继续排障。`
      : null
  ]);
}

export function getApprovalExpectationCopy() {
  return "审批通过会把 waiting 链路交回 runtime 继续恢复；审批拒绝会让对应阻塞链路保持失败/阻断，而不是继续自动重试。";
}

export function formatApprovalDecisionResultMessage(
  decision: "approved" | "rejected",
  snapshot?: ApprovalDecisionSnapshotInput
) {
  const snapshotSummary = formatApprovalSnapshot(snapshot ?? {});

  if (decision === "approved") {
    return joinParts([
      "审批已通过，runtime 会沿原 waiting 链路继续尝试恢复；如果 run 仍停在 waiting，请继续检查 callback 或定时恢复。",
      snapshotSummary
    ]);
  }

  return joinParts([
    "审批已拒绝，对应等待中的执行会保持 blocked / failed 语义；后续应转向人工处理或重新发起新的访问请求。",
    snapshotSummary
  ]);
}

export function getNotificationRetryExpectationCopy() {
  return "通知重试只负责把审批请求重新送达目标，不会直接恢复 run；run 是否继续推进，仍取决于审批结果或后续 callback。";
}

export function formatNotificationRetryResultMessage(input: {
  status?: NotificationDeliveryStatus | null;
  target?: string | null;
  error?: string | null;
  waitingStatus?: string | null;
}) {
  const targetLabel = input.target?.trim() ? input.target.trim() : "当前目标";
  const waitingSummary = input.waitingStatus
    ? ` 当前 waiting 链路：${input.waitingStatus}。`
    : "";

  if (input.status === "delivered") {
    return `通知已重新投递到 ${targetLabel}。这一步只表示审批请求已送达；run 仍需等待人工决策后才会继续。${waitingSummary}`;
  }

  if (input.status === "pending") {
    return `通知已按 ${targetLabel} 重新入队，等待 worker 投递。当前 run 仍会保持 waiting，直到审批完成或阻塞解除。${waitingSummary}`;
  }

  if (input.status === "failed") {
    return joinParts([
      input.error ?? "通知已重试，但当前通道仍未成功投递。",
      "这意味着审批人可能仍未收到请求，run 也不会因此自动恢复。",
      input.waitingStatus ? `当前 waiting 链路：${input.waitingStatus}。` : null
    ]);
  }

  return joinParts([
    "通知已触发重试，请继续回看最新通知状态与审批结果，确认阻塞是否真正解除。",
    input.waitingStatus ? `当前 waiting 链路：${input.waitingStatus}。` : null
  ]);
}
