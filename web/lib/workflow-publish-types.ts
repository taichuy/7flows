import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem,
  RunExecutionNodeItem,
  SkillReferenceLoadItem
} from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";

export type PublishedEndpointInvocationStatus = "succeeded" | "failed" | "rejected";
export type PublishedEndpointInvocationRequestSource = "workflow" | "alias" | "path";
export type PublishedEndpointInvocationCacheStatus = "hit" | "miss" | "bypass";
export type PublishedEndpointInvocationRequestSurface =
  | "native.workflow"
  | "native.workflow.async"
  | "native.alias"
  | "native.alias.async"
  | "native.path"
  | "native.path.async"
  | "openai.chat.completions"
  | "openai.chat.completions.async"
  | "openai.responses"
  | "openai.responses.async"
  | "openai.unknown"
  | "anthropic.messages"
  | "anthropic.messages.async"
  | "unknown";

export type PublishedEndpointInvocationExportFormat = "json" | "jsonl";

export type PublishedEndpointInvocationSummary = {
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
  cache_hit_count: number;
  cache_miss_count: number;
  cache_bypass_count: number;
  last_invoked_at?: string | null;
  last_status?: string | null;
  last_cache_status?: "hit" | "miss" | "bypass" | null;
  last_run_id?: string | null;
  last_run_status?: string | null;
  last_reason_code?: string | null;
  approval_ticket_count?: number;
  pending_approval_count?: number;
  approved_approval_count?: number;
  rejected_approval_count?: number;
  expired_approval_count?: number;
  pending_notification_count?: number;
  delivered_notification_count?: number;
  failed_notification_count?: number;
};

export type PublishedEndpointInvocationItem = {
  id: string;
  workflow_id: string;
  binding_id: string;
  endpoint_id: string;
  endpoint_alias: string;
  route_path: string;
  protocol: string;
  auth_mode: string;
  request_source: PublishedEndpointInvocationRequestSource;
  request_surface: PublishedEndpointInvocationRequestSurface;
  status: PublishedEndpointInvocationStatus;
  cache_status: PublishedEndpointInvocationCacheStatus;
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_prefix?: string | null;
  api_key_status?: "active" | "revoked" | null;
  run_id?: string | null;
  run_status?: string | null;
  run_current_node_id?: string | null;
  run_waiting_reason?: string | null;
  run_waiting_lifecycle?: {
    node_run_id: string;
    node_status: string;
    waiting_reason?: string | null;
    callback_ticket_count: number;
    callback_ticket_status_counts: Record<string, number>;
    callback_waiting_lifecycle?: CallbackWaitingLifecycleSummary | null;
    callback_waiting_explanation?: RunExecutionFocusExplanation | null;
    sensitive_access_summary?: {
      request_count: number;
      approval_ticket_count: number;
      pending_approval_count: number;
      approved_approval_count: number;
      rejected_approval_count: number;
      expired_approval_count: number;
      pending_notification_count: number;
      delivered_notification_count: number;
      failed_notification_count: number;
    } | null;
    scheduled_resume_delay_seconds?: number | null;
    scheduled_resume_reason?: string | null;
    scheduled_resume_source?: string | null;
    scheduled_waiting_status?: string | null;
    scheduled_resume_scheduled_at?: string | null;
    scheduled_resume_due_at?: string | null;
    scheduled_resume_requeued_at?: string | null;
    scheduled_resume_requeue_source?: string | null;
  } | null;
  run_snapshot?: OperatorRunFollowUpSnapshot | null;
  run_follow_up?: OperatorRunFollowUpSummary | null;
  execution_focus_explanation?: RunExecutionFocusExplanation | null;
  callback_waiting_explanation?: RunExecutionFocusExplanation | null;
  reason_code?: string | null;
  error_message?: string | null;
  request_preview: {
    key_count?: number;
    keys?: string[];
    sample?: Record<string, unknown>;
  };
  response_preview?: Record<string, unknown> | null;
  duration_ms?: number | null;
  created_at: string;
  finished_at?: string | null;
};

