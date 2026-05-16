use std::collections::BTreeMap;

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use plugin_framework::{
    error::PluginFrameworkError,
    provider_contract::{
        ProviderFinishReason, ProviderInvocationInput, ProviderInvocationResult, ProviderMessage,
        ProviderMessageRole, ProviderRuntimeError, ProviderRuntimeErrorKind, ProviderStreamEvent,
        ProviderUsage,
    },
};
use serde_json::{Map, Value, json};

use crate::{
    binding_runtime::{render_templated_bindings, resolve_node_inputs},
    code_runtime::execute_code_node,
    compiled_plan::{
        CompiledLlmRuntime, CompiledNode, CompiledPlan, CompiledPluginRuntime, LlmRoutingMode,
    },
    execution_state::{
        CheckpointSnapshot, ExecutionStopReason, FlowDebugExecutionOutcome, NodeExecutionFailure,
        NodeExecutionTrace, PendingCallbackTask, PendingHumanInput,
    },
    node_errors::build_node_type_not_implemented_error_payload,
    payload_builder::{
        BuiltNodePayloads, PublicOutputContract, RawNodeExecutionResult, is_reserved_payload_key,
    },
};

pub use crate::code_runtime::{CodeInvocationOutput, CodeInvoker, QuickJsCodeInvoker};

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderInvocationOutput {
    pub events: Vec<ProviderStreamEvent>,
    pub result: ProviderInvocationResult,
}

#[async_trait]
pub trait ProviderInvoker: Send + Sync {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct CapabilityInvocationOutput {
    pub output_payload: Value,
}

#[async_trait]
pub trait CapabilityInvoker: Send + Sync {
    async fn invoke_capability_node(
        &self,
        runtime: &CompiledPluginRuntime,
        config_payload: Value,
        input_payload: Value,
    ) -> Result<CapabilityInvocationOutput>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct LlmNodeExecution {
    pub output_payload: Value,
    pub error_payload: Option<Value>,
    pub metrics_payload: Value,
    pub debug_payload: Value,
    pub provider_events: Vec<ProviderStreamEvent>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CapabilityNodeExecution {
    pub output_payload: Value,
    pub error_payload: Option<Value>,
    pub metrics_payload: Value,
    pub debug_payload: Value,
}

pub async fn start_flow_debug_run<I>(
    plan: &CompiledPlan,
    input_payload: &Value,
    invoker: &I,
) -> Result<FlowDebugExecutionOutcome>
where
    I: ProviderInvoker + CapabilityInvoker + CodeInvoker + ?Sized,
{
    let variable_pool = input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;

    execute_from(plan, 0, variable_pool, invoker).await
}

pub async fn resume_flow_debug_run<I>(
    plan: &CompiledPlan,
    checkpoint: &CheckpointSnapshot,
    waiting_node_id: &str,
    resume_payload: &Value,
    invoker: &I,
) -> Result<FlowDebugExecutionOutcome>
where
    I: ProviderInvoker + CapabilityInvoker + CodeInvoker + ?Sized,
{
    let patch = resume_payload
        .as_object()
        .ok_or_else(|| anyhow!("resume payload must be an object"))?;
    let waiting_node = plan
        .nodes
        .get(waiting_node_id)
        .ok_or_else(|| anyhow!("waiting node not found: {waiting_node_id}"))?;
    let allowed_output_keys = waiting_node
        .outputs
        .iter()
        .map(|output| output.key.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    for key in patch.keys() {
        if !allowed_output_keys.contains(key.as_str()) {
            return Err(anyhow!(
                "resume payload key {key} is not a public output for {waiting_node_id}"
            ));
        }
    }
    let mut variable_pool = checkpoint.variable_pool.clone();

    variable_pool.insert(waiting_node_id.to_string(), Value::Object(patch.clone()));

    execute_from(plan, checkpoint.next_node_index, variable_pool, invoker).await
}

async fn execute_from<I>(
    plan: &CompiledPlan,
    next_node_index: usize,
    mut variable_pool: Map<String, Value>,
    invoker: &I,
) -> Result<FlowDebugExecutionOutcome>
where
    I: ProviderInvoker + CapabilityInvoker + CodeInvoker + ?Sized,
{
    let mut node_traces = Vec::new();

    for (index, node_id) in plan
        .topological_order
        .iter()
        .enumerate()
        .skip(next_node_index)
    {
        let node = plan
            .nodes
            .get(node_id)
            .ok_or_else(|| anyhow!("compiled node missing: {node_id}"))?;
        let resolved_inputs = match resolve_node_inputs(node, &variable_pool) {
            Ok(inputs) => inputs,
            Err(error) => {
                let error_payload = build_binding_resolution_error_payload(&error);
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: json!({}),
                    output_payload: json!({}),
                    error_payload: Some(error_payload.clone()),
                    metrics_payload: json!({ "preview_mode": true }),
                    debug_payload: json!({}),
                    provider_events: Vec::new(),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::Failed(NodeExecutionFailure {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        error_payload,
                    }),
                    variable_pool,
                    checkpoint_snapshot: None,
                    node_traces,
                });
            }
        };
        let rendered_templates = render_templated_bindings(node, &resolved_inputs);

        match node.node_type.as_str() {
            "start" => {
                let payload = variable_pool
                    .get(node_id)
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: json!({}),
                    output_payload: payload,
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true }),
                    debug_payload: json!({}),
                    provider_events: Vec::new(),
                });
            }
            "llm" => {
                let execution = execute_llm_node(
                    node,
                    &resolved_inputs,
                    &rendered_templates,
                    &variable_pool,
                    invoker,
                )
                .await?;
                let trace = NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: execution.output_payload.clone(),
                    error_payload: execution.error_payload.clone(),
                    metrics_payload: execution.metrics_payload.clone(),
                    debug_payload: execution.debug_payload.clone(),
                    provider_events: execution.provider_events.clone(),
                };
                node_traces.push(trace);

