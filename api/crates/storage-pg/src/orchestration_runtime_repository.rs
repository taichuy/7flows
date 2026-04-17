use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::{
    AppendRunEventInput, CompleteFlowRunInput, CompleteNodeRunInput, CreateFlowRunInput,
    CreateNodeRunInput, OrchestrationRuntimeRepository, UpsertCompiledPlanInput,
};
use sqlx::{postgres::PgRow, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
    mappers::orchestration_runtime_mapper::{
        PgOrchestrationRuntimeMapper, StoredApplicationRunSummaryRow, StoredCheckpointRow,
        StoredCompiledPlanRow, StoredFlowRunRow, StoredNodeRunRow, StoredRunEventRow,
    },
    repositories::PgControlPlaneStore,
};

#[async_trait]
impl OrchestrationRuntimeRepository for PgControlPlaneStore {
    async fn upsert_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> Result<domain::CompiledPlanRecord> {
        let row = sqlx::query(
            r#"
            insert into flow_compiled_plans (
                id,
                flow_id,
                flow_draft_id,
                schema_version,
                document_updated_at,
                plan,
                created_by
            ) values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (flow_draft_id) do update
            set flow_id = excluded.flow_id,
                schema_version = excluded.schema_version,
                document_updated_at = excluded.document_updated_at,
                plan = excluded.plan,
                created_by = excluded.created_by,
                updated_at = now()
            returning
                id,
                flow_id,
                flow_draft_id,
                schema_version,
                document_updated_at,
                plan,
                created_by,
                created_at,
                updated_at
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.flow_id)
        .bind(input.flow_draft_id)
        .bind(&input.schema_version)
        .bind(input.document_updated_at)
        .bind(&input.plan)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        map_compiled_plan_record(row)
    }

