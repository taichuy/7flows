import type {
  ApprovalTicketItem,
  NotificationDispatchItem,
  SensitiveAccessRequestItem,
  SensitiveAccessTimelineEntry
} from "@/lib/get-sensitive-access";

type SensitiveAccessInboxHrefOptions = {
  status?: ApprovalTicketItem["status"] | null;
  waitingStatus?: ApprovalTicketItem["waiting_status"] | null;
  requestDecision?: NonNullable<SensitiveAccessRequestItem["decision"]> | null;
  requesterType?: SensitiveAccessRequestItem["requester_type"] | null;
  notificationStatus?: NotificationDispatchItem["status"] | null;
  notificationChannel?: NotificationDispatchItem["channel"] | null;
  runId?: string | null;
  nodeRunId?: string | null;
  accessRequestId?: string | null;
  approvalTicketId?: string | null;
};

export function buildSensitiveAccessInboxHref({
  status,
  waitingStatus,
  requestDecision,
  requesterType,
  notificationStatus,
  notificationChannel,
  runId,
  nodeRunId,
  accessRequestId,
  approvalTicketId
}: SensitiveAccessInboxHrefOptions): string {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
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

  const query = params.toString();
  return query ? `/sensitive-access?${query}` : "/sensitive-access";
}

export function buildSensitiveAccessTimelineInboxHref(
  entry: SensitiveAccessTimelineEntry,
  defaultRunId?: string | null
): string {
  return buildSensitiveAccessInboxHref({
    runId: entry.request.run_id ?? entry.approval_ticket?.run_id ?? defaultRunId ?? null,
    nodeRunId: entry.request.node_run_id ?? entry.approval_ticket?.node_run_id ?? null,
    status: entry.approval_ticket?.status ?? null,
    waitingStatus: entry.approval_ticket?.waiting_status ?? null,
    accessRequestId: entry.request.id,
    approvalTicketId: entry.approval_ticket?.id ?? null
  });
}