                if let Some(error_payload) = execution.error_payload {
                    return Ok(FlowDebugExecutionOutcome {
                        stop_reason: ExecutionStopReason::Failed(NodeExecutionFailure {
                            node_id: node.node_id.clone(),
                            node_alias: node.alias.clone(),
                            error_payload,
                        }),
                        variable_pool,
                        checkpoint_snapshot: None,
                        node_traces,
                    });
                }

                variable_pool.insert(
                    node.node_id.clone(),
                    project_node_variable_payload(node, &execution.output_payload)?,
                );
            }
            "plugin_node" => {
                let execution = execute_capability_plugin_node(
                    node,
                    &resolved_inputs,
                    &rendered_templates,
                    invoker,
                )
                .await?;
                let trace = NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: execution.output_payload.clone(),
                    error_payload: execution.error_payload.clone(),
                    metrics_payload: execution.metrics_payload.clone(),
                    debug_payload: execution.debug_payload.clone(),
                    provider_events: Vec::new(),
                };
                node_traces.push(trace);

                if let Some(error_payload) = execution.error_payload {
                    return Ok(FlowDebugExecutionOutcome {
                        stop_reason: ExecutionStopReason::Failed(NodeExecutionFailure {
                            node_id: node.node_id.clone(),
                            node_alias: node.alias.clone(),
                            error_payload,
                        }),
                        variable_pool,
                        checkpoint_snapshot: None,
                        node_traces,
                    });
                }

                variable_pool.insert(
                    node.node_id.clone(),
                    project_node_variable_payload(node, &execution.output_payload)?,
                );
            }
            "template_transform" | "answer" => {
                let output_key = first_output_key(node);
                let output_value =
                    rendered_templates
                        .values()
                        .next()
                        .cloned()
                        .unwrap_or_else(|| {
                            resolved_inputs
                                .values()
                                .next()
                                .cloned()
                                .unwrap_or(Value::Null)
                        });
                let output_payload = json!({ output_key: output_value });
                variable_pool.insert(
                    node.node_id.clone(),
                    project_node_variable_payload(node, &output_payload)?,
                );
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload,
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true }),
                    debug_payload: json!({}),
                    provider_events: Vec::new(),
                });
            }
            "human_input" => {
                let prompt = rendered_templates
                    .get("prompt")
                    .and_then(Value::as_str)
                    .unwrap_or("请提供人工输入")
                    .to_string();
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: json!({}),
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true, "waiting": "human_input" }),
                    debug_payload: json!({}),
                    provider_events: Vec::new(),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::WaitingHuman(PendingHumanInput {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        prompt,
                    }),
                    variable_pool: variable_pool.clone(),
                    checkpoint_snapshot: Some(CheckpointSnapshot {
                        next_node_index: index + 1,
                        variable_pool,
                    }),
                    node_traces,
                });
            }
            "tool" | "http_request" => {
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs.clone()),
                    output_payload: json!({}),
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true, "waiting": node.node_type }),
                    debug_payload: json!({}),
                    provider_events: Vec::new(),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::WaitingCallback(PendingCallbackTask {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        callback_kind: node.node_type.clone(),
                        request_payload: Value::Object(resolved_inputs),
                    }),
                    variable_pool: variable_pool.clone(),
                    checkpoint_snapshot: Some(CheckpointSnapshot {
                        next_node_index: index + 1,
                        variable_pool,
                    }),
                    node_traces,
                });
            }
            "code" => {
                let execution = execute_code_node(node, &resolved_inputs, invoker).await?;
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: execution.output_payload.clone(),
                    error_payload: execution.error_payload.clone(),
                    metrics_payload: execution.metrics_payload.clone(),
                    debug_payload: execution.debug_payload.clone(),
                    provider_events: Vec::new(),
                });

                if let Some(error_payload) = execution.error_payload {
                    return Ok(FlowDebugExecutionOutcome {
                        stop_reason: ExecutionStopReason::Failed(NodeExecutionFailure {
                            node_id: node.node_id.clone(),
                            node_alias: node.alias.clone(),
                            error_payload,
                        }),
                        variable_pool,
                        checkpoint_snapshot: None,
                        node_traces,
                    });
                }

                variable_pool.insert(
                    node.node_id.clone(),
                    project_node_variable_payload(node, &execution.output_payload)?,
                );
            }
            other => {
                let error_payload = build_node_type_not_implemented_error_payload(other, "preview");
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: json!({}),
                    error_payload: Some(error_payload.clone()),
                    metrics_payload: json!({ "preview_mode": true }),
                    debug_payload: json!({}),
                    provider_events: Vec::new(),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::Failed(NodeExecutionFailure {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        error_payload,
                    }),
                    variable_pool,
                    checkpoint_snapshot: None,
                    node_traces,
                });
            }
        }
    }

    Ok(FlowDebugExecutionOutcome {
        stop_reason: ExecutionStopReason::Completed,
        variable_pool,
        checkpoint_snapshot: None,
        node_traces,
    })
}

