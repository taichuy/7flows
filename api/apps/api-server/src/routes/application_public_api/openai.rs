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
use serde_json::Value;
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
    pub content: String,
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
    OpenAiChatCompletionResponse {
        id: format!("chatcmpl-{}", run.id),
        object: "chat.completion",
        created: run.created_at.unix_timestamp(),
        model,
        choices: vec![OpenAiChatCompletionChoice {
            index: 0,
            message: OpenAiChatMessage {
                role: "assistant",
                content: run.answer.unwrap_or_default(),
            },
            finish_reason: "stop",
        }],
        usage: openai_usage(run.usage),
    }
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
