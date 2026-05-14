use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use control_plane::application_public_api::{
    compat::openai::{map_chat_completion_request, OpenAiCompatError},
    native::{
        ApplicationNativeRunService, CreateNativeRunCommand, NativeRunRequest, NativeRunResult,
    },
};
use serde::Serialize;
use serde_json::{json, Value};
use utoipa::ToSchema;

use crate::{
    app_state::ApiState,
    routes::application_public_api::{compat_sse, native},
};

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiErrorBody {
    pub error: OpenAiErrorObject,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiErrorObject {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub param: Option<String>,
    pub code: String,
}

#[derive(Debug)]
pub enum OpenAiRouteError {
    Compat(OpenAiCompatError),
    Native(native::NativeApiError),
    RequiredAction,
}

impl From<OpenAiCompatError> for OpenAiRouteError {
    fn from(error: OpenAiCompatError) -> Self {
        Self::Compat(error)
    }
}

impl From<native::NativeApiError> for OpenAiRouteError {
    fn from(error: native::NativeApiError) -> Self {
        Self::Native(error)
    }
}

impl IntoResponse for OpenAiRouteError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            OpenAiRouteError::Compat(error) => (
                StatusCode::BAD_REQUEST,
                OpenAiErrorObject {
                    message: error.message,
                    error_type: error.error_type,
                    param: error.param,
                    code: error.code,
                },
            ),
            OpenAiRouteError::Native(error) => (
                error.status,
                OpenAiErrorObject {
                    message: error.message,
                    error_type: "invalid_request_error".to_string(),
                    param: None,
                    code: error.code.to_string(),
                },
            ),
            OpenAiRouteError::RequiredAction => (
                StatusCode::CONFLICT,
                OpenAiErrorObject {
                    message: "waiting states are not supported by compatible endpoints; use the Native API to inspect and resume required_action runs".to_string(),
                    error_type: "invalid_request_error".to_string(),
                    param: None,
                    code: "required_action_not_supported".to_string(),
                },
            ),
        };
        (status, Json(OpenAiErrorBody { error })).into_response()
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiChatCompletionResponse {
    pub id: String,
    pub object: &'static str,
    pub created: i64,
    pub model: String,
    pub choices: Vec<OpenAiChatCompletionChoice>,
    pub usage: OpenAiUsage,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiChatCompletionChoice {
    pub index: u32,
    pub message: OpenAiChatMessage,
    pub finish_reason: &'static str,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiChatMessage {
    pub role: &'static str,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAiToolCall>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: &'static str,
    pub function: OpenAiToolCallFunction,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OpenAiToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Default, Serialize, ToSchema)]
pub struct OpenAiUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