export type PublishedEndpointInvocationFacetItem = {
  value: string;
  count: number;
  last_invoked_at?: string | null;
  last_status?: PublishedEndpointInvocationStatus | null;
};

export type PublishedEndpointInvocationApiKeyUsageItem = {
  api_key_id: string;
  name?: string | null;
  key_prefix?: string | null;
  status?: "active" | "revoked" | null;
  invocation_count: number;
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
  last_invoked_at?: string | null;
  last_status?: PublishedEndpointInvocationStatus | null;
  last_reason_code?: string | null;
};

export type PublishedEndpointInvocationFailureReasonItem = {
  message: string;
  count: number;
  last_invoked_at?: string | null;
};

export type PublishedEndpointInvocationBucketFacetItem = {
  value: string;
  count: number;
};

export type PublishedEndpointInvocationApiKeyBucketFacetItem = {
  api_key_id: string;
  name?: string | null;
  key_prefix?: string | null;
  count: number;
};

export type PublishedEndpointInvocationTimeBucketItem = {
  bucket_start: string;
  bucket_end: string;
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
  api_key_counts: PublishedEndpointInvocationApiKeyBucketFacetItem[];
  cache_status_counts: PublishedEndpointInvocationBucketFacetItem[];
  run_status_counts: PublishedEndpointInvocationBucketFacetItem[];
  request_surface_counts: PublishedEndpointInvocationBucketFacetItem[];
  reason_counts: PublishedEndpointInvocationBucketFacetItem[];
};

export type PublishedEndpointInvocationFilters = {
  status?: PublishedEndpointInvocationStatus | null;
  request_source?: PublishedEndpointInvocationRequestSource | null;
  request_surface?: PublishedEndpointInvocationRequestSurface | null;
  cache_status?: PublishedEndpointInvocationCacheStatus | null;
  run_status?: string | null;
  api_key_id?: string | null;
  reason_code?: string | null;
  created_from?: string | null;
  created_to?: string | null;
};

export type PublishedEndpointInvocationListOptions = {
  limit?: number;
  status?: PublishedEndpointInvocationStatus;
  requestSource?: PublishedEndpointInvocationRequestSource;
  requestSurface?: PublishedEndpointInvocationRequestSurface;
  cacheStatus?: PublishedEndpointInvocationCacheStatus;
  runStatus?: string;
  apiKeyId?: string;
  reasonCode?: string;
  createdFrom?: string;
  createdTo?: string;
};

export type PublishedEndpointInvocationFacets = {
  status_counts: PublishedEndpointInvocationFacetItem[];
  request_source_counts: PublishedEndpointInvocationFacetItem[];
  request_surface_counts: PublishedEndpointInvocationFacetItem[];
  cache_status_counts: PublishedEndpointInvocationFacetItem[];
  run_status_counts: PublishedEndpointInvocationFacetItem[];
  reason_counts: PublishedEndpointInvocationFacetItem[];
  api_key_usage: PublishedEndpointInvocationApiKeyUsageItem[];
  recent_failure_reasons: PublishedEndpointInvocationFailureReasonItem[];
  timeline_granularity: "hour" | "day";
  timeline: PublishedEndpointInvocationTimeBucketItem[];
};

export type PublishedEndpointInvocationListResponse = {
  filters: PublishedEndpointInvocationFilters;
  summary: PublishedEndpointInvocationSummary;
  facets: PublishedEndpointInvocationFacets;
  items: PublishedEndpointInvocationItem[];
};

export type PublishedEndpointInvocationRunReference = {
  id: string;
  status: string;
  current_node_id?: string | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
};

export type PublishedEndpointInvocationCallbackTicketItem = RunCallbackTicketItem;

export type PublishedEndpointInvocationCacheReference = {
  cache_status: PublishedEndpointInvocationCacheStatus;
  cache_key?: string | null;
  cache_entry_id?: string | null;
  inventory_entry?: PublishedEndpointCacheInventoryItem | null;
};

