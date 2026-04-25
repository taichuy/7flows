import type { AgentFlowTraceItem } from '../../api/runtime';

export function filterTraceItemsByNode(
  traceItems: AgentFlowTraceItem[],
  nodeId: string | null
) {
  if (!nodeId) {
    return traceItems;
  }

  return traceItems.filter((item) => item.nodeId === nodeId);
}
