import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  normalizeOperatorRunFollowUp,
  normalizeOperatorRunSnapshot,
  type OperatorRunFollowUpBody,
  type OperatorRunSnapshotBody
} from "@/app/actions/run-snapshot";
import type {
  CallbackWaitingLifecycleSummary,
  SkillReferenceLoadItem
} from "@/lib/get-run-views";
import {
  buildSensitiveAccessInboxEntryCallbackContext,
  type SensitiveAccessInboxCallbackContext
} from "@/lib/sensitive-access-inbox-callback-context";
import {
  buildSensitiveAccessInboxEntryExecutionContext,
  type SensitiveAccessInboxExecutionContext
} from "@/lib/sensitive-access-inbox-execution-context";
import { resolveSensitiveAccessCanonicalRunSnapshot } from "@/lib/sensitive-access";

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
  executionFocusNodeName?: string | null;
  executionFocusNodeType?: string | null;
  executionFocusExplanation?: SignalFollowUpExplanation | null;
  callbackWaitingExplanation?: SignalFollowUpExplanation | null;
  callbackWaitingLifecycle?: CallbackWaitingLifecycleSummary | null;
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeReason?: string | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
  scheduledResumeRequeuedAt?: string | null;
  scheduledResumeRequeueSource?: string | null;
  executionFocusArtifactCount?: number;
  executionFocusArtifactRefCount?: number;
  executionFocusToolCallCount?: number;
  executionFocusRawRefCount?: number;
  executionFocusArtifactRefs?: string[];
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
    requested_execution_class?: string | null;
    requested_execution_source?: string | null;
    requested_execution_profile?: string | null;
    requested_execution_timeout_ms?: number | null;
    requested_execution_network_policy?: string | null;
    requested_execution_filesystem_policy?: string | null;
    requested_execution_dependency_mode?: string | null;
    requested_execution_builtin_package_set?: string | null;
    requested_execution_dependency_ref?: string | null;
    requested_execution_backend_extensions?: Record<string, unknown> | null;
    effective_execution_class?: string | null;
    execution_executor_ref?: string | null;
    execution_sandbox_backend_id?: string | null;
    execution_sandbox_backend_executor_ref?: string | null;
    execution_sandbox_runner_kind?: string | null;
    execution_blocking_reason?: string | null;
    execution_fallback_reason?: string | null;
    response_summary?: string | null;
    response_content_type?: string | null;
    raw_ref?: string | null;
  }>;
  executionFocusSkillTrace?: {
    reference_count: number;
    phase_counts: Record<string, number>;
    source_counts: Record<string, number>;
    loads: SkillReferenceLoadItem[];
  } | null;
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
  runSnapshot?: OperatorRunSnapshotSummary | null;
  runFollowUp?: NonNullable<ReturnType<typeof normalizeOperatorRunFollowUp>> | null;
  callbackWaitingContext?: SensitiveAccessInboxCallbackContext | null;
  executionContext?: SensitiveAccessInboxExecutionContext | null;
};

export type SensitiveAccessTimelineEntry = {
  request: SensitiveAccessRequestItem;
  resource: SensitiveResourceItem;
  approval_ticket?: ApprovalTicketItem | null;
  notifications: NotificationDispatchItem[];
  outcome_explanation?: SignalFollowUpExplanation | null;
  run_snapshot?: OperatorRunSnapshotSummary | null;
  run_follow_up?: {
    affected_run_count: number;
    sampled_run_count: number;
    waiting_run_count: number;
    running_run_count: number;
    succeeded_run_count: number;
    failed_run_count: number;
    unknown_run_count: number;
    recommended_action?: {
      kind: string;
      entry_key: string;
      href: string | null;
      label: string | null;
    } | null;
    sampled_runs: Array<{
      run_id: string;
      snapshot?: OperatorRunSnapshotSummary | null;
    }>;
    explanation?: SignalFollowUpExplanation | null;
  } | null;
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
  affected_run_count?: number;
  affected_workflow_count?: number;
  primary_blocker_kind?:
    | "pending_approval"
    | "waiting_resume"
    | "failed_notification"
    | "pending_notification"
    | null;
  blockers?: Array<{
    kind:
      | "pending_approval"
      | "waiting_resume"
      | "failed_notification"
      | "pending_notification";
    tone: "blocked" | "degraded";
    item_count: number;
    affected_run_count: number;
    affected_workflow_count: number;
  }>;
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
  runFollowUp?: NonNullable<ReturnType<typeof normalizeOperatorRunFollowUp>> | null;
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
  run_snapshot?: OperatorRunSnapshotBody | OperatorRunSnapshotSummary | null;
  run_follow_up?: OperatorRunFollowUpBody | null;
};

