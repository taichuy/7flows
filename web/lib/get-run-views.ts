import { getApiBaseUrl } from "@/lib/api-base-url";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";

export type RunArtifactItem = {
  id: string;
  run_id: string;
  node_run_id?: string | null;
  artifact_kind: string;
  content_type: string;
  summary: string;
  uri: string;
  metadata_payload: Record<string, unknown>;
  created_at: string;
};

export type ToolCallItem = {
  id: string;
  run_id: string;
  node_run_id: string;
  tool_id: string;
  tool_name: string;
  phase: string;
  status: string;
  request_summary: string;
  response_summary?: string | null;
  raw_ref?: string | null;
  latency_ms: number;
  retry_count: number;
  error_message?: string | null;
  created_at: string;
  finished_at?: string | null;
};

export type AICallItem = {
  id: string;
  run_id: string;
  node_run_id: string;
  role: string;
  status: string;
  provider?: string | null;
  model_id?: string | null;
  input_summary: string;
  output_summary?: string | null;
  input_ref?: string | null;
  output_ref?: string | null;
  latency_ms: number;
  token_usage: Record<string, unknown>;
  cost_payload: Record<string, unknown>;
  assistant: boolean;
  error_message?: string | null;
  created_at: string;
  finished_at?: string | null;
};

export type RunCallbackTicketItem = {
  ticket: string;
  run_id: string;
  node_run_id: string;
  tool_call_id?: string | null;
  tool_id?: string | null;
  tool_call_index: number;
  waiting_status: string;
  status: string;
  reason?: string | null;
  callback_payload?: Record<string, unknown> | null;
  created_at: string;
  expires_at?: string | null;
  consumed_at?: string | null;
  canceled_at?: string | null;
  expired_at?: string | null;
};

export type CallbackWaitingLifecycleSummary = {
  wait_cycle_count: number;
  issued_ticket_count: number;
  expired_ticket_count: number;
  consumed_ticket_count: number;
  canceled_ticket_count: number;
  late_callback_count: number;
  resume_schedule_count: number;
  max_expired_ticket_count: number;
  terminated: boolean;
  termination_reason?: string | null;
  terminated_at?: string | null;
  last_ticket_status?: string | null;
  last_ticket_reason?: string | null;
  last_ticket_updated_at?: string | null;
  last_late_callback_status?: string | null;
  last_late_callback_reason?: string | null;
  last_late_callback_at?: string | null;
  last_resume_delay_seconds?: number | null;
  last_resume_reason?: string | null;
  last_resume_source?: string | null;
  last_resume_backoff_attempt: number;
};

export type RunCallbackWaitingSummary = {
  node_count: number;
  terminated_node_count: number;
  issued_ticket_count: number;
  expired_ticket_count: number;
  consumed_ticket_count: number;
  canceled_ticket_count: number;
  late_callback_count: number;
  resume_schedule_count: number;
  resume_source_counts: Record<string, number>;
  termination_reason_counts: Record<string, number>;
};

export type RunExecutionNodeItem = {
  node_run_id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  phase?: string | null;
  execution_class: string;
  execution_source: string;
  execution_profile?: string | null;
  execution_timeout_ms?: number | null;
  execution_network_policy?: string | null;
  execution_filesystem_policy?: string | null;
  execution_dispatched_count: number;
  execution_fallback_count: number;
  execution_blocked_count: number;
  execution_unavailable_count: number;
  effective_execution_class?: string | null;
  execution_executor_ref?: string | null;
  execution_blocking_reason?: string | null;
  execution_fallback_reason?: string | null;
  retry_count: number;
  waiting_reason?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  event_count: number;
  event_type_counts: Record<string, number>;
  last_event_type?: string | null;
  artifact_refs: string[];
  artifacts: RunArtifactItem[];
  tool_calls: ToolCallItem[];
  ai_calls: AICallItem[];
  callback_tickets: RunCallbackTicketItem[];
  sensitive_access_entries: SensitiveAccessTimelineEntry[];
  callback_waiting_lifecycle?: CallbackWaitingLifecycleSummary | null;
};

export type RunExecutionView = {
  run_id: string;
  workflow_id: string;
  workflow_version: string;
  compiled_blueprint_id?: string | null;
  status: string;
  summary: {
    node_run_count: number;
    waiting_node_count: number;
    errored_node_count: number;
    execution_dispatched_node_count: number;
    execution_fallback_node_count: number;
    execution_blocked_node_count: number;
    execution_unavailable_node_count: number;
    artifact_count: number;
    tool_call_count: number;
    ai_call_count: number;
    assistant_call_count: number;
    callback_ticket_count: number;
    sensitive_access_request_count: number;
    sensitive_access_approval_ticket_count: number;
    sensitive_access_notification_count: number;
    artifact_kind_counts: Record<string, number>;
    tool_status_counts: Record<string, number>;
    ai_role_counts: Record<string, number>;
    execution_requested_class_counts: Record<string, number>;
    execution_effective_class_counts: Record<string, number>;
    execution_executor_ref_counts: Record<string, number>;
    callback_ticket_status_counts: Record<string, number>;
    sensitive_access_decision_counts: Record<string, number>;
    sensitive_access_approval_status_counts: Record<string, number>;
    sensitive_access_notification_status_counts: Record<string, number>;
    callback_waiting: RunCallbackWaitingSummary;
  };
  nodes: RunExecutionNodeItem[];
};

export type RunEvidenceEntryItem = {
  title: string;
  detail: string;
  source_ref?: string | null;
};

export type RunEvidenceNodeItem = {
  node_run_id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  phase?: string | null;
  summary: string;
  key_points: string[];
  evidence: RunEvidenceEntryItem[];
  conflicts: string[];
  unknowns: string[];
  recommended_focus: string[];
  confidence?: number | null;
  artifact_refs: string[];
  decision_output: Record<string, unknown>;
  tool_calls: ToolCallItem[];
  assistant_calls: AICallItem[];
  supporting_artifacts: RunArtifactItem[];
};

export type RunEvidenceView = {
  run_id: string;
  workflow_id: string;
  workflow_version: string;
  status: string;
  summary: {
    node_count: number;
    artifact_count: number;
    tool_call_count: number;
    assistant_call_count: number;
  };
  nodes: RunEvidenceNodeItem[];
};

async function fetchRunView<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getRunExecutionView(runId: string) {
  return fetchRunView<RunExecutionView>(
    `/api/runs/${encodeURIComponent(runId)}/execution-view`
  );
}

export function getRunEvidenceView(runId: string) {
  return fetchRunView<RunEvidenceView>(
    `/api/runs/${encodeURIComponent(runId)}/evidence-view`
  );
}
