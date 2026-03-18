import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export type SensitiveAccessInboxEntryScope = {
  runId: string | null;
  nodeRunId: string | null;
};

export function resolveSensitiveAccessInboxEntryScope(
  entry: Pick<SensitiveAccessInboxEntry, "ticket" | "request" | "callbackWaitingContext">
): SensitiveAccessInboxEntryScope {
  return {
    runId:
      trimOrNull(entry.ticket.run_id) ??
      trimOrNull(entry.request?.run_id) ??
      trimOrNull(entry.callbackWaitingContext?.runId),
    nodeRunId:
      trimOrNull(entry.ticket.node_run_id) ??
      trimOrNull(entry.request?.node_run_id) ??
      trimOrNull(entry.callbackWaitingContext?.nodeRunId)
  };
}
