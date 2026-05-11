use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};
use control_plane::flow::FlowService;
use control_plane::ports::{DebugVariableCacheEntry, OrchestrationRuntimeRepository};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use storage_durable::MainDurableStore;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState, error_response::ApiError, middleware::require_session::require_session,
    response::ApiSuccess,
};

use super::{
    ensure_application_visible, runtime_debug_artifacts::offload_debug_variable_snapshot_artifacts,
};

const DEBUG_VARIABLE_SNAPSHOT_SCHEMA_VERSION: &str = "1flowbase.debug-variable-snapshot/v1";

#[derive(Debug, Serialize, ToSchema)]
pub struct DebugVariableSnapshotResponse {
    pub snapshot_schema_version: String,
    pub workspace_id: String,
    pub actor_user_id: String,
    pub draft_id: String,
    pub flow_schema_version: String,
    pub document_hash: String,
    pub debug_session_id: String,
    pub latest_run_scope: Option<DebugVariableSnapshotRunScopeResponse>,
    pub snapshot_completeness: String,
    pub source_flow_run_ids: serde_json::Value,
    pub source_node_run_ids: serde_json::Value,
    pub variable_cache: serde_json::Value,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DebugVariableSnapshotRunScopeResponse {
    pub flow_run_id: String,
    pub run_mode: String,
    pub status: String,
    pub target_node_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DebugVariableSnapshotQuery {
    pub debug_session_id: Option<String>,
    pub run_id: Option<Uuid>,
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}/orchestration/debug-variable-snapshot",
    params(("id" = String, Path, description = "Application id")),
    responses(
        (status = 200, body = DebugVariableSnapshotResponse),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn get_debug_variable_snapshot(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(query): Query<DebugVariableSnapshotQuery>,
) -> Result<Json<ApiSuccess<DebugVariableSnapshotResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    ensure_application_visible(&state, context.user.id, id).await?;
    let editor_state = FlowService::new(state.store.clone())
        .get_or_create_editor_state(context.user.id, id)
        .await?;

    let snapshot = build_debug_variable_snapshot(
        &state.store,
        id,
        context.actor.current_workspace_id,
        context.actor.user_id,
        query.debug_session_id,
        query.run_id,
        &editor_state,
    )
    .await?;
    let snapshot = offload_debug_variable_snapshot_artifacts(
        state,
        context.actor.current_workspace_id,
        id,
        snapshot,
    )
    .await?;

    Ok(Json(ApiSuccess::new(snapshot)))
}

fn preview_output_cache_payload(output_payload: &serde_json::Value) -> Option<serde_json::Value> {
    let payload = output_payload.as_object()?;

    if payload.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(payload.clone()))
    }
}

type NodeOutputSelectors = HashMap<String, Vec<(String, Vec<String>)>>;

fn read_output_selector<'a>(
    output_payload: &'a serde_json::Map<String, serde_json::Value>,
    selector: &[String],
) -> Option<&'a serde_json::Value> {
    let (first, rest) = selector.split_first()?;
    let mut current = output_payload.get(first)?;

    for segment in rest {
        current = current.as_object()?.get(segment)?;
    }

    Some(current)
}

