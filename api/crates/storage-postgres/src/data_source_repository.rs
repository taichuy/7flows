use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{
        CreateDataSourceInstanceInput, CreateDataSourcePreviewSessionInput, DataSourceRepository,
        UpdateDataSourceInstanceStatusInput, UpsertDataSourceCatalogCacheInput,
        UpsertDataSourceSecretInput,
    },
};
use sqlx::Row;
use uuid::Uuid;

use crate::repositories::PgControlPlaneStore;

fn parse_instance_status(value: &str) -> Result<domain::DataSourceInstanceStatus> {
    match value {
        "draft" => Ok(domain::DataSourceInstanceStatus::Draft),
        "ready" => Ok(domain::DataSourceInstanceStatus::Ready),
        "invalid" => Ok(domain::DataSourceInstanceStatus::Invalid),
        "disabled" => Ok(domain::DataSourceInstanceStatus::Disabled),
        _ => Err(ControlPlaneError::InvalidInput("data_source_instance.status").into()),
    }
}

fn parse_refresh_status(value: &str) -> Result<domain::DataSourceCatalogRefreshStatus> {
    match value {
        "idle" => Ok(domain::DataSourceCatalogRefreshStatus::Idle),
        "ready" => Ok(domain::DataSourceCatalogRefreshStatus::Ready),
        "failed" => Ok(domain::DataSourceCatalogRefreshStatus::Failed),
        _ => Err(ControlPlaneError::InvalidInput("data_source_catalog.refresh_status").into()),
    }
}