pub async fn execute_llm_node<I>(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
    rendered_templates: &Map<String, Value>,
    variable_pool: &Map<String, Value>,
    invoker: &I,
) -> Result<LlmNodeExecution>
where
    I: ProviderInvoker + ?Sized,
{
    let runtime = node.llm_runtime.as_ref().ok_or_else(|| {
        anyhow!(
            "compiled llm node is missing runtime metadata: {}",
            node.node_id
        )
    })?;
    let attempt_runtimes = llm_attempt_runtimes(runtime);
    let failover_enabled = runtime
        .routing
        .as_ref()
        .is_some_and(|routing| routing.routing_mode == LlmRoutingMode::FailoverQueue);
    let mut attempt_metrics = Vec::new();
    let mut failed_attempts = Vec::new();

    for (attempt_index, attempt_runtime) in attempt_runtimes.iter().enumerate() {
        let invocation_input = build_provider_invocation_input(
            node,
            attempt_runtime,
            resolved_inputs,
            rendered_templates,
            variable_pool,
        );
        if invocation_input.messages.is_empty() {
            let error_payload = build_empty_prompt_messages_error_payload(attempt_runtime);
            let attempt = build_attempt_metric(
                attempt_index,
                attempt_runtime,
                "failed",
                false,
                Some(&error_payload),
                &ProviderUsage::default(),
                0,
            );
            attempt_metrics.push(attempt);

            return build_failed_llm_execution(
                node,
                attempt_runtime,
                error_payload,
                build_llm_metrics_payload(
                    attempt_runtime,
                    ProviderUsage::default(),
                    Some(ProviderFinishReason::Error),
                    0,
                    attempt_metrics,
                ),
                Vec::new(),
                false,
            );
        }
        let output = match invoker.invoke_llm(attempt_runtime, invocation_input).await {
            Ok(output) => output,
            Err(error) => {
                let provider_error = provider_runtime_error_from_anyhow(&error);
                let error_payload = build_provider_error_payload(attempt_runtime, &provider_error);
                let attempt = build_attempt_metric(
                    attempt_index,
                    attempt_runtime,
                    "failed",
                    false,
                    Some(&error_payload),
                    &ProviderUsage::default(),
                    0,
                );
                attempt_metrics.push(attempt.clone());
                failed_attempts.push(attempt);
                if failover_enabled && attempt_index + 1 < attempt_runtimes.len() {
                    continue;
                }

                return build_failed_llm_execution(
                    node,
                    attempt_runtime,
                    error_payload,
                    build_llm_metrics_payload(
                        attempt_runtime,
                        ProviderUsage::default(),
                        Some(ProviderFinishReason::Error),
                        0,
                        attempt_metrics,
                    ),
                    Vec::new(),
                    true,
                );
            }
        };

        let usage = collect_usage(&output.events, &output.result.usage);
        let finish_reason = output
            .result
            .finish_reason
            .clone()
            .or_else(|| finish_reason_from_events(&output.events));
        let final_content = resolve_final_llm_content(
            output.result.final_content.clone(),
            collect_dify_style_deltas(&output.events),
        );
        let provider_error = first_provider_error(&output.events).cloned().or_else(|| {
            matches!(finish_reason, Some(ProviderFinishReason::Error)).then(|| {
                ProviderRuntimeError::normalize(
                    "invoke",
                    "provider invocation finished with error",
                    None,
                )
            })
        });
        let failed_after_first_token = provider_error.is_some()
            && content_delta_seen_before_terminal_failure(&output.events, finish_reason.as_ref());
        let error_payload = provider_error
            .as_ref()
            .map(|error| build_provider_error_payload(attempt_runtime, error));
        let attempt_status = if error_payload.is_some() {
            "failed"
        } else {
            "succeeded"
        };
        let attempt = build_attempt_metric(
            attempt_index,
            attempt_runtime,
            attempt_status,
            failed_after_first_token,
            error_payload.as_ref(),
            &usage,
            output.events.len(),
        );
        attempt_metrics.push(attempt.clone());

        if let Some(error_payload) = &error_payload {
            failed_attempts.push(attempt);
            if failover_enabled
                && !failed_after_first_token
                && attempt_index + 1 < attempt_runtimes.len()
            {
                continue;
            }
            return build_failed_llm_execution(
                node,
                attempt_runtime,
                error_payload.clone(),
                build_llm_metrics_payload(
                    attempt_runtime,
                    usage,
                    finish_reason,
                    output.events.len(),
                    attempt_metrics,
                ),
                output.events,
                true,
            );
        }

        return build_successful_llm_execution(
            node,
            attempt_runtime,
            &output.result,
            final_content,
            build_llm_metrics_payload(
                attempt_runtime,
                usage,
                finish_reason.clone(),
                output.events.len(),
                attempt_metrics,
            ),
            output.events,
        );
    }

    let error_payload = json!({
        "error_kind": "provider_unavailable",
        "message": "all failover queue attempts failed",
        "attempts": failed_attempts,
    });
    build_failed_llm_execution(
        node,
        runtime,
        error_payload,
        build_llm_metrics_payload(
            runtime,
            ProviderUsage::default(),
            Some(ProviderFinishReason::Error),
            0,
            attempt_metrics,
        ),
        Vec::new(),
        true,
    )
}