fn output_selector(output: &serde_json::Value, key: &str) -> Vec<String> {
    let selector = output
        .get("selector")
        .and_then(|value| value.as_array())
        .map(|segments| {
            segments
                .iter()
                .filter_map(|segment| segment.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .filter(|segments| !segments.is_empty());

    selector.unwrap_or_else(|| vec![key.to_string()])
}

fn collect_node_public_output_selectors(document: &serde_json::Value) -> NodeOutputSelectors {
    let mut selectors = HashMap::new();
    let Some(nodes) = document
        .get("graph")
        .and_then(|graph| graph.get("nodes"))
        .and_then(|nodes| nodes.as_array())
    else {
        return selectors;
    };

    for node in nodes {
        if node.get("type").and_then(|value| value.as_str()) == Some("start") {
            continue;
        }
        let Some(node_id) = node.get("id").and_then(|value| value.as_str()) else {
            continue;
        };
        let Some(outputs) = node.get("outputs").and_then(|value| value.as_array()) else {
            continue;
        };

        let node_selectors = outputs
            .iter()
            .filter_map(|output| {
                let key = output.get("key").and_then(|value| value.as_str())?;
                if key.is_empty() || key.starts_with("__") {
                    return None;
                }
                Some((key.to_string(), output_selector(output, key)))
            })
            .collect::<Vec<_>>();

        if !node_selectors.is_empty() {
            selectors.insert(node_id.to_string(), node_selectors);
        }
    }

    selectors
}

fn collect_compiled_plan_public_output_selectors(plan: &serde_json::Value) -> NodeOutputSelectors {
    let mut selectors = HashMap::new();
    let Some(nodes) = plan.get("nodes").and_then(|nodes| nodes.as_object()) else {
        return selectors;
    };

    for (node_id, node) in nodes {
        if node.get("node_type").and_then(|value| value.as_str()) == Some("start") {
            continue;
        }
        let Some(outputs) = node.get("outputs").and_then(|value| value.as_array()) else {
            continue;
        };

        let node_selectors = outputs
            .iter()
            .filter_map(|output| {
                let key = output.get("key").and_then(|value| value.as_str())?;
                if key.is_empty() || key.starts_with("__") {
                    return None;
                }
                Some((key.to_string(), output_selector(output, key)))
            })
            .collect::<Vec<_>>();

        if !node_selectors.is_empty() {
            selectors.insert(node_id.to_string(), node_selectors);
        }
    }

    selectors
}

async fn public_output_selectors_for_run(
    store: &MainDurableStore,
    run: &domain::FlowRunRecord,
    fallback_document: &serde_json::Value,
) -> Result<NodeOutputSelectors, ApiError> {
    if let Some(compiled_plan_id) = run.compiled_plan_id {
        if let Some(compiled_plan) =
            <MainDurableStore as OrchestrationRuntimeRepository>::get_compiled_plan(
                store,
                compiled_plan_id,
            )
            .await?
        {
            let selectors = collect_compiled_plan_public_output_selectors(&compiled_plan.plan);
            if !selectors.is_empty() {
                return Ok(selectors);
            }
        }
    }

    Ok(collect_node_public_output_selectors(fallback_document))
}

fn insert_variable_value(
    variable_cache: &mut serde_json::Map<String, serde_json::Value>,
    node_id: &str,
    key: &str,
    value: &serde_json::Value,
) {
    let node_entry = variable_cache
        .entry(node_id.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let Some(node_entry) = node_entry.as_object_mut() else {
        return;
    };
    node_entry.insert(key.to_string(), value.clone());
}

fn merge_debug_variable_cache_entries(
    variable_cache: &mut serde_json::Map<String, serde_json::Value>,
    entries: Vec<DebugVariableCacheEntry>,
) {
    for entry in entries {
        insert_variable_value(
            variable_cache,
            &entry.node_id,
            &entry.variable_key,
            &entry.value,
        );
    }
}

async fn load_debug_variable_cache_entries(
    store: &MainDurableStore,
    application_id: Uuid,
    draft_id: Uuid,
    actor_user_id: Uuid,
) -> Result<Vec<DebugVariableCacheEntry>, ApiError> {
    Ok(
        <MainDurableStore as OrchestrationRuntimeRepository>::list_debug_variable_cache_entries(
            store,
            application_id,
            draft_id,
            actor_user_id,
        )
        .await?,
    )
}

fn insert_node_run_source_id(
    source_map: &mut serde_json::Map<String, serde_json::Value>,
    node_id: &str,
    key: &str,
    source_id: Uuid,
) {
    let node_entry = source_map
        .entry(node_id.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let Some(node_entry) = node_entry.as_object_mut() else {
        return;
    };
    node_entry.insert(
        key.to_string(),
        serde_json::Value::String(source_id.to_string()),
    );
}

fn is_snapshot_public_node_status(status: domain::NodeRunStatus) -> bool {
    matches!(status, domain::NodeRunStatus::Succeeded)
}

fn merge_node_output_payload(
    variable_cache: &mut serde_json::Map<String, serde_json::Value>,
    source_node_run_ids: &mut serde_json::Map<String, serde_json::Value>,
    node_run: &domain::NodeRunRecord,
    public_output_selectors: &NodeOutputSelectors,
) {
    if !is_snapshot_public_node_status(node_run.status) {
        return;
    }
    let Some(output_payload) = preview_output_cache_payload(&node_run.output_payload) else {
        return;
    };
    let Some(output_payload) = output_payload.as_object() else {
        return;
    };
    let Some(node_selectors) = public_output_selectors.get(&node_run.node_id) else {
        return;
    };

    for (key, selector) in node_selectors {
        if let Some(value) = read_output_selector(output_payload, selector) {
            insert_variable_value(variable_cache, &node_run.node_id, key, value);
            insert_node_run_source_id(source_node_run_ids, &node_run.node_id, key, node_run.id);
        }
    }
}

fn debug_snapshot_document_hash(document: &serde_json::Value) -> String {
    let bytes = serde_json::to_vec(document).unwrap_or_default();
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn normalize_debug_session_id(debug_session_id: Option<String>) -> Option<String> {
    debug_session_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn to_debug_snapshot_run_scope(
    run: &domain::FlowRunRecord,
) -> DebugVariableSnapshotRunScopeResponse {
    DebugVariableSnapshotRunScopeResponse {
        flow_run_id: run.id.to_string(),
        run_mode: run.run_mode.as_str().to_string(),
        status: run.status.as_str().to_string(),
        target_node_id: run.target_node_id.clone(),
    }
}

fn debug_snapshot_completeness(status: domain::FlowRunStatus) -> &'static str {
    match status {
        domain::FlowRunStatus::Succeeded => "complete",
        domain::FlowRunStatus::Queued
        | domain::FlowRunStatus::Running
        | domain::FlowRunStatus::WaitingCallback
        | domain::FlowRunStatus::WaitingHuman
        | domain::FlowRunStatus::Paused
        | domain::FlowRunStatus::Failed
        | domain::FlowRunStatus::Cancelled => "partial",
    }
}

fn debug_snapshot_flow_schema_version(editor_state: &domain::FlowEditorState) -> String {
    editor_state
        .draft
        .document
        .get("schemaVersion")
        .and_then(|value| value.as_str())
        .unwrap_or(&editor_state.draft.schema_version)
        .to_string()
}

fn run_matches_snapshot_key(
    run: &domain::FlowRunRecord,
    actor_user_id: Uuid,
    debug_session_id: Option<&str>,
    editor_state: &domain::FlowEditorState,
) -> bool {
    if run.created_by != actor_user_id || run.draft_id != editor_state.draft.id {
        return false;
    }

    match debug_session_id {
        Some(id) => run.debug_session_id == id,
        None => true,
    }
}

pub(super) async fn build_debug_variable_snapshot(
    store: &MainDurableStore,
    application_id: Uuid,
    workspace_id: Uuid,
    actor_user_id: Uuid,
    debug_session_id: Option<String>,
    run_id: Option<Uuid>,
    editor_state: &domain::FlowEditorState,
) -> Result<DebugVariableSnapshotResponse, ApiError> {
    let document_hash = debug_snapshot_document_hash(&editor_state.draft.document);
    let flow_schema_version = debug_snapshot_flow_schema_version(editor_state);
    if let Some(run_id) = run_id {
        let detail =
            <MainDurableStore as OrchestrationRuntimeRepository>::get_application_run_detail(
                store,
                application_id,
                run_id,
            )
            .await?
            .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                "flow_run",
            ))?;
        let mut variable_cache = serde_json::Map::new();
        let source_flow_run_ids = serde_json::Map::new();
        let mut source_node_run_ids = serde_json::Map::new();
        let public_output_selectors =
            public_output_selectors_for_run(store, &detail.flow_run, &editor_state.draft.document)
                .await?;

        for node_run in &detail.node_runs {
            merge_node_output_payload(
                &mut variable_cache,
                &mut source_node_run_ids,
                node_run,
                &public_output_selectors,
            );
        }
        return Ok(DebugVariableSnapshotResponse {
            snapshot_schema_version: DEBUG_VARIABLE_SNAPSHOT_SCHEMA_VERSION.to_string(),
            workspace_id: workspace_id.to_string(),
            actor_user_id: actor_user_id.to_string(),
            draft_id: detail.flow_run.draft_id.to_string(),
            flow_schema_version: detail.flow_run.flow_schema_version.clone(),
            document_hash: detail.flow_run.document_hash.clone(),
            debug_session_id: detail.flow_run.debug_session_id.clone(),
            latest_run_scope: Some(to_debug_snapshot_run_scope(&detail.flow_run)),
            snapshot_completeness: debug_snapshot_completeness(detail.flow_run.status).to_string(),
            source_flow_run_ids: serde_json::Value::Object(source_flow_run_ids),
            source_node_run_ids: serde_json::Value::Object(source_node_run_ids),
            variable_cache: serde_json::Value::Object(variable_cache),
        });
    }
    let debug_session_id = normalize_debug_session_id(debug_session_id);
    let runs = <MainDurableStore as OrchestrationRuntimeRepository>::list_application_runs(
        store,
        application_id,
    )
    .await?;
    let mut variable_cache = serde_json::Map::new();
    let source_flow_run_ids = serde_json::Map::new();
    let source_node_run_ids = serde_json::Map::new();
    let mut latest_run_scope = None;
    let mut snapshot_completeness = "empty";
    let mut snapshot_draft_id = editor_state.draft.id.to_string();
    let mut snapshot_flow_schema_version = flow_schema_version;
    let mut snapshot_document_hash = document_hash;

    for run in runs {
        let Some(detail) =
            <MainDurableStore as OrchestrationRuntimeRepository>::get_application_run_detail(
                store,
                application_id,
                run.id,
            )
            .await?
        else {
            continue;
        };

        if !run_matches_snapshot_key(
            &detail.flow_run,
            actor_user_id,
            debug_session_id.as_deref(),
            editor_state,
        ) {
            continue;
        }

        latest_run_scope = Some(to_debug_snapshot_run_scope(&detail.flow_run));
        snapshot_completeness = debug_snapshot_completeness(detail.flow_run.status);
        snapshot_draft_id = detail.flow_run.draft_id.to_string();
        snapshot_flow_schema_version = detail.flow_run.flow_schema_version.clone();
        snapshot_document_hash = detail.flow_run.document_hash.clone();
        break;
    }
    merge_debug_variable_cache_entries(
        &mut variable_cache,
        load_debug_variable_cache_entries(
            store,
            application_id,
            editor_state.draft.id,
            actor_user_id,
        )
        .await?,
    );

    Ok(DebugVariableSnapshotResponse {
        snapshot_schema_version: DEBUG_VARIABLE_SNAPSHOT_SCHEMA_VERSION.to_string(),
        workspace_id: workspace_id.to_string(),
        actor_user_id: actor_user_id.to_string(),
        draft_id: snapshot_draft_id,
        flow_schema_version: snapshot_flow_schema_version,
        document_hash: snapshot_document_hash,
        debug_session_id: debug_session_id.unwrap_or_default(),
        latest_run_scope,
        snapshot_completeness: snapshot_completeness.to_string(),
        source_flow_run_ids: serde_json::Value::Object(source_flow_run_ids),
        source_node_run_ids: serde_json::Value::Object(source_node_run_ids),
        variable_cache: serde_json::Value::Object(variable_cache),
    })
}
