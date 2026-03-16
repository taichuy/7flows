import { getApiBaseUrl } from "@/lib/api-base-url";

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
  reason_code?: string | null;
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
};

export type SensitiveAccessTimelineEntry = {
  request: SensitiveAccessRequestItem;
  resource: SensitiveResourceItem;
  approval_ticket?: ApprovalTicketItem | null;
  notifications: NotificationDispatchItem[];
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

export type SensitiveAccessInboxSnapshot = {
  entries: SensitiveAccessInboxEntry[];
  channels: NotificationChannelCapabilityItem[];
  resources: SensitiveResourceItem[];
  requests: SensitiveAccessRequestItem[];
  notifications: NotificationDispatchItem[];
  summary: SensitiveAccessInboxSummary;
};

type SensitiveAccessInboxOptions = {
  ticketStatus?: ApprovalTicketItem["status"];
  waitingStatus?: ApprovalTicketItem["waiting_status"];
  runId?: string;
};

export async function getSensitiveAccessInboxSnapshot({
  ticketStatus,
  waitingStatus,
  runId
}: SensitiveAccessInboxOptions = {}): Promise<SensitiveAccessInboxSnapshot> {
  const [resources, requests, tickets, notifications, channels] = await Promise.all([
    getSensitiveResources(),
    getSensitiveAccessRequests(),
    getApprovalTickets({ status: ticketStatus, waitingStatus, runId }),
    getNotificationDispatches(),
    getNotificationChannels()
  ]);

  const requestsById = new Map(requests.map((item) => [item.id, item]));
  const resourcesById = new Map(resources.map((item) => [item.id, item]));
  const notificationsByTicketId = groupNotificationsByTicket(notifications);
  const entries = tickets
    .map((ticket) => {
      const request = requestsById.get(ticket.access_request_id) ?? null;
      return {
        ticket,
        request,
        resource: request ? (resourcesById.get(request.resource_id) ?? null) : null,
        notifications: notificationsByTicketId[ticket.id] ?? []
      } satisfies SensitiveAccessInboxEntry;
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
    summary: buildInboxSummary(entries)
  };
}

async function getSensitiveResources(): Promise<SensitiveResourceItem[]> {
  return fetchSensitiveAccessList<SensitiveResourceItem>("/api/sensitive-access/resources");
}

async function getSensitiveAccessRequests(): Promise<SensitiveAccessRequestItem[]> {
  return fetchSensitiveAccessList<SensitiveAccessRequestItem>("/api/sensitive-access/requests");
}

async function getApprovalTickets({
  status,
  waitingStatus,
  runId
}: {
  status?: ApprovalTicketItem["status"];
  waitingStatus?: ApprovalTicketItem["waiting_status"];
  runId?: string;
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

  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchSensitiveAccessList<ApprovalTicketItem>(
    `/api/sensitive-access/approval-tickets${query}`
  );
}

async function getNotificationDispatches(): Promise<NotificationDispatchItem[]> {
  return fetchSensitiveAccessList<NotificationDispatchItem>(
    "/api/sensitive-access/notification-dispatches"
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