fn map_instance(row: sqlx::postgres::PgRow) -> Result<domain::DataSourceInstanceRecord> {
    Ok(domain::DataSourceInstanceRecord {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        installation_id: row.get("installation_id"),
        source_code: row.get("source_code"),
        display_name: row.get("display_name"),
        status: parse_instance_status(row.get::<String, _>("status").as_str())?,
        config_json: row.get("config_json"),
        metadata_json: row.get("metadata_json"),
        created_by: row.get("created_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_secret(row: sqlx::postgres::PgRow) -> Result<domain::DataSourceSecretRecord> {
    Ok(domain::DataSourceSecretRecord {
        data_source_instance_id: row.get("data_source_instance_id"),
        encrypted_secret_json: row.get("encrypted_secret_json"),
        secret_version: row.get("secret_version"),
        updated_at: row.get("updated_at"),
    })
}

fn map_catalog_cache(row: sqlx::postgres::PgRow) -> Result<domain::DataSourceCatalogCacheRecord> {
    Ok(domain::DataSourceCatalogCacheRecord {
        data_source_instance_id: row.get("data_source_instance_id"),
        refresh_status: parse_refresh_status(row.get::<String, _>("refresh_status").as_str())?,
        catalog_json: row.get("catalog_json"),
        last_error_message: row.get("last_error_message"),
        refreshed_at: row.get("refreshed_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_preview_session(
    row: sqlx::postgres::PgRow,
) -> Result<domain::DataSourcePreviewSessionRecord> {
    Ok(domain::DataSourcePreviewSessionRecord {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        actor_user_id: row.get("actor_user_id"),
        data_source_instance_id: row.get("data_source_instance_id"),
        config_fingerprint: row.get("config_fingerprint"),
        preview_json: row.get("preview_json"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
    })
}

#[async_trait]
impl DataSourceRepository for PgControlPlaneStore {
    async fn create_instance(
        &self,
        input: &CreateDataSourceInstanceInput,
    ) -> Result<domain::DataSourceInstanceRecord> {
        let row = sqlx::query(
            r#"
            insert into data_source_instances (
                id,
                workspace_id,
                installation_id,
                source_code,
                display_name,
                status,
                config_json,
                metadata_json,
                created_by
            ) values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9
            )
            returning
                id,
                workspace_id,
                installation_id,
                source_code,
                display_name,
                status,
                config_json,
                metadata_json,
                created_by,
                created_at,
                updated_at
            "#,
        )
        .bind(input.instance_id)
        .bind(input.workspace_id)
        .bind(input.installation_id)
        .bind(&input.source_code)
        .bind(&input.display_name)
        .bind(input.status.as_str())
        .bind(&input.config_json)
        .bind(&input.metadata_json)
        .bind(input.created_by)
        .fetch_one(self.pool())
        .await?;

        map_instance(row)
    }

    async fn update_instance_status(
        &self,
        input: &UpdateDataSourceInstanceStatusInput,
    ) -> Result<domain::DataSourceInstanceRecord> {
        let row = sqlx::query(
            r#"
            update data_source_instances
            set
                status = $3,
                metadata_json = $4,
                updated_at = now()
            where workspace_id = $1
              and id = $2
            returning
                id,
                workspace_id,
                installation_id,
                source_code,
                display_name,
                status,
                config_json,
                metadata_json,
                created_by,
                created_at,
                updated_at
            "#,
        )
        .bind(input.workspace_id)
        .bind(input.instance_id)
        .bind(input.status.as_str())
        .bind(&input.metadata_json)
        .fetch_one(self.pool())
        .await?;

        map_instance(row)
    }

    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<Option<domain::DataSourceInstanceRecord>> {
        let row = sqlx::query(
            r#"
            select
                id,
                workspace_id,
                installation_id,
                source_code,
                display_name,
                status,
                config_json,
                metadata_json,
                created_by,
                created_at,
                updated_at
            from data_source_instances
            where workspace_id = $1
              and id = $2
            "#,
        )
        .bind(workspace_id)
        .bind(instance_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(map_instance).transpose()
    }

    async fn upsert_secret(
        &self,
        input: &UpsertDataSourceSecretInput,
    ) -> Result<domain::DataSourceSecretRecord> {
        let row = sqlx::query(
            r#"
            insert into data_source_secrets (
                data_source_instance_id,
                encrypted_secret_json,
                secret_version
            ) values (
                $1, $2, $3
            )
            on conflict (data_source_instance_id) do update
            set
                encrypted_secret_json = excluded.encrypted_secret_json,
                secret_version = excluded.secret_version,
                updated_at = now()
            returning
                data_source_instance_id,
                encrypted_secret_json,
                secret_version,
                updated_at
            "#,
        )
        .bind(input.data_source_instance_id)
        .bind(&input.secret_json)
        .bind(input.secret_version)
        .fetch_one(self.pool())
        .await?;

        map_secret(row)
    }

    async fn get_secret_json(&self, instance_id: Uuid) -> Result<Option<serde_json::Value>> {
        let row = sqlx::query(
            r#"
            select encrypted_secret_json
            from data_source_secrets
            where data_source_instance_id = $1
            "#,
        )
        .bind(instance_id)
        .fetch_optional(self.pool())
        .await?;

        Ok(row.map(|row| row.get("encrypted_secret_json")))
    }

    async fn upsert_catalog_cache(
        &self,
        input: &UpsertDataSourceCatalogCacheInput,
    ) -> Result<domain::DataSourceCatalogCacheRecord> {
        let row = sqlx::query(
            r#"
            insert into data_source_catalog_caches (
                data_source_instance_id,
                refresh_status,
                catalog_json,
                last_error_message,
                refreshed_at
            ) values (
                $1, $2, $3, $4, $5
            )
            on conflict (data_source_instance_id) do update
            set
                refresh_status = excluded.refresh_status,
                catalog_json = excluded.catalog_json,
                last_error_message = excluded.last_error_message,
                refreshed_at = excluded.refreshed_at,
                updated_at = now()
            returning
                data_source_instance_id,
                refresh_status,
                catalog_json,
                last_error_message,
                refreshed_at,
                updated_at
            "#,
        )
        .bind(input.data_source_instance_id)
        .bind(input.refresh_status.as_str())
        .bind(&input.catalog_json)
        .bind(input.last_error_message.as_deref())
        .bind(input.refreshed_at)
        .fetch_one(self.pool())
        .await?;

        map_catalog_cache(row)
    }

    async fn create_preview_session(
        &self,
        input: &CreateDataSourcePreviewSessionInput,
    ) -> Result<domain::DataSourcePreviewSessionRecord> {
        let row = sqlx::query(
            r#"
            insert into data_source_preview_sessions (
                id,
                workspace_id,
                actor_user_id,
                data_source_instance_id,
                config_fingerprint,
                preview_json,
                expires_at
            ) values (
                $1, $2, $3, $4, $5, $6, $7
            )
            returning
                id,
                workspace_id,
                actor_user_id,
                data_source_instance_id,
                config_fingerprint,
                preview_json,
                expires_at,
                created_at
            "#,
        )
        .bind(input.session_id)
        .bind(input.workspace_id)
        .bind(input.actor_user_id)
        .bind(input.data_source_instance_id)
        .bind(&input.config_fingerprint)
        .bind(&input.preview_json)
        .bind(input.expires_at)
        .fetch_one(self.pool())
        .await?;

        map_preview_session(row)
    }
}
