use anyhow::{bail, Result};
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{
        CreatePluginAssignmentInput, CreatePluginTaskInput, PluginRepository,
        UpdatePluginInstallationEnabledInput, UpdatePluginTaskStatusInput,
        UpsertPluginInstallationInput,
    },
};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::plugin_mapper::{
        PgPluginMapper, StoredPluginAssignmentRow, StoredPluginInstallationRow, StoredPluginTaskRow,
    },
    repositories::PgControlPlaneStore,
};

fn map_installation(row: sqlx::postgres::PgRow) -> Result<domain::PluginInstallationRecord> {
    PgPluginMapper::to_installation_record(StoredPluginInstallationRow {
        id: row.get("id"),
        provider_code: row.get("provider_code"),
        plugin_id: row.get("plugin_id"),
        plugin_version: row.get("plugin_version"),
        contract_version: row.get("contract_version"),
        protocol: row.get("protocol"),
        display_name: row.get("display_name"),
        source_kind: row.get("source_kind"),
        verification_status: row.get("verification_status"),
        enabled: row.get("enabled"),
        install_path: row.get("install_path"),
        checksum: row.get("checksum"),
        signature_status: row.get("signature_status"),
        metadata_json: row.get("metadata_json"),
        created_by: row.get("created_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_assignment(row: sqlx::postgres::PgRow) -> Result<domain::PluginAssignmentRecord> {
    PgPluginMapper::to_assignment_record(StoredPluginAssignmentRow {
        id: row.get("id"),
        installation_id: row.get("installation_id"),
        workspace_id: row.get("workspace_id"),
        provider_code: row.get("provider_code"),
        assigned_by: row.get("assigned_by"),
        created_at: row.get("created_at"),
    })
}

fn map_task(row: sqlx::postgres::PgRow) -> Result<domain::PluginTaskRecord> {
    PgPluginMapper::to_task_record(StoredPluginTaskRow {
        id: row.get("id"),
        installation_id: row.get("installation_id"),
        workspace_id: row.get("workspace_id"),
        provider_code: row.get("provider_code"),
        task_kind: row.get("task_kind"),
        status: row.get("status"),
        status_message: row.get("status_message"),
        detail_json: row.get("detail_json"),
        created_by: row.get("created_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        finished_at: row.get("finished_at"),
    })
}

#[async_trait]
impl PluginRepository for PgControlPlaneStore {
    async fn upsert_installation(
        &self,
        input: &UpsertPluginInstallationInput,
    ) -> Result<domain::PluginInstallationRecord> {
        let row = sqlx::query(
            r#"
            insert into plugin_installations (
                id,
                provider_code,
                plugin_id,
                plugin_version,
                contract_version,
                protocol,
                display_name,
                source_kind,
                verification_status,
                enabled,
                install_path,
                checksum,
                signature_status,
                metadata_json,
                created_by
            ) values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            on conflict (plugin_id) do update
            set
                provider_code = excluded.provider_code,
                plugin_version = excluded.plugin_version,
                contract_version = excluded.contract_version,
                protocol = excluded.protocol,
                display_name = excluded.display_name,
                source_kind = excluded.source_kind,
                verification_status = excluded.verification_status,
                enabled = excluded.enabled,
                install_path = excluded.install_path,
                checksum = excluded.checksum,
                signature_status = excluded.signature_status,
                metadata_json = excluded.metadata_json,
                updated_at = now()
            returning
                id,
                provider_code,
                plugin_id,
                plugin_version,
                contract_version,
                protocol,
                display_name,
                source_kind,
                verification_status,
                enabled,
                install_path,
                checksum,
                signature_status,
                metadata_json,
                created_by,
                created_at,
                updated_at
            "#,
        )
        .bind(input.installation_id)
        .bind(&input.provider_code)
        .bind(&input.plugin_id)
        .bind(&input.plugin_version)
        .bind(&input.contract_version)
        .bind(&input.protocol)
        .bind(&input.display_name)
        .bind(&input.source_kind)
        .bind(input.verification_status.as_str())
        .bind(input.enabled)
        .bind(&input.install_path)
        .bind(input.checksum.as_deref())
        .bind(input.signature_status.as_deref())
        .bind(&input.metadata_json)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        map_installation(row)
    }

    async fn get_installation(
        &self,
        installation_id: Uuid,
    ) -> Result<Option<domain::PluginInstallationRecord>> {
        let row = sqlx::query(
            r#"
            select
                id,
                provider_code,
                plugin_id,
                plugin_version,
                contract_version,
                protocol,
                display_name,
                source_kind,
                verification_status,
                enabled,
                install_path,
                checksum,
                signature_status,
                metadata_json,
                created_by,
                created_at,
                updated_at
            from plugin_installations
            where id = $1
            "#,
        )
        .bind(installation_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(map_installation).transpose()
    }

    async fn list_installations(&self) -> Result<Vec<domain::PluginInstallationRecord>> {
        let rows = sqlx::query(
            r#"
            select
                id,
                provider_code,
                plugin_id,
                plugin_version,
                contract_version,
                protocol,
                display_name,
                source_kind,
                verification_status,
                enabled,
                install_path,
                checksum,
                signature_status,
                metadata_json,
                created_by,
                created_at,
                updated_at
            from plugin_installations
            order by updated_at desc, id desc
            "#,
        )
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_installation).collect()
    }

    async fn update_installation_enabled(
        &self,
        input: &UpdatePluginInstallationEnabledInput,
    ) -> Result<domain::PluginInstallationRecord> {
        let row = sqlx::query(
            r#"
            update plugin_installations
            set
                enabled = $2,
                updated_at = now()
            where id = $1
            returning
                id,
                provider_code,
                plugin_id,
                plugin_version,
                contract_version,
                protocol,
                display_name,
                source_kind,
                verification_status,
                enabled,
                install_path,
                checksum,
                signature_status,
                metadata_json,
                created_by,
                created_at,
                updated_at
            "#,
        )
        .bind(input.installation_id)
        .bind(input.enabled)
        .fetch_optional(self.pool())
        .await?;

        match row {
            Some(row) => map_installation(row),
            None => bail!(ControlPlaneError::NotFound("plugin_installation")),
        }
    }

    async fn create_assignment(
        &self,
        input: &CreatePluginAssignmentInput,
    ) -> Result<domain::PluginAssignmentRecord> {
        let row = sqlx::query(
            r#"
            insert into plugin_assignments (
                id,
                installation_id,
                workspace_id,
                provider_code,
                assigned_by
            ) values ($1, $2, $3, $4, $5)
            on conflict (workspace_id, provider_code) do update
            set
                installation_id = excluded.installation_id,
                assigned_by = excluded.assigned_by
            returning
                id,
                installation_id,
                workspace_id,
                provider_code,
                assigned_by,
                created_at
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.installation_id)
        .bind(input.workspace_id)
        .bind(&input.provider_code)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        map_assignment(row)
    }

    async fn list_assignments(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::PluginAssignmentRecord>> {
        let rows = sqlx::query(
            r#"
            select id, installation_id, workspace_id, provider_code, assigned_by, created_at
            from plugin_assignments
            where workspace_id = $1
            order by created_at desc, id desc
            "#,
        )
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_assignment).collect()
    }

    async fn create_task(&self, input: &CreatePluginTaskInput) -> Result<domain::PluginTaskRecord> {
        let row = sqlx::query(
            r#"
            insert into plugin_tasks (
                id,
                installation_id,
                workspace_id,
                provider_code,
                task_kind,
                status,
                status_message,
                detail_json,
                created_by
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            returning
                id,
                installation_id,
                workspace_id,
                provider_code,
                task_kind,
                status,
                status_message,
                detail_json,
                created_by,
                created_at,
                updated_at,
                finished_at
            "#,
        )
        .bind(input.task_id)
        .bind(input.installation_id)
        .bind(input.workspace_id)
        .bind(&input.provider_code)
        .bind(input.task_kind.as_str())
        .bind(input.status.as_str())
        .bind(input.status_message.as_deref())
        .bind(&input.detail_json)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        map_task(row)
    }

    async fn update_task_status(
        &self,
        input: &UpdatePluginTaskStatusInput,
    ) -> Result<domain::PluginTaskRecord> {
        let row = sqlx::query(
            r#"
            update plugin_tasks
            set
                status = $2,
                status_message = $3,
                detail_json = $4,
                updated_at = now(),
                finished_at = case
                    when $2 in ('success', 'failed', 'canceled', 'timed_out')
                        then coalesce(finished_at, now())
                    else null
                end
            where id = $1
            returning
                id,
                installation_id,
                workspace_id,
                provider_code,
                task_kind,
                status,
                status_message,
                detail_json,
                created_by,
                created_at,
                updated_at,
                finished_at
            "#,
        )
        .bind(input.task_id)
        .bind(input.status.as_str())
        .bind(input.status_message.as_deref())
        .bind(&input.detail_json)
        .fetch_optional(self.pool())
        .await?;

        match row {
            Some(row) => map_task(row),
            None => bail!(ControlPlaneError::NotFound("plugin_task")),
        }
    }

    async fn get_task(&self, task_id: Uuid) -> Result<Option<domain::PluginTaskRecord>> {
        let row = sqlx::query(
            r#"
            select
                id,
                installation_id,
                workspace_id,
                provider_code,
                task_kind,
                status,
                status_message,
                detail_json,
                created_by,
                created_at,
                updated_at,
                finished_at
            from plugin_tasks
            where id = $1
            "#,
        )
        .bind(task_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(map_task).transpose()
    }

    async fn list_tasks(&self) -> Result<Vec<domain::PluginTaskRecord>> {
        let rows = sqlx::query(
            r#"
            select
                id,
                installation_id,
                workspace_id,
                provider_code,
                task_kind,
                status,
                status_message,
                detail_json,
                created_by,
                created_at,
                updated_at,
                finished_at
            from plugin_tasks
            order by created_at desc, id desc
            "#,
        )
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_task).collect()
    }
}
