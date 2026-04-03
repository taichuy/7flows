import { fetchConsoleApiPath } from "@/lib/console-session-client";
import type { WorkflowToolGovernanceSummary } from "@/lib/get-workflows";
import type {
  AICallItem,
  CallbackWaitingLifecycleSummary,
  OperatorRunFollowUpSummary,
  RunArtifactItem,
  RunExecutionFocusExplanation,
  RunExecutionFocusReason,
  SkillReferenceLoadItem,
  ToolCallItem
} from "@/lib/get-run-views";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";

export type NodeRunItem = {
  id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  phase?: string | null;
  retry_count?: number;
  input_payload: Record<string, unknown>;
  checkpoint_payload?: Record<string, unknown>;
  working_context?: Record<string, unknown>;
  evidence_context?: Record<string, unknown> | null;
  artifact_refs?: string[];
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  waiting_reason?: string | null;
  started_at?: string | null;
  phase_started_at?: string | null;
  finished_at?: string | null;
};

export type RunEventItem = {
  id: number;
  run_id: string;
  node_run_id?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type RunDetail = {
  id: string;
  workflow_id: string;
  workflow_version: string;
  compiled_blueprint_id?: string | null;
  status: string;
  input_payload: Record<string, unknown>;
  checkpoint_payload?: Record<string, unknown>;
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  current_node_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  event_count: number;
  event_type_counts: Record<string, number>;
  first_event_at?: string | null;
  last_event_at?: string | null;
  blocking_node_run_id?: string | null;
  execution_focus_reason?: RunExecutionFocusReason | null;
  execution_focus_node?: {
    node_run_id: string;
    node_id: string;
    node_name: string;
    node_type: string;
    status: string;
    callback_waiting_explanation?: RunExecutionFocusExplanation | null;
    callback_waiting_lifecycle?: CallbackWaitingLifecycleSummary | null;
    phase?: string | null;
    execution_class?: string | null;
    execution_source?: string | null;
    requested_execution_class?: string | null;
    requested_execution_source?: string | null;
    requested_execution_profile?: string | null;
    requested_execution_timeout_ms?: number | null;
    requested_execution_network_policy?: string | null;
    requested_execution_filesystem_policy?: string | null;
    requested_execution_dependency_mode?: string | null;
    requested_execution_builtin_package_set?: string | null;
    requested_execution_dependency_ref?: string | null;
    requested_execution_backend_extensions?: Record<string, unknown> | null;
    effective_execution_class?: string | null;
    execution_executor_ref?: string | null;
    execution_sandbox_backend_id?: string | null;
    execution_sandbox_backend_executor_ref?: string | null;
    execution_sandbox_runner_kind?: string | null;
    execution_blocking_reason?: string | null;
    execution_fallback_reason?: string | null;
    scheduled_resume_delay_seconds?: number | null;
    scheduled_resume_reason?: string | null;
    scheduled_resume_source?: string | null;
    scheduled_waiting_status?: string | null;
    scheduled_resume_scheduled_at?: string | null;
    scheduled_resume_due_at?: string | null;
    scheduled_resume_requeued_at?: string | null;
    scheduled_resume_requeue_source?: string | null;
    artifact_refs?: string[];
    artifacts?: RunArtifactItem[];
    tool_calls?: ToolCallItem[];
  } | null;
  execution_focus_explanation?: RunExecutionFocusExplanation | null;
  execution_focus_skill_trace?: {
    reference_count?: number | null;
    phase_counts?: Record<string, number> | null;
    source_counts?: Record<string, number> | null;
    loads?: SkillReferenceLoadItem[] | null;
  } | null;
  tool_governance?: WorkflowToolGovernanceSummary | null;
  legacy_auth_governance?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  run_follow_up?: OperatorRunFollowUpSummary | null;
  node_runs: NodeRunItem[];
  artifacts?: RunArtifactItem[];
  tool_calls?: ToolCallItem[];
  ai_calls?: AICallItem[];
  events: RunEventItem[];
};

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  try {
    const response = await fetchConsoleApiPath(
      `/api/runs/${encodeURIComponent(runId)}/detail?include_events=false`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RunDetail;
  } catch {
    return null;
  }
}
