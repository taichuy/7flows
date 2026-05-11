import type {
  AgentFlowDebugMessage,
  AgentFlowDebugMessageStatus,
  AgentFlowTraceItem,
  FlowDebugRunDetail
} from '../../api/runtime';
import {
  appendReasoningDeltaToAssistantContent,
  appendTextDeltaToAssistantContent,
  closeOpenThinkBlock,
  parseAssistantContent
} from './assistant-content';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractDeltaText(payload: unknown): string {
  if (!isRecord(payload)) {
    return '';
  }

  for (const key of ['text', 'delta']) {
    const value = payload[key];

    if (typeof value === 'string') {
      return value;
    }
  }

  return '';
}

function collectDeltaEvents(
  detail: FlowDebugRunDetail,
  eventType: 'text_delta' | 'reasoning_delta'
): string | null {
  const text = detail.events
    .filter((event) => event.event_type === eventType)
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => extractDeltaText(event.payload))
    .join('');

  return text.trim().length > 0 ? text : null;
}

function collectTextDeltaEvents(detail: FlowDebugRunDetail): string | null {
  return collectDeltaEvents(detail, 'text_delta');
}

function collectOrderedAssistantContentEvents(
  detail: FlowDebugRunDetail
): string | null {
  const content = detail.events
    .filter(
      (event) =>
        event.event_type === 'text_delta' ||
        event.event_type === 'reasoning_delta'
    )
    .sort((left, right) => left.sequence - right.sequence)
    .reduce((currentContent, event) => {
      const text = extractDeltaText(event.payload);

      return event.event_type === 'reasoning_delta'
        ? appendReasoningDeltaToAssistantContent(currentContent, text)
        : appendTextDeltaToAssistantContent(currentContent, text);
    }, '');

  const closedContent = closeOpenThinkBlock(content);

  return closedContent.trim().length > 0 ? closedContent : null;
}

function findPreferredOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  for (const key of ['answer', 'text', 'content', 'message']) {
    const value = payload[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  if (isRecord(payload.error)) {
    const message = payload.error.message;

    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return null;
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

export function mapRunDetailToTrace(
  detail: FlowDebugRunDetail
): AgentFlowTraceItem[] {
  return detail.node_runs.map((nodeRun) => ({
    nodeRunId: nodeRun.id,
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
    metricsPayload: nodeRun.metrics_payload,
    debugPayload: nodeRun.debug_payload ?? {}
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

  const streamingText = collectTextDeltaEvents(detail);

  if (streamingText && detail.flow_run.status === 'running') {
    return streamingText;
  }

  const outputPayloadText =
    findPreferredOutputText(detail.flow_run.output_payload) ??
    findFirstString(detail.flow_run.output_payload);

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

function extractAssistantContent(detail: FlowDebugRunDetail): string {
  const orderedStreamContent = collectOrderedAssistantContentEvents(detail);

  if (orderedStreamContent) {
    const orderedParsedContent = parseAssistantContent(orderedStreamContent);

    if (orderedParsedContent.answerText.trim().length > 0) {
      return orderedStreamContent;
    }

    const outputText = extractAssistantOutputText(detail);

    if (!outputText) {
      return orderedStreamContent;
    }

    const outputParsedContent = parseAssistantContent(outputText);

    if (outputParsedContent.answerText.trim().length > 0) {
      return outputText;
    }

    if (outputParsedContent.reasoningText.trim().length === 0) {
      return appendTextDeltaToAssistantContent(
        orderedStreamContent,
        outputText
      );
    }

    return orderedStreamContent;
  }

  return extractAssistantOutputText(detail);
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
    content: extractAssistantContent(detail),
    status: mapMessageStatus(detail.flow_run.status),
    runId: detail.flow_run.id,
    rawOutput,
    traceSummary: traceItems.slice(0, 3)
  };
}
