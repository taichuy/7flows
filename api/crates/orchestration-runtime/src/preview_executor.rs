use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};

use crate::{
    binding_runtime::{render_templated_bindings, resolve_node_inputs},
    compiled_plan::CompiledPlan,
    execution_engine::{execute_llm_node, ProviderInvoker},
};

pub struct NodePreviewOutcome {
    pub target_node_id: String,
    pub resolved_inputs: Map<String, Value>,
    pub rendered_templates: Map<String, Value>,
    pub output_contract: Vec<Value>,
    pub node_output: Value,
    pub error_payload: Option<Value>,
    pub metrics_payload: Value,
    pub debug_payload: Value,
    pub provider_events: Vec<plugin_framework::provider_contract::ProviderStreamEvent>,
}

impl NodePreviewOutcome {
    pub fn as_payload(&self) -> Value {
        json!({
            "target_node_id": self.target_node_id,
            "resolved_inputs": self.resolved_inputs,
            "rendered_templates": self.rendered_templates,
            "output_contract": self.output_contract,
            "node_output": self.node_output,
            "error_payload": self.error_payload,
            "metrics_payload": self.metrics_payload,
            "debug_payload": self.debug_payload,
            "provider_events": self.provider_events,
        })
    }

    pub fn is_failed(&self) -> bool {
        self.error_payload.is_some()
    }
}

fn start_preview_output(resolved_inputs: &Map<String, Value>) -> Value {
    let mut output = resolved_inputs.clone();

    output
        .entry("query".to_string())
        .or_insert_with(|| Value::String(String::new()));
    output
        .entry("model".to_string())
        .or_insert_with(|| Value::String(String::new()));
    output
        .entry("history".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    output
        .entry("files".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));

    Value::Object(output)
}

pub async fn run_node_preview<I>(
    plan: &CompiledPlan,
    target_node_id: &str,
    input_payload: &Value,
    invoker: &I,
) -> Result<NodePreviewOutcome>
where
    I: ProviderInvoker + ?Sized,
{
    let node = plan
        .nodes
        .get(target_node_id)
        .ok_or_else(|| anyhow!("target node not found: {target_node_id}"))?;
    let variable_pool = input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;
    let resolved_inputs = if node.node_type == "start" {
        variable_pool
            .get(target_node_id)
            .and_then(|value| value.as_object())
            .cloned()
            .unwrap_or_default()
    } else {
        resolve_node_inputs(node, &variable_pool)?
    };
    let rendered_templates = render_templated_bindings(node, &resolved_inputs);
    let output_contract = node
        .outputs
        .iter()
        .map(|output| {
            json!({
                "key": output.key,
                "title": output.title,
                "value_type": output.value_type,
            })
        })
        .collect();

    let (node_output, error_payload, metrics_payload, debug_payload, provider_events) =
        if node.node_type == "start" {
            (
                start_preview_output(&resolved_inputs),
                None,
                json!({ "preview_mode": true }),
                json!({}),
                Vec::new(),
            )
        } else if node.node_type == "llm" {
            let execution = execute_llm_node(
                node,
                &resolved_inputs,
                &rendered_templates,
                &variable_pool,
                invoker,
            )
            .await?;
            (
                execution.output_payload,
                execution.error_payload,
                execution.metrics_payload,
                execution.debug_payload,
                execution.provider_events,
            )
        } else if node.node_type == "code" {
            (
                json!({}),
                Some(json!({
                    "error_code": "node_type_not_implemented",
                    "node_type": node.node_type,
                    "message": "code nodes are not implemented in preview runtime",
                })),
                json!({ "preview_mode": true, "waiting": "code" }),
                json!({}),
                Vec::new(),
            )
        } else {
            (
                Value::Null,
                None,
                json!({ "preview_mode": true }),
                json!({}),
                Vec::new(),
            )
        };

    Ok(NodePreviewOutcome {
        target_node_id: node.node_id.clone(),
        resolved_inputs,
        rendered_templates,
        output_contract,
        node_output,
        error_payload,
        metrics_payload,
        debug_payload,
        provider_events,
    })
}