pub async fn execute_capability_plugin_node<I>(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
    _rendered_templates: &Map<String, Value>,
    invoker: &I,
) -> Result<CapabilityNodeExecution>
where
    I: CapabilityInvoker + ?Sized,
{
    let runtime = node.plugin_runtime.as_ref().ok_or_else(|| {
        anyhow!(
            "compiled plugin node is missing runtime metadata: {}",
            node.node_id
        )
    })?;
    let config_payload = node.config.clone();
    let input_payload = Value::Object(resolved_inputs.clone());

    match invoker
        .invoke_capability_node(runtime, config_payload, input_payload)
        .await
    {
        Ok(output) => {
            let raw = RawNodeExecutionResult {
                executor_output: object_from_value(output.output_payload)?,
                metrics_facts: object_from_value(json!({
                    "plugin_id": runtime.plugin_id,
                    "plugin_version": runtime.plugin_version,
                    "plugin_unique_identifier": runtime.plugin_unique_identifier,
                    "package_id": runtime.package_id,
                    "contribution_code": runtime.contribution_code,
                    "node_shell": runtime.node_shell,
                    "schema_version": runtime.schema_version,
                    "contribution_checksum": runtime.contribution_checksum,
                    "compiled_contribution_hash": runtime.compiled_contribution_hash,
                    "side_effect_policy": runtime.side_effect_policy,
                }))?,
                error_facts: Map::new(),
                debug_facts: Map::new(),
                provider_events: Vec::new(),
            };
            let built = build_plugin_node_payloads(node, raw)?;

            Ok(CapabilityNodeExecution {
                output_payload: built.output_payload,
                error_payload: None,
                metrics_payload: built.metrics_payload,
                debug_payload: built.debug_payload,
            })
        }
        Err(error) => {
            let raw = RawNodeExecutionResult {
                executor_output: object_from_value(json!({ first_output_key(node): Value::Null }))?,
                metrics_facts: object_from_value(json!({
                    "plugin_id": runtime.plugin_id,
                    "plugin_version": runtime.plugin_version,
                    "plugin_unique_identifier": runtime.plugin_unique_identifier,
                    "package_id": runtime.package_id,
                    "contribution_code": runtime.contribution_code,
                    "node_shell": runtime.node_shell,
                    "schema_version": runtime.schema_version,
                    "contribution_checksum": runtime.contribution_checksum,
                    "compiled_contribution_hash": runtime.compiled_contribution_hash,
                    "side_effect_policy": runtime.side_effect_policy,
                    "error": true,
                }))?,
                error_facts: object_from_value(json!({
                    "message": error.to_string(),
                }))?,
                debug_facts: Map::new(),
                provider_events: Vec::new(),
            };
            let built = build_plugin_node_payloads(node, raw)?;

            Ok(CapabilityNodeExecution {
                output_payload: built.output_payload,
                error_payload: Some(built.error_payload),
                metrics_payload: built.metrics_payload,
                debug_payload: built.debug_payload,
            })
        }
    }
}

fn build_plugin_node_payloads(
    node: &CompiledNode,
    raw: RawNodeExecutionResult,
) -> Result<BuiltNodePayloads> {
    for key in raw.executor_output.keys() {
        if is_reserved_payload_key(key) {
            return Err(anyhow!(
                "reserved plugin output key `{key}` cannot be returned by capability node executor"
            ));
        }
    }

    PublicOutputContract::from_compiled_outputs(&node.outputs)?.build_node_payloads(raw)
}

fn llm_attempt_runtimes(runtime: &CompiledLlmRuntime) -> Vec<CompiledLlmRuntime> {
    let Some(routing) = runtime.routing.as_ref() else {
        return vec![runtime.clone()];
    };
    if routing.routing_mode != LlmRoutingMode::FailoverQueue || routing.queue_targets.is_empty() {
        return vec![runtime.clone()];
    }

    routing
        .queue_targets
        .iter()
        .map(|target| {
            let mut attempt = runtime.clone();
            attempt.provider_instance_id = target.provider_instance_id.clone();
            attempt.provider_code = target.provider_code.clone();
            attempt.protocol = target.protocol.clone();
            attempt.model = target.upstream_model_id.clone();
            attempt
        })
        .collect()
}

fn build_attempt_metric(
    attempt_index: usize,
    runtime: &CompiledLlmRuntime,
    status: &str,
    failed_after_first_token: bool,
    error_payload: Option<&Value>,
    usage: &ProviderUsage,
    event_count: usize,
) -> Value {
    json!({
        "attempt_index": attempt_index,
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "upstream_model_id": runtime.model,
        "model": runtime.model,
        "status": status,
        "failed_after_first_token": failed_after_first_token,
        "event_count": event_count,
        "usage": serde_json::to_value(usage).unwrap_or(Value::Null),
        "error_code": error_payload
            .and_then(|payload| payload.get("error_kind"))
            .cloned()
            .unwrap_or(Value::Null),
        "error_message_ref": error_payload
            .and_then(|payload| payload.get("message"))
            .and_then(Value::as_str)
            .map(|message| format!("runtime_artifact:inline:error:{message}"))
            .map(Value::String)
            .unwrap_or(Value::Null),
    })
}

fn build_llm_metrics_payload(
    runtime: &CompiledLlmRuntime,
    usage: ProviderUsage,
    finish_reason: Option<ProviderFinishReason>,
    event_count: usize,
    attempts: Vec<Value>,
) -> Value {
    json!({
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "model": runtime.model,
        "event_count": event_count,
        "route": build_llm_route_payload(runtime),
        "usage": serde_json::to_value(&usage).unwrap_or(Value::Null),
        "finish_reason": finish_reason
            .as_ref()
            .map(|reason| serde_json::to_value(reason).unwrap_or(Value::Null))
            .unwrap_or(Value::Null),
        "queue_snapshot_id": runtime
            .routing
            .as_ref()
            .and_then(|routing| routing.queue_snapshot_id.clone())
            .map(Value::String)
            .unwrap_or(Value::Null),
        "attempts": attempts,
    })
}

