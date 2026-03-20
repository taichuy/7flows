import type {
  ApprovalTicketItem,
  NotificationChannelCapabilityItem,
  NotificationDispatchItem,
  SensitiveAccessRequestItem
} from "@/lib/get-sensitive-access";

export type SensitiveAccessInboxPageFilterState = {
  status: ApprovalTicketItem["status"] | null;
  waitingStatus: ApprovalTicketItem["waiting_status"] | null;
  requestDecision: NonNullable<SensitiveAccessRequestItem["decision"]> | null;
  requesterType: SensitiveAccessRequestItem["requester_type"] | null;
  notificationStatus: NotificationDispatchItem["status"] | null;
  notificationChannel: NotificationDispatchItem["channel"] | null;
  runId: string | null;
  nodeRunId: string | null;
  accessRequestId: string | null;
  approvalTicketId: string | null;
};

export type SensitiveAccessInboxFilterChip = {
  key: string;
  label: string;
};

export const APPROVAL_STATUS_OPTIONS: Array<ApprovalTicketItem["status"]> = [
  "pending",
  "approved",
  "rejected",
  "expired"
];

export const WAITING_STATUS_OPTIONS: Array<ApprovalTicketItem["waiting_status"]> = [
  "waiting",
  "resumed",
  "failed"
];

export const REQUEST_DECISION_OPTIONS: Array<
  NonNullable<SensitiveAccessRequestItem["decision"]>
> = ["allow", "deny", "require_approval", "allow_masked"];

export const REQUESTER_TYPE_OPTIONS: Array<SensitiveAccessRequestItem["requester_type"]> = [
  "human",
  "ai",
  "workflow",
  "tool"
];

export const NOTIFICATION_STATUS_OPTIONS: Array<NotificationDispatchItem["status"]> = [
  "pending",
  "delivered",
  "failed"
];

export const NOTIFICATION_CHANNEL_OPTIONS: Array<NotificationDispatchItem["channel"]> = [
  "in_app",
  "webhook",
  "feishu",
  "slack",
  "email"
];

export const CHANNEL_TARGET_KIND_LABELS: Record<
  NotificationChannelCapabilityItem["target_kind"],
  string
> = {
  in_app: "站内 inbox",
  http_url: "Webhook URL",
  email_list: "邮箱列表"
};

export const CHANNEL_CONFIG_STATUS_LABELS: Record<
  NotificationChannelCapabilityItem["config_facts"][number]["status"],
  string
> = {
  configured: "configured",
  missing: "missing",
  info: "info"
};

export function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function formatChannelTimestamp(value?: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

export function hasActiveInboxFilters(filters: SensitiveAccessInboxPageFilterState) {
  return hasActiveInboxScopeFilters(filters) || hasActiveInboxSliceFilters(filters);
}

export function hasActiveInboxScopeFilters(filters: SensitiveAccessInboxPageFilterState) {
  return Boolean(
    filters.status ||
      filters.waitingStatus ||
      filters.requestDecision ||
      filters.requesterType ||
      filters.notificationStatus ||
      filters.notificationChannel
  );
}

export function hasActiveInboxSliceFilters(filters: SensitiveAccessInboxPageFilterState) {
  return Boolean(
    filters.runId || filters.nodeRunId || filters.accessRequestId || filters.approvalTicketId
  );
}

export function buildSensitiveAccessInboxScopeChips(
  filters: SensitiveAccessInboxPageFilterState
): SensitiveAccessInboxFilterChip[] {
  const chips: SensitiveAccessInboxFilterChip[] = [];

  if (filters.status) {
    chips.push({ key: "status", label: `ticket ${filters.status}` });
  }
  if (filters.waitingStatus) {
    chips.push({ key: "waitingStatus", label: `recovery ${filters.waitingStatus}` });
  }
  if (filters.requestDecision) {
    chips.push({ key: "requestDecision", label: `decision ${filters.requestDecision}` });
  }
  if (filters.requesterType) {
    chips.push({ key: "requesterType", label: `requester ${filters.requesterType}` });
  }
  if (filters.notificationStatus) {
    chips.push({ key: "notificationStatus", label: `notify ${filters.notificationStatus}` });
  }
  if (filters.notificationChannel) {
    chips.push({ key: "notificationChannel", label: `channel ${filters.notificationChannel}` });
  }

  return chips;
}

export function buildSensitiveAccessInboxSliceChips(
  filters: SensitiveAccessInboxPageFilterState
): SensitiveAccessInboxFilterChip[] {
  const chips: SensitiveAccessInboxFilterChip[] = [];

  if (filters.runId) {
    chips.push({ key: "runId", label: `run slice ${filters.runId}` });
  }
  if (filters.nodeRunId) {
    chips.push({ key: "nodeRunId", label: `node run ${filters.nodeRunId}` });
  }
  if (filters.accessRequestId) {
    chips.push({
      key: "accessRequestId",
      label: `request ${filters.accessRequestId.slice(0, 8)}`
    });
  }
  if (filters.approvalTicketId) {
    chips.push({
      key: "approvalTicketId",
      label: `ticket ${filters.approvalTicketId.slice(0, 8)}`
    });
  }

  return chips;
}

export function clearSensitiveAccessInboxScopeFilters(
  filters: SensitiveAccessInboxPageFilterState
): SensitiveAccessInboxPageFilterState {
  return {
    ...filters,
    status: null,
    waitingStatus: null,
    requestDecision: null,
    requesterType: null,
    notificationStatus: null,
    notificationChannel: null
  };
}

export function clearSensitiveAccessInboxSliceFilters(
  filters: SensitiveAccessInboxPageFilterState
): SensitiveAccessInboxPageFilterState {
  return {
    ...filters,
    runId: null,
    nodeRunId: null,
    accessRequestId: null,
    approvalTicketId: null
  };
}
