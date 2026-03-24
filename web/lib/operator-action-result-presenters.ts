import { getEffectiveExecutionClassFact } from "@/lib/execution-fact-honesty";

type NotificationDeliveryStatus = "pending" | "delivered" | "failed";

type RunSnapshotInput = {
  status?: string | null;
  currentNodeId?: string | null;
  waitingReason?: string | null;
  executionFocusReason?: string | null;
  executionFocusNodeId?: string | null;
  executionFocusNodeRunId?: string | null;
  executionFocusNodeName?: string | null;
  executionFocusNodeType?: string | null;
  executionFocusExplanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  callbackWaitingExplanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  executionFocusArtifactCount?: number;
  executionFocusArtifactRefCount?: number;
  executionFocusToolCallCount?: number;
  executionFocusRawRefCount?: number;
  executionFocusArtifactRefs?: Array<string | null | undefined>;
  executionFocusArtifacts?: Array<{
    artifact_kind?: string | null;
    content_type?: string | null;
    summary?: string | null;
    uri?: string | null;
  }>;
  executionFocusToolCalls?: Array<{
    id?: string | null;
    tool_id?: string | null;
    tool_name?: string | null;
    phase?: string | null;
    status?: string | null;
    requested_execution_dependency_mode?: string | null;
    requested_execution_builtin_package_set?: string | null;
    requested_execution_dependency_ref?: string | null;
    requested_execution_backend_extensions?: Record<string, unknown> | null;
    effective_execution_class?: string | null;
    execution_sandbox_backend_id?: string | null;
    execution_sandbox_runner_kind?: string | null;
    execution_blocking_reason?: string | null;
    execution_fallback_reason?: string | null;
    response_summary?: string | null;
    response_content_type?: string | null;
    raw_ref?: string | null;
  }>;
};

type ApprovalDecisionSnapshotInput = {
  waitingStatus?: string | null;
  decisionLabel?: string | null;
  reasonLabel?: string | null;
  policySummary?: string | null;
  blockerDeltaSummary?: string | null;
  runSnapshot?: RunSnapshotInput | null;
};

type OutcomeExplanationInput = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

type CleanupRunCallbackTicketsSummary = {
  matchedCount: number;
  expiredCount: number;
  scheduledResumeCount: number;
  terminatedCount: number;
  blockerDeltaSummary?: string | null;
  runFollowUpExplanation?: OutcomeExplanationInput | null;
  runSnapshot?: RunSnapshotInput | null;
};

type BulkRunSnapshotSample = {
  runId: string;
  snapshot: RunSnapshotInput | null;
};

type BulkOperatorFollowUpInput = {
  affectedRunCount: number;
  sampledRuns: BulkRunSnapshotSample[];
};

export type BulkRunFollowUpSummary = {
  affectedRunCount: number;
  sampledRunCount: number;
  waitingRunCount: number;
  runningRunCount: number;
  succeededRunCount: number;
  failedRunCount: number;
  unknownRunCount: number;
};

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" ");
}

function appendUniqueParts(
  base: string | null | undefined,
  extras: Array<string | null | undefined>
) {
  const normalizedBase = base?.trim() || null;
  const normalizedExtras = extras.filter((extra): extra is string => {
    const normalizedExtra = extra?.trim();
    if (!normalizedExtra) {
      return false;
    }

    return !(normalizedBase && normalizedBase.includes(normalizedExtra));
  });

  return joinParts([normalizedBase, ...normalizedExtras]);
}

