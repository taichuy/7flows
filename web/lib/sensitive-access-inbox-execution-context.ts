import type {
  RunExecutionFocusReason,
  RunExecutionNodeItem,
  RunExecutionView
} from "@/lib/get-run-views";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

export type SensitiveAccessInboxExecutionContext = {
  runId: string;
  entryNode: RunExecutionNodeItem | null;
  focusNode: RunExecutionNodeItem;
  focusReason?: RunExecutionFocusReason | null;
  focusMatchesEntry: boolean;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

export function buildSensitiveAccessInboxEntryExecutionContext(
  entry: SensitiveAccessInboxEntry,
  executionView?: Pick<
    RunExecutionView,
    "run_id" | "nodes" | "execution_focus_reason" | "execution_focus_node"
  > | null
): SensitiveAccessInboxExecutionContext | null {
  const runId =
    trimOrNull(entry.ticket.run_id) ??
    trimOrNull(entry.request?.run_id) ??
    trimOrNull(executionView?.run_id);
  const focusNode = executionView?.execution_focus_node ?? null;
  if (!runId || !focusNode) {
    return null;
  }

  const entryNode = pickExecutionNode(entry, executionView);
  return {
    runId,
    entryNode,
    focusNode,
    focusReason: executionView?.execution_focus_reason ?? null,
    focusMatchesEntry: entryNode?.node_run_id === focusNode.node_run_id
  };
}
