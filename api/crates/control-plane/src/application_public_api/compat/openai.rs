use serde_json::Value;

use crate::application_public_api::native::NativeRunRequest;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenAiCompatError {
    pub message: String,
    pub error_type: String,
    pub param: Option<String>,
    pub code: String,
}

impl OpenAiCompatError {
    fn invalid(param: &'static str, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            error_type: "invalid_request_error".to_string(),
            param: Some(param.to_string()),
            code: "invalid_request".to_string(),
        }
    }

    fn unsupported(param: &'static str) -> Self {
        Self {
            message: format!("{param} is not supported by this endpoint"),
            error_type: "invalid_request_error".to_string(),
            param: Some(param.to_string()),
            code: "unsupported_feature".to_string(),
        }
    }
}

pub fn map_chat_completion_request(request: Value) -> Result<NativeRunRequest, OpenAiCompatError> {
    reject_unsupported(&request)?;
    let object = request
        .as_object()
        .ok_or_else(|| OpenAiCompatError::invalid("body", "request body must be an object"))?;
    let model = object
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| OpenAiCompatError::invalid("model", "model is required"))?;
    let messages = object
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| OpenAiCompatError::invalid("messages", "messages is required"))?;

    let last_user_index = messages
        .iter()
        .rposition(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        .ok_or_else(|| OpenAiCompatError::invalid("messages", "user message is required"))?;
    let mut history = Vec::new();
    for (index, message) in messages.iter().enumerate() {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .ok_or_else(|| OpenAiCompatError::invalid("messages", "message role is required"))?;
        let content = openai_text_content(message.get("content").ok_or_else(|| {
            OpenAiCompatError::invalid("messages", "message content is required")
        })?)?;
        if index == last_user_index {
            continue;
        }
        history.push(serde_json::json!({ "role": role, "content": content }));
    }
    let query =
        openai_text_content(messages[last_user_index].get("content").ok_or_else(|| {
            OpenAiCompatError::invalid("messages", "message content is required")
        })?)?;

    let response_mode = object
        .get("stream")
        .and_then(Value::as_bool)
        .filter(|stream| *stream)
        .map(|_| "streaming".to_string());
    let conversation = object
        .get("user")
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
        "compatibility_mode": "openai-chat-completions-v1"
    });
    if response_mode.is_none() {
        native
            .as_object_mut()
            .expect("native request object")
            .remove("response_mode");
    }

    serde_json::from_value(native)
        .map_err(|_| OpenAiCompatError::invalid("body", "failed to build Native request"))
}

fn reject_unsupported(request: &Value) -> Result<(), OpenAiCompatError> {
    for field in [
        "tools",
        "tool_choice",
        "function_call",
        "audio",
        "modalities",
    ] {
        if request.get(field).is_some() {
            return Err(OpenAiCompatError::unsupported(field));
        }
    }
    Ok(())
}

fn openai_text_content(content: &Value) -> Result<String, OpenAiCompatError> {
    if let Some(text) = content.as_str() {
        return Ok(text.to_string());
    }
    let parts = content
        .as_array()
        .ok_or_else(|| OpenAiCompatError::invalid("messages", "content must be text"))?;
    let mut text = String::new();
    for part in parts {
        let part_type = part.get("type").and_then(Value::as_str).unwrap_or_default();
        match part_type {
            "text" => {
                if let Some(value) = part.get("text").and_then(Value::as_str) {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(value);
                }
            }
            "input_text" => {
                if let Some(value) = part.get("text").and_then(Value::as_str) {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(value);
                }
            }
            "image_url" | "input_image" | "input_audio" | "file" | "input_file" => {
                return Err(OpenAiCompatError::unsupported("messages"));
            }
            _ => return Err(OpenAiCompatError::unsupported("messages")),
        }
    }
    Ok(text)
}