    async fn create_flow_run(&self, input: &CreateFlowRunInput) -> Result<domain::FlowRunRecord> {
        let row = sqlx::query(
            r#"
            insert into flow_runs (
                id,
                application_id,
                flow_id,
                flow_draft_id,
                compiled_plan_id,
                run_mode,
                target_node_id,
                status,
                input_payload,
                created_by,
                started_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            returning
                id,
                application_id,
                flow_id,
                flow_draft_id,
                compiled_plan_id,
                run_mode,
                target_node_id,
                status,
                input_payload,
                output_payload,
                error_payload,
                created_by,
                started_at,
                finished_at,
                created_at
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.application_id)
        .bind(input.flow_id)
        .bind(input.flow_draft_id)
        .bind(input.compiled_plan_id)
        .bind(input.run_mode.as_str())
        .bind(input.target_node_id.as_deref())
        .bind(input.status.as_str())
        .bind(&input.input_payload)
        .bind(input.actor_user_id)
        .bind(input.started_at)
        .fetch_one(self.pool())
        .await?;

        map_flow_run_record(row)
    }

    async fn create_node_run(&self, input: &CreateNodeRunInput) -> Result<domain::NodeRunRecord> {
        let row = sqlx::query(
            r#"
            insert into node_runs (
                id,
                flow_run_id,
                node_id,
                node_type,
                node_alias,
                status,
                input_payload,
                started_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning
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
                started_at,
                finished_at
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.flow_run_id)
        .bind(&input.node_id)
        .bind(&input.node_type)
        .bind(&input.node_alias)
        .bind(input.status.as_str())
        .bind(&input.input_payload)
        .bind(input.started_at)
        .fetch_one(self.pool())
        .await?;

        map_node_run_record(row)
    }

    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> Result<domain::NodeRunRecord> {
        let row = sqlx::query(
            r#"
            update node_runs
            set status = $2,
                output_payload = $3,
                error_payload = $4,
                metrics_payload = $5,
                finished_at = $6
            where id = $1
            returning
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
                started_at,
                finished_at
            "#,
        )
        .bind(input.node_run_id)
        .bind(input.status.as_str())
        .bind(&input.output_payload)
        .bind(&input.error_payload)
        .bind(&input.metrics_payload)
        .bind(input.finished_at)
        .fetch_one(self.pool())
        .await?;

        map_node_run_record(row)
    }

    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> Result<domain::FlowRunRecord> {
        let row = sqlx::query(
            r#"
            update flow_runs
            set status = $2,
                output_payload = $3,
                error_payload = $4,
                finished_at = $5
            where id = $1
            returning
                id,
                application_id,
                flow_id,
                flow_draft_id,
                compiled_plan_id,
                run_mode,
                target_node_id,
                status,
                input_payload,
                output_payload,
                error_payload,
                created_by,
                started_at,
                finished_at,
                created_at
            "#,
        )
        .bind(input.flow_run_id)
        .bind(input.status.as_str())
        .bind(&input.output_payload)
        .bind(&input.error_payload)
        .bind(input.finished_at)
        .fetch_one(self.pool())
        .await?;

        map_flow_run_record(row)
    }

    async fn append_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> Result<domain::RunEventRecord> {
        let mut tx = self.pool().begin().await?;
        let next_sequence = next_event_sequence(&mut tx, input.flow_run_id).await?;
        let row = sqlx::query(
            r#"
            insert into flow_run_events (
                id,
                flow_run_id,
                node_run_id,
                sequence,
                event_type,
                payload
            ) values ($1, $2, $3, $4, $5, $6)
            returning
                id,
                flow_run_id,
                node_run_id,
                sequence,
                event_type,
                payload,
                created_at
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.flow_run_id)
        .bind(input.node_run_id)
        .bind(next_sequence)
        .bind(&input.event_type)
        .bind(&input.payload)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(map_run_event_record(row))
    }

    async fn list_application_runs(
        &self,
        application_id: Uuid,
    ) -> Result<Vec<domain::ApplicationRunSummary>> {
        let rows = sqlx::query(
            r#"
            select
                id,
                run_mode,
                status,
                target_node_id,
                started_at,
                finished_at
            from flow_runs
            where application_id = $1
            order by started_at desc, id desc
            "#,
        )
        .bind(application_id)
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_application_run_summary).collect()
    }

    async fn get_application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::ApplicationRunDetail>> {
        let Some(flow_run) =
            fetch_flow_run_for_application(self, application_id, flow_run_id).await?
        else {
            return Ok(None);
        };

        Ok(Some(domain::ApplicationRunDetail {
            node_runs: list_node_runs_for_flow_run(self, flow_run.id).await?,
            checkpoints: list_checkpoints_for_flow_run(self, flow_run.id).await?,
            events: list_events_for_flow_run(self, flow_run.id).await?,
            flow_run,
        }))
    }

    async fn get_latest_node_run(
        &self,
        application_id: Uuid,
        node_id: &str,
    ) -> Result<Option<domain::NodeLastRun>> {
        let latest = sqlx::query(
            r#"
            select
                nr.id as node_run_id,
                fr.id as flow_run_id
            from node_runs nr
            join flow_runs fr on fr.id = nr.flow_run_id
            where fr.application_id = $1
              and nr.node_id = $2
            order by nr.started_at desc, nr.id desc
            limit 1
            "#,
        )
        .bind(application_id)
        .bind(node_id)
        .fetch_optional(self.pool())
        .await?;

        let Some(latest) = latest else {
            return Ok(None);
        };
        let flow_run_id: Uuid = latest.get("flow_run_id");
        let node_run_id: Uuid = latest.get("node_run_id");
        let flow_run = fetch_flow_run_for_application(self, application_id, flow_run_id)
            .await?
            .expect("joined flow_run must exist");
        let node_run = fetch_node_run(self, node_run_id)
            .await?
            .expect("joined node_run must exist");

        Ok(Some(domain::NodeLastRun {
            checkpoints: list_checkpoints_for_node_run(self, node_run.id).await?,
            events: list_events_for_node_context(self, flow_run.id, node_run.id).await?,
            flow_run,
            node_run,
        }))
    }
}

async fn next_event_sequence(tx: &mut Transaction<'_, Postgres>, flow_run_id: Uuid) -> Result<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "select coalesce(max(sequence), 0) + 1 from flow_run_events where flow_run_id = $1",
    )
    .bind(flow_run_id)
    .fetch_one(&mut **tx)
    .await?)
}

