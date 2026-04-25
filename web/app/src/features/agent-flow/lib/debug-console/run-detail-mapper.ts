import type {
  AgentFlowDebugMessage,
  AgentFlowDebugMessageStatus,
  AgentFlowTraceItem,
  FlowDebugRunDetail
} from '../../api/runtime';

function findFirstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nextValue = findFirstString(entry);

      if (nextValue) {
        return nextValue;
      }
    }

    return null;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const nextValue = findFirstString(entry);

      if (nextValue) {
        return nextValue;
      }
    }
  }

  return null;
}

function summarizePayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || Object.keys(payload).length === 0) {
    return '';
  }

  return JSON.stringify(payload, null, 2);
}

function mapMessageStatus(status: string): AgentFlowDebugMessageStatus {
  switch (status) {
    case 'succeeded':
      return 'completed';
    case 'waiting_callback':
      return 'waiting_callback';
    case 'waiting_human':
      return 'waiting_human';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return 'running';
  }
}

export function mapRunDetailToTrace(detail: FlowDebugRunDetail): AgentFlowTraceItem[] {
  return detail.node_runs.map((nodeRun) => ({
    nodeId: nodeRun.node_id,
    nodeAlias: nodeRun.node_alias,
    nodeType: nodeRun.node_type,
    status: nodeRun.status,
    startedAt: nodeRun.started_at,
    finishedAt: nodeRun.finished_at,
    durationMs: nodeRun.finished_at
      ? Math.max(
          new Date(nodeRun.finished_at).getTime() -
            new Date(nodeRun.started_at).getTime(),
          0
        )
      : null,
    inputPayload: nodeRun.input_payload,
    outputPayload: nodeRun.output_payload,
    errorPayload: nodeRun.error_payload,
    metricsPayload: nodeRun.metrics_payload
  }));
}

export function extractAssistantOutputText(detail: FlowDebugRunDetail): string {
  if (
    detail.flow_run.status === 'waiting_human' ||
    detail.flow_run.status === 'waiting_callback' ||
    detail.flow_run.status === 'cancelled'
  ) {
    return '';
  }

  const outputPayloadText = findFirstString(detail.flow_run.output_payload);

  if (outputPayloadText) {
    return outputPayloadText;
  }

  const preferredNodeRun =
    [...detail.node_runs]
      .reverse()
      .find((nodeRun) => findFirstString(nodeRun.output_payload)) ?? null;

  if (preferredNodeRun) {
    return findFirstString(preferredNodeRun.output_payload) ?? '';
  }

  if (detail.flow_run.error_payload) {
    return summarizePayload(detail.flow_run.error_payload);
  }

  return summarizePayload(detail.flow_run.output_payload);
}

export function mapRunDetailToConversation(
  detail: FlowDebugRunDetail
): AgentFlowDebugMessage {
  const traceItems = mapRunDetailToTrace(detail);
  const rawOutput =
    Object.keys(detail.flow_run.output_payload).length > 0
      ? detail.flow_run.output_payload
      : null;

  return {
    id: `assistant-${detail.flow_run.id}`,
    role: 'assistant',
    content: extractAssistantOutputText(detail),
    status: mapMessageStatus(detail.flow_run.status),
    runId: detail.flow_run.id,
    rawOutput,
    traceSummary: traceItems.slice(0, 3)
  };
}
