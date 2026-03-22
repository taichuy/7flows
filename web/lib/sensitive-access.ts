import type {
  OperatorRunFollowUpBody,
  OperatorRunSnapshotBody
} from "@/app/actions/run-snapshot";
import {
  normalizeOperatorRunFollowUp,
  normalizeOperatorRunSnapshot
} from "@/app/actions/run-snapshot";
import type {
  OperatorRunSnapshotSummary,
  SensitiveAccessTimelineEntry,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";

type SensitiveAccessRunIdSample = {
  runId?: string | null;
  run_id?: string | null;
};

type ResolveSensitiveAccessRunIdOptions = {
  requestRunId?: string | null;
  approvalTicketRunId?: string | null;
  defaultRunId?: string | null;
  sampledRuns?: SensitiveAccessRunIdSample[] | null;
};

export type SensitiveAccessBlockingResource = {
  id: string;
  label: string;
  description?: string | null;
  sensitivity_level: string;
  source: string;
  metadata: Record<string, unknown>;
};

export type SensitiveAccessBlockingRequest = {
  id: string;
  run_id?: string | null;
  node_run_id?: string | null;
  requester_type: string;
  requester_id: string;
  resource_id: string;
  action_type: string;
  purpose_text?: string | null;
  decision: string;
  decision_label?: string | null;
  reason_code?: string | null;
  reason_label?: string | null;
  policy_summary?: string | null;
};

export type SensitiveAccessBlockingApprovalTicket = {
  id: string;
  access_request_id: string;
  run_id?: string | null;
  node_run_id?: string | null;
  status: string;
  waiting_status?: string | null;
  approved_by?: string | null;
};

export type SensitiveAccessBlockingNotification = {
  id: string;
  approval_ticket_id: string;
  channel: string;
  target: string;
  status: string;
};

export type SensitiveAccessRunFollowUp = NonNullable<
  ReturnType<typeof normalizeOperatorRunFollowUp>
> & {
  explanation?: SignalFollowUpExplanation | null;
};

export type SensitiveAccessBlockingPayload = {
  detail: string;
  resource: SensitiveAccessBlockingResource;
  access_request: SensitiveAccessBlockingRequest;
  approval_ticket?: SensitiveAccessBlockingApprovalTicket | null;
  notifications: SensitiveAccessBlockingNotification[];
  outcome_explanation?: SignalFollowUpExplanation | null;
  run_snapshot?: OperatorRunSnapshotSummary | null;
  run_follow_up?: SensitiveAccessRunFollowUp | null;
};

type SensitiveAccessBlockingPayloadBody = Omit<
  SensitiveAccessBlockingPayload,
  "run_snapshot" | "run_follow_up"
> & {
  run_snapshot?: OperatorRunSnapshotBody | OperatorRunSnapshotSummary | null;
  run_follow_up?:
    | OperatorRunFollowUpBody
    | (SensitiveAccessRunFollowUp & {
        sampled_runs?: Array<{
          run_id?: string | null;
          snapshot?: OperatorRunSnapshotBody | OperatorRunSnapshotSummary | null;
          callback_tickets?: unknown[] | null;
          sensitive_access_entries?: SensitiveAccessTimelineEntry[] | null;
        }>;
      })
    | null;
};

export type SensitiveAccessGuardedResult<T> =
  | {
      kind: "ok";
      data: T;
    }
  | {
      kind: "blocked";
      statusCode: 403 | 409;
      payload: SensitiveAccessBlockingPayload;
    }
  | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveAccessBlockingPayload(value: unknown): value is SensitiveAccessBlockingPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.detail === "string" &&
    isRecord(value.resource) &&
    typeof value.resource.id === "string" &&
    typeof value.resource.label === "string" &&
    typeof value.resource.sensitivity_level === "string" &&
    typeof value.resource.source === "string" &&
    isRecord(value.access_request) &&
    typeof value.access_request.id === "string" &&
    typeof value.access_request.requester_type === "string" &&
    typeof value.access_request.requester_id === "string" &&
    typeof value.access_request.resource_id === "string" &&
    typeof value.access_request.action_type === "string" &&
    typeof value.access_request.decision === "string" &&
    Array.isArray(value.notifications)
  );
}

function normalizeSignalFollowUpExplanation(
  explanation?: SignalFollowUpExplanation | null
): SignalFollowUpExplanation | null {
  if (!explanation) {
    return null;
  }

  return {
    primary_signal: explanation.primary_signal ?? null,
    follow_up: explanation.follow_up ?? null
  };
}

