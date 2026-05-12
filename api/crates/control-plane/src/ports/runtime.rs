use super::*;
use plugin_framework::data_source_contract::{
    DataSourceDescribeResourceInput, DataSourcePreviewReadInput, DataSourcePreviewReadOutput,
    DataSourceResourceDescriptor,
};

#[async_trait]
pub trait RuntimeRegistrySync: Send + Sync {
    async fn rebuild(&self) -> anyhow::Result<()>;
}

#[derive(Debug, Clone)]
pub struct UpsertCompiledPlanInput {
    pub actor_user_id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub schema_version: String,
    pub document_hash: String,
    pub document_updated_at: OffsetDateTime,
    pub plan: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct CreateFlowRunInput {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub compiled_plan_id: Uuid,
    pub debug_session_id: String,
    pub flow_schema_version: String,
    pub document_hash: String,
    pub run_mode: domain::FlowRunMode,
    pub target_node_id: Option<String>,
    pub status: domain::FlowRunStatus,
    pub input_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
    pub api_key_id: Option<Uuid>,
    pub publication_version_id: Option<Uuid>,
    pub external_user: Option<String>,
    pub external_conversation_id: Option<String>,
    pub external_trace_id: Option<String>,
    pub compatibility_mode: Option<String>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateFlowRunShellInput {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub debug_session_id: String,
    pub flow_schema_version: String,
    pub document_hash: String,
    pub run_mode: domain::FlowRunMode,
    pub target_node_id: Option<String>,
    pub status: domain::FlowRunStatus,
    pub input_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
    pub api_key_id: Option<Uuid>,
    pub publication_version_id: Option<Uuid>,
    pub external_user: Option<String>,
    pub external_conversation_id: Option<String>,
    pub external_trace_id: Option<String>,
    pub compatibility_mode: Option<String>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AttachCompiledPlanToFlowRunInput {
    pub flow_run_id: Uuid,
    pub compiled_plan_id: Uuid,
    pub flow_schema_version: String,
    pub document_hash: String,
    pub status: domain::FlowRunStatus,
}

#[derive(Debug, Clone)]
pub struct FailQueuedFlowRunShellInput {
    pub flow_run_id: Uuid,
    pub output_payload: serde_json::Value,
    pub error_payload: serde_json::Value,
    pub finished_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct CreateNodeRunInput {
    pub flow_run_id: Uuid,
    pub node_id: String,
    pub node_type: String,
    pub node_alias: String,
    pub status: domain::NodeRunStatus,
    pub input_payload: serde_json::Value,
    pub debug_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct UpdateNodeRunInput {
    pub node_run_id: Uuid,
    pub status: domain::NodeRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub debug_payload: serde_json::Value,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct CompleteNodeRunInput {
    pub node_run_id: Uuid,
    pub status: domain::NodeRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub debug_payload: serde_json::Value,
    pub finished_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct UpdateFlowRunInput {
    pub flow_run_id: Uuid,
    pub status: domain::FlowRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct CompleteFlowRunInput {
    pub flow_run_id: Uuid,
    pub status: domain::FlowRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub finished_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct AppendRunEventInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpdateFlowRunPayloadsInput {
    pub flow_run_id: Uuid,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct UpdateNodeRunPayloadsInput {
    pub node_run_id: Uuid,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub debug_payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpdateRunEventPayloadInput {
    pub run_event_id: Uuid,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct DebugVariableCacheKey {
    pub node_id: String,
    pub variable_key: String,
}

#[derive(Debug, Clone)]
pub struct DebugVariableCacheEntry {
    pub node_id: String,
    pub variable_key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpsertDebugVariableCacheEntryInput {
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub draft_id: Uuid,
    pub actor_user_id: Uuid,
    pub node_id: String,
    pub variable_key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct DeleteDebugVariableCacheEntriesInput {
    pub application_id: Uuid,
    pub draft_id: Uuid,
    pub actor_user_id: Uuid,
    pub keys: Option<Vec<DebugVariableCacheKey>>,
}

#[derive(Debug, Clone)]
pub struct CreateRuntimeDebugArtifactInput {
    pub artifact_id: Uuid,
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Option<Uuid>,
    pub node_run_id: Option<Uuid>,
    pub run_event_id: Option<Uuid>,
    pub artifact_kind: String,
    pub content_type: String,
    pub original_size_bytes: i64,
    pub preview_size_bytes: i64,
    pub storage_id: Uuid,
    pub storage_ref: String,
    pub retention_state: String,
}

#[derive(Debug, Clone)]
pub struct GetRuntimeDebugArtifactInput {
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub artifact_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct AppendRuntimeSpanInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub parent_span_id: Option<Uuid>,
    pub kind: domain::RuntimeSpanKind,
    pub name: String,
    pub status: domain::RuntimeSpanStatus,
    pub capability_id: Option<String>,
    pub input_ref: Option<String>,
    pub output_ref: Option<String>,
    pub error_payload: Option<serde_json::Value>,
    pub metadata: serde_json::Value,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct AppendRuntimeEventInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub span_id: Option<Uuid>,
    pub parent_span_id: Option<Uuid>,
    pub event_type: String,
    pub layer: domain::RuntimeEventLayer,
    pub source: domain::RuntimeEventSource,
    pub trust_level: domain::RuntimeTrustLevel,
    pub item_id: Option<Uuid>,
    pub ledger_ref: Option<String>,
    pub payload: serde_json::Value,
    pub visibility: domain::RuntimeEventVisibility,
    pub durability: domain::RuntimeEventDurability,
}

#[derive(Debug, Clone)]
pub struct AppendRuntimeItemInput {
    pub flow_run_id: Uuid,
    pub span_id: Option<Uuid>,
    pub kind: domain::RuntimeItemKind,
    pub status: domain::RuntimeItemStatus,
    pub source_event_id: Option<Uuid>,
    pub input_ref: Option<String>,
    pub output_ref: Option<String>,
    pub usage_ledger_id: Option<Uuid>,
    pub trust_level: domain::RuntimeTrustLevel,
}

#[derive(Debug, Clone)]
pub struct AppendContextProjectionInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub llm_turn_span_id: Option<Uuid>,
    pub projection_kind: String,
    pub merge_stage_ref: Option<String>,
    pub source_transcript_ref: Option<String>,
    pub source_item_refs: serde_json::Value,
    pub compaction_event_id: Option<Uuid>,
    pub summary_version: Option<String>,
    pub model_input_ref: String,
    pub model_input_hash: String,
    pub compacted_summary_ref: Option<String>,
    pub previous_projection_id: Option<Uuid>,
    pub token_estimate: Option<i64>,
    pub provider_continuation_metadata: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct AppendUsageLedgerInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub span_id: Option<Uuid>,
    pub failover_attempt_id: Option<Uuid>,
    pub provider_instance_id: Option<Uuid>,
    pub gateway_route_id: Option<Uuid>,
    pub model_id: Option<String>,
    pub upstream_model_id: Option<String>,
    pub upstream_request_id: Option<String>,
    pub input_tokens: Option<i64>,
    pub cached_input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub reasoning_output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub input_cache_hit_tokens: Option<i64>,
    pub input_cache_miss_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub cache_write_tokens: Option<i64>,
    pub price_snapshot: Option<serde_json::Value>,
    pub cost_snapshot: Option<serde_json::Value>,
    pub usage_status: domain::UsageLedgerStatus,
    pub raw_usage: serde_json::Value,
    pub normalized_usage: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct AppendCostLedgerInput {
    pub flow_run_id: Option<Uuid>,
    pub span_id: Option<Uuid>,
    pub usage_ledger_id: Option<Uuid>,
    pub workspace_id: Uuid,
    pub provider_instance_id: Option<Uuid>,
    pub provider_account_id: Option<Uuid>,
    pub gateway_route_id: Option<Uuid>,
    pub model_id: Option<String>,
    pub upstream_model_id: Option<String>,
    pub price_snapshot: serde_json::Value,
    pub raw_cost: Option<String>,
    pub normalized_cost: Option<String>,
    pub settlement_currency: Option<String>,
    pub cost_source: String,
    pub cost_status: String,
}

#[derive(Debug, Clone)]
pub struct AppendCreditLedgerInput {
    pub workspace_id: Uuid,
    pub user_id: Option<Uuid>,
    pub app_id: Option<Uuid>,
    pub agent_id: Option<Uuid>,
    pub flow_run_id: Option<Uuid>,
    pub span_id: Option<Uuid>,
    pub cost_ledger_id: Option<Uuid>,
    pub transaction_type: String,
    pub amount: String,
    pub balance_after: Option<String>,
    pub credit_unit: String,
    pub reason: String,
    pub idempotency_key: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct AppendBillingSessionInput {
    pub workspace_id: Uuid,
    pub flow_run_id: Option<Uuid>,
    pub client_request_id: Option<String>,
    pub idempotency_key: String,
    pub route_id: Option<Uuid>,
    pub provider_account_id: Option<Uuid>,
    pub status: domain::BillingSessionStatus,
    pub reserved_credit_ledger_id: Option<Uuid>,
    pub settled_credit_ledger_id: Option<Uuid>,
    pub refund_credit_ledger_id: Option<Uuid>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpsertDataModelSideEffectReceiptInput {
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub draft_id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub node_id: String,
    pub action: String,
    pub model_code: String,
    pub record_id: Option<String>,
    pub deleted_id: Option<String>,
    pub affected_count: i64,
    pub idempotency_key: String,
    pub payload_hash: String,
    pub actor_user_id: Uuid,
    pub scope_id: Uuid,
    pub status: String,
    pub output_payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct DataModelSideEffectReceiptClaim {
    pub record: domain::DataModelSideEffectReceiptRecord,
    pub claimed: bool,
}

#[derive(Debug, Clone)]
pub struct AppendModelFailoverAttemptLedgerInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub llm_turn_span_id: Option<Uuid>,
    pub queue_snapshot_id: Option<Uuid>,
    pub attempt_index: i32,
    pub provider_instance_id: Option<Uuid>,
    pub provider_code: String,
    pub upstream_model_id: String,
    pub protocol: String,
    pub request_ref: Option<String>,
    pub request_hash: Option<String>,
    pub started_at: OffsetDateTime,
    pub first_token_at: Option<OffsetDateTime>,
    pub finished_at: Option<OffsetDateTime>,
    pub status: String,
    pub failed_after_first_token: bool,
    pub upstream_request_id: Option<String>,
    pub error_code: Option<String>,
    pub error_message_ref: Option<String>,
    pub usage_ledger_id: Option<Uuid>,
    pub cost_ledger_id: Option<Uuid>,
    pub response_ref: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LinkUsageLedgerToModelFailoverAttemptInput {
    pub failover_attempt_id: Uuid,
    pub usage_ledger_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct AppendCapabilityInvocationInput {
    pub flow_run_id: Uuid,
    pub span_id: Option<Uuid>,
    pub capability_id: String,
    pub requested_by_span_id: Option<Uuid>,
    pub requester_kind: String,
    pub arguments_ref: Option<String>,
    pub authorization_status: String,
    pub authorization_reason: Option<String>,
    pub result_ref: Option<String>,
    pub normalized_result: Option<serde_json::Value>,
    pub started_at: Option<OffsetDateTime>,
    pub finished_at: Option<OffsetDateTime>,
    pub error_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CreateCheckpointInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub status: String,
    pub reason: String,
    pub locator_payload: serde_json::Value,
    pub variable_snapshot: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CreateCallbackTaskInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub callback_kind: String,
    pub request_payload: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CompleteCallbackTaskInput {
    pub callback_task_id: Uuid,
    pub response_payload: serde_json::Value,
    pub completed_at: OffsetDateTime,
}

#[async_trait]
pub trait OrchestrationRuntimeRepository: Send + Sync {
    async fn upsert_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> anyhow::Result<domain::CompiledPlanRecord>;
    async fn get_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> anyhow::Result<Option<domain::CompiledPlanRecord>>;
    async fn create_flow_run(
        &self,
        input: &CreateFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn create_flow_run_shell(
        &self,
        input: &CreateFlowRunShellInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn attach_compiled_plan_to_flow_run(
        &self,
        input: &AttachCompiledPlanToFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn fail_queued_flow_run_shell(
        &self,
        input: &FailQueuedFlowRunShellInput,
    ) -> anyhow::Result<Option<domain::FlowRunRecord>>;
    async fn get_flow_run(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Option<domain::FlowRunRecord>>;
    async fn create_node_run(
        &self,
        input: &CreateNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn update_node_run(
        &self,
        input: &UpdateNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn update_flow_run(
        &self,
        input: &UpdateFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn update_flow_run_if_status(
        &self,
        input: &UpdateFlowRunInput,
        expected_status: domain::FlowRunStatus,
    ) -> anyhow::Result<Option<domain::FlowRunRecord>>;
    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn get_checkpoint(
        &self,
        flow_run_id: Uuid,
        checkpoint_id: Uuid,
    ) -> anyhow::Result<Option<domain::CheckpointRecord>>;
    async fn create_checkpoint(
        &self,
        input: &CreateCheckpointInput,
    ) -> anyhow::Result<domain::CheckpointRecord>;
    async fn create_callback_task(
        &self,
        input: &CreateCallbackTaskInput,
    ) -> anyhow::Result<domain::CallbackTaskRecord>;
    async fn get_callback_task(
        &self,
        callback_task_id: Uuid,
    ) -> anyhow::Result<Option<domain::CallbackTaskRecord>> {
        let _ = callback_task_id;
        anyhow::bail!("get_callback_task not implemented")
    }
    async fn complete_callback_task(
        &self,
        input: &CompleteCallbackTaskInput,
    ) -> anyhow::Result<domain::CallbackTaskRecord>;
    async fn append_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> anyhow::Result<domain::RunEventRecord>;
    async fn append_run_events(
        &self,
        inputs: &[AppendRunEventInput],
    ) -> anyhow::Result<Vec<domain::RunEventRecord>> {
        let mut records = Vec::with_capacity(inputs.len());
        for input in inputs {
            records.push(self.append_run_event(input).await?);
        }
        Ok(records)
    }
    async fn update_flow_run_payloads(
        &self,
        input: &UpdateFlowRunPayloadsInput,
    ) -> anyhow::Result<domain::FlowRunRecord> {
        let _ = input;
        anyhow::bail!("update_flow_run_payloads not implemented")
    }
    async fn update_node_run_payloads(
        &self,
        input: &UpdateNodeRunPayloadsInput,
    ) -> anyhow::Result<domain::NodeRunRecord> {
        let _ = input;
        anyhow::bail!("update_node_run_payloads not implemented")
    }
    async fn update_run_event_payload(
        &self,
        input: &UpdateRunEventPayloadInput,
    ) -> anyhow::Result<domain::RunEventRecord> {
        let _ = input;
        anyhow::bail!("update_run_event_payload not implemented")
    }
    async fn upsert_debug_variable_cache_entry(
        &self,
        input: &UpsertDebugVariableCacheEntryInput,
    ) -> anyhow::Result<DebugVariableCacheEntry> {
        let _ = input;
        anyhow::bail!("upsert_debug_variable_cache_entry not implemented")
    }
    async fn list_debug_variable_cache_entries(
        &self,
        application_id: Uuid,
        draft_id: Uuid,
        actor_user_id: Uuid,
    ) -> anyhow::Result<Vec<DebugVariableCacheEntry>> {
        let _ = (application_id, draft_id, actor_user_id);
        anyhow::bail!("list_debug_variable_cache_entries not implemented")
    }
    async fn delete_debug_variable_cache_entries(
        &self,
        input: &DeleteDebugVariableCacheEntriesInput,
    ) -> anyhow::Result<()> {
        let _ = input;
        anyhow::bail!("delete_debug_variable_cache_entries not implemented")
    }
    async fn create_runtime_debug_artifact(
        &self,
        input: &CreateRuntimeDebugArtifactInput,
    ) -> anyhow::Result<domain::RuntimeDebugArtifactRecord> {
        let _ = input;
        anyhow::bail!("create_runtime_debug_artifact not implemented")
    }
    async fn get_runtime_debug_artifact(
        &self,
        input: &GetRuntimeDebugArtifactInput,
    ) -> anyhow::Result<Option<domain::RuntimeDebugArtifactRecord>> {
        let _ = input;
        anyhow::bail!("get_runtime_debug_artifact not implemented")
    }
    async fn get_data_model_side_effect_receipt(
        &self,
        workspace_id: Uuid,
        idempotency_key: &str,
    ) -> anyhow::Result<Option<domain::DataModelSideEffectReceiptRecord>> {
        let _ = (workspace_id, idempotency_key);
        anyhow::bail!("get_data_model_side_effect_receipt not implemented")
    }
    async fn claim_data_model_side_effect_receipt(
        &self,
        input: &UpsertDataModelSideEffectReceiptInput,
    ) -> anyhow::Result<DataModelSideEffectReceiptClaim> {
        let _ = input;
        anyhow::bail!("claim_data_model_side_effect_receipt not implemented")
    }
    async fn upsert_data_model_side_effect_receipt(
        &self,
        input: &UpsertDataModelSideEffectReceiptInput,
    ) -> anyhow::Result<domain::DataModelSideEffectReceiptRecord> {
        let _ = input;
        anyhow::bail!("upsert_data_model_side_effect_receipt not implemented")
    }
    async fn append_runtime_span(
        &self,
        input: &AppendRuntimeSpanInput,
    ) -> anyhow::Result<domain::RuntimeSpanRecord>;
    async fn append_runtime_event(
        &self,
        input: &AppendRuntimeEventInput,
    ) -> anyhow::Result<domain::RuntimeEventRecord>;
    async fn append_runtime_events(
        &self,
        inputs: &[AppendRuntimeEventInput],
    ) -> anyhow::Result<Vec<domain::RuntimeEventRecord>> {
        let mut records = Vec::with_capacity(inputs.len());
        for input in inputs {
            records.push(self.append_runtime_event(input).await?);
        }
        Ok(records)
    }
    async fn append_runtime_item(
        &self,
        input: &AppendRuntimeItemInput,
    ) -> anyhow::Result<domain::RuntimeItemRecord>;
    async fn append_context_projection(
        &self,
        input: &AppendContextProjectionInput,
    ) -> anyhow::Result<domain::ContextProjectionRecord>;
    async fn append_usage_ledger(
        &self,
        input: &AppendUsageLedgerInput,
    ) -> anyhow::Result<domain::UsageLedgerRecord>;
    async fn append_cost_ledger(
        &self,
        input: &AppendCostLedgerInput,
    ) -> anyhow::Result<domain::CostLedgerRecord>;
    async fn append_credit_ledger(
        &self,
        input: &AppendCreditLedgerInput,
    ) -> anyhow::Result<domain::CreditLedgerRecord>;
    async fn append_billing_session(
        &self,
        input: &AppendBillingSessionInput,
    ) -> anyhow::Result<domain::BillingSessionRecord>;
    async fn append_audit_hash(
        &self,
        flow_run_id: Uuid,
        fact_table: &str,
        fact_id: Uuid,
        payload: serde_json::Value,
    ) -> anyhow::Result<domain::AuditHashRecord>;
    async fn append_model_failover_attempt_ledger(
        &self,
        input: &AppendModelFailoverAttemptLedgerInput,
    ) -> anyhow::Result<domain::ModelFailoverAttemptLedgerRecord>;
    async fn link_usage_ledger_to_model_failover_attempt(
        &self,
        input: &LinkUsageLedgerToModelFailoverAttemptInput,
    ) -> anyhow::Result<domain::ModelFailoverAttemptLedgerRecord>;
    async fn append_capability_invocation(
        &self,
        input: &AppendCapabilityInvocationInput,
    ) -> anyhow::Result<domain::CapabilityInvocationRecord>;
    async fn list_runtime_spans(
        &self,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Vec<domain::RuntimeSpanRecord>>;
    async fn list_runtime_events(
        &self,
        flow_run_id: Uuid,
        after_sequence: i64,
    ) -> anyhow::Result<Vec<domain::RuntimeEventRecord>>;
    async fn list_runtime_items(
        &self,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Vec<domain::RuntimeItemRecord>>;
    async fn list_context_projections(
        &self,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ContextProjectionRecord>>;
    async fn list_usage_ledger(
        &self,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Vec<domain::UsageLedgerRecord>>;
    async fn list_model_failover_attempt_ledger(
        &self,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ModelFailoverAttemptLedgerRecord>>;
    async fn list_capability_invocations(
        &self,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Vec<domain::CapabilityInvocationRecord>>;
    async fn list_application_runs(
        &self,
        application_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ApplicationRunSummary>>;
    async fn get_application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Option<domain::ApplicationRunDetail>>;
    async fn get_latest_node_run(
        &self,
        application_id: Uuid,
        node_id: &str,
    ) -> anyhow::Result<Option<domain::NodeLastRun>>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderRuntimeInvocationOutput {
    pub events: Vec<ProviderStreamEvent>,
    pub result: ProviderInvocationResult,
}

#[async_trait]
pub trait ProviderRuntimePort: Send + Sync {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()>;
    async fn validate_provider(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn list_models(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: serde_json::Value,
    ) -> anyhow::Result<Vec<ProviderModelDescriptor>>;
    async fn get_balance(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: serde_json::Value,
    ) -> anyhow::Result<ProviderBalanceResult> {
        let _ = installation;
        let _ = provider_config;
        anyhow::bail!("provider balance is not implemented by this runtime")
    }
    async fn invoke_stream(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: ProviderInvocationInput,
    ) -> anyhow::Result<ProviderRuntimeInvocationOutput>;
    async fn invoke_stream_with_live_events(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: ProviderInvocationInput,
        live_events: Option<tokio::sync::mpsc::UnboundedSender<ProviderStreamEvent>>,
    ) -> anyhow::Result<ProviderRuntimeInvocationOutput> {
        let _ = live_events;
        self.invoke_stream(installation, input).await
    }
}

#[async_trait]
pub trait DataSourceRuntimePort: Send + Sync {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()>;
    async fn validate_config(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn test_connection(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn discover_catalog(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn describe_resource(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: DataSourceDescribeResourceInput,
    ) -> anyhow::Result<DataSourceResourceDescriptor>;
    async fn preview_read(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: DataSourcePreviewReadInput,
    ) -> anyhow::Result<DataSourcePreviewReadOutput>;
}
