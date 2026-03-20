import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export type SensitiveAccessInboxEntryScope = {
  runId: string | null;
  nodeRunId: string | null;
};

export type SensitiveAccessInboxEntryScopes = {
  display: SensitiveAccessInboxEntryScope;
  action: SensitiveAccessInboxEntryScope;
};

type SensitiveAccessInboxEntryScopeInput = Pick<
  SensitiveAccessInboxEntry,
  "ticket" | "request" | "callbackWaitingContext" | "executionContext"
>;

function resolveSensitiveAccessInboxEntryDisplayScope(
  entry: SensitiveAccessInboxEntryScopeInput
): SensitiveAccessInboxEntryScope {
  return {
    runId:
      trimOrNull(entry.callbackWaitingContext?.runId) ??
      trimOrNull(entry.executionContext?.runId) ??
      trimOrNull(entry.ticket.run_id) ??
      trimOrNull(entry.request?.run_id),
    nodeRunId:
      trimOrNull(entry.callbackWaitingContext?.nodeRunId) ??
      trimOrNull(entry.executionContext?.focusNode.node_run_id) ??
      trimOrNull(entry.ticket.node_run_id) ??
      trimOrNull(entry.request?.node_run_id) ??
      trimOrNull(entry.executionContext?.entryNodeRunId)
  };
}

export function resolveSensitiveAccessInboxEntryActionScope(
  entry: SensitiveAccessInboxEntryScopeInput
): SensitiveAccessInboxEntryScope {
  return {
    runId:
      trimOrNull(entry.ticket.run_id) ??
      trimOrNull(entry.request?.run_id) ??
      trimOrNull(entry.callbackWaitingContext?.runId) ??
      trimOrNull(entry.executionContext?.runId),
    nodeRunId:
      trimOrNull(entry.ticket.node_run_id) ??
      trimOrNull(entry.request?.node_run_id) ??
      trimOrNull(entry.executionContext?.entryNodeRunId)
  };
}

export function resolveSensitiveAccessInboxEntryScopes(
  entry: SensitiveAccessInboxEntryScopeInput
): SensitiveAccessInboxEntryScopes {
  return {
    display: resolveSensitiveAccessInboxEntryDisplayScope(entry),
    action: resolveSensitiveAccessInboxEntryActionScope(entry)
  };
}

export function resolveSensitiveAccessInboxEntryScope(
  entry: SensitiveAccessInboxEntryScopeInput
): SensitiveAccessInboxEntryScope {
  return resolveSensitiveAccessInboxEntryDisplayScope(entry);
}
