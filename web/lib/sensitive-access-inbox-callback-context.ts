import type { RunExecutionView } from "@/lib/get-run-views";
import type {
  SensitiveAccessInboxEntry,
  SensitiveAccessTimelineEntry
} from "@/lib/get-sensitive-access";

export type SensitiveAccessInboxCallbackContext = {
  runId: string;
  nodeRunId: string;
  waitingReason?: string | null;
  lifecycle?: RunExecutionView["nodes"][number]["callback_waiting_lifecycle"];
  callbackTickets: RunExecutionView["nodes"][number]["callback_tickets"];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasCallbackSignals(node: RunExecutionView["nodes"][number]) {
  return Boolean(
    node.waiting_reason ||
      node.callback_waiting_lifecycle ||
      typeof node.scheduled_resume_delay_seconds === "number" ||
      node.callback_tickets.length > 0
  );
}

function buildInlineSensitiveAccessEntries(
  entry: SensitiveAccessInboxEntry
): SensitiveAccessTimelineEntry[] {
  if (!entry.request || !entry.resource) {
    return [];
  }

  return [
    {
      request: entry.request,
      resource: entry.resource,
      approval_ticket: entry.ticket,
      notifications: entry.notifications
    }
  ];
}

function pickExecutionNode(
  entry: SensitiveAccessInboxEntry,
  executionView?: Pick<RunExecutionView, "nodes"> | null
) {
  if (!executionView) {
    return null;
  }

  const nodeRunId = trimOrNull(entry.ticket.node_run_id) ?? trimOrNull(entry.request?.node_run_id);
  if (nodeRunId) {
    return executionView.nodes.find((node) => node.node_run_id === nodeRunId) ?? null;
  }

  const ticketId = trimOrNull(entry.ticket.id);
  const requestId = trimOrNull(entry.request?.id);
  return (
    executionView.nodes.find((node) =>
      node.sensitive_access_entries.some(
        (item) => item.approval_ticket?.id === ticketId || item.request.id === requestId
      )
    ) ?? null
  );
}

export function buildSensitiveAccessInboxEntryCallbackContext(
  entry: SensitiveAccessInboxEntry,
  executionView?: Pick<RunExecutionView, "nodes"> | null
): SensitiveAccessInboxCallbackContext | null {
  const runId = trimOrNull(entry.ticket.run_id) ?? trimOrNull(entry.request?.run_id);
  const node = pickExecutionNode(entry, executionView);
  if (!runId || !node || !hasCallbackSignals(node)) {
    return null;
  }

  return {
    runId,
    nodeRunId: node.node_run_id,
    waitingReason: node.waiting_reason,
    lifecycle: node.callback_waiting_lifecycle,
    callbackTickets: node.callback_tickets,
    sensitiveAccessEntries: buildInlineSensitiveAccessEntries(entry),
    scheduledResumeDelaySeconds: node.scheduled_resume_delay_seconds,
    scheduledResumeSource: node.scheduled_resume_source,
    scheduledWaitingStatus: node.scheduled_waiting_status,
    scheduledResumeScheduledAt: node.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: node.scheduled_resume_due_at
  };
}