fn build_llm_route_payload(runtime: &CompiledLlmRuntime) -> Value {
    match runtime.routing.as_ref() {
        Some(routing) => json!({
            "routing_mode": routing.routing_mode,
            "fixed_model_target": routing.fixed_model_target,
            "queue_template_id": routing.queue_template_id,
            "provider_instance_id": runtime.provider_instance_id,
            "provider_code": runtime.provider_code,
            "upstream_model_id": runtime.model,
            "protocol": runtime.protocol,
        }),
        None => json!({
            "routing_mode": "fixed_model",
            "provider_instance_id": runtime.provider_instance_id,
            "provider_code": runtime.provider_code,
            "upstream_model_id": runtime.model,
            "protocol": runtime.protocol,
        }),
    }
}

fn build_provider_invocation_input(
    node: &CompiledNode,
    runtime: &CompiledLlmRuntime,
    resolved_inputs: &Map<String, Value>,
    rendered_templates: &Map<String, Value>,
    variable_pool: &Map<String, Value>,
) -> ProviderInvocationInput {
    let (system, messages) = provider_messages_from_prompt_messages(binding_prompt_messages(
        node,
        rendered_templates,
        resolved_inputs,
        variable_pool,
    ));

    let trace_context = BTreeMap::from([
        ("node_id".to_string(), node.node_id.clone()),
        ("node_alias".to_string(), node.alias.clone()),
    ]);

    ProviderInvocationInput {
        provider_instance_id: runtime.provider_instance_id.clone(),
        provider_code: runtime.provider_code.clone(),
        protocol: runtime.protocol.clone(),
        model: runtime.model.clone(),
        provider_config: Value::Null,
        messages,
        system,
        tools: provider_tools(node, resolved_inputs, rendered_templates, variable_pool),
        mcp_bindings: Vec::new(),
        response_format: build_response_format(&node.config),
        model_parameters: build_model_parameters(&node.config),
        trace_context,
        run_context: BTreeMap::from([(
            "resolved_inputs".to_string(),
            Value::Object(resolved_inputs.clone()),
        )]),
    }
}

fn build_empty_prompt_messages_error_payload(runtime: &CompiledLlmRuntime) -> Value {
    json!({
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "error_kind": "prompt_messages_empty",
        "message": "LLM node requires at least one non-empty user or assistant prompt message",
    })
}

fn build_binding_resolution_error_payload(error: &anyhow::Error) -> Value {
    let message = error.to_string();
    let error_kind = if message.contains("unresolved template selector") {
        "prompt_template_unresolved"
    } else {
        "binding_resolution_failed"
    };

    json!({
        "error_kind": error_kind,
        "message": message,
    })
}

fn build_response_format(config: &Value) -> Option<Value> {
    let response_format = config.get("response_format")?;

    if response_format
        .get("mode")
        .and_then(Value::as_str)
        .is_some_and(|mode| mode == "text")
    {
        return None;
    }

    Some(response_format.clone())
}

