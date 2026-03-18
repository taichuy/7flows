import {
  getCallbackWaitingRecommendedAction,
  listCallbackWaitingOperatorStatuses,
  type CallbackWaitingOperatorStatus,
  type CallbackWaitingRecommendedAction
} from "@/lib/callback-waiting-presenters";
import { getRunExecutionView, type RunExecutionNodeItem } from "@/lib/get-run-views";

export type CallbackBlockerSnapshot = {
  nodeRunId?: string | null;
  operatorStatuses: CallbackWaitingOperatorStatus[];
  recommendedAction?: CallbackWaitingRecommendedAction | null;
};

export type CallbackBlockerScope = {
  runId?: string | null;
  nodeRunId?: string | null;
};

export type CallbackBlockerScopedSnapshot = {
  runId: string;
  nodeRunId?: string | null;
  snapshot: CallbackBlockerSnapshot | null;
};

export type BulkCallbackBlockerDeltaSummary = {
  sampledScopeCount: number;
  changedScopeCount: number;
  clearedScopeCount: number;
  fullyClearedScopeCount: number;
  stillBlockedScopeCount: number;
  summary: string | null;
};

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" ");
}

function hasCallbackSignals(node: RunExecutionNodeItem) {
  return Boolean(
    node.waiting_reason ||
      node.callback_waiting_lifecycle ||
      typeof node.scheduled_resume_delay_seconds === "number" ||
      node.callback_tickets.length > 0 ||
      node.sensitive_access_entries.length > 0
  );
}

function pickCallbackNode(
  nodes: RunExecutionNodeItem[],
  nodeRunId?: string | null
): RunExecutionNodeItem | null {
  const normalizedNodeRunId = nodeRunId?.trim() || null;
  if (normalizedNodeRunId) {
    return nodes.find((node) => node.node_run_id === normalizedNodeRunId) ?? null;
  }

  return (
    nodes.find((node) => node.status === "waiting_callback") ??
    nodes.find((node) => node.phase === "waiting_callback") ??
    nodes.find((node) => hasCallbackSignals(node)) ??
    null
  );
}

function formatLabels(statuses: CallbackWaitingOperatorStatus[]) {
  return statuses.map((status) => status.label).join("、");
}

function buildScopeKey({ runId, nodeRunId }: { runId: string; nodeRunId?: string | null }) {
  return `${runId}::${nodeRunId?.trim() || ""}`;
}

function normalizeScopes(scopes: CallbackBlockerScope[], limit: number) {
  const normalized: Array<{ runId: string; nodeRunId?: string | null }> = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    const runId = scope.runId?.trim();
    if (!runId) {
      continue;
    }

    const nodeRunId = scope.nodeRunId?.trim() || null;
    const key = buildScopeKey({ runId, nodeRunId });
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({ runId, nodeRunId });
    if (normalized.length >= Math.max(limit, 0)) {
      break;
    }
  }

  return normalized;
}

function getOperatorStatusKinds(snapshot?: CallbackBlockerSnapshot | null) {
  return (snapshot?.operatorStatuses ?? []).map((status) => status.kind).sort();
}

function getRecommendedActionLabel(snapshot?: CallbackBlockerSnapshot | null) {
  return snapshot?.recommendedAction?.label?.trim() || null;
}

export async function fetchCallbackBlockerSnapshot({
  runId,
  nodeRunId
}: {
  runId?: string | null;
  nodeRunId?: string | null;
}): Promise<CallbackBlockerSnapshot | null> {
  const normalizedRunId = runId?.trim();
  if (!normalizedRunId) {
    return null;
  }

  const executionView = await getRunExecutionView(normalizedRunId);
  if (!executionView) {
    return null;
  }

  const node = pickCallbackNode(executionView.nodes, nodeRunId);
  if (!node) {
    return null;
  }

  const operatorStatuses = listCallbackWaitingOperatorStatuses({
    lifecycle: node.callback_waiting_lifecycle,
    callbackTickets: node.callback_tickets,
    sensitiveAccessEntries: node.sensitive_access_entries,
    scheduledResumeDelaySeconds: node.scheduled_resume_delay_seconds,
    scheduledResumeSource: node.scheduled_resume_source,
    scheduledWaitingStatus: node.scheduled_waiting_status,
    scheduledResumeScheduledAt: node.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: node.scheduled_resume_due_at
  });

  return {
    nodeRunId: node.node_run_id,
    operatorStatuses,
    recommendedAction: getCallbackWaitingRecommendedAction({
      lifecycle: node.callback_waiting_lifecycle,
      callbackTickets: node.callback_tickets,
      sensitiveAccessEntries: node.sensitive_access_entries,
      scheduledResumeDelaySeconds: node.scheduled_resume_delay_seconds,
      scheduledResumeSource: node.scheduled_resume_source,
      scheduledWaitingStatus: node.scheduled_waiting_status,
      scheduledResumeScheduledAt: node.scheduled_resume_scheduled_at,
      scheduledResumeDueAt: node.scheduled_resume_due_at
    })
  };
}

export async function fetchCallbackBlockerSnapshots(
  scopes: CallbackBlockerScope[],
  limit = 3
): Promise<CallbackBlockerScopedSnapshot[]> {
  const normalizedScopes = normalizeScopes(scopes, limit);
  return Promise.all(
    normalizedScopes.map(async ({ runId, nodeRunId }) => ({
      runId,
      nodeRunId,
      snapshot: await fetchCallbackBlockerSnapshot({ runId, nodeRunId })
    }))
  );
}