function formatRunSnapshotEvidenceSummary({
  executionFocusNodeName,
  executionFocusNodeId,
  executionFocusArtifactCount,
  executionFocusArtifactRefCount,
  executionFocusToolCallCount,
  executionFocusRawRefCount,
  executionFocusArtifacts,
  executionFocusToolCalls
}: RunSnapshotInput) {
  const artifactCount = executionFocusArtifactCount ?? executionFocusArtifacts?.length ?? 0;
  const artifactRefCount = executionFocusArtifactRefCount ?? 0;
  const toolCallCount = executionFocusToolCallCount ?? executionFocusToolCalls?.length ?? 0;
  const rawRefCount =
    executionFocusRawRefCount ??
    executionFocusToolCalls?.filter((toolCall) => Boolean(toolCall?.raw_ref?.trim())).length ??
    0;

  if (artifactCount <= 0 && artifactRefCount <= 0 && toolCallCount <= 0 && rawRefCount <= 0) {
    return null;
  }

  const focusNodeLabel = executionFocusNodeName?.trim() || executionFocusNodeId?.trim() || "聚焦节点";
  const sampleToolCall = executionFocusToolCalls?.find(
    (toolCall) =>
      Boolean(toolCall?.raw_ref?.trim()) ||
      Boolean(toolCall?.response_summary?.trim()) ||
      Boolean(toolCall?.execution_sandbox_backend_id?.trim()) ||
      Boolean(toolCall?.execution_blocking_reason?.trim()) ||
      Boolean(toolCall?.execution_fallback_reason?.trim())
  );
  const sampleArtifact = executionFocusArtifacts?.find(
    (artifact) => Boolean(artifact?.summary?.trim()) || Boolean(artifact?.uri?.trim())
  );

  const summary = joinParts([
    `${focusNodeLabel} 已关联 ${artifactCount} 个 artifact、${artifactRefCount} 条 artifact ref、${toolCallCount} 条 tool call。`,
    rawRefCount > 0 ? `其中 ${rawRefCount} 条 tool call 已落到 raw_ref，可直接回看原始输出。` : null
  ]);

  const sample = sampleToolCall
    ? joinParts([
        "样本 tool：",
        sampleToolCall.tool_name?.trim() || sampleToolCall.tool_id?.trim() || "tool",
        sampleToolCall.status?.trim() ? `状态 ${sampleToolCall.status.trim()}。` : null,
        getEffectiveExecutionClassFact(sampleToolCall)
          ? `effective ${getEffectiveExecutionClassFact(sampleToolCall)}。`
          : null,
        sampleToolCall.execution_sandbox_backend_id?.trim()
          ? `backend ${sampleToolCall.execution_sandbox_backend_id.trim()}。`
          : null,
        sampleToolCall.raw_ref?.trim() ? `raw_ref ${sampleToolCall.raw_ref.trim()}。` : null,
        sampleToolCall.response_summary?.trim() ? sampleToolCall.response_summary.trim() : null,
        sampleToolCall.execution_blocking_reason?.trim()
          ? `执行阻断：${sampleToolCall.execution_blocking_reason.trim()}`
          : null,
        sampleToolCall.execution_fallback_reason?.trim()
          ? `执行降级：${sampleToolCall.execution_fallback_reason.trim()}`
          : null
      ])
    : sampleArtifact
      ? joinParts([
          "样本 artifact：",
          sampleArtifact.summary?.trim() || null,
          sampleArtifact.uri?.trim() ? `(${sampleArtifact.uri.trim()})` : null
        ])
      : null;

  return joinParts([summary, sample]);
}

export function formatRunSnapshotSummary({
  status,
  currentNodeId,
  waitingReason,
  executionFocusNodeId,
  executionFocusExplanation,
  callbackWaitingExplanation,
  ...evidence
}: RunSnapshotInput) {
  const normalizedStatus = status?.trim() || null;
  if (!normalizedStatus) {
    return null;
  }

  const executionFocusPrimarySignal =
    executionFocusExplanation?.primary_signal?.trim() || null;
  const executionFocusFollowUp = executionFocusExplanation?.follow_up?.trim() || null;
  const callbackWaitingPrimarySignal =
    callbackWaitingExplanation?.primary_signal?.trim() || null;
  const callbackWaitingFollowUp = callbackWaitingExplanation?.follow_up?.trim() || null;
  const normalizedFocusNodeId = executionFocusNodeId?.trim() || null;
  const normalizedCurrentNodeId = currentNodeId?.trim() || null;
  const shouldPreferCallbackWaitingExplanation =
    Boolean(callbackWaitingPrimarySignal) &&
    (!executionFocusPrimarySignal || executionFocusPrimarySignal.startsWith("等待原因："));
  const effectivePrimarySignal = shouldPreferCallbackWaitingExplanation
    ? callbackWaitingPrimarySignal
    : executionFocusPrimarySignal;
  const effectiveFollowUp = shouldPreferCallbackWaitingExplanation && callbackWaitingFollowUp
    ? callbackWaitingFollowUp
    : executionFocusFollowUp;

  return joinParts([
    `当前 run 状态：${normalizedStatus}。`,
    normalizedCurrentNodeId ? `当前节点：${normalizedCurrentNodeId}。` : null,
    normalizedFocusNodeId && normalizedFocusNodeId !== normalizedCurrentNodeId
      ? `聚焦节点：${normalizedFocusNodeId}。`
      : null,
    effectivePrimarySignal ? `重点信号：${effectivePrimarySignal}` : null,
    effectiveFollowUp ? `后续动作：${effectiveFollowUp}` : null,
    !effectivePrimarySignal && waitingReason ? `waiting reason：${waitingReason}。` : null,
    formatRunSnapshotEvidenceSummary({
      executionFocusNodeId,
      executionFocusExplanation,
      callbackWaitingExplanation,
      waitingReason,
      status,
      currentNodeId,
      ...evidence
    })
  ]);
}

