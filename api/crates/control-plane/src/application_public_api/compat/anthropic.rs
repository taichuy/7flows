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
    reject_unsupported(&request)?;
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
        let content = anthropic_text_content(
            message
                .get("content")
                .ok_or_else(|| AnthropicCompatError::invalid("message content is required"))?,
        )?;
        if index == last_user_index {
            continue;
        }
        history.push(serde_json::json!({ "role": role, "content": content }));
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

    let mut native = serde_json::json!({
        "query": query,
        "model": model,
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

fn reject_unsupported(request: &Value) -> Result<(), AnthropicCompatError> {
    for field in ["tools", "tool_choice"] {
        if request.get(field).is_some() {
            return Err(AnthropicCompatError::unsupported(field));
        }
    }
    Ok(())
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
            "tool_result" | "tool_use" | "server_tool_use" | "computer_use" => {
                return Err(AnthropicCompatError::unsupported("tools"));
            }
            "image" | "document" => return Err(AnthropicCompatError::unsupported("messages")),
            _ => return Err(AnthropicCompatError::unsupported("messages")),
        }
    }
    Ok(text)
}
