use anyhow::{anyhow, bail, Result};
use serde_json::{Map, Value};

use crate::compiled_plan::{CompiledBinding, CompiledNode};

pub fn resolve_node_inputs(
    node: &CompiledNode,
    variable_pool: &Map<String, Value>,
) -> Result<Map<String, Value>> {
    let mut resolved = Map::new();

    for (binding_key, binding) in &node.bindings {
        resolved.insert(
            binding_key.clone(),
            resolve_binding(binding, variable_pool).map_err(|error| {
                anyhow!(
                    "failed to resolve binding {binding_key} for {}: {error}",
                    node.node_id
                )
            })?,
        );
    }

    Ok(resolved)
}

pub fn render_templated_bindings(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
) -> Map<String, Value> {
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

fn resolve_binding(binding: &CompiledBinding, variable_pool: &Map<String, Value>) -> Result<Value> {
    match binding.kind.as_str() {
        "selector" => {
            let selector = binding
                .selector_paths
                .first()
                .ok_or_else(|| anyhow!("selector binding is missing selector path"))?;
            lookup_selector_value(variable_pool, selector)
        }
        "selector_list" => binding
            .selector_paths
            .iter()
            .map(|selector| lookup_selector_value(variable_pool, selector))
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
                        segment.as_str().map(str::to_string).ok_or_else(|| {
                            anyhow!("named_bindings selector segment must be a string")
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                object.insert(
                    name.to_string(),
                    lookup_selector_value(variable_pool, &selector)?,
                );
            }

            Ok(Value::Object(object))
        }
        "templated_text" => binding
            .raw_value
            .as_str()
            .map(|value| Value::String(render_template(value, variable_pool)))
            .ok_or_else(|| anyhow!("templated_text raw_value must be a string")),
        "condition_group" | "state_write" => Ok(binding.raw_value.clone()),
        other => bail!("unsupported binding kind: {other}"),
    }
}

pub fn lookup_selector_value(
    variable_pool: &Map<String, Value>,
    selector: &[String],
) -> Result<Value> {
    let mut segments = selector.iter();
    let first = segments
        .next()
        .ok_or_else(|| anyhow!("selector binding is missing selector path"))?;
    let mut cursor = variable_pool
        .get(first)
        .ok_or_else(|| anyhow!("selector source not found: {}", selector.join(".")))?;

    for segment in segments {
        cursor = cursor
            .get(segment)
            .ok_or_else(|| anyhow!("selector path not found: {}", selector.join(".")))?;
    }

    Ok(cursor.clone())
}

fn render_template(template: &str, variable_pool: &Map<String, Value>) -> String {
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
        let replacement = token.split('.').map(str::to_string).collect::<Vec<_>>();

        if replacement.len() >= 2 {
            match lookup_selector_value(variable_pool, &replacement) {
                Ok(Value::String(text)) => rendered.push_str(&text),
                Ok(Value::Null) => rendered.push_str("null"),
                Ok(value) => rendered.push_str(&value.to_string()),
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
