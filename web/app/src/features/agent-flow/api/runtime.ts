import type {
  FlowAuthoringDocument,
  FlowBinding,
  FlowNodeDocument,
  FlowNodeOutputDocument
} from '@1flowbase/flow-schema';
import {
  cancelConsoleFlowRun,
  deleteConsoleDebugVariableCacheEntries,
  getConsoleApplicationRunDetail,
  getConsoleApplicationRunNodeLastRun,
  getConsoleDebugVariableSnapshot,
  getConsoleRuntimeDebugArtifact,
  startConsoleFlowDebugRun,
  startConsoleFlowDebugRunStream,
  getConsoleNodeLastRun,
  startConsoleNodeDebugPreview,
  upsertConsoleDebugVariableCacheEntry,
  type ConsoleApplicationRunDetail,
  type ConsoleDebugVariableSnapshot,
  type ConsoleFlowDebugStreamEvent,
  type ConsoleFlowDebugStreamCursor,
  type ConsoleFlowDebugStreamHandlers,
  type ConsoleNodeLastRun,
  type ConsoleRuntimeDebugArtifactPreview
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from '../../applications/api/applications';
import {
  extractDataModelQuerySelectors,
  getActiveNodeBindings
} from '../lib/data-model-query-binding';
import {
  getNodeVariableOutputs,
  getStartInputFields
} from '../lib/start-node-variables';

export type NodeLastRun = ConsoleNodeLastRun;
export type FlowDebugRunDetail = ConsoleApplicationRunDetail;
export type RuntimeDebugArtifactPreview = ConsoleRuntimeDebugArtifactPreview;
export type DebugVariableSnapshot = ConsoleDebugVariableSnapshot & {
  variable_cache: NodeDebugPreviewVariableCache;
};
export type FlowDebugRunStreamEvent = ConsoleFlowDebugStreamEvent;
export type FlowDebugRunStreamHandlers = ConsoleFlowDebugStreamHandlers;
export type AgentFlowDebugMessageStatus =
  | 'running'
  | 'completed'
  | 'waiting_callback'
  | 'waiting_human'
  | 'cancelled'
  | 'failed';

export interface AgentFlowTraceItem {
  nodeId: string;
  nodeRunId?: string;
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
  debugPayload?: Record<string, unknown>;
}

export interface AgentFlowVariableItem {
  key: string;
  label: string;
  value: unknown;
  isReadOnly?: boolean;
  isTruncated?: boolean;
  artifactRef?: string;
  helperText?: string;
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
  nodeLabel: string;
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

export interface NodeDebugPreviewVariableField {
  nodeId: string;
  nodeLabel: string;
  key: string;
  title: string;
  valueType: FlowNodeDocument['outputs'][number]['valueType'];
  value: unknown;
}

export type NodeDebugPreviewVariableCache = Record<
  string,
  Record<string, unknown>
>;

export interface NodeDebugPreviewPlan {
  input_payload: Record<string, Record<string, unknown>>;
  missing_fields: NodeDebugPreviewVariableField[];
}

export const nodeLastRunQueryKey = (applicationId: string, nodeId: string) =>
  [
    'applications',
    applicationId,
    'runtime',
    'nodes',
    nodeId,
    'last-run'
  ] as const;

export const applicationRunNodeLastRunQueryKey = (
  applicationId: string,
  runId: string,
  nodeId: string
) =>
  [
    'applications',
    applicationId,
    'runtime',
    'runs',
    runId,
    'nodes',
    nodeId,
    'last-run'
  ] as const;

export function fetchNodeLastRun(applicationId: string, nodeId: string) {
  return getConsoleNodeLastRun(
    applicationId,
    nodeId,
    getApplicationsApiBaseUrl()
  );
}

export function fetchDebugVariableSnapshot(applicationId: string) {
  return getConsoleDebugVariableSnapshot(
    applicationId,
    getApplicationsApiBaseUrl()
  );
}

export function upsertDebugVariableCacheEntry(
  applicationId: string,
  input: {
    node_id: string;
    variable_key: string;
    value: unknown;
  },
  csrfToken: string
) {
  return upsertConsoleDebugVariableCacheEntry(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function deleteDebugVariableCacheEntries(
  applicationId: string,
  input: {
    keys?: Array<{
      node_id: string;
      variable_key: string;
    }>;
  },
  csrfToken: string
) {
  return deleteConsoleDebugVariableCacheEntries(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function nodeLastRunToFlowDebugRunDetail(
  lastRun: ConsoleNodeLastRun
): FlowDebugRunDetail {
  return {
    flow_run: lastRun.flow_run,
    node_runs: [lastRun.node_run],
    checkpoints: lastRun.checkpoints,
    callback_tasks: [],
    events: lastRun.events
  };
}

export function startNodeDebugPreview(
  applicationId: string,
  nodeId: string,
  input: {
    input_payload: Record<string, Record<string, unknown>>;
    document?: FlowAuthoringDocument;
    debug_session_id?: string;
  },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function extractNodePreviewVariableOutput(
  lastRun: ConsoleNodeLastRun
): Record<string, unknown> {
  const outputPayload = lastRun.node_run.output_payload;

  if (!isRecord(outputPayload)) {
    return {};
  }

  return outputPayload;
}

export function buildFlowDebugRunInput(
  document: FlowAuthoringDocument,
  inputValues?: Record<string, unknown>
) {
  const startNode = document.graph.nodes.find((node) => node.type === 'start');
  const startPayload: Record<string, unknown> = {};

  for (const output of startNode ? getNodeVariableOutputs(startNode) : []) {
    startPayload[output.key] =
      inputValues &&
      Object.prototype.hasOwnProperty.call(inputValues, output.key)
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
  input: {
    input_payload: Record<string, Record<string, unknown>>;
    document?: FlowAuthoringDocument;
    debug_session_id?: string;
  },
  csrfToken: string
) {
  return startConsoleFlowDebugRun(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function startFlowDebugRunStream(
  applicationId: string,
  input: {
    input_payload: Record<string, Record<string, unknown>>;
    document?: FlowAuthoringDocument;
    debug_session_id?: string;
  },
  csrfToken: string,
  handlers: FlowDebugRunStreamHandlers,
  cursor?: ConsoleFlowDebugStreamCursor
) {
  return startConsoleFlowDebugRunStream(
    applicationId,
    input,
    csrfToken,
    handlers,
    {
      cursor,
      baseUrl: getApplicationsApiBaseUrl()
    }
  );
}

export function fetchApplicationRunDetail(
  applicationId: string,
  runId: string
) {
  return getConsoleApplicationRunDetail(
    applicationId,
    runId,
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationRunNodeLastRun(
  applicationId: string,
  runId: string,
  nodeId: string
) {
  return getConsoleApplicationRunNodeLastRun(
    applicationId,
    runId,
    nodeId,
    getApplicationsApiBaseUrl()
  );
}

export function fetchRuntimeDebugArtifact(
  applicationId: string,
  artifactId: string
) {
  return getConsoleRuntimeDebugArtifact(
    applicationId,
    artifactId,
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

function extractSelectors(
  binding: FlowBinding
): Array<readonly [string, string]> {
  switch (binding.kind) {
    case 'selector': {
      const selector = normalizeSelectorPath(binding.value);

      return selector ? [selector] : [];
    }
    case 'selector_list':
      return binding.value
        .map((value) => normalizeSelectorPath(value))
        .filter((value): value is readonly [string, string] => value !== null);
    case 'prompt_messages':
      return binding.value.flatMap((message) =>
        extractTemplateSelectors(message.content.value)
      );
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
    case 'data_model_query':
      return extractDataModelQuerySelectors(binding.value)
        .map((value) => normalizeSelectorPath(value))
        .filter((value): value is readonly [string, string] => value !== null);
    case 'templated_text':
      return extractTemplateSelectors(binding.value);
  }
}

function hasPreviewVariableValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function findNodeOutput(node: FlowNodeDocument | undefined, outputKey: string) {
  return node
    ? getNodeVariableOutputs(node).find((output) => output.key === outputKey)
    : undefined;
}

function readCachedOutputValue(
  payload: Record<string, unknown> | undefined,
  output: FlowNodeOutputDocument | undefined,
  outputKey: string
): { found: true; value: unknown } | { found: false } {
  if (!payload) {
    return { found: false };
  }

  if (Object.prototype.hasOwnProperty.call(payload, outputKey)) {
    return { found: true, value: payload[outputKey] };
  }

  if (!output?.selector?.length) {
    return { found: false };
  }

  let current: unknown = payload;

  for (const segment of output.selector) {
    if (
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false };
    }

    current = current[segment];
  }

  return { found: true, value: current };
}

function buildMissingPreviewField(
  document: FlowAuthoringDocument,
  nodeId: string,
  outputKey: string
): NodeDebugPreviewVariableField {
  const node = document.graph.nodes.find((entry) => entry.id === nodeId);
  const output = findNodeOutput(node, outputKey);

  return {
    nodeId,
    nodeLabel: node?.alias ?? nodeId,
    key: outputKey,
    title: output?.title ?? `${node?.alias ?? nodeId}.${outputKey}`,
    valueType: output?.valueType ?? 'unknown',
    value: buildPreviewValue(node, outputKey)
  };
}

function isRequiredStartPreviewKey(node: FlowNodeDocument, outputKey: string) {
  if (outputKey === 'query') {
    return true;
  }

  return getStartInputFields(node).some(
    (field) => field.key === outputKey && field.required
  );
}

function buildStringPreviewValue(
  node: FlowNodeDocument | undefined,
  outputKey: string
) {
  if (
    node?.type === 'start' &&
    (outputKey === 'query' || outputKey === 'model')
  ) {
    return '';
  }

  if (outputKey === 'text' || outputKey === 'answer') {
    return '这是调试预览输出';
  }

  return `${node?.alias ?? '节点'} ${outputKey} 调试值`;
}

function buildPreviewValue(
  node: FlowNodeDocument | undefined,
  outputKey: string
) {
  const startInputField =
    node?.type === 'start'
      ? getStartInputFields(node).find((field) => field.key === outputKey)
      : undefined;

  if (startInputField?.defaultValue !== undefined) {
    return startInputField.defaultValue;
  }

  const output = node
    ? getNodeVariableOutputs(node).find((entry) => entry.key === outputKey)
    : undefined;

  if (output?.valueType.startsWith('array')) {
    return [];
  }

  switch (output?.valueType) {
    case 'number':
      return 1;
    case 'boolean':
      return true;
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

  const selectors = getActiveNodeBindings(node).flatMap(([, binding]) =>
    extractSelectors(binding)
  );

  for (const [sourceNodeId, outputKey] of selectors) {
    const sourceNode = document.graph.nodes.find(
      (entry) => entry.id === sourceNodeId
    );

    inputPayload[sourceNodeId] ??= {};
    inputPayload[sourceNodeId][outputKey] = buildPreviewValue(
      sourceNode,
      outputKey
    );
  }

  return { input_payload: inputPayload };
}

export function buildNodeDebugPreviewPlan(
  document: FlowAuthoringDocument,
  nodeId: string,
  variableCache: NodeDebugPreviewVariableCache = {}
): NodeDebugPreviewPlan {
  const node = document.graph.nodes.find((entry) => entry.id === nodeId);
  const inputPayload: Record<string, Record<string, unknown>> = {};
  const missingFields: NodeDebugPreviewVariableField[] = [];

  if (!node) {
    return { input_payload: inputPayload, missing_fields: missingFields };
  }

  if (node.type === 'start') {
    const visitedStartKeys = new Set<string>();

    for (const output of getNodeVariableOutputs(node)) {
      if (visitedStartKeys.has(output.key)) {
        continue;
      }

      visitedStartKeys.add(output.key);

      const cachedOutput = readCachedOutputValue(
        variableCache[node.id],
        output,
        output.key
      );

      if (cachedOutput.found && hasPreviewVariableValue(cachedOutput.value)) {
        inputPayload[node.id] ??= {};
        inputPayload[node.id][output.key] = cachedOutput.value;
        continue;
      }

      inputPayload[node.id] ??= {};
      inputPayload[node.id][output.key] = buildPreviewValue(node, output.key);

      if (isRequiredStartPreviewKey(node, output.key)) {
        missingFields.push(
          buildMissingPreviewField(document, node.id, output.key)
        );
      }
    }

    return { input_payload: inputPayload, missing_fields: missingFields };
  }

  const selectors = getActiveNodeBindings(node).flatMap(([, binding]) =>
    extractSelectors(binding)
  );
  const visited = new Set<string>();

  for (const [sourceNodeId, outputKey] of selectors) {
    const cacheKey = `${sourceNodeId}.${outputKey}`;
    const sourceNode = document.graph.nodes.find(
      (entry) => entry.id === sourceNodeId
    );
    const sourceOutput = findNodeOutput(sourceNode, outputKey);
    const cachedOutput = readCachedOutputValue(
      variableCache[sourceNodeId],
      sourceOutput,
      outputKey
    );

    if (visited.has(cacheKey)) {
      continue;
    }

    visited.add(cacheKey);

    if (cachedOutput.found && hasPreviewVariableValue(cachedOutput.value)) {
      inputPayload[sourceNodeId] ??= {};
      inputPayload[sourceNodeId][outputKey] = cachedOutput.value;
      continue;
    }

    missingFields.push(
      buildMissingPreviewField(document, sourceNodeId, outputKey)
    );
  }

  return { input_payload: inputPayload, missing_fields: missingFields };
}