export type PublishedEndpointInvocationSkillTraceNodeItem = {
  node_run_id: string;
  node_id?: string | null;
  node_name?: string | null;
  reference_count: number;
  loads: SkillReferenceLoadItem[];
};

export type PublishedEndpointInvocationSkillTrace = {
  scope: "execution_focus_node" | "run";
  reference_count: number;
  phase_counts: Record<string, number>;
  source_counts: Record<string, number>;
  nodes: PublishedEndpointInvocationSkillTraceNodeItem[];
};

export type PublishedEndpointInvocationExecutionFocusReason =
  | "blocking_node_run"
  | "blocked_execution"
  | "current_node"
  | "fallback_node";

export type RunExecutionFocusExplanation = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

export type OperatorRunFollowUpSnapshot = {
  workflow_id?: string | null;
  status?: string | null;
  current_node_id?: string | null;
  waiting_reason?: string | null;
  execution_focus_reason?: PublishedEndpointInvocationExecutionFocusReason | null;
  execution_focus_node_id?: string | null;
  execution_focus_node_name?: string | null;
  execution_focus_node_type?: string | null;
  execution_focus_node_run_id?: string | null;
  execution_focus_explanation?: RunExecutionFocusExplanation | null;
  callback_waiting_explanation?: RunExecutionFocusExplanation | null;
  callback_waiting_lifecycle?: CallbackWaitingLifecycleSummary | null;
  scheduled_resume_delay_seconds?: number | null;
  scheduled_resume_reason?: string | null;
  scheduled_resume_source?: string | null;
  scheduled_waiting_status?: string | null;
  scheduled_resume_scheduled_at?: string | null;
  scheduled_resume_due_at?: string | null;
  scheduled_resume_requeued_at?: string | null;
  scheduled_resume_requeue_source?: string | null;
  execution_focus_artifact_count?: number;
  execution_focus_artifact_ref_count?: number;
  execution_focus_tool_call_count?: number;
  execution_focus_raw_ref_count?: number;
  execution_focus_artifact_refs?: string[];
  execution_focus_artifacts?: Array<{
    artifact_kind?: string | null;
    content_type?: string | null;
    summary?: string | null;
    uri?: string | null;
  }>;
  execution_focus_tool_calls?: Array<{
    id?: string | null;
    tool_id?: string | null;
    tool_name?: string | null;
    phase?: string | null;
    status?: string | null;
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
    adapter_request_trace_id?: string | null;
    adapter_request_execution?: Record<string, unknown> | null;
    adapter_request_execution_class?: string | null;
    adapter_request_execution_source?: string | null;
    adapter_request_execution_contract?: Record<string, unknown> | null;
    execution_blocking_reason?: string | null;
    execution_fallback_reason?: string | null;
    response_summary?: string | null;
    response_content_type?: string | null;
    raw_ref?: string | null;
  }>;
  execution_focus_skill_trace?: {
    reference_count: number;
    phase_counts: Record<string, number>;
    source_counts: Record<string, number>;
    loads: SkillReferenceLoadItem[];
  } | null;
};

export type OperatorRunFollowUpSnapshotSample = {
  run_id: string;
  snapshot?: OperatorRunFollowUpSnapshot | null;
  callback_tickets?: RunCallbackTicketItem[];
  sensitive_access_entries?: SensitiveAccessTimelineEntry[];
};

export type OperatorRunFollowUpSummary = {
  affected_run_count: number;
  sampled_run_count: number;
  waiting_run_count: number;
  running_run_count: number;
  succeeded_run_count: number;
  failed_run_count: number;
  unknown_run_count: number;
  recommended_action?: {
    kind: string;
    entry_key: string;
    href: string | null;
    label: string | null;
  } | null;
  sampled_runs: OperatorRunFollowUpSnapshotSample[];
  explanation?: RunExecutionFocusExplanation | null;
};

