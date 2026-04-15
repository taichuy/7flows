use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use control_plane::{
    application::{ApplicationService, CreateApplicationCommand},
    errors::ControlPlaneError,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateApplicationBody {
    pub application_type: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationSummaryResponse {
    pub id: String,
    pub application_type: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationOrchestrationSectionResponse {
    pub status: String,
    pub subject_kind: String,
    pub subject_status: String,
    pub current_subject_id: Option<String>,
    pub current_draft_id: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationApiSectionResponse {
    pub status: String,
    pub credential_kind: String,
    pub invoke_routing_mode: String,
    pub invoke_path_template: Option<String>,
    pub api_capability_status: String,
    pub credentials_status: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationLogsSectionResponse {
    pub status: String,
    pub runs_capability_status: String,
    pub run_object_kind: String,
    pub log_retention_status: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationMonitoringSectionResponse {
    pub status: String,
    pub metrics_capability_status: String,
    pub metrics_object_kind: String,
    pub tracing_config_status: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationSectionsResponse {
    pub orchestration: ApplicationOrchestrationSectionResponse,
    pub api: ApplicationApiSectionResponse,
    pub logs: ApplicationLogsSectionResponse,
    pub monitoring: ApplicationMonitoringSectionResponse,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationDetailResponse {
    pub id: String,
    pub application_type: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
    pub updated_at: String,
    pub sections: ApplicationSectionsResponse,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route(
            "/applications",
            get(list_applications).post(create_application),
        )
        .route("/applications/:id", get(get_application))
}

fn to_application_summary(application: domain::ApplicationRecord) -> ApplicationSummaryResponse {
    ApplicationSummaryResponse {
        id: application.id.to_string(),
        application_type: application.application_type.as_str().to_string(),
        name: application.name,
        description: application.description,
        icon: application.icon,
        icon_type: application.icon_type,
        icon_background: application.icon_background,
        updated_at: application.updated_at.format(&Rfc3339).unwrap(),
    }
}

fn to_sections_response(sections: domain::ApplicationSections) -> ApplicationSectionsResponse {
    ApplicationSectionsResponse {
        orchestration: ApplicationOrchestrationSectionResponse {
            status: sections.orchestration.status,
            subject_kind: sections.orchestration.subject_kind,
            subject_status: sections.orchestration.subject_status,
            current_subject_id: sections
                .orchestration
                .current_subject_id
                .map(|value| value.to_string()),
            current_draft_id: sections
                .orchestration
                .current_draft_id
                .map(|value| value.to_string()),
        },
        api: ApplicationApiSectionResponse {
            status: sections.api.status,
            credential_kind: sections.api.credential_kind,
            invoke_routing_mode: sections.api.invoke_routing_mode,
            invoke_path_template: sections.api.invoke_path_template,
            api_capability_status: sections.api.api_capability_status,
            credentials_status: sections.api.credentials_status,
        },
        logs: ApplicationLogsSectionResponse {
            status: sections.logs.status,
            runs_capability_status: sections.logs.runs_capability_status,
            run_object_kind: sections.logs.run_object_kind,
            log_retention_status: sections.logs.log_retention_status,
        },
        monitoring: ApplicationMonitoringSectionResponse {
            status: sections.monitoring.status,
            metrics_capability_status: sections.monitoring.metrics_capability_status,
            metrics_object_kind: sections.monitoring.metrics_object_kind,
            tracing_config_status: sections.monitoring.tracing_config_status,
        },
    }
}

fn to_application_detail(application: domain::ApplicationRecord) -> ApplicationDetailResponse {
    ApplicationDetailResponse {
        id: application.id.to_string(),
        application_type: application.application_type.as_str().to_string(),
        name: application.name,
        description: application.description,
        icon: application.icon,
        icon_type: application.icon_type,
        icon_background: application.icon_background,
        updated_at: application.updated_at.format(&Rfc3339).unwrap(),
        sections: to_sections_response(application.sections),
    }
}

fn parse_application_type(value: &str) -> Result<domain::ApplicationType, ApiError> {
    match value {
        "agent_flow" => Ok(domain::ApplicationType::AgentFlow),
        "workflow" => Ok(domain::ApplicationType::Workflow),
        _ => Err(ControlPlaneError::InvalidInput("application_type").into()),
    }
}

#[utoipa::path(
    get,
    path = "/api/console/applications",
    responses(
        (status = 200, body = [ApplicationSummaryResponse]),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody)
    )
)]
pub async fn list_applications(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<ApplicationSummaryResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let applications = ApplicationService::new(state.store.clone())
        .list_applications(context.user.id)
        .await?;

    Ok(Json(ApiSuccess::new(
        applications
            .into_iter()
            .map(to_application_summary)
            .collect(),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/applications",
    request_body = CreateApplicationBody,
    responses(
        (status = 201, body = ApplicationDetailResponse),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody)
    )
)]
pub async fn create_application(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<CreateApplicationBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ApplicationDetailResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let created = ApplicationService::new(state.store.clone())
        .create_application(CreateApplicationCommand {
            actor_user_id: context.user.id,
            application_type: parse_application_type(&body.application_type)?,
            name: body.name,
            description: body.description,
            icon: body.icon,
            icon_type: body.icon_type,
            icon_background: body.icon_background,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_application_detail(created))),
    ))
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}",
    params(
        ("id" = String, Path, description = "Application id")
    ),
    responses(
        (status = 200, body = ApplicationDetailResponse),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn get_application(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiSuccess<ApplicationDetailResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let application = ApplicationService::new(state.store.clone())
        .get_application(context.user.id, id)
        .await?;

    Ok(Json(ApiSuccess::new(to_application_detail(application))))
}
