import type {
  OperatorRunSnapshotSummary,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";

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

export type SensitiveAccessBlockingPayload = {
  detail: string;
  resource: SensitiveAccessBlockingResource;
  access_request: SensitiveAccessBlockingRequest;
  approval_ticket?: SensitiveAccessBlockingApprovalTicket | null;
  notifications: SensitiveAccessBlockingNotification[];
  outcome_explanation?: SignalFollowUpExplanation | null;
  run_snapshot?: OperatorRunSnapshotSummary | null;
  run_follow_up?: {
    explanation?: SignalFollowUpExplanation | null;
    affected_run_count?: number;
    sampled_run_count?: number;
    waiting_run_count?: number;
    running_run_count?: number;
    succeeded_run_count?: number;
    failed_run_count?: number;
    unknown_run_count?: number;
  } | null;
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
      payload
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
