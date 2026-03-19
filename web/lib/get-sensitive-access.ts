import { getApiBaseUrl } from "@/lib/api-base-url";
import type { RunExecutionView } from "@/lib/get-run-views";
import {
  buildSensitiveAccessInboxEntryCallbackContext,
  type SensitiveAccessInboxCallbackContext
} from "@/lib/sensitive-access-inbox-callback-context";
import {
  buildSensitiveAccessInboxEntryExecutionContext,
  type SensitiveAccessInboxExecutionContext
} from "@/lib/sensitive-access-inbox-execution-context";

export type SensitiveResourceItem = {
  id: string;
  label: string;
  description?: string | null;
  sensitivity_level: "L0" | "L1" | "L2" | "L3";
  source:
    | "credential"
    | "workflow_context"
    | "workspace_resource"
    | "local_capability"
    | "published_secret";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SensitiveAccessRequestItem = {
  id: string;
  run_id?: string | null;
  node_run_id?: string | null;
  requester_type: "human" | "ai" | "workflow" | "tool";
  requester_id: string;
  resource_id: string;
  action_type: "read" | "use" | "export" | "write" | "invoke";
  purpose_text?: string | null;
  decision?: "allow" | "deny" | "require_approval" | "allow_masked" | null;
  decision_label?: string | null;
  reason_code?: string | null;
  reason_label?: string | null;
  policy_summary?: string | null;
  created_at: string;
  decided_at?: string | null;
};

export type ApprovalTicketItem = {
  id: string;
  access_request_id: string;
  run_id?: string | null;
  node_run_id?: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  waiting_status: "waiting" | "resumed" | "failed";
  approved_by?: string | null;
  decided_at?: string | null;
  expires_at?: string | null;
  created_at: string;
};

export type NotificationDispatchItem = {
  id: string;
  approval_ticket_id: string;
  channel: "in_app" | "webhook" | "feishu" | "slack" | "email";
  target: string;
  status: "pending" | "delivered" | "failed";
  delivered_at?: string | null;
  error?: string | null;
  created_at: string;
};

export type SignalFollowUpExplanation = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

export type OperatorRunSnapshotSummary = {
  status?: string | null;
  workflowId?: string | null;
  currentNodeId?: string | null;
  waitingReason?: string | null;
  executionFocusReason?: string | null;
  executionFocusNodeId?: string | null;
  executionFocusNodeRunId?: string | null;
  executionFocusExplanation?: SignalFollowUpExplanation | null;
  callbackWaitingExplanation?: SignalFollowUpExplanation | null;
};

export type SensitiveAccessBulkRunSample = {
  runId: string;
  snapshot: OperatorRunSnapshotSummary | null;
};

export type NotificationChannelCapabilityItem = {
  channel: "in_app" | "webhook" | "feishu" | "slack" | "email";
  delivery_mode: "inline" | "worker";
  target_kind: "in_app" | "http_url" | "email_list";
  configured: boolean;
  health_status: "ready" | "degraded";
  summary: string;
  target_hint: string;
  target_example: string;
  health_reason: string;
  config_facts: Array<{
    key: string;
    label: string;
    status: "configured" | "missing" | "info";
    value: string;
  }>;
  dispatch_summary: {
    pending_count: number;
    delivered_count: number;
    failed_count: number;
    latest_dispatch_at?: string | null;
    latest_delivered_at?: string | null;
    latest_failure_at?: string | null;
    latest_failure_error?: string | null;
    latest_failure_target?: string | null;
  };
};

export type SensitiveAccessInboxEntry = {
  ticket: ApprovalTicketItem;
  request: SensitiveAccessRequestItem | null;
  resource: SensitiveResourceItem | null;
  notifications: NotificationDispatchItem[];
  callbackWaitingContext?: SensitiveAccessInboxCallbackContext | null;
  executionContext?: SensitiveAccessInboxExecutionContext | null;
};

export type SensitiveAccessTimelineEntry = {
  request: SensitiveAccessRequestItem;
  resource: SensitiveResourceItem;
  approval_ticket?: ApprovalTicketItem | null;
  notifications: NotificationDispatchItem[];
  outcome_explanation?: SignalFollowUpExplanation | null;
};

export type SensitiveAccessInboxSummary = {
  ticket_count: number;
  pending_ticket_count: number;
  approved_ticket_count: number;
  rejected_ticket_count: number;
  expired_ticket_count: number;
  waiting_ticket_count: number;
  resumed_ticket_count: number;
  failed_ticket_count: number;
  pending_notification_count: number;
  delivered_notification_count: number;
  failed_notification_count: number;
};

export type SensitiveAccessBulkAction = "approved" | "rejected" | "retry";

export type SensitiveAccessBulkSkipSummary = {
  reason: string;
  count: number;
  detail: string;
};

export type SensitiveAccessBulkActionResult = {
  action: SensitiveAccessBulkAction;
  status: "success" | "error";
  message: string;
  outcomeExplanation?: SignalFollowUpExplanation | null;
  runFollowUpExplanation?: SignalFollowUpExplanation | null;
  blockerDeltaSummary?: string | null;
  requestedCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedReasonSummary: SensitiveAccessBulkSkipSummary[];
  affectedRunCount: number;
  sampledRunCount: number;
  waitingRunCount: number;
  runningRunCount: number;
  succeededRunCount: number;
  failedRunCount: number;
  unknownRunCount: number;
  blockerSampleCount: number;
  blockerChangedCount: number;
  blockerClearedCount: number;
  blockerFullyClearedCount: number;
  blockerStillBlockedCount: number;
  sampledRuns?: SensitiveAccessBulkRunSample[];
};

export type SensitiveAccessInboxSnapshot = {
  entries: SensitiveAccessInboxEntry[];
  channels: NotificationChannelCapabilityItem[];
  resources: SensitiveResourceItem[];
  requests: SensitiveAccessRequestItem[];
  notifications: NotificationDispatchItem[];
  summary: SensitiveAccessInboxSummary;
};

type SensitiveAccessInboxEntryBody = {
  ticket: ApprovalTicketItem;
  request?: SensitiveAccessRequestItem | null;
  resource?: SensitiveResourceItem | null;
  notifications: NotificationDispatchItem[];
};

type SensitiveAccessInboxResponseBody = {
  entries?: SensitiveAccessInboxEntryBody[];
  channels?: NotificationChannelCapabilityItem[];
  resources?: SensitiveResourceItem[];
  requests?: SensitiveAccessRequestItem[];
  notifications?: NotificationDispatchItem[];
  execution_views?: RunExecutionView[];
  summary?: SensitiveAccessInboxSummary | null;
};

type SensitiveAccessInboxOptions = {
  ticketStatus?: ApprovalTicketItem["status"];
  waitingStatus?: ApprovalTicketItem["waiting_status"];
  requestDecision?: NonNullable<SensitiveAccessRequestItem["decision"]>;
  requesterType?: SensitiveAccessRequestItem["requester_type"];
  notificationStatus?: NotificationDispatchItem["status"];
  notificationChannel?: NotificationDispatchItem["channel"];
  runId?: string;
  nodeRunId?: string;
  accessRequestId?: string;
  approvalTicketId?: string;
};

export async function getSensitiveAccessInboxSnapshot({
  ticketStatus,
  waitingStatus,
  requestDecision,
  requesterType,
  notificationStatus,
  notificationChannel,
  runId,
  nodeRunId,
  accessRequestId,
  approvalTicketId
}: SensitiveAccessInboxOptions = {}): Promise<SensitiveAccessInboxSnapshot> {
  const params = new URLSearchParams();
  if (ticketStatus) {
    params.set("status", ticketStatus);
  }
  if (waitingStatus) {
    params.set("waiting_status", waitingStatus);
  }
  if (requestDecision) {
    params.set("decision", requestDecision);
  }
  if (requesterType) {
    params.set("requester_type", requesterType);
  }
  if (notificationStatus) {
    params.set("notification_status", notificationStatus);
  }
  if (notificationChannel) {
    params.set("notification_channel", notificationChannel);
  }
  if (runId?.trim()) {
    params.set("run_id", runId.trim());
  }
  if (nodeRunId?.trim()) {
    params.set("node_run_id", nodeRunId.trim());
  }
  if (accessRequestId?.trim()) {
    params.set("access_request_id", accessRequestId.trim());
  }
  if (approvalTicketId?.trim()) {
    params.set("approval_ticket_id", approvalTicketId.trim());
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";

  let body: SensitiveAccessInboxResponseBody | null = null;
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/sensitive-access/inbox${query}`, {
      cache: "no-store"
    });
    if (response.ok) {
      body = (await response.json()) as SensitiveAccessInboxResponseBody;
    }
  } catch {
    body = null;
  }

  const resources = body?.resources ?? [];
  const requests = body?.requests ?? [];
  const notifications = body?.notifications ?? [];
  const channels = body?.channels ?? [];
  const executionViewsByRunId = new Map(
    (body?.execution_views ?? []).map((item) => [item.run_id, item] as const)
  );

  const entries = (body?.entries ?? [])
    .map((entry) => ({
      ticket: entry.ticket,
      request: entry.request ?? null,
      resource: entry.resource ?? null,
      notifications: entry.notifications ?? []
    }))
    .map((entry) => ({
      ...entry,
      callbackWaitingContext: buildSensitiveAccessInboxEntryCallbackContext(
        entry,
        executionViewsByRunId.get(entry.ticket.run_id ?? entry.request?.run_id ?? "") ?? null
      ),
      executionContext: buildSensitiveAccessInboxEntryExecutionContext(
        entry,
        executionViewsByRunId.get(entry.ticket.run_id ?? entry.request?.run_id ?? "") ?? null
      )
    }))
    .sort(
      (left, right) =>
        new Date(right.ticket.created_at).getTime() - new Date(left.ticket.created_at).getTime()
    );

  return {
    entries,
    channels,
    resources,
    requests,
    notifications,
    summary: body?.summary ?? buildInboxSummary(entries)
  };
}

async function getSensitiveResources(): Promise<SensitiveResourceItem[]> {
  return fetchSensitiveAccessList<SensitiveResourceItem>("/api/sensitive-access/resources");
}

async function getSensitiveAccessRequests({
  decision,
  requesterType,
  runId,
  nodeRunId,
  accessRequestId
}: {
  decision?: NonNullable<SensitiveAccessRequestItem["decision"]>;
  requesterType?: SensitiveAccessRequestItem["requester_type"];
  runId?: string;
  nodeRunId?: string;
  accessRequestId?: string;
} = {}): Promise<SensitiveAccessRequestItem[]> {
  const params = new URLSearchParams();
  if (decision) {
    params.set("decision", decision);
  }
  if (requesterType) {
    params.set("requester_type", requesterType);
  }
  if (runId?.trim()) {
    params.set("run_id", runId.trim());
  }
  if (nodeRunId?.trim()) {
    params.set("node_run_id", nodeRunId.trim());
  }
  if (accessRequestId?.trim()) {
    params.set("access_request_id", accessRequestId.trim());
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchSensitiveAccessList<SensitiveAccessRequestItem>(
    `/api/sensitive-access/requests${query}`
  );
}

async function getApprovalTickets({
  status,
  waitingStatus,
  runId,
  nodeRunId,
  accessRequestId,
  approvalTicketId
}: {
  status?: ApprovalTicketItem["status"];
  waitingStatus?: ApprovalTicketItem["waiting_status"];
  runId?: string;
  nodeRunId?: string;
  accessRequestId?: string;
  approvalTicketId?: string;
} = {}): Promise<ApprovalTicketItem[]> {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
  if (waitingStatus) {
    params.set("waiting_status", waitingStatus);
  }
  if (runId?.trim()) {
    params.set("run_id", runId.trim());
  }
  if (nodeRunId?.trim()) {
    params.set("node_run_id", nodeRunId.trim());
  }
  if (accessRequestId?.trim()) {
    params.set("access_request_id", accessRequestId.trim());
  }
  if (approvalTicketId?.trim()) {
    params.set("approval_ticket_id", approvalTicketId.trim());
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchSensitiveAccessList<ApprovalTicketItem>(
    `/api/sensitive-access/approval-tickets${query}`
  );
}

async function getNotificationDispatches({
  approvalTicketId,
  runId,
  nodeRunId,
  accessRequestId,
  status,
  channel
}: {
  approvalTicketId?: string;
  runId?: string;
  nodeRunId?: string;
  accessRequestId?: string;
  status?: NotificationDispatchItem["status"];
  channel?: NotificationDispatchItem["channel"];
} = {}): Promise<NotificationDispatchItem[]> {
  const params = new URLSearchParams();
  if (approvalTicketId?.trim()) {
    params.set("approval_ticket_id", approvalTicketId.trim());
  }
  if (runId?.trim()) {
    params.set("run_id", runId.trim());
  }
  if (nodeRunId?.trim()) {
    params.set("node_run_id", nodeRunId.trim());
  }
  if (accessRequestId?.trim()) {
    params.set("access_request_id", accessRequestId.trim());
  }
  if (status) {
    params.set("status", status);
  }
  if (channel) {
    params.set("channel", channel);
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchSensitiveAccessList<NotificationDispatchItem>(
    `/api/sensitive-access/notification-dispatches${query}`
  );
}

async function getNotificationChannels(): Promise<NotificationChannelCapabilityItem[]> {
  return fetchSensitiveAccessList<NotificationChannelCapabilityItem>(
    "/api/sensitive-access/notification-channels"
  );
}

async function fetchSensitiveAccessList<T>(path: string): Promise<T[]> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as T[];
  } catch {
    return [];
  }
}

function groupNotificationsByTicket(
  notifications: NotificationDispatchItem[]
): Record<string, NotificationDispatchItem[]> {
  return notifications.reduce<Record<string, NotificationDispatchItem[]>>((accumulator, item) => {
    if (!accumulator[item.approval_ticket_id]) {
      accumulator[item.approval_ticket_id] = [];
    }
    accumulator[item.approval_ticket_id].push(item);
    return accumulator;
  }, {});
}

function buildInboxSummary(
  entries: SensitiveAccessInboxEntry[]
): SensitiveAccessInboxSummary {
  const notifications = entries.flatMap((entry) => entry.notifications);

  return {
    ticket_count: entries.length,
    pending_ticket_count: entries.filter((item) => item.ticket.status === "pending").length,
    approved_ticket_count: entries.filter((item) => item.ticket.status === "approved").length,
    rejected_ticket_count: entries.filter((item) => item.ticket.status === "rejected").length,
    expired_ticket_count: entries.filter((item) => item.ticket.status === "expired").length,
    waiting_ticket_count: entries.filter((item) => item.ticket.waiting_status === "waiting").length,
    resumed_ticket_count: entries.filter((item) => item.ticket.waiting_status === "resumed").length,
    failed_ticket_count: entries.filter((item) => item.ticket.waiting_status === "failed").length,
    pending_notification_count: notifications.filter((item) => item.status === "pending").length,
    delivered_notification_count: notifications.filter((item) => item.status === "delivered").length,
    failed_notification_count: notifications.filter((item) => item.status === "failed").length
  };
}
