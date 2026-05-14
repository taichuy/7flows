use serde_json::Value;

use crate::application_public_api::native::NativeRunRequest;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnthropicCompatError {
    pub message: String,
    pub error_type: String,
}

impl AnthropicCompatError {
    fn invalid(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            error_type: "invalid_request".to_string(),
        }
    }

    fn unsupported(param: &'static str) -> Self {
        Self {
            message: format!("{param} is not supported by this endpoint"),
            error_type: "unsupported_feature".to_string(),
        }
    }
}

pub fn map_messages_request(request: Value) -> Result<NativeRunRequest, AnthropicCompatError> {
    let object = request
        .as_object()
        .ok_or_else(|| AnthropicCompatError::invalid("request body must be an object"))?;
    let model = object
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| AnthropicCompatError::invalid("model is required"))?;
    let messages = object
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| AnthropicCompatError::invalid("messages is required"))?;

    let mut history = Vec::new();
    if let Some(system) = object.get("system").and_then(Value::as_str) {
        history.push(serde_json::json!({ "role": "system", "content": system }));
    }

    let last_user_index = messages
        .iter()
        .rposition(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        .ok_or_else(|| AnthropicCompatError::invalid("user message is required"))?;
    for (index, message) in messages.iter().enumerate() {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .ok_or_else(|| AnthropicCompatError::invalid("message role is required"))?;
        let content_value = message
            .get("content")
            .ok_or_else(|| AnthropicCompatError::invalid("message content is required"))?;
        let content = anthropic_text_content(content_value)?;
        if index == last_user_index {
            continue;
        }
        let mut history_entry = serde_json::json!({ "role": role, "content": content });
        if content_value.is_array() {
            history_entry["content_blocks"] = content_value.clone();
        }
        history.push(history_entry);
    }
    let query = anthropic_text_content(
        messages[last_user_index]
            .get("content")
            .ok_or_else(|| AnthropicCompatError::invalid("message content is required"))?,
    )?;

    let response_mode = object
        .get("stream")
        .and_then(Value::as_bool)
        .filter(|stream| *stream)
        .map(|_| "streaming".to_string());
    let conversation = object
        .get("metadata")
        .and_then(|metadata| metadata.get("user_id"))
        .and_then(Value::as_str)
        .map(|user| serde_json::json!({ "user": user }))
        .unwrap_or_else(|| serde_json::json!({}));
    let metadata = object
        .get("metadata")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let compatibility = compatibility_payload(object);
    let mut metadata = metadata;
    if !compatibility.is_null() {
        metadata["compatibility"] = compatibility.clone();
    }

    let mut native = serde_json::json!({
        "query": query,
        "model": model,
        "inputs": compatibility_inputs(compatibility),
        "history": history,
        "conversation": conversation,
        "response_mode": response_mode,
        "metadata": metadata,
        "compatibility_mode": "anthropic-messages-v1"
    });
    if response_mode.is_none() {
        native
            .as_object_mut()
            .expect("native request object")
            .remove("response_mode");
    }

    serde_json::from_value(native)
        .map_err(|_| AnthropicCompatError::invalid("failed to build Native request"))
}

fn compatibility_payload(object: &serde_json::Map<String, Value>) -> Value {
    let mut compatibility = serde_json::Map::new();
    for key in ["tools", "tool_choice"] {
        if let Some(value) = object.get(key) {
            compatibility.insert(key.to_string(), value.clone());
        }
    }
    if compatibility.is_empty() {
        Value::Null
    } else {
        Value::Object(compatibility)
    }
}

fn compatibility_inputs(compatibility: Value) -> Value {
    if compatibility.is_null() {
        return serde_json::json!({});
    }
    serde_json::json!({ "compatibility": compatibility })
}

fn anthropic_text_content(content: &Value) -> Result<String, AnthropicCompatError> {
    if let Some(text) = content.as_str() {
        return Ok(text.to_string());
    }
    let blocks = content
        .as_array()
        .ok_or_else(|| AnthropicCompatError::invalid("content must be text"))?;
    let mut text = String::new();
    for block in blocks {
        let block_type = block
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match block_type {
            "text" => {
                if let Some(value) = block.get("text").and_then(Value::as_str) {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(value);
                }
            }
            "tool_result" => {
                let value = anthropic_tool_result_text(block);
                if !value.is_empty() {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(&value);
                }
            }
            "tool_use" | "server_tool_use" => {
                if block
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|name| name == "computer")
                {
                    return Err(AnthropicCompatError::unsupported("computer_use"));
                }
            }
            "computer_use" => {
                return Err(AnthropicCompatError::unsupported("computer_use"));
            }
            "image" | "document" => return Err(AnthropicCompatError::unsupported("messages")),
            _ => return Err(AnthropicCompatError::unsupported("messages")),
        }
    }
    Ok(text)
}

fn anthropic_tool_result_text(block: &Value) -> String {
    let Some(content) = block.get("content") else {
        return String::new();
    };
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    if let Some(blocks) = content.as_array() {
        return blocks
            .iter()
            .filter_map(|entry| entry.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
    }
    content.to_string()
}