export function formatCallbackBlockerDeltaSummary({
  before,
  after
}: {
  before?: CallbackBlockerSnapshot | null;
  after?: CallbackBlockerSnapshot | null;
}): string | null {
  if (!before && !after) {
    return null;
  }

  const beforeStatuses = before?.operatorStatuses ?? [];
  const afterStatuses = after?.operatorStatuses ?? [];
  const afterKinds = new Set(afterStatuses.map((status) => status.kind));
  const beforeKinds = new Set(beforeStatuses.map((status) => status.kind));

  const clearedStatuses = beforeStatuses.filter((status) => !afterKinds.has(status.kind));
  const addedStatuses = afterStatuses.filter((status) => !beforeKinds.has(status.kind));
  const beforeActionLabel = before?.recommendedAction?.label?.trim() || null;
  const afterActionLabel = after?.recommendedAction?.label?.trim() || null;

  return joinParts([
    clearedStatuses.length > 0
      ? `阻塞变化：已解除 ${formatLabels(clearedStatuses)}。`
      : null,
    addedStatuses.length > 0 ? `新增 ${formatLabels(addedStatuses)}。` : null,
    clearedStatuses.length === 0 && addedStatuses.length === 0 && afterStatuses.length > 0
      ? `阻塞变化：当前仍是 ${formatLabels(afterStatuses)}。`
      : null,
    after && afterStatuses.length === 0
      ? "阻塞变化：当前 callback summary 已没有显式 operator blocker。"
      : null,
    !after && before
      ? "动作后暂未读到最新 blocker 快照，请刷新当前页确认阻塞是否真正减少。"
      : null,
    after && beforeActionLabel !== afterActionLabel && afterActionLabel
      ? `建议动作已切换为“${afterActionLabel}”。`
      : null,
    after && beforeActionLabel !== afterActionLabel && !afterActionLabel && beforeActionLabel
      ? "建议动作已清空；下一步应结合最新 run 状态确认是否真正离开 waiting。"
      : null,
    after && beforeActionLabel === afterActionLabel && afterActionLabel
      ? `建议动作仍是“${afterActionLabel}”。`
      : null
  ]);
}

export function summarizeBulkCallbackBlockerDelta({
  before,
  after
}: {
  before: CallbackBlockerScopedSnapshot[];
  after: CallbackBlockerScopedSnapshot[];
}): BulkCallbackBlockerDeltaSummary {
  const afterByKey = new Map(after.map((item) => [buildScopeKey(item), item]));
  const samples = before.map((beforeItem) => {
    const key = buildScopeKey(beforeItem);
    const afterItem = afterByKey.get(key);
    const beforeKinds = getOperatorStatusKinds(beforeItem.snapshot);
    const afterKinds = getOperatorStatusKinds(afterItem?.snapshot);
    const beforeAction = getRecommendedActionLabel(beforeItem.snapshot);
    const afterAction = getRecommendedActionLabel(afterItem?.snapshot);

    return {
      runId: beforeItem.runId,
      nodeRunId: beforeItem.nodeRunId,
      deltaSummary: formatCallbackBlockerDeltaSummary({
        before: beforeItem.snapshot,
        after: afterItem?.snapshot ?? null
      }),
      changed:
        beforeKinds.join("|") !== afterKinds.join("|") || beforeAction !== afterAction,
      cleared: beforeKinds.some((kind) => !afterKinds.includes(kind)),
      fullyCleared: beforeKinds.length > 0 && afterKinds.length === 0,
      stillBlocked: afterKinds.length > 0
    };
  });

  const sampledScopeCount = samples.length;
  const changedScopeCount = samples.filter((sample) => sample.changed).length;
  const clearedScopeCount = samples.filter((sample) => sample.cleared).length;
  const fullyClearedScopeCount = samples.filter((sample) => sample.fullyCleared).length;
  const stillBlockedScopeCount = samples.filter((sample) => sample.stillBlocked).length;

  const sampleSummary = samples
    .map((sample) =>
      joinParts([
        `run ${sample.runId.slice(0, 8)}`,
        sample.nodeRunId ? `node ${sample.nodeRunId.slice(0, 8)}` : null,
        sample.deltaSummary ? `：${sample.deltaSummary}` : null
      ])
    )
    .join(" ");

  return {
    sampledScopeCount,
    changedScopeCount,
    clearedScopeCount,
    fullyClearedScopeCount,
    stillBlockedScopeCount,
    summary:
      sampledScopeCount === 0
        ? null
        : joinParts([
            `已回读 ${sampledScopeCount} 个 blocker 样本；发生变化 ${changedScopeCount} 个。`,
            clearedScopeCount > 0 ? `其中已解除阻塞 ${clearedScopeCount} 个。` : null,
            fullyClearedScopeCount > 0
              ? `已完全清空显式 operator blocker ${fullyClearedScopeCount} 个。`
              : null,
            stillBlockedScopeCount > 0
              ? `动作后仍有 ${stillBlockedScopeCount} 个样本存在 operator blocker。`
              : null,
            sampleSummary
          ])
  };
}
