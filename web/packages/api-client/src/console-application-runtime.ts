import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import { ApiClientError } from './errors';
import { apiFetch } from './transport';

export type ConsoleFlowRunMode = 'debug_node_preview' | 'debug_flow_run';

export interface ConsoleApplicationRunSummary {
  id: string;
  run_mode: ConsoleFlowRunMode;
  status: string;
  target_node_id: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ConsoleFlowRunDetail {
  id: string;
  application_id: string;
  flow_id: string;
  draft_id: string;
  compiled_plan_id: string | null;
  run_mode: ConsoleFlowRunMode;
  status: string;
  target_node_id: string | null;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  error_payload: Record<string, unknown> | null;
  created_by: string;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}

export interface ConsoleNodeRunDetail {
  id: string;
  flow_run_id: string;
  node_id: string;
  node_type: string;
  node_alias: string;
  status: string;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  error_payload: Record<string, unknown> | null;
  metrics_payload: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface ConsoleRunCheckpoint {
  id: string;
  flow_run_id: string;
  node_run_id: string | null;
  status: string;
  reason: string;
  locator_payload: Record<string, unknown>;
  variable_snapshot: Record<string, unknown>;
  external_ref_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface ConsoleRunEvent {
  id: string;
  flow_run_id: string;
  node_run_id: string | null;
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ConsoleCallbackTask {
  id: string;
  flow_run_id: string;
  node_run_id: string;
  callback_kind: string;
  status: 'pending' | 'completed' | 'cancelled';
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown> | null;
  external_ref_payload: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface ConsoleApplicationRunDetail {
  flow_run: ConsoleFlowRunDetail;
  node_runs: ConsoleNodeRunDetail[];
  checkpoints: ConsoleRunCheckpoint[];
  callback_tasks: ConsoleCallbackTask[];
  events: ConsoleRunEvent[];
}

export interface RuntimeDebugStreamPart {
  id: string;
  flow_run_id: string;
  item_id?: string | null;
  span_id?: string | null;
  part_type: string;
  status: string;
  trust_level: string;
  payload: unknown;
}

export interface RuntimeDebugStreamResponse {
  parts: RuntimeDebugStreamPart[];
}

export type ConsoleFlowDebugStreamEvent =
  | {
      type: 'flow_accepted';
      run_id: string;
      status: 'queued' | 'starting' | string;
    }
  | {
      type: 'flow_started';
      run_id: string;
      status: string;
    }
  | {
      type: 'node_started';
      node_run_id: string;
      node_id: string;
      node_type: string;
      title: string;
      input_payload?: Record<string, unknown>;
      started_at?: string;
    }
  | {
      type: 'node_finished';
      node_run_id: string;
      node_id: string;
      status: string;
      output_payload?: Record<string, unknown>;
      error_payload?: Record<string, unknown> | null;
      metrics_payload?: Record<string, unknown>;
      started_at?: string;
      finished_at?: string | null;
    }
  | {
      type: 'text_delta';
      node_run_id?: string | null;
      node_id: string;
      text: string;
    }
  | {
      type: 'reasoning_delta';
      node_run_id?: string | null;
      node_id: string;
      text: string;
    }
  | {
      type: 'usage_snapshot';
      node_run_id?: string | null;
      node_id: string;
      usage: unknown;
    }
  | {
      type: 'flow_finished';
      run_id: string;
      status: string;
      output: Record<string, unknown>;
    }
  | {
      type: 'flow_failed';
      run_id: string;
      error: string;
      error_payload?: Record<string, unknown> | null;
    }
  | {
      type: 'flow_cancelled';
      run_id: string;
      status: 'cancelled' | string;
      reason?: string;
      manual_stop?: boolean;
    }
  | {
      type: 'heartbeat';
    }
  | {
      type: 'replay_expired';
    };

export interface ConsoleFlowDebugStreamHandlers {
  onEvent: (event: ConsoleFlowDebugStreamEvent) => void;
  onCompleted?: () => void;
  getAbortController?: (abortController: AbortController) => void;
}

export interface ConsoleNodeLastRun {
  flow_run: ConsoleFlowRunDetail;
  node_run: ConsoleNodeRunDetail;
  checkpoints: ConsoleRunCheckpoint[];
  events: ConsoleRunEvent[];
}

export interface ConsoleDebugVariableSnapshot {
  variable_cache: Record<string, Record<string, unknown>>;
}

export function startConsoleNodeDebugPreview(
  applicationId: string,
  nodeId: string,
  input: {
    input_payload: Record<string, unknown>;
    document?: FlowAuthoringDocument;
  },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleNodeLastRun>({
    path: `/api/console/applications/${applicationId}/orchestration/nodes/${nodeId}/debug-runs`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function startConsoleFlowDebugRun(
  applicationId: string,
  input: {
    input_payload: Record<string, unknown>;
    document?: FlowAuthoringDocument;
  },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/debug-runs`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

function dispatchSseEvent(
  eventBuffer: string,
  handlers: ConsoleFlowDebugStreamHandlers
) {
  const dataLines: string[] = [];

  for (const line of eventBuffer.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  handlers.onEvent(
    JSON.parse(dataLines.join('\n')) as ConsoleFlowDebugStreamEvent
  );
}

async function readSseStream(
  response: Response,
  handlers: ConsoleFlowDebugStreamHandlers
) {
  const reader = response.body?.getReader();

  if (!reader) {
    handlers.onCompleted?.();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      if (buffer.trim().length > 0) {
        dispatchSseEvent(buffer, handlers);
      }
      handlers.onCompleted?.();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const eventFrames = buffer.split(/\r?\n\r?\n/);
    buffer = eventFrames.pop() ?? '';

    for (const eventFrame of eventFrames) {
      dispatchSseEvent(eventFrame, handlers);
    }
  }
}

export async function startConsoleFlowDebugRunStream(
  applicationId: string,
  input: {
    input_payload: Record<string, unknown>;
    document?: FlowAuthoringDocument;
  },
  csrfToken: string,
  handlers: ConsoleFlowDebugStreamHandlers,
  baseUrl?: string
) {
  const abortController = new AbortController();
  handlers.getAbortController?.(abortController);

  const response = await fetch(
    `${baseUrl ?? ''}/api/console/applications/${applicationId}/orchestration/debug-runs/stream`,
    {
      method: 'POST',
      credentials: 'include',
      signal: abortController.signal,
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    throw await ApiClientError.fromResponse(response);
  }

  await readSseStream(response, handlers);
}

export function resumeConsoleFlowRun(
  applicationId: string,
  runId: string,
  input: { checkpoint_id: string; input_payload: Record<string, unknown> },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/runs/${runId}/resume`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function cancelConsoleFlowRun(
  applicationId: string,
  runId: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/runs/${runId}/cancel`,
    method: 'POST',
    csrfToken,
    baseUrl
  });
}

export function completeConsoleCallbackTask(
  applicationId: string,
  callbackTaskId: string,
  input: { response_payload: Record<string, unknown> },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/callback-tasks/${callbackTaskId}/complete`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function getConsoleApplicationRuns(
  applicationId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunSummary[]>({
    path: `/api/console/applications/${applicationId}/logs/runs`,
    baseUrl
  });
}

export function getConsoleApplicationRunDetail(
  applicationId: string,
  runId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/logs/runs/${runId}`,
    baseUrl
  });
}

export function getConsoleRuntimeDebugStream(
  applicationId: string,
  runId: string,
  baseUrl?: string
) {
  return apiFetch<RuntimeDebugStreamResponse>({
    path: `/api/console/applications/${applicationId}/logs/runs/${runId}/debug-stream`,
    baseUrl
  });
}

export function getConsoleDebugVariableSnapshot(
  applicationId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDebugVariableSnapshot>({
    path: `/api/console/applications/${applicationId}/orchestration/debug-variable-snapshot`,
    baseUrl
  });
}

export function getConsoleNodeLastRun(
  applicationId: string,
  nodeId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleNodeLastRun | null>({
    path: `/api/console/applications/${applicationId}/orchestration/nodes/${nodeId}/last-run`,
    baseUrl
  });
}