fn binding_prompt_messages<'a>(
    node: &'a CompiledNode,
    rendered_templates: &'a Map<String, Value>,
    resolved_inputs: &'a Map<String, Value>,
    variable_pool: &'a Map<String, Value>,
) -> Vec<Value> {
    let mut messages = compatible_history_messages(node, resolved_inputs, variable_pool);
    let prompt_messages = rendered_templates
        .get("prompt_messages")
        .or_else(|| resolved_inputs.get("prompt_messages"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    messages.extend(prompt_messages);
    messages
}

fn provider_messages_from_prompt_messages(
    prompt_messages: Vec<Value>,
) -> (Option<String>, Vec<ProviderMessage>) {
    let mut system_parts = Vec::new();
    let mut messages = Vec::new();

    for message in &prompt_messages {
        let content = message
            .get("content")
            .and_then(value_to_text)
            .unwrap_or_default();

        let carries_tool_payload = message.get("tool_calls").is_some()
            || message.get("tool_call_id").is_some()
            || message.get("content_blocks").is_some();
        if content.trim().is_empty() && !carries_tool_payload {
            continue;
        }

        let role = message
            .get("role")
            .and_then(Value::as_str)
            .map(provider_message_role)
            .unwrap_or(ProviderMessageRole::User);

        if role == ProviderMessageRole::System {
            system_parts.push(content);
        } else {
            messages.push(ProviderMessage {
                role,
                content,
                name: message
                    .get("name")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                tool_call_id: message
                    .get("tool_call_id")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                tool_calls: message.get("tool_calls").cloned(),
                content_blocks: message.get("content_blocks").cloned(),
            });
        }
    }

    let system = (!system_parts.is_empty()).then(|| system_parts.join("\n\n"));

    (system, messages)
}

fn provider_message_role(role: &str) -> ProviderMessageRole {
    match role {
        "system" => ProviderMessageRole::System,
        "assistant" => ProviderMessageRole::Assistant,
        "tool" => ProviderMessageRole::Tool,
        _ => ProviderMessageRole::User,
    }
}

fn compatible_history_messages(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
    variable_pool: &Map<String, Value>,
) -> Vec<Value> {
    let direct_history = resolved_inputs
        .get("history")
        .and_then(Value::as_array)
        .cloned();
    if let Some(history) = direct_history {
        return history;
    }

    node.dependency_node_ids
        .iter()
        .filter_map(|node_id| variable_pool.get(node_id))
        .find_map(|payload| {
            payload
                .get("history")
                .and_then(Value::as_array)
                .cloned()
                .filter(|history| !history.is_empty())
        })
        .unwrap_or_default()
}

fn provider_tools(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
    rendered_templates: &Map<String, Value>,
    variable_pool: &Map<String, Value>,
) -> Vec<Value> {
    for candidate in [
        rendered_templates.get("tools"),
        resolved_inputs.get("tools"),
        resolved_inputs
            .get("compatibility")
            .and_then(|value| value.get("tools")),
        node.config.get("tools"),
        node.config
            .get("compatibility")
            .and_then(|value| value.get("tools")),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(tools) = candidate.as_array() {
            if !tools.is_empty() {
                return tools.clone();
            }
        }
    }

    node.dependency_node_ids
        .iter()
        .filter_map(|node_id| variable_pool.get(node_id))
        .find_map(|payload| {
            payload
                .get("compatibility")
                .and_then(|compatibility| compatibility.get("tools"))
                .and_then(Value::as_array)
                .cloned()
                .filter(|tools| !tools.is_empty())
                .or_else(|| {
                    payload
                        .get("tools")
                        .and_then(Value::as_array)
                        .cloned()
                        .filter(|tools| !tools.is_empty())
                })
        })
        .unwrap_or_default()
}

fn value_to_text(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        other => Some(other.to_string()),
    }
}

fn build_model_parameters(config: &Value) -> BTreeMap<String, Value> {
    if let Some(items) = config
        .get("llm_parameters")
        .and_then(Value::as_object)
        .and_then(|value| value.get("items"))
        .and_then(Value::as_object)
    {
        return items
            .iter()
            .filter_map(|(key, item)| {
                let enabled = item
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let value = item.get("value").cloned().unwrap_or(Value::Null);
                enabled.then_some((key.clone(), value))
            })
            .collect();
    }

    [
        "temperature",
        "top_p",
        "presence_penalty",
        "frequency_penalty",
        "max_tokens",
        "seed",
    ]
    .into_iter()
    .filter_map(|key| {
        config
            .get(key)
            .cloned()
            .map(|value| (key.to_string(), value))
    })
    .collect()
}

fn first_output_key(node: &CompiledNode) -> String {
    node.outputs
        .first()
        .map(|output| output.key.clone())
        .unwrap_or_else(|| "result".to_string())
}

fn build_failed_llm_execution(
    node: &CompiledNode,
    runtime: &CompiledLlmRuntime,
    error_payload: Value,
    metrics_payload: Value,
    provider_events: Vec<ProviderStreamEvent>,
    include_output_payload: bool,
) -> Result<LlmNodeExecution> {
    let raw = RawNodeExecutionResult {
        executor_output: Map::new(),
        metrics_facts: object_from_value(metrics_payload)?,
        error_facts: object_from_value(error_payload)?,
        debug_facts: build_llm_debug_facts(node, runtime, None),
        provider_events: provider_events.clone(),
    };
    let built = build_llm_node_payloads(node, raw)?;

    Ok(LlmNodeExecution {
        output_payload: if include_output_payload {
            built.output_payload
        } else {
            json!({})
        },
        error_payload: Some(built.error_payload),
        metrics_payload: built.metrics_payload,
        debug_payload: built.debug_payload,
        provider_events,
    })
}

fn build_successful_llm_execution(
    node: &CompiledNode,
    runtime: &CompiledLlmRuntime,
    result: &ProviderInvocationResult,
    final_content: Option<String>,
    metrics_payload: Value,
    provider_events: Vec<ProviderStreamEvent>,
) -> Result<LlmNodeExecution> {
    let raw_text = final_content.unwrap_or_default();
    let answer_text = strip_llm_think_tags(&raw_text);
    let mut executor_output = Map::new();
    executor_output.insert("text".to_string(), Value::String(raw_text));
    executor_output.insert(
        "provider_route".to_string(),
        build_llm_provider_route_payload(runtime),
    );
    if let Some(finish_reason) = result.finish_reason.as_ref() {
        executor_output.insert(
            "finish_reason".to_string(),
            serde_json::to_value(finish_reason).unwrap_or(Value::Null),
        );
    }
    if let Some(usage) = metrics_payload.get("usage").cloned() {
        executor_output.insert("usage".to_string(), usage);
    }
    if !result.tool_calls.is_empty() {
        executor_output.insert(
            "tool_calls".to_string(),
            serde_json::to_value(&result.tool_calls).unwrap_or(Value::Null),
        );
    }
    if !result.mcp_calls.is_empty() {
        executor_output.insert(
            "mcp_calls".to_string(),
            serde_json::to_value(&result.mcp_calls).unwrap_or(Value::Null),
        );
    }
    if !result.provider_metadata.is_null() {
        executor_output.insert(
            "provider_metadata".to_string(),
            result.provider_metadata.clone(),
        );
    }
    if declares_public_output(node, "structured_output")
        && is_structured_response_format(&node.config)
    {
        executor_output.insert(
            "structured_output".to_string(),
            parse_structured_llm_output(&answer_text),
        );
    }

    let raw = RawNodeExecutionResult {
        executor_output,
        metrics_facts: object_from_value(metrics_payload)?,
        error_facts: Map::new(),
        debug_facts: build_llm_debug_facts(node, runtime, Some(result)),
        provider_events: provider_events.clone(),
    };
    let built = build_llm_node_payloads(node, raw)?;

    Ok(LlmNodeExecution {
        output_payload: built.output_payload,
        error_payload: None,
        metrics_payload: built.metrics_payload,
        debug_payload: built.debug_payload,
        provider_events,
    })
}

fn build_llm_node_payloads(
    node: &CompiledNode,
    raw: RawNodeExecutionResult,
) -> Result<BuiltNodePayloads> {
    PublicOutputContract::from_compiled_outputs(&node.outputs)?.build_node_payloads(raw)
}

fn project_node_variable_payload(node: &CompiledNode, output_payload: &Value) -> Result<Value> {
    PublicOutputContract::from_compiled_outputs(&node.outputs)?
        .project_variable_payload(output_payload)
}

fn object_from_value(value: Value) -> Result<Map<String, Value>> {
    value
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("payload bucket facts must be an object"))
}