function normalizeId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function pickSampleRunId(sampledRuns?: SensitiveAccessRunIdSample[] | null): string | null {
  if (!Array.isArray(sampledRuns)) {
    return null;
  }

  for (const item of sampledRuns) {
    const runId = normalizeId(item?.runId ?? item?.run_id ?? null);
    if (runId) {
      return runId;
    }
  }

  return null;
}

export function resolveSensitiveAccessRunId({
  requestRunId,
  approvalTicketRunId,
  defaultRunId,
  sampledRuns
}: ResolveSensitiveAccessRunIdOptions): string | null {
  return (
    normalizeId(requestRunId) ??
    normalizeId(approvalTicketRunId) ??
    pickSampleRunId(sampledRuns) ??
    normalizeId(defaultRunId)
  );
}

function normalizeBlockingRunSnapshot(
  snapshot?: OperatorRunSnapshotBody | OperatorRunSnapshotSummary | null
): OperatorRunSnapshotSummary | null {
  if (!snapshot || !isRecord(snapshot)) {
    return null;
  }

  if (
    "workflow_id" in snapshot ||
    "current_node_id" in snapshot ||
    "execution_focus_node_id" in snapshot ||
    "callback_waiting_explanation" in snapshot ||
    "execution_focus_artifact_refs" in snapshot
  ) {
    return normalizeOperatorRunSnapshot(snapshot);
  }

  return snapshot as OperatorRunSnapshotSummary;
}

export function normalizeSensitiveAccessRunFollowUp(
  summary?: SensitiveAccessBlockingPayloadBody["run_follow_up"]
): SensitiveAccessRunFollowUp | null {
  if (!summary || !isRecord(summary)) {
    return null;
  }

  if (
    "affectedRunCount" in summary ||
    "sampledRuns" in summary ||
    "waitingRunCount" in summary ||
    "runningRunCount" in summary
  ) {
    const normalizedSummary = summary as SensitiveAccessRunFollowUp;
    return {
      ...normalizedSummary,
      recommendedAction: normalizedSummary.recommendedAction ?? null,
      explanation: normalizeSignalFollowUpExplanation(summary.explanation ?? null),
      sampledRuns: Array.isArray(normalizedSummary.sampledRuns)
        ? normalizedSummary.sampledRuns.map((item) => ({
            runId: typeof item?.runId === "string" ? item.runId : "",
            snapshot: normalizeBlockingRunSnapshot(item?.snapshot ?? null),
            callbackTickets: Array.isArray(item?.callbackTickets) ? item.callbackTickets : [],
            sensitiveAccessEntries: Array.isArray(item?.sensitiveAccessEntries)
              ? item.sensitiveAccessEntries
              : []
          }))
        : []
    };
  }

  const normalized = normalizeOperatorRunFollowUp(summary);
  if (normalized) {
    return {
      affectedRunCount: normalized.affectedRunCount,
      sampledRunCount: normalized.sampledRunCount,
      waitingRunCount: normalized.waitingRunCount,
      runningRunCount: normalized.runningRunCount,
      succeededRunCount: normalized.succeededRunCount,
      failedRunCount: normalized.failedRunCount,
      unknownRunCount: normalized.unknownRunCount,
      recommendedAction: normalized.recommendedAction ?? null,
      sampledRuns: Array.isArray(summary.sampled_runs)
        ? summary.sampled_runs
            .filter((item) => typeof item?.run_id === "string" && item.run_id.trim())
            .map((item) => ({
              runId: item.run_id,
              snapshot: normalizeBlockingRunSnapshot(item.snapshot ?? null),
              callbackTickets: Array.isArray(item.callback_tickets) ? item.callback_tickets : [],
              sensitiveAccessEntries: Array.isArray(item.sensitive_access_entries)
                ? item.sensitive_access_entries
                : []
            }))
        : normalized.sampledRuns,
      explanation: normalizeSignalFollowUpExplanation(summary.explanation ?? null)
    };
  }

  return null;
}

