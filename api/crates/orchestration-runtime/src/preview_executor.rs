use anyhow::{anyhow, bail, Result};
use serde_json::{json, Map, Value};

use crate::{
    compiled_plan::{CompiledBinding, CompiledNode, CompiledPlan},
};

pub struct NodePreviewOutcome {
    pub target_node_id: String,
    pub resolved_inputs: Map<String, Value>,
    pub rendered_templates: Map<String, Value>,
    pub output_contract: Vec<Value>,
}

impl NodePreviewOutcome {
    pub fn as_payload(&self) -> Value {
        json!({
            "target_node_id": self.target_node_id,
            "resolved_inputs": self.resolved_inputs,
            "rendered_templates": self.rendered_templates,
            "output_contract": self.output_contract,
        })
    }
}

pub fn run_node_preview(
    plan: &CompiledPlan,
    target_node_id: &str,
    input_payload: &Value,
) -> Result<NodePreviewOutcome> {
    let node = plan
        .nodes
        .get(target_node_id)
        .ok_or_else(|| anyhow!("target node not found: {target_node_id}"))?;
    let resolved_inputs = resolve_inputs(node, input_payload)?;
    let rendered_templates = render_templates(node, &resolved_inputs);
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

    Ok(NodePreviewOutcome {
        target_node_id: node.node_id.clone(),
        resolved_inputs,
        rendered_templates,
        output_contract,
    })
}

fn resolve_inputs(node: &CompiledNode, input_payload: &Value) -> Result<Map<String, Value>> {
    let mut resolved = Map::new();

    for (binding_key, binding) in &node.bindings {
        resolved.insert(
            binding_key.clone(),
            resolve_binding(binding, input_payload).map_err(|error| {
                anyhow!("failed to resolve binding {binding_key} for {}: {error}", node.node_id)
            })?,
        );
    }

    Ok(resolved)
}

fn render_templates(node: &CompiledNode, resolved_inputs: &Map<String, Value>) -> Map<String, Value> {
    node.bindings
        .iter()
        .filter_map(|(binding_key, binding)| {
            (binding.kind == "templated_text")
                .then(|| {
                    resolved_inputs
                        .get(binding_key)
                        .cloned()
                        .unwrap_or(Value::Null)
                })
                .map(|value| (binding_key.clone(), value))
        })
        .collect()
}

fn resolve_binding(binding: &CompiledBinding, input_payload: &Value) -> Result<Value> {
    match binding.kind.as_str() {
        "selector" => {
            let selector = binding
                .selector_paths
                .first()
                .ok_or_else(|| anyhow!("selector binding is missing selector path"))?;
            lookup_selector_value(input_payload, selector)
        }
        "selector_list" => binding
            .selector_paths
            .iter()
            .map(|selector| lookup_selector_value(input_payload, selector))
            .collect::<Result<Vec<_>>>()
            .map(Value::Array),
        "named_bindings" => {
            let entries = binding
                .raw_value
                .as_array()
                .ok_or_else(|| anyhow!("named_bindings raw_value must be an array"))?;
            let mut object = Map::new();

            for entry in entries {
                let name = entry
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("named_bindings entry missing name"))?;
                let selector = entry
                    .get("selector")
                    .and_then(Value::as_array)
                    .ok_or_else(|| anyhow!("named_bindings entry missing selector"))?
                    .iter()
                    .map(|segment| {
                        segment
                            .as_str()
                            .map(str::to_string)
                            .ok_or_else(|| anyhow!("named_bindings selector segment must be a string"))
                    })
                    .collect::<Result<Vec<_>>>()?;
                object.insert(name.to_string(), lookup_selector_value(input_payload, &selector)?);
            }

            Ok(Value::Object(object))
        }
        "templated_text" => binding
            .raw_value
            .as_str()
            .map(|value| Value::String(render_template(value, input_payload)))
            .ok_or_else(|| anyhow!("templated_text raw_value must be a string")),
        "condition_group" | "state_write" => Ok(binding.raw_value.clone()),
        other => bail!("unsupported binding kind in preview executor: {other}"),
    }
}

fn lookup_selector_value(input_payload: &Value, selector: &[String]) -> Result<Value> {
    let mut cursor = input_payload;

    for segment in selector {
        cursor = cursor
            .get(segment)
            .ok_or_else(|| anyhow!("selector path not found: {}", selector.join(".")))?;
    }

    Ok(cursor.clone())
}

fn render_template(template: &str, input_payload: &Value) -> String {
    let mut rendered = String::new();
    let mut cursor = 0;

    while let Some(start_offset) = template[cursor..].find("{{") {
        let start = cursor + start_offset;
        rendered.push_str(&template[cursor..start]);
        let token_start = start + 2;
        let Some(end_offset) = template[token_start..].find("}}") else {
            rendered.push_str(&template[start..]);
            return rendered;
        };
        let token_end = token_start + end_offset;
        let token = template[token_start..token_end].trim();
        let replacement = token
            .split('.')
            .map(str::to_string)
            .collect::<Vec<_>>();

        if replacement.len() >= 2 {
            match lookup_selector_value(input_payload, &replacement) {
                Ok(Value::String(text)) => rendered.push_str(&text),
                Ok(value) => rendered.push_str(&json_to_inline_string(&value)),
                Err(_) => rendered.push_str(&template[start..token_end + 2]),
            }
        } else {
            rendered.push_str(&template[start..token_end + 2]);
        }

        cursor = token_end + 2;
    }

    rendered.push_str(&template[cursor..]);
    rendered
}

fn json_to_inline_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}