function formatBulkRunFollowUp({
  affectedRunCount,
  sampledRuns
}: BulkOperatorFollowUpInput) {
  const summary = summarizeBulkRunFollowUp({ affectedRunCount, sampledRuns });
  if (summary.affectedRunCount <= 0) {
    return null;
  }

  if (affectedRunCount <= 0) {
    return null;
  }

  const statusCounts = new Map<string, number>();
  for (const item of sampledRuns) {
    const status = item.snapshot?.status?.trim() || "unknown";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const statusSummary = Array.from(statusCounts.entries())
    .map(([status, count]) => `${status} ${count}`)
    .join("、");

  const sampleSummary = sampledRuns
    .map(({ runId, snapshot }) => {
      const shortRunId = runId.slice(0, 8);
      const snapshotSummary = formatRunSnapshotSummary(snapshot ?? {});
      return snapshotSummary
        ? `run ${shortRunId}：${snapshotSummary}`
        : `run ${shortRunId}：暂未读取到最新快照。`;
    })
    .join(" ");

  const sampledCount = sampledRuns.length;
  return joinParts([
    sampledCount > 0
      ? `本次影响 ${affectedRunCount} 个 run；已回读 ${sampledCount} 个样本，当前状态分布：${statusSummary || "unknown"}。`
      : `本次影响 ${affectedRunCount} 个 run；当前还未读取到可用的 run 快照。`,
    sampleSummary,
    affectedRunCount > sampledCount
      ? `其余 ${affectedRunCount - sampledCount} 个 run 可继续到对应 run detail / inbox slice 查看后续推进。`
      : null
  ]);
}

export function formatOperatorOutcomeExplanationMessage(input: {
  explanation?: OutcomeExplanationInput | null;
  runFollowUpExplanation?: OutcomeExplanationInput | null;
  blockerDeltaSummary?: string | null;
  runSnapshot?: RunSnapshotInput | null;
  fallback: string;
}) {
  const primarySignal = input.explanation?.primary_signal?.trim() || null;
  const followUp = input.explanation?.follow_up?.trim() || null;
  const runFollowUpPrimarySignal = input.runFollowUpExplanation?.primary_signal?.trim() || null;
  const runFollowUpFollowUp = input.runFollowUpExplanation?.follow_up?.trim() || null;
  const runFollowUpSummary =
    joinParts([runFollowUpPrimarySignal, runFollowUpFollowUp]) ||
    formatRunSnapshotSummary(input.runSnapshot ?? {});
  const explanationSummary = joinParts([primarySignal, followUp]);

  return (
    appendUniqueParts(explanationSummary || input.fallback, [
      input.blockerDeltaSummary,
      runFollowUpSummary
    ]) || input.fallback
  );
}

export function formatBulkOperatorOutcomeExplanationMessage(input: {
  explanation?: OutcomeExplanationInput | null;
  runFollowUpExplanation?: OutcomeExplanationInput | null;
  blockerDeltaSummary?: string | null;
  affectedRunCount: number;
  sampledRuns: BulkRunSnapshotSample[];
  fallback: string;
}) {
  const primarySignal = input.explanation?.primary_signal?.trim() || null;
  const followUp = input.explanation?.follow_up?.trim() || null;
  const runFollowUpPrimarySignal = input.runFollowUpExplanation?.primary_signal?.trim() || null;
  const runFollowUpFollowUp = input.runFollowUpExplanation?.follow_up?.trim() || null;
  const runFollowUpSummary =
    joinParts([runFollowUpPrimarySignal, runFollowUpFollowUp]) ||
    formatBulkRunFollowUp({
      affectedRunCount: input.affectedRunCount,
      sampledRuns: input.sampledRuns
    });
  const explanationSummary = joinParts([primarySignal, followUp]);

  return (
    appendUniqueParts(explanationSummary || input.fallback, [
      input.blockerDeltaSummary,
      runFollowUpSummary
    ]) || input.fallback
  );
}

export function summarizeBulkRunFollowUp({
  affectedRunCount,
  sampledRuns
}: BulkOperatorFollowUpInput): BulkRunFollowUpSummary {
  const summary: BulkRunFollowUpSummary = {
    affectedRunCount,
    sampledRunCount: sampledRuns.length,
    waitingRunCount: 0,
    runningRunCount: 0,
    succeededRunCount: 0,
    failedRunCount: 0,
    unknownRunCount: 0
  };

  for (const item of sampledRuns) {
    const status = item.snapshot?.status?.trim() || "unknown";
    if (status === "waiting") {
      summary.waitingRunCount += 1;
      continue;
    }
    if (status === "running") {
      summary.runningRunCount += 1;
      continue;
    }
    if (status === "succeeded") {
      summary.succeededRunCount += 1;
      continue;
    }
    if (status === "failed") {
      summary.failedRunCount += 1;
      continue;
    }
    summary.unknownRunCount += 1;
  }

  return summary;
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

export function formatManualResumeResultMessage(input?: {
  runSnapshot?: RunSnapshotInput | null;
  blockerDeltaSummary?: string | null;
}) {
  const runStatus = input?.runSnapshot?.status;
  if (!runStatus) {
    return "已发起恢复尝试，请立即回看当前 run 时间线，确认是否真正离开 waiting 状态。";
  }

  const snapshotSummary = formatRunSnapshotSummary(input?.runSnapshot ?? {});

  if (runStatus === "waiting") {
    return joinParts([
      "已发起恢复尝试，但 run 仍处于 waiting。请继续检查 callback ticket、审批进度或定时恢复是否仍在阻塞。",
      input?.blockerDeltaSummary,
      snapshotSummary
    ]);
  }

  if (runStatus === "running") {
    return joinParts([
      "已发起恢复尝试，run 已重新进入 running。接下来重点确认节点是否继续推进，而不只是停留在恢复事件。",
      input?.blockerDeltaSummary,
      snapshotSummary
    ]);
  }

  if (runStatus === "succeeded") {
    return joinParts([
      "已发起恢复尝试，run 已完成 succeeded。当前阻塞链路已经解除。",
      input?.blockerDeltaSummary,
      snapshotSummary
    ]);
  }

  if (runStatus === "failed") {
    return joinParts([
      "已发起恢复尝试，但 run 已落到 failed。请结合 blocker timeline 与节点错误继续排障。",
      input?.blockerDeltaSummary,
      snapshotSummary
    ]);
  }

  return joinParts([
    `已发起恢复尝试，当前 run 状态：${runStatus}。请继续回看时间线确认这次恢复是否真正推动了执行。`,
    input?.blockerDeltaSummary,
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
  terminatedCount,
  blockerDeltaSummary,
  runFollowUpExplanation,
  runSnapshot
}: CleanupRunCallbackTicketsSummary) {
  const runSnapshotSummary = formatRunSnapshotSummary(runSnapshot ?? {});
  const runFollowUpSummary = joinParts([
    runFollowUpExplanation?.primary_signal,
    runFollowUpExplanation?.follow_up
  ]);

  if (matchedCount === 0) {
    return joinParts([
      "当前 slice 没有发现已过期的 callback ticket；如果 run 仍在等待，问题更可能在未完成审批、外部 callback 未到达，或尚未到定时恢复窗口。",
      blockerDeltaSummary,
      runFollowUpSummary,
      runSnapshotSummary
    ]);
  }

  return joinParts([
    `已处理 ${expiredCount} 条过期 ticket。`,
    scheduledResumeCount > 0
      ? `系统已安排 ${scheduledResumeCount} 次恢复，请回看 run 是否从 waiting 继续推进。`
      : "本次没有新增恢复调度。",
    terminatedCount > 0
      ? `另有 ${terminatedCount} 条等待链路被终止，需要按失败路径继续排障。`
      : null,
    blockerDeltaSummary,
    runFollowUpSummary,
    runSnapshotSummary
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
  const runSnapshotSummary = formatRunSnapshotSummary(snapshot?.runSnapshot ?? {});

  if (decision === "approved") {
    return joinParts([
      "审批已通过，runtime 会沿原 waiting 链路继续尝试恢复；如果 run 仍停在 waiting，请继续检查 callback 或定时恢复。",
      snapshotSummary,
      snapshot?.blockerDeltaSummary,
      runSnapshotSummary
    ]);
  }

  return joinParts([
    "审批已拒绝，对应等待中的执行会保持 blocked / failed 语义；后续应转向人工处理或重新发起新的访问请求。",
    snapshotSummary,
    snapshot?.blockerDeltaSummary,
    runSnapshotSummary
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
  blockerDeltaSummary?: string | null;
  runSnapshot?: RunSnapshotInput | null;
}) {
  const targetLabel = input.target?.trim() ? input.target.trim() : "当前目标";
  const waitingSummary = input.waitingStatus
    ? ` 当前 waiting 链路：${input.waitingStatus}。`
    : "";
  const runSnapshotSummary = formatRunSnapshotSummary(input.runSnapshot ?? {});

  if (input.status === "delivered") {
    return joinParts([
      `通知已重新投递到 ${targetLabel}。这一步只表示审批请求已送达；run 仍需等待人工决策后才会继续。${waitingSummary}`,
      input.blockerDeltaSummary,
      runSnapshotSummary
    ]);
  }

  if (input.status === "pending") {
    return joinParts([
      `通知已按 ${targetLabel} 重新入队，等待 worker 投递。当前 run 仍会保持 waiting，直到审批完成或阻塞解除。${waitingSummary}`,
      input.blockerDeltaSummary,
      runSnapshotSummary
    ]);
  }

  if (input.status === "failed") {
    return joinParts([
      input.error ?? "通知已重试，但当前通道仍未成功投递。",
      "这意味着审批人可能仍未收到请求，run 也不会因此自动恢复。",
      input.waitingStatus ? `当前 waiting 链路：${input.waitingStatus}。` : null,
      input.blockerDeltaSummary,
      runSnapshotSummary
    ]);
  }

  return joinParts([
    "通知已触发重试，请继续回看最新通知状态与审批结果，确认阻塞是否真正解除。",
    input.waitingStatus ? `当前 waiting 链路：${input.waitingStatus}。` : null,
    input.blockerDeltaSummary,
    runSnapshotSummary
  ]);
}

export function formatBulkApprovalDecisionResultMessage(input: {
  decision: "approved" | "rejected";
  updatedCount: number;
  skippedCount: number;
  skippedSummary?: string | null;
  affectedRunCount: number;
  sampledRuns: BulkRunSnapshotSample[];
  blockerDeltaSummary?: string | null;
}) {
  const baseMessage = formatBulkApprovalDecisionBaseMessage(input);
  return joinParts([
    baseMessage,
    input.blockerDeltaSummary,
    formatBulkRunFollowUp({
      affectedRunCount: input.affectedRunCount,
      sampledRuns: input.sampledRuns
    })
  ]);
}

export function formatBulkApprovalDecisionBaseMessage(input: {
  decision: "approved" | "rejected";
  updatedCount: number;
  skippedCount: number;
  skippedSummary?: string | null;
}) {
  const actionLabel = input.decision === "approved" ? "批准" : "拒绝";
  return joinParts([
    `批量${actionLabel} ${input.updatedCount} 条票据，跳过 ${input.skippedCount} 条。`,
    input.skippedSummary ?? null
  ]);
}

export function formatBulkNotificationRetryResultMessage(input: {
  updatedCount: number;
  skippedCount: number;
  skippedSummary?: string | null;
  affectedRunCount: number;
  sampledRuns: BulkRunSnapshotSample[];
  blockerDeltaSummary?: string | null;
}) {
  const baseMessage = formatBulkNotificationRetryBaseMessage(input);
  return joinParts([
    baseMessage,
    input.blockerDeltaSummary,
    formatBulkRunFollowUp({
      affectedRunCount: input.affectedRunCount,
      sampledRuns: input.sampledRuns
    })
  ]);
}

export function formatBulkNotificationRetryBaseMessage(input: {
  updatedCount: number;
  skippedCount: number;
  skippedSummary?: string | null;
}) {
  return joinParts([
    `批量重试 ${input.updatedCount} 条通知，跳过 ${input.skippedCount} 条。`,
    input.skippedSummary ?? null
  ]);
}