#[utoipa::path(
    post,
    path = "/v1/chat/completions",
    request_body = Value,
    responses(
        (status = 200, body = OpenAiChatCompletionResponse),
        (status = 400, body = OpenAiErrorBody),
        (status = 401, body = OpenAiErrorBody),
        (status = 403, body = OpenAiErrorBody),
        (status = 409, body = OpenAiErrorBody)
    )
)]
pub async fn create_chat_completion(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, OpenAiRouteError> {
    let bearer_token = native::bearer_token(&headers)?;
    let request = parse_openai_request(body)?;
    let model = request.model.clone().unwrap_or_default();
    let response_mode = request.response_mode.clone();
    let run = create_native_run(state.clone(), bearer_token.clone(), request).await?;

    if response_mode.as_deref() == Some("streaming") {
        return compat_sse::start_openai_run_stream(state, run, model)
            .await
            .map_err(Into::into);
    }

    let run = native::execute_blocking_native_run(state, bearer_token, run).await?;
    if run.required_action.is_some() {
        return Err(OpenAiRouteError::RequiredAction);
    }
    Ok(Json(to_openai_response(run, model)).into_response())
}

fn parse_openai_request(body: Bytes) -> Result<NativeRunRequest, OpenAiRouteError> {
    let value = serde_json::from_slice::<Value>(&body).map_err(|_| OpenAiCompatError {
        message: "invalid JSON body".to_string(),
        error_type: "invalid_request_error".to_string(),
        param: Some("body".to_string()),
        code: "invalid_request".to_string(),
    })?;
    map_chat_completion_request(value).map_err(Into::into)
}

async fn create_native_run(
    state: Arc<ApiState>,
    bearer_token: String,
    request: NativeRunRequest,
) -> Result<NativeRunResult, native::NativeApiError> {
    ApplicationNativeRunService::new(state.store.clone())
        .create_native_run(CreateNativeRunCommand {
            bearer_token,
            request,
        })
        .await
        .map_err(native::native_error)
}

fn to_openai_response(run: NativeRunResult, model: String) -> OpenAiChatCompletionResponse {
    let tool_calls = openai_tool_calls(run.tool_calls.as_ref());
    let finish_reason = if tool_calls.is_some() {
        "tool_calls"
    } else {
        "stop"
    };
    OpenAiChatCompletionResponse {
        id: format!("chatcmpl-{}", run.id),
        object: "chat.completion",
        created: run.created_at.unix_timestamp(),
        model,
        choices: vec![OpenAiChatCompletionChoice {
            index: 0,
            message: OpenAiChatMessage {
                role: "assistant",
                content: if tool_calls.is_some() {
                    run.answer
                } else {
                    Some(run.answer.unwrap_or_default())
                },
                tool_calls,
            },
            finish_reason,
        }],
        usage: openai_usage(run.usage),
    }
}

fn openai_tool_calls(tool_calls: Option<&Value>) -> Option<Vec<OpenAiToolCall>> {
    let calls = tool_calls?.as_array()?;
    let mapped = calls
        .iter()
        .filter_map(|call| {
            let name = call.get("name").and_then(Value::as_str)?;
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("tool_call")
                .to_string();
            let arguments = call.get("arguments").cloned().unwrap_or_else(|| json!({}));
            Some(OpenAiToolCall {
                id,
                call_type: "function",
                function: OpenAiToolCallFunction {
                    name: name.to_string(),
                    arguments: match arguments {
                        Value::String(value) => value,
                        value => value.to_string(),
                    },
                },
            })
        })
        .collect::<Vec<_>>();
    (!mapped.is_empty()).then_some(mapped)
}

fn openai_usage(
    usage: Option<control_plane::application_public_api::native::NativeUsage>,
) -> OpenAiUsage {
    let Some(usage) = usage else {
        return OpenAiUsage::default();
    };
    OpenAiUsage {
        prompt_tokens: usage.prompt_tokens.unwrap_or_default(),
        completion_tokens: usage.completion_tokens.unwrap_or_default(),
        total_tokens: usage.total_tokens.unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use control_plane::application_public_api::native::NativeRunStatus;
    use time::OffsetDateTime;
    use uuid::Uuid;

    #[test]
    fn openai_response_projects_native_tool_calls() {
        let run = NativeRunResult {
            id: Uuid::nil(),
            application_id: Uuid::nil(),
            api_key_id: Uuid::nil(),
            publication_version_id: Uuid::nil(),
            status: NativeRunStatus::Succeeded,
            node_input_payload: json!({}),
            metadata: json!({}),
            answer: None,
            required_action: None,
            tool_calls: Some(json!([
                {
                    "id": "call_123",
                    "name": "lookup_order",
                    "arguments": {"order_id": "order_123"}
                }
            ])),
            usage: None,
            error: None,
            created_at: OffsetDateTime::UNIX_EPOCH,
        };

        let payload = serde_json::to_value(to_openai_response(run, "provider/model".into()))
            .expect("openai response serializes");

        assert_eq!(payload["choices"][0]["finish_reason"], json!("tool_calls"));
        assert_eq!(
            payload["choices"][0]["message"]["tool_calls"][0]["function"]["name"],
            json!("lookup_order")
        );
        assert_eq!(
            payload["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],
            json!("{\"order_id\":\"order_123\"}")
        );
    }
}
