pub mod anthropic;
pub mod compat_sse;
pub mod native;
pub mod openai;
pub mod sse;

use std::sync::Arc;

use axum::{routing::post, Router};

use crate::app_state::ApiState;

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/runs", post(native::create_native_run))
        .route("/runs/:run_id", axum::routing::get(native::get_native_run))
        .route("/runs/:run_id/cancel", post(native::cancel_native_run))
        .route("/runs/:run_id/resume", post(native::resume_native_run))
        .route("/files", post(native::upload_native_file))
}

pub fn compatible_router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/v1/chat/completions", post(openai::create_chat_completion))
        .route("/v1/messages", post(anthropic::create_message))
}