type SensitiveAccessInboxResponseBody = {
  entries?: SensitiveAccessInboxEntryBody[];
  channels?: NotificationChannelCapabilityItem[];
  resources?: SensitiveResourceItem[];
  requests?: SensitiveAccessRequestItem[];
  notifications?: NotificationDispatchItem[];
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
  const entries = (body?.entries ?? [])
    .map((entry) => ({
      ticket: entry.ticket,
      request: entry.request ?? null,
      resource: entry.resource ?? null,
      notifications: entry.notifications ?? [],
      runSnapshot: normalizeOperatorRunSnapshot(entry.run_snapshot) ?? null,
      runFollowUp: normalizeOperatorRunFollowUp(entry.run_follow_up) ?? null
    }))
    .map((entry) => {
      const runContext = resolveSensitiveAccessCanonicalRunSnapshot({
        requestRunId: entry.request?.run_id,
        approvalTicketRunId: entry.ticket.run_id,
        runSnapshot: entry.runSnapshot,
        runFollowUp: entry.runFollowUp
      });

      return {
        ...entry,
        callbackWaitingContext: buildSensitiveAccessInboxEntryCallbackContext(
          entry,
          runContext.snapshot,
          runContext.runId
        ),
        executionContext: buildSensitiveAccessInboxEntryExecutionContext(
          entry,
          runContext.snapshot,
          runContext.runId
        )
      };
    })
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
    summary: normalizeInboxSummary(body?.summary ?? null, entries)
  };
}

function normalizeInboxSummary(
  summary: SensitiveAccessInboxSummary | null | undefined,
  entries: SensitiveAccessInboxEntry[]
): SensitiveAccessInboxSummary {
  const fallback = buildInboxSummary(entries);
  if (!summary) {
    return fallback;
  }

  return {
    ...fallback,
    ...summary,
    primary_blocker_kind: summary.primary_blocker_kind ?? fallback.primary_blocker_kind,
    blockers: summary.blockers ?? fallback.blockers
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
  const collectImpactedScope = (
    scopedEntries: SensitiveAccessInboxEntry[]
  ): { runIds: Set<string>; workflowIds: Set<string> } => {
    const runIds = new Set<string>();
    const workflowIds = new Set<string>();
    scopedEntries.forEach((entry) => {
      const runId =
        entry.ticket.run_id?.trim() ||
        entry.request?.run_id?.trim() ||
        entry.runFollowUp?.sampledRuns.find((sample) => sample.runId.trim())?.runId?.trim() ||
        null;
      if (runId) {
        runIds.add(runId);
      }

      const workflowId =
        entry.runSnapshot?.workflowId?.trim() ||
        entry.runFollowUp?.sampledRuns
          .map((sample) => sample.snapshot?.workflowId?.trim() ?? "")
          .find(Boolean) ||
        null;
      if (workflowId) {
        workflowIds.add(workflowId);
      }
    });
    return { runIds, workflowIds };
  };

  const { runIds, workflowIds } = collectImpactedScope(entries);
  const blockers = [
    {
      kind: "pending_approval" as const,
      tone: "blocked" as const,
      item_count: entries.filter((item) => item.ticket.status === "pending").length,
      entries: entries.filter((item) => item.ticket.status === "pending")
    },
    {
      kind: "waiting_resume" as const,
      tone: "blocked" as const,
      item_count: entries.filter((item) => item.ticket.waiting_status === "waiting").length,
      entries: entries.filter((item) => item.ticket.waiting_status === "waiting")
    },
    {
      kind: "failed_notification" as const,
      tone: "blocked" as const,
      item_count: notifications.filter((item) => item.status === "failed").length,
      entries: entries.filter((item) => item.notifications.some((notification) => notification.status === "failed"))
    },
    {
      kind: "pending_notification" as const,
      tone: "degraded" as const,
      item_count: notifications.filter((item) => item.status === "pending").length,
      entries: entries.filter((item) => item.notifications.some((notification) => notification.status === "pending"))
    }
  ]
    .filter((blocker) => blocker.item_count > 0)
    .map((blocker) => {
      const blockerScope = collectImpactedScope(blocker.entries);
      return {
        kind: blocker.kind,
        tone: blocker.tone,
        item_count: blocker.item_count,
        affected_run_count: blockerScope.runIds.size,
        affected_workflow_count: blockerScope.workflowIds.size
      };
    });

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
    failed_notification_count: notifications.filter((item) => item.status === "failed").length,
    affected_run_count: runIds.size,
    affected_workflow_count: workflowIds.size,
    primary_blocker_kind: blockers[0]?.kind ?? null,
    blockers
  };
}
