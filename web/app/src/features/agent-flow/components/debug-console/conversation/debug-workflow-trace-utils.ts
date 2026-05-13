import type { AgentFlowTraceItem } from '../../../api/runtime';

export function getTraceItemKey(item: AgentFlowTraceItem) {
  return item.nodeRunId ?? item.nodeId;
}

export function nodeDisplayName(item: AgentFlowTraceItem) {
  if (item.nodeType === 'start') {
    return '用户输入';
  }

  if (item.nodeType === 'answer') {
    return '直接回复';
  }

  return item.nodeAlias;
}