fn build_llm_provider_route_payload(runtime: &CompiledLlmRuntime) -> Value {
    json!({
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "model": runtime.model,
    })
}

fn build_llm_debug_facts(
    node: &CompiledNode,
    runtime: &CompiledLlmRuntime,
    result: Option<&ProviderInvocationResult>,
) -> Map<String, Value> {
    let attempt_ref = format!("pending_attempt_id:{}", node.node_id);
    let mut debug = Map::new();

    debug.insert(
        "assistant_message".to_string(),
        json!({
            "role": "assistant",
            "content": result
                .and_then(|result| result.final_content.as_deref())
                .unwrap_or_default(),
        }),
    );
    debug.insert("raw_response_ref".to_string(), Value::Null);
    debug.insert(
        "context_projection_ref".to_string(),
        Value::String(format!("pending_projection_id:{}", node.node_id)),
    );
    debug.insert(
        "attempt_refs".to_string(),
        Value::Array(vec![Value::String(attempt_ref.clone())]),
    );
    debug.insert("winner_attempt_ref".to_string(), Value::String(attempt_ref));
    if result.is_none() {
        debug.insert(
            "provider_route".to_string(),
            build_llm_provider_route_payload(runtime),
        );
    }

    debug
}

fn declares_public_output(node: &CompiledNode, key: &str) -> bool {
    node.outputs.iter().any(|output| output.key == key)
}

fn is_structured_response_format(config: &Value) -> bool {
    config
        .get("response_format")
        .and_then(|format| format.get("mode"))
        .and_then(Value::as_str)
        .is_some_and(|mode| matches!(mode, "json_object" | "json_schema"))
}

fn parse_structured_llm_output(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or(Value::Null)
}

fn strip_llm_think_tags(text: &str) -> String {
    let mut answer = String::new();
    let mut remaining = text;

    while let Some(start) = remaining.find("<think>") {
        answer.push_str(&remaining[..start]);
        let after_start = &remaining[start + "<think>".len()..];
        if let Some(end) = after_start.find("</think>") {
            remaining = &after_start[end + "</think>".len()..];
        } else {
            remaining = "";
            break;
        }
    }
    answer.push_str(remaining);

    answer
}

fn resolve_final_llm_content(
    result_content: Option<String>,
    stream_content: Option<String>,
) -> Option<String> {
    match (result_content, stream_content) {
        (Some(_), Some(stream)) if stream.contains("<think>") => Some(stream),
        (Some(result), _) => Some(result),
        (None, stream) => stream,
    }
}

fn collect_dify_style_deltas(events: &[ProviderStreamEvent]) -> Option<String> {
    let mut content = String::new();

    for event in events {
        match event {
            ProviderStreamEvent::ReasoningDelta { delta } => {
                append_reasoning_delta(&mut content, delta);
            }
            ProviderStreamEvent::TextDelta { delta } => {
                append_text_delta(&mut content, delta);
            }
            _ => {}
        }
    }

    close_open_think_block(&mut content);
    (!content.is_empty()).then_some(content)
}

fn append_reasoning_delta(content: &mut String, delta: &str) {
    if delta.is_empty() {
        return;
    }

    if !has_open_think_block(content) {
        content.push_str("<think>");
    }
    content.push_str(delta);
}

fn append_text_delta(content: &mut String, delta: &str) {
    close_open_think_block(content);
    content.push_str(delta);
}

fn close_open_think_block(content: &mut String) {
    if has_open_think_block(content) {
        content.push_str("</think>");
    }
}

fn has_open_think_block(content: &str) -> bool {
    content.rfind("<think>") > content.rfind("</think>")
}

fn collect_usage(events: &[ProviderStreamEvent], result_usage: &ProviderUsage) -> ProviderUsage {
    let mut usage = result_usage.clone();
    for event in events {
        match event {
            ProviderStreamEvent::UsageSnapshot { usage: snapshot } => {
                usage = snapshot.clone();
            }
            ProviderStreamEvent::UsageDelta { usage: delta } => {
                apply_usage_delta(&mut usage, delta)
            }
            _ => {}
        }
    }
    usage
}

fn apply_usage_delta(target: &mut ProviderUsage, delta: &ProviderUsage) {
    add_usage_value(&mut target.input_tokens, delta.input_tokens);
    add_usage_value(
        &mut target.input_cache_hit_tokens,
        delta.input_cache_hit_tokens,
    );
    add_usage_value(
        &mut target.input_cache_miss_tokens,
        delta.input_cache_miss_tokens,
    );
    add_usage_value(&mut target.output_tokens, delta.output_tokens);
    add_usage_value(&mut target.reasoning_tokens, delta.reasoning_tokens);
    add_usage_value(&mut target.cache_read_tokens, delta.cache_read_tokens);
    add_usage_value(&mut target.cache_write_tokens, delta.cache_write_tokens);
    add_usage_value(&mut target.total_tokens, delta.total_tokens);
}

fn add_usage_value(target: &mut Option<u64>, delta: Option<u64>) {
    if let Some(delta) = delta {
        *target = Some(target.unwrap_or_default() + delta);
    }
}

