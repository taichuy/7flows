import type {
  FlowAuthoringDocument,
  FlowBinding,
  FlowNodeDocument
} from '@1flowbase/flow-schema';
import {
  cancelConsoleFlowRun,
  getConsoleApplicationRunDetail,
  startConsoleFlowDebugRun,
  getConsoleNodeLastRun,
  startConsoleNodeDebugPreview,
  type ConsoleApplicationRunDetail,
  type ConsoleNodeLastRun
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from '../../applications/api/applications';

export type NodeLastRun = ConsoleNodeLastRun;
export type FlowDebugRunDetail = ConsoleApplicationRunDetail;
export type AgentFlowDebugMessageStatus =
  | 'running'
  | 'completed'
  | 'waiting_callback'
  | 'waiting_human'
  | 'cancelled'
  | 'failed';

export interface AgentFlowTraceItem {
  nodeId: string;
  nodeAlias: string;
  nodeType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  errorPayload: Record<string, unknown> | null;
  metricsPayload: Record<string, unknown>;
}

export interface AgentFlowVariableItem {
  key: string;
  label: string;
  value: unknown;
}

export interface AgentFlowVariableGroup {
  title: string;
  items: AgentFlowVariableItem[];
}

export interface AgentFlowDebugMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: AgentFlowDebugMessageStatus;
  runId: string | null;
  rawOutput: Record<string, unknown> | null;
  traceSummary: AgentFlowTraceItem[];
}

export interface AgentFlowRunContextField {
  nodeId: string;
  key: string;
  title: string;
  valueType: FlowNodeDocument['outputs'][number]['valueType'];
  value: unknown;
}

export interface AgentFlowRunContext {
  environmentLabel: 'draft';
  remembered: boolean;
  fields: AgentFlowRunContextField[];
}

export const nodeLastRunQueryKey = (applicationId: string, nodeId: string) =>
  ['applications', applicationId, 'runtime', 'nodes', nodeId, 'last-run'] as const;

export function fetchNodeLastRun(applicationId: string, nodeId: string) {
  return getConsoleNodeLastRun(
    applicationId,
    nodeId,
    getApplicationsApiBaseUrl()
  );
}

export function startNodeDebugPreview(
  applicationId: string,
  nodeId: string,
  input: { input_payload: Record<string, Record<string, unknown>> },
  csrfToken: string
) {
  return startConsoleNodeDebugPreview(
    applicationId,
    nodeId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function buildFlowDebugRunInput(
  document: FlowAuthoringDocument,
  inputValues?: Record<string, unknown>
) {
  const startNode = document.graph.nodes.find((node) => node.type === 'start');
  const startPayload: Record<string, unknown> = {};

  for (const output of startNode?.outputs ?? []) {
    startPayload[output.key] =
      inputValues && Object.prototype.hasOwnProperty.call(inputValues, output.key)
        ? inputValues[output.key]
        : buildPreviewValue(startNode, output.key);
  }

  return {
    input_payload: {
      [startNode?.id ?? 'node-start']: startPayload
    }
  };
}

export function startFlowDebugRun(
  applicationId: string,
  input: { input_payload: Record<string, Record<string, unknown>> },
  csrfToken: string
) {
  return startConsoleFlowDebugRun(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationRunDetail(applicationId: string, runId: string) {
  return getConsoleApplicationRunDetail(
    applicationId,
    runId,
    getApplicationsApiBaseUrl()
  );
}

export function cancelFlowDebugRun(
  applicationId: string,
  runId: string,
  csrfToken: string
) {
  return cancelConsoleFlowRun(
    applicationId,
    runId,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

function normalizeSelectorPath(value: string[] | null | undefined) {
  if (!value || value.length < 2) {
    return null;
  }

  return [value[0], value[1]] as const;
}

function extractTemplateSelectors(template: string) {
  const selectors: Array<readonly [string, string]> = [];
  const matcher = /{{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\s*}}/g;

  for (const match of template.matchAll(matcher)) {
    if (!match[1] || !match[2]) {
      continue;
    }

    selectors.push([match[1], match[2]]);
  }

  return selectors;
}

function extractSelectors(binding: FlowBinding): Array<readonly [string, string]> {
  switch (binding.kind) {
    case 'selector': {
      const selector = normalizeSelectorPath(binding.value);

      return selector ? [selector] : [];
    }
    case 'selector_list':
      return binding.value
        .map((value) => normalizeSelectorPath(value))
        .filter((value): value is readonly [string, string] => value !== null);
    case 'named_bindings':
      return binding.value
        .map((entry) => normalizeSelectorPath(entry.selector))
        .filter((value): value is readonly [string, string] => value !== null);
    case 'condition_group':
      return binding.value.conditions
        .map((condition) => normalizeSelectorPath(condition.left))
        .filter((value): value is readonly [string, string] => value !== null);
    case 'state_write':
      return binding.value
        .map((entry) => normalizeSelectorPath(entry.source))
        .filter((value): value is readonly [string, string] => value !== null);
    case 'templated_text':
      return extractTemplateSelectors(binding.value);
  }
}

function buildStringPreviewValue(node: FlowNodeDocument | undefined, outputKey: string) {
  if (outputKey === 'query') {
    return '总结退款政策';
  }

  if (outputKey === 'text' || outputKey === 'answer') {
    return '这是调试预览输出';
  }

  return `${node?.alias ?? '节点'} ${outputKey} 调试值`;
}

function buildPreviewValue(node: FlowNodeDocument | undefined, outputKey: string) {
  const output = node?.outputs.find((entry) => entry.key === outputKey);

  switch (output?.valueType) {
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'json':
    case 'unknown':
      return {};
    case 'string':
    default:
      return buildStringPreviewValue(node, outputKey);
  }
}

export function buildNodeDebugPreviewInput(
  document: FlowAuthoringDocument,
  nodeId: string
) {
  const node = document.graph.nodes.find((entry) => entry.id === nodeId);
  const inputPayload: Record<string, Record<string, unknown>> = {};

  if (!node) {
    return { input_payload: inputPayload };
  }

  const selectors = Object.values(node.bindings).flatMap((binding) =>
    extractSelectors(binding)
  );

  for (const [sourceNodeId, outputKey] of selectors) {
    const sourceNode = document.graph.nodes.find((entry) => entry.id === sourceNodeId);

    inputPayload[sourceNodeId] ??= {};
    inputPayload[sourceNodeId][outputKey] = buildPreviewValue(sourceNode, outputKey);
  }

  return { input_payload: inputPayload };
}