export type PublishedEndpointInvocationDetailResponse = {
  invocation: PublishedEndpointInvocationItem;
  run?: PublishedEndpointInvocationRunReference | null;
  run_snapshot?: OperatorRunFollowUpSnapshot | null;
  run_follow_up?: OperatorRunFollowUpSummary | null;
  callback_tickets: PublishedEndpointInvocationCallbackTicketItem[];
  blocking_node_run_id?: string | null;
  execution_focus_reason?: PublishedEndpointInvocationExecutionFocusReason | null;
  execution_focus_node?: RunExecutionNodeItem | null;
  execution_focus_explanation?: RunExecutionFocusExplanation | null;
  callback_waiting_explanation?: RunExecutionFocusExplanation | null;
  skill_trace?: PublishedEndpointInvocationSkillTrace | null;
  blocking_sensitive_access_entries: SensitiveAccessTimelineEntry[];
  sensitive_access_entries: SensitiveAccessTimelineEntry[];
  cache: PublishedEndpointInvocationCacheReference;
};

export type PublishedEndpointCacheInventorySummary = {
  enabled: boolean;
  ttl?: number | null;
  max_entries?: number | null;
  vary_by: string[];
  active_entry_count: number;
  total_hit_count: number;
  last_hit_at?: string | null;
  nearest_expires_at?: string | null;
  latest_created_at?: string | null;
};

export type PublishedEndpointCacheInventoryItem = {
  id: string;
  binding_id: string;
  cache_key: string;
  response_preview: {
    key_count?: number;
    keys?: string[];
    sample?: Record<string, unknown>;
  };
  hit_count: number;
  last_hit_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type PublishedEndpointCacheInventoryResponse = {
  summary: PublishedEndpointCacheInventorySummary;
  items: PublishedEndpointCacheInventoryItem[];
};

export type WorkflowPublishedEndpointIssue = {
  category: "unsupported_auth_mode";
  message: string;
  field?: string | null;
  remediation?: string | null;
  blocks_lifecycle_publish: boolean;
};

export type WorkflowPublishedEndpointLegacyAuthCleanupSkipReason =
  | "binding_not_found"
  | "binding_not_legacy_auth"
  | "binding_not_draft"
  | "binding_already_offline";

export type WorkflowPublishedEndpointLegacyAuthCleanupSkipItem = {
  binding_id: string;
  endpoint_id?: string | null;
  endpoint_name?: string | null;
  workflow_version?: string | null;
  lifecycle_status?: "draft" | "published" | "offline" | null;
  reason: WorkflowPublishedEndpointLegacyAuthCleanupSkipReason;
  detail: string;
};

export type WorkflowPublishedEndpointLegacyAuthCleanupResult = {
  requested_count: number;
  updated_count: number;
  skipped_count: number;
  updated_binding_ids: string[];
  skipped_items: WorkflowPublishedEndpointLegacyAuthCleanupSkipItem[];
};

export type PublishedEndpointApiKeyItem = {
  id: string;
  workflow_id: string;
  endpoint_id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked";
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowPublishedEndpointItem = {
  id: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_version: string;
  target_workflow_version_id: string;
  target_workflow_version: string;
  compiled_blueprint_id: string;
  endpoint_id: string;
  endpoint_name: string;
  endpoint_alias: string;
  route_path: string;
  protocol: string;
  auth_mode: string;
  streaming: boolean;
  lifecycle_status: "draft" | "published" | "offline";
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  rate_limit_policy?:
    | {
        requests: number;
        windowSeconds: number;
      }
    | null;
  cache_policy?:
    | {
        enabled: boolean;
        ttl: number;
        maxEntries: number;
        varyBy: string[];
      }
    | null;
  published_at?: string | null;
  unpublished_at?: string | null;
  created_at: string;
  updated_at: string;
  activity?: PublishedEndpointInvocationSummary | null;
  cache_inventory?: PublishedEndpointCacheInventorySummary | null;
  issues?: WorkflowPublishedEndpointIssue[];
};