fn finish_reason_from_events(events: &[ProviderStreamEvent]) -> Option<ProviderFinishReason> {
    events.iter().rev().find_map(|event| match event {
        ProviderStreamEvent::Finish { reason } => Some(reason.clone()),
        _ => None,
    })
}

fn first_provider_error(events: &[ProviderStreamEvent]) -> Option<&ProviderRuntimeError> {
    events.iter().find_map(|event| match event {
        ProviderStreamEvent::Error { error } => Some(error),
        _ => None,
    })
}

fn content_delta_seen_before_terminal_failure(
    events: &[ProviderStreamEvent],
    finish_reason: Option<&ProviderFinishReason>,
) -> bool {
    let mut saw_content_delta = false;
    for event in events {
        match event {
            ProviderStreamEvent::TextDelta { .. } | ProviderStreamEvent::ReasoningDelta { .. } => {
                saw_content_delta = true
            }
            ProviderStreamEvent::Error { .. } => return saw_content_delta,
            ProviderStreamEvent::Finish {
                reason: ProviderFinishReason::Error,
            } => return saw_content_delta,
            _ => {}
        }
    }

    saw_content_delta && matches!(finish_reason, Some(ProviderFinishReason::Error))
}

fn build_provider_error_payload(
    runtime: &CompiledLlmRuntime,
    error: &ProviderRuntimeError,
) -> Value {
    json!({
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "error_kind": serde_json::to_value(error.kind).unwrap_or(Value::Null),
        "message": sanitize_diagnostic_text(&error.message),
        "provider_summary": error
            .provider_summary
            .as_deref()
            .map(sanitize_diagnostic_text),
    })
}

fn provider_runtime_error_from_anyhow(error: &anyhow::Error) -> ProviderRuntimeError {
    if let Some(PluginFrameworkError::RuntimeContract { error }) =
        error.downcast_ref::<PluginFrameworkError>()
    {
        return normalize_runtime_contract_error(error);
    }

    ProviderRuntimeError::normalize("invoke", error.to_string(), None)
}

fn normalize_runtime_contract_error(error: &ProviderRuntimeError) -> ProviderRuntimeError {
    if error.kind != ProviderRuntimeErrorKind::ProviderInvalidResponse {
        return error.clone();
    }

    let normalized = ProviderRuntimeError::normalize(
        "invoke",
        &error.message,
        error.provider_summary.as_deref(),
    );
    if normalized.kind == ProviderRuntimeErrorKind::ProviderInvalidResponse {
        error.clone()
    } else {
        normalized
    }
}

fn sanitize_diagnostic_text(text: &str) -> String {
    let mut sanitized = text.to_string();
    for marker in [
        "bearer ",
        "authorization:",
        "\"authorization\":\"",
        "api_key=",
        "api_key:",
        "\"api_key\":\"",
        "token=",
        "secret=",
        "\"secret\":\"",
    ] {
        sanitized = redact_marker_value(&sanitized, marker);
    }
    sanitized = redact_prefixed_token(&sanitized, "sk-");
    let sanitized = sanitized.trim();
    if sanitized.chars().count() <= 240 {
        sanitized.to_string()
    } else {
        format!("{}...", sanitized.chars().take(240).collect::<String>())
    }
}

fn redact_marker_value(text: &str, marker: &str) -> String {
    let haystack = text.to_ascii_lowercase();
    let needle = marker.to_ascii_lowercase();
    let mut result = String::with_capacity(text.len());
    let mut cursor = 0;

    while let Some(offset) = haystack[cursor..].find(&needle) {
        let start = cursor + offset;
        let value_start = start + marker.len();
        result.push_str(&text[cursor..value_start]);
        let mut value_end = value_start;
        for ch in text[value_start..].chars() {
            if ch.is_whitespace() || matches!(ch, '"' | '\'' | ',' | '}' | ']' | '\n' | '\r') {
                break;
            }
            value_end += ch.len_utf8();
        }
        if value_end > value_start {
            result.push_str("[REDACTED]");
        }
        cursor = value_end;
    }

    result.push_str(&text[cursor..]);
    result
}

fn redact_prefixed_token(text: &str, prefix: &str) -> String {
    let haystack = text.to_ascii_lowercase();
    let needle = prefix.to_ascii_lowercase();
    let mut result = String::with_capacity(text.len());
    let mut cursor = 0;

    while let Some(offset) = haystack[cursor..].find(&needle) {
        let start = cursor + offset;
        result.push_str(&text[cursor..start]);
        result.push_str(prefix);
        result.push_str("[REDACTED]");
        let mut token_end = start + prefix.len();
        for ch in text[token_end..].chars() {
            if !(ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.')) {
                break;
            }
            token_end += ch.len_utf8();
        }
        cursor = token_end;
    }

    result.push_str(&text[cursor..]);
    result
}

#[cfg(test)]
mod input_cache_usage_tests {
    use super::*;

    #[test]
    fn usage_delta_accumulates_input_cache_hit_and_miss_tokens() {
        let mut usage = ProviderUsage {
            input_tokens: Some(100),
            input_cache_hit_tokens: Some(40),
            input_cache_miss_tokens: Some(60),
            output_tokens: Some(12),
            total_tokens: Some(112),
            ..ProviderUsage::default()
        };

        apply_usage_delta(
            &mut usage,
            &ProviderUsage {
                input_cache_hit_tokens: Some(5),
                input_cache_miss_tokens: Some(7),
                ..ProviderUsage::default()
            },
        );

        assert_eq!(usage.input_cache_hit_tokens, Some(45));
        assert_eq!(usage.input_cache_miss_tokens, Some(67));
        assert_eq!(usage.total_tokens(), Some(112));
    }
}
