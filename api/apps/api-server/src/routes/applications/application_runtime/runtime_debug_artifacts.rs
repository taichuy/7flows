use std::sync::Arc;

use axum::{
    body::Body,
    http::{header::CONTENT_TYPE, Response, StatusCode},
};
use control_plane::{
    errors::ControlPlaneError,
    orchestration_runtime::debug_artifacts::{
        build_runtime_debug_artifact_object_path, build_runtime_debug_artifact_preview,
        inline_budget_for_kind, RUNTIME_DEBUG_ARTIFACT_CONTENT_TYPE_JSON,
        RUNTIME_DEBUG_ARTIFACT_RETENTION_ACTIVE,
    },
    ports::{
        CreateRuntimeDebugArtifactInput, FileManagementRepository, GetRuntimeDebugArtifactInput,
        OrchestrationRuntimeRepository, UpdateFlowRunPayloadsInput, UpdateNodeRunPayloadsInput,
        UpdateRunEventPayloadInput,
    },
};
use serde_json::Value;
use storage_durable::MainDurableStore;
use uuid::Uuid;

use crate::{app_state::ApiState, error_response::ApiError};

struct RuntimeDebugArtifactScope {
    workspace_id: Uuid,
    application_id: Uuid,
    flow_run_id: Option<Uuid>,
    node_run_id: Option<Uuid>,
    run_event_id: Option<Uuid>,
}

struct RuntimeDebugArtifactWriter {
    state: Arc<ApiState>,
    storage: domain::FileStorageRecord,
    driver: Arc<dyn storage_object::FileStorageDriver>,
}

impl RuntimeDebugArtifactWriter {
    async fn new(state: Arc<ApiState>) -> Result<Self, ApiError> {
        let storage =
            <MainDurableStore as FileManagementRepository>::get_default_file_storage(&state.store)
                .await?
                .ok_or(ControlPlaneError::Conflict("file_storage_default_missing"))?;
        if !storage.enabled {
            return Err(ControlPlaneError::Conflict("file_storage_disabled").into());
        }
        let driver = state
            .file_storage_registry
            .get(&storage.driver_type)
            .ok_or(ControlPlaneError::Conflict("storage_driver_not_registered"))?;

        Ok(Self {
            state,
            storage,
            driver,
        })
    }

    async fn offload_value(
        &self,
        scope: &RuntimeDebugArtifactScope,
        artifact_kind: &str,
        value: Value,
    ) -> Result<(Value, bool), ApiError> {
        let artifact_id = Uuid::now_v7();
        let Some(preview) = build_runtime_debug_artifact_preview(
            artifact_id,
            &value,
            inline_budget_for_kind(artifact_kind),
        )?
        else {
            return Ok((value, false));
        };
        let storage_ref = build_runtime_debug_artifact_object_path(
            scope.workspace_id,
            scope.application_id,
            scope.flow_run_id,
            preview.artifact_id,
        );

        self.driver
            .put_object(storage_object::FileStoragePutInput {
                config_json: &self.storage.config_json,
                object_path: &storage_ref,
                content_type: Some(RUNTIME_DEBUG_ARTIFACT_CONTENT_TYPE_JSON),
                bytes: &preview.full_bytes,
            })
            .await?;
        <MainDurableStore as OrchestrationRuntimeRepository>::create_runtime_debug_artifact(
            &self.state.store,
            &CreateRuntimeDebugArtifactInput {
                artifact_id: preview.artifact_id,
                workspace_id: scope.workspace_id,
                application_id: scope.application_id,
                flow_run_id: scope.flow_run_id,
                node_run_id: scope.node_run_id,
                run_event_id: scope.run_event_id,
                artifact_kind: artifact_kind.to_string(),
                content_type: RUNTIME_DEBUG_ARTIFACT_CONTENT_TYPE_JSON.to_string(),
                original_size_bytes: preview.original_size_bytes,
                preview_size_bytes: preview.preview_size_bytes,
                storage_id: self.storage.id,
                storage_ref,
                retention_state: RUNTIME_DEBUG_ARTIFACT_RETENTION_ACTIVE.to_string(),
            },
        )
        .await?;

        Ok((preview.preview_value, true))
    }
}