async fn fetch_flow_run_for_application(
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
            run_mode,
            target_node_id,
            status,
            input_payload,
            output_payload,
            error_payload,
            created_by,
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

async fn fetch_node_run(
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

async fn list_node_runs_for_flow_run(
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

async fn list_checkpoints_for_flow_run(
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

async fn list_checkpoints_for_node_run(
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

async fn list_events_for_flow_run(
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

async fn list_events_for_node_context(
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

fn map_compiled_plan_record(row: PgRow) -> Result<domain::CompiledPlanRecord> {
    Ok(PgOrchestrationRuntimeMapper::to_compiled_plan_record(
        StoredCompiledPlanRow {
            id: row.get("id"),
            flow_id: row.get("flow_id"),
            flow_draft_id: row.get("flow_draft_id"),
            schema_version: row.get("schema_version"),
            document_updated_at: row.get("document_updated_at"),
            plan: row.get("plan"),
            created_by: row.get("created_by"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        },
    ))
}

fn map_flow_run_record(row: PgRow) -> Result<domain::FlowRunRecord> {
    PgOrchestrationRuntimeMapper::to_flow_run_record(StoredFlowRunRow {
        id: row.get("id"),
        application_id: row.get("application_id"),
        flow_id: row.get("flow_id"),
        flow_draft_id: row.get("flow_draft_id"),
        compiled_plan_id: row.get("compiled_plan_id"),
        run_mode: row.get("run_mode"),
        target_node_id: row.get("target_node_id"),
        status: row.get("status"),
        input_payload: row.get("input_payload"),
        output_payload: row.get("output_payload"),
        error_payload: row.get("error_payload"),
        created_by: row.get("created_by"),
        started_at: row.get("started_at"),
        finished_at: row.get("finished_at"),
        created_at: row.get("created_at"),
    })
}

fn map_node_run_record(row: PgRow) -> Result<domain::NodeRunRecord> {
    PgOrchestrationRuntimeMapper::to_node_run_record(StoredNodeRunRow {
        id: row.get("id"),
        flow_run_id: row.get("flow_run_id"),
        node_id: row.get("node_id"),
        node_type: row.get("node_type"),
        node_alias: row.get("node_alias"),
        status: row.get("status"),
        input_payload: row.get("input_payload"),
        output_payload: row.get("output_payload"),
        error_payload: row.get("error_payload"),
        metrics_payload: row.get("metrics_payload"),
        started_at: row.get("started_at"),
        finished_at: row.get("finished_at"),
    })
}

fn map_checkpoint_record(row: PgRow) -> domain::CheckpointRecord {
    PgOrchestrationRuntimeMapper::to_checkpoint_record(StoredCheckpointRow {
        id: row.get("id"),
        flow_run_id: row.get("flow_run_id"),
        node_run_id: row.get("node_run_id"),
        status: row.get("status"),
        reason: row.get("reason"),
        locator_payload: row.get("locator_payload"),
        variable_snapshot: row.get("variable_snapshot"),
        external_ref_payload: row.get("external_ref_payload"),
        created_at: row.get("created_at"),
    })
}

fn map_run_event_record(row: PgRow) -> domain::RunEventRecord {
    PgOrchestrationRuntimeMapper::to_run_event_record(StoredRunEventRow {
        id: row.get("id"),
        flow_run_id: row.get("flow_run_id"),
        node_run_id: row.get("node_run_id"),
        sequence: row.get("sequence"),
        event_type: row.get("event_type"),
        payload: row.get("payload"),
        created_at: row.get("created_at"),
    })
}

fn map_application_run_summary(row: PgRow) -> Result<domain::ApplicationRunSummary> {
    PgOrchestrationRuntimeMapper::to_application_run_summary(StoredApplicationRunSummaryRow {
        id: row.get("id"),
        run_mode: row.get("run_mode"),
        status: row.get("status"),
        target_node_id: row.get("target_node_id"),
        started_at: row.get("started_at"),
        finished_at: row.get("finished_at"),
    })
}