export function resolveSensitiveAccessCanonicalRunSnapshot(input: {
  requestRunId?: string | null;
  approvalTicketRunId?: string | null;
  defaultRunId?: string | null;
  runSnapshot?: OperatorRunSnapshotSummary | null;
  runFollowUp?: SensitiveAccessBlockingPayloadBody["run_follow_up"] | SensitiveAccessRunFollowUp | null;
}): {
  runId: string | null;
  runFollowUp: SensitiveAccessRunFollowUp | null;
  snapshot: OperatorRunSnapshotSummary | null;
} {
  const runFollowUp = normalizeSensitiveAccessRunFollowUp(input.runFollowUp);
  const runId = resolveSensitiveAccessRunId({
    requestRunId: input.requestRunId,
    approvalTicketRunId: input.approvalTicketRunId,
    defaultRunId: input.defaultRunId,
    sampledRuns: runFollowUp?.sampledRuns
  });
  const directSnapshot = normalizeBlockingRunSnapshot(input.runSnapshot);
  if (directSnapshot) {
    return {
      runId,
      runFollowUp,
      snapshot: directSnapshot
    };
  }

  if (!runFollowUp) {
    return {
      runId,
      runFollowUp: null,
      snapshot: null
    };
  }

  if (runId) {
    const matchingSnapshot = runFollowUp.sampledRuns.find((sample) => sample.runId === runId)?.snapshot;
    if (matchingSnapshot) {
      return {
        runId,
        runFollowUp,
        snapshot: matchingSnapshot
      };
    }
  }

  return {
    runId,
    runFollowUp,
    snapshot: runFollowUp.sampledRuns.find((sample) => sample.snapshot != null)?.snapshot ?? null
  };
}

export function resolveSensitiveAccessBlockingRunId(
  payload: SensitiveAccessBlockingPayload
): string | null {
  return resolveSensitiveAccessRunId({
    requestRunId: payload.access_request.run_id,
    approvalTicketRunId: payload.approval_ticket?.run_id,
    sampledRuns: payload.run_follow_up?.sampledRuns
  });
}

export function resolveSensitiveAccessTimelineEntryRunId(
  entry: SensitiveAccessTimelineEntry,
  defaultRunId?: string | null
): string | null {
  return resolveSensitiveAccessRunId({
    requestRunId: entry.request.run_id,
    approvalTicketRunId: entry.approval_ticket?.run_id,
    defaultRunId,
    sampledRuns: entry.run_follow_up?.sampled_runs
  });
}

export function resolveSensitiveAccessTimelineEntryRunContext(
  entry: SensitiveAccessTimelineEntry,
  defaultRunId?: string | null
) {
  return resolveSensitiveAccessCanonicalRunSnapshot({
    requestRunId: entry.request.run_id,
    approvalTicketRunId: entry.approval_ticket?.run_id,
    defaultRunId,
    runSnapshot: entry.run_snapshot,
    runFollowUp: entry.run_follow_up
  });
}

function normalizeSensitiveAccessBlockingPayload(
  payload: SensitiveAccessBlockingPayloadBody
): SensitiveAccessBlockingPayload {
  return {
    ...payload,
    outcome_explanation: normalizeSignalFollowUpExplanation(payload.outcome_explanation),
    run_snapshot: normalizeBlockingRunSnapshot(payload.run_snapshot),
    run_follow_up: normalizeSensitiveAccessRunFollowUp(payload.run_follow_up)
  };
}

export async function parseSensitiveAccessBlockingResponse(
  response: Response
): Promise<{
  statusCode: 403 | 409;
  payload: SensitiveAccessBlockingPayload;
} | null> {
  if (response.status !== 403 && response.status !== 409) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const payload = await response.json();
    if (!isSensitiveAccessBlockingPayload(payload)) {
      return null;
    }

    return {
      statusCode: response.status,
      payload: normalizeSensitiveAccessBlockingPayload(
        payload as SensitiveAccessBlockingPayloadBody
      )
    };
  } catch {
    return null;
  }
}

export async function parseSensitiveAccessGuardedResponse<T>(
  response: Response
): Promise<SensitiveAccessGuardedResult<T>> {
  if (response.ok) {
    return {
      kind: "ok",
      data: (await response.json()) as T
    };
  }

  const blocked = await parseSensitiveAccessBlockingResponse(response);
  if (!blocked) {
    return null;
  }

  return {
    kind: "blocked",
    statusCode: blocked.statusCode,
    payload: blocked.payload
  };
}

export function isSensitiveAccessBlockedResult<T>(
  result: SensitiveAccessGuardedResult<T>
): result is {
  kind: "blocked";
  statusCode: 403 | 409;
  payload: SensitiveAccessBlockingPayload;
} {
  return result?.kind === "blocked";
}
