use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};

use crate::{
    binding_runtime::{render_templated_bindings, resolve_node_inputs},
    compiled_plan::CompiledPlan,
    execution_state::{
        CheckpointSnapshot, ExecutionStopReason, FlowDebugExecutionOutcome, NodeExecutionTrace,
        PendingCallbackTask, PendingHumanInput,
    },
};

pub fn start_flow_debug_run(
    plan: &CompiledPlan,
    input_payload: &Value,
) -> Result<FlowDebugExecutionOutcome> {
    let variable_pool = input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;

    execute_from(plan, 0, variable_pool)
}

pub fn resume_flow_debug_run(
    plan: &CompiledPlan,
    checkpoint: &CheckpointSnapshot,
    resume_payload: &Value,
) -> Result<FlowDebugExecutionOutcome> {
    let patch = resume_payload
        .as_object()
        .ok_or_else(|| anyhow!("resume payload must be an object"))?;
    let mut variable_pool = checkpoint.variable_pool.clone();

    for (node_id, payload) in patch {
        variable_pool.insert(node_id.clone(), payload.clone());
    }

    execute_from(plan, checkpoint.next_node_index, variable_pool)
}

fn execute_from(
    plan: &CompiledPlan,
    next_node_index: usize,
    mut variable_pool: Map<String, Value>,
) -> Result<FlowDebugExecutionOutcome> {
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
        let resolved_inputs = resolve_node_inputs(node, &variable_pool)?;
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
                    metrics_payload: json!({ "preview_mode": true }),
                });
            }
            "llm" | "template_transform" | "answer" => {
                let output_key = node
                    .outputs
                    .first()
                    .map(|output| output.key.clone())
                    .unwrap_or_else(|| "result".to_string());
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
                variable_pool.insert(node.node_id.clone(), output_payload.clone());
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload,
                    metrics_payload: json!({ "preview_mode": true }),
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
                    metrics_payload: json!({ "preview_mode": true, "waiting": "human_input" }),
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
                    metrics_payload: json!({ "preview_mode": true, "waiting": node.node_type }),
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
            other => return Err(anyhow!("unsupported debug node type: {other}")),
        }
    }

    Ok(FlowDebugExecutionOutcome {
        stop_reason: ExecutionStopReason::Completed,
        variable_pool,
        checkpoint_snapshot: None,
        node_traces,
    })
}
