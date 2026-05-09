use anyhow::Result;
use uuid::Uuid;

use crate::repositories::PgControlPlaneStore;

use super::record_mappers::{
    map_callback_task_record, map_checkpoint_record, map_flow_run_record, map_node_run_record,
    map_run_event_record,
};

pub(super) async fn fetch_flow_run_for_application(
    store: &PgControlPlaneStore,
    application_id: Uuid,
    flow_run_id: Uuid,
) -> Result<Option<domain::FlowRunRecord>> {
    let row = sqlx::query(
        r#"
        select
            id,
            application_id,
            flow_id,
            flow_draft_id,
            compiled_plan_id,
            debug_session_id,
            flow_schema_version,
            document_hash,
            run_mode,
            target_node_id,
            status,
            input_payload,
            output_payload,
            error_payload,
            created_by,
            api_key_id,
            publication_version_id,
            external_user,
            external_conversation_id,
            external_trace_id,
            compatibility_mode,
            idempotency_key,
            started_at,
            finished_at,
            created_at
        from flow_runs
        where application_id = $1
          and id = $2
        "#,
    )
    .bind(application_id)
    .bind(flow_run_id)
    .fetch_optional(store.pool())
    .await?;

    row.map(map_flow_run_record).transpose()
}

pub(super) async fn fetch_node_run(
    store: &PgControlPlaneStore,
    node_run_id: Uuid,
) -> Result<Option<domain::NodeRunRecord>> {
    let row = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_id,
            node_type,
            node_alias,
            status,
            input_payload,
            output_payload,
            error_payload,
            metrics_payload,
            debug_payload,
            started_at,
            finished_at
        from node_runs
        where id = $1
        "#,
    )
    .bind(node_run_id)
    .fetch_optional(store.pool())
    .await?;

    row.map(map_node_run_record).transpose()
}

pub(super) async fn list_node_runs_for_flow_run(
    store: &PgControlPlaneStore,
    flow_run_id: Uuid,
) -> Result<Vec<domain::NodeRunRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_id,
            node_type,
            node_alias,
            status,
            input_payload,
            output_payload,
            error_payload,
            metrics_payload,
            debug_payload,
            started_at,
            finished_at
        from node_runs
        where flow_run_id = $1
        order by started_at asc, id asc
        "#,
    )
    .bind(flow_run_id)
    .fetch_all(store.pool())
    .await?;

    rows.into_iter().map(map_node_run_record).collect()
}

pub(super) async fn list_checkpoints_for_flow_run(
    store: &PgControlPlaneStore,
    flow_run_id: Uuid,
) -> Result<Vec<domain::CheckpointRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_run_id,
            status,
            reason,
            locator_payload,
            variable_snapshot,
            external_ref_payload,
            created_at
        from flow_run_checkpoints
        where flow_run_id = $1
        order by created_at asc, id asc
        "#,
    )
    .bind(flow_run_id)
    .fetch_all(store.pool())
    .await?;

    Ok(rows.into_iter().map(map_checkpoint_record).collect())
}

pub(super) async fn list_checkpoints_for_node_run(
    store: &PgControlPlaneStore,
    node_run_id: Uuid,
) -> Result<Vec<domain::CheckpointRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_run_id,
            status,
            reason,
            locator_payload,
            variable_snapshot,
            external_ref_payload,
            created_at
        from flow_run_checkpoints
        where node_run_id = $1
        order by created_at asc, id asc
        "#,
    )
    .bind(node_run_id)
    .fetch_all(store.pool())
    .await?;

    Ok(rows.into_iter().map(map_checkpoint_record).collect())
}

pub(super) async fn list_events_for_flow_run(
    store: &PgControlPlaneStore,
    flow_run_id: Uuid,
) -> Result<Vec<domain::RunEventRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_run_id,
            sequence,
            event_type,
            payload,
            created_at
        from flow_run_events
        where flow_run_id = $1
        order by sequence asc, id asc
        "#,
    )
    .bind(flow_run_id)
    .fetch_all(store.pool())
    .await?;

    Ok(rows.into_iter().map(map_run_event_record).collect())
}

pub(super) async fn list_callback_tasks_for_flow_run(
    store: &PgControlPlaneStore,
    flow_run_id: Uuid,
) -> Result<Vec<domain::CallbackTaskRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_run_id,
            callback_kind,
            status,
            request_payload,
            response_payload,
            external_ref_payload,
            created_at,
            completed_at
        from flow_run_callback_tasks
        where flow_run_id = $1
        order by created_at asc, id asc
        "#,
    )
    .bind(flow_run_id)
    .fetch_all(store.pool())
    .await?;

    rows.into_iter().map(map_callback_task_record).collect()
}

pub(super) async fn list_events_for_node_context(
    store: &PgControlPlaneStore,
    flow_run_id: Uuid,
    node_run_id: Uuid,
) -> Result<Vec<domain::RunEventRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            flow_run_id,
            node_run_id,
            sequence,
            event_type,
            payload,
            created_at
        from flow_run_events
        where flow_run_id = $1
          and (node_run_id is null or node_run_id = $2)
        order by sequence asc, id asc
        "#,
    )
    .bind(flow_run_id)
    .bind(node_run_id)
    .fetch_all(store.pool())
    .await?;

    Ok(rows.into_iter().map(map_run_event_record).collect())
}