pub async fn offload_application_run_detail_artifacts(
    state: Arc<ApiState>,
    workspace_id: Uuid,
    application_id: Uuid,
    mut detail: domain::ApplicationRunDetail,
) -> Result<domain::ApplicationRunDetail, ApiError> {
    if !is_safe_to_persist_debug_artifact_previews(detail.flow_run.status) {
        return Ok(detail);
    }

    let writer = RuntimeDebugArtifactWriter::new(state.clone()).await?;
    let flow_scope = RuntimeDebugArtifactScope {
        workspace_id,
        application_id,
        flow_run_id: Some(detail.flow_run.id),
        node_run_id: None,
        run_event_id: None,
    };
    let (flow_input_payload, flow_input_changed) = writer
        .offload_value(
            &flow_scope,
            "flow_input_payload",
            detail.flow_run.input_payload.clone(),
        )
        .await?;
    let (flow_output_payload, flow_output_changed) = writer
        .offload_value(
            &flow_scope,
            "flow_output_payload",
            detail.flow_run.output_payload.clone(),
        )
        .await?;
    let (flow_error_payload, flow_error_changed) = match detail.flow_run.error_payload.clone() {
        Some(error_payload) => {
            let (payload, changed) = writer
                .offload_value(&flow_scope, "flow_error_payload", error_payload)
                .await?;
            (Some(payload), changed)
        }
        None => (None, false),
    };
    if flow_input_changed || flow_output_changed || flow_error_changed {
        detail.flow_run =
            <MainDurableStore as OrchestrationRuntimeRepository>::update_flow_run_payloads(
                &state.store,
                &UpdateFlowRunPayloadsInput {
                    flow_run_id: detail.flow_run.id,
                    input_payload: flow_input_payload,
                    output_payload: flow_output_payload,
                    error_payload: flow_error_payload,
                },
            )
            .await?;
    }

    for node_run in &mut detail.node_runs {
        let node_scope = RuntimeDebugArtifactScope {
            workspace_id,
            application_id,
            flow_run_id: Some(detail.flow_run.id),
            node_run_id: Some(node_run.id),
            run_event_id: None,
        };
        let (input_payload, input_changed) = writer
            .offload_value(
                &node_scope,
                "node_input_payload",
                node_run.input_payload.clone(),
            )
            .await?;
        let (output_payload, output_changed) = writer
            .offload_value(
                &node_scope,
                "node_output_payload",
                node_run.output_payload.clone(),
            )
            .await?;
        let (error_payload, error_changed) = match node_run.error_payload.clone() {
            Some(error_payload) => {
                let (payload, changed) = writer
                    .offload_value(&node_scope, "node_error_payload", error_payload)
                    .await?;
                (Some(payload), changed)
            }
            None => (None, false),
        };
        let (metrics_payload, metrics_changed) = writer
            .offload_value(
                &node_scope,
                "node_metrics_payload",
                node_run.metrics_payload.clone(),
            )
            .await?;
        let (debug_payload, debug_changed) = writer
            .offload_value(
                &node_scope,
                "node_debug_payload",
                node_run.debug_payload.clone(),
            )
            .await?;

        if input_changed || output_changed || error_changed || metrics_changed || debug_changed {
            *node_run =
                <MainDurableStore as OrchestrationRuntimeRepository>::update_node_run_payloads(
                    &state.store,
                    &UpdateNodeRunPayloadsInput {
                        node_run_id: node_run.id,
                        input_payload,
                        output_payload,
                        error_payload,
                        metrics_payload,
                        debug_payload,
                    },
                )
                .await?;
        }
    }

    for event in &mut detail.events {
        let event_scope = RuntimeDebugArtifactScope {
            workspace_id,
            application_id,
            flow_run_id: Some(detail.flow_run.id),
            node_run_id: event.node_run_id,
            run_event_id: Some(event.id),
        };
        let (payload, changed) = writer
            .offload_value(&event_scope, "run_event_payload", event.payload.clone())
            .await?;
        if changed {
            *event =
                <MainDurableStore as OrchestrationRuntimeRepository>::update_run_event_payload(
                    &state.store,
                    &UpdateRunEventPayloadInput {
                        run_event_id: event.id,
                        payload,
                    },
                )
                .await?;
        }
    }

    Ok(detail)
}

fn is_safe_to_persist_debug_artifact_previews(status: domain::FlowRunStatus) -> bool {
    matches!(
        status,
        domain::FlowRunStatus::Succeeded
            | domain::FlowRunStatus::Failed
            | domain::FlowRunStatus::Cancelled
    )
}

pub async fn load_runtime_debug_artifact_response(
    state: Arc<ApiState>,
    workspace_id: Uuid,
    application_id: Uuid,
    artifact_id: Uuid,
) -> Result<Response<Body>, ApiError> {
    let artifact =
        <MainDurableStore as OrchestrationRuntimeRepository>::get_runtime_debug_artifact(
            &state.store,
            &GetRuntimeDebugArtifactInput {
                workspace_id,
                application_id,
                artifact_id,
            },
        )
        .await?
        .ok_or(ControlPlaneError::NotFound("runtime_debug_artifact"))?;
    let storage = <MainDurableStore as FileManagementRepository>::get_file_storage(
        &state.store,
        artifact.storage_id,
    )
    .await?
    .ok_or(ControlPlaneError::NotFound("file_storage"))?;
    if !storage.enabled {
        return Err(ControlPlaneError::Conflict("file_storage_disabled").into());
    }
    let driver = state
        .file_storage_registry
        .get(&storage.driver_type)
        .ok_or(ControlPlaneError::Conflict("storage_driver_not_registered"))?;
    let object = driver
        .open_read(storage_object::OpenReadInput {
            config_json: &storage.config_json,
            object_path: &artifact.storage_ref,
        })
        .await?;
    let content_type = object.content_type.unwrap_or(artifact.content_type);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type)
        .body(Body::from(object.bytes))
        .unwrap())
}
