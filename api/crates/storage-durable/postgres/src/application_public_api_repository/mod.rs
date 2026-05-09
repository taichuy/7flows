use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    application_public_api::{
        mapping::ApplicationApiMappingConfig, publications::ApplicationPublicationVersionRecord,
    },
    errors::ControlPlaneError,
    ports::{
        ApplicationApiMappingRepository, ApplicationPublicationRepository,
        CreateApplicationPublicationVersionInput, ReplaceApplicationApiMappingInput,
        SetApplicationApiEnabledInput,
    },
};
use sqlx::Row;
use uuid::Uuid;

use crate::repositories::PgControlPlaneStore;

#[async_trait]
impl ApplicationApiMappingRepository for PgControlPlaneStore {
    async fn get_application_api_mapping(
        &self,
        application_id: Uuid,
    ) -> Result<Option<ApplicationApiMappingConfig>> {
        let mapping = sqlx::query_scalar::<_, serde_json::Value>(
            "select mapping_config from application_api_mappings where application_id = $1",
        )
        .bind(application_id)
        .fetch_optional(self.pool())
        .await?
        .map(serde_json::from_value)
        .transpose()?;

        Ok(mapping)
    }

    async fn replace_application_api_mapping(
        &self,
        input: &ReplaceApplicationApiMappingInput,
    ) -> Result<ApplicationApiMappingConfig> {
        let mapping = serde_json::to_value(&input.mapping)?;
        let row = sqlx::query_scalar::<_, serde_json::Value>(
            r#"
            insert into application_api_mappings (
                application_id,
                mapping_config,
                updated_by
            ) values ($1, $2, $3)
            on conflict (application_id) do update
            set mapping_config = excluded.mapping_config,
                updated_by = excluded.updated_by,
                updated_at = now()
            returning mapping_config
            "#,
        )
        .bind(input.application_id)
        .bind(mapping)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        serde_json::from_value(row).map_err(Into::into)
    }
}

#[async_trait]
impl ApplicationPublicationRepository for PgControlPlaneStore {
    async fn create_active_application_publication_version(
        &self,
        input: &CreateApplicationPublicationVersionInput,
    ) -> Result<ApplicationPublicationVersionRecord> {
        let mut tx = self.pool().begin().await?;
        let updated_application = sqlx::query(
            "update applications set api_enabled = $2, updated_by = $3, updated_at = now() where id = $1",
        )
        .bind(input.application_id)
        .bind(input.api_enabled)
        .bind(input.actor_user_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if updated_application == 0 {
            return Err(ControlPlaneError::NotFound("application").into());
        }

        sqlx::query(
            "update application_publication_versions set active = false where application_id = $1 and active = true",
        )
        .bind(input.application_id)
        .execute(&mut *tx)
        .await?;

        let version_sequence = sqlx::query_scalar::<_, i64>(
            "select coalesce(max(version_sequence), 0) + 1 from application_publication_versions where application_id = $1",
        )
        .bind(input.application_id)
        .fetch_one(&mut *tx)
        .await?;

        let row = sqlx::query(
            r#"
            insert into application_publication_versions (
                id,
                application_id,
                flow_id,
                flow_version_id,
                compiled_plan_id,
                version_sequence,
                active,
                api_enabled,
                flow_schema_version,
                document_hash,
                document_snapshot,
                mapping_snapshot,
                runtime_profile_snapshot,
                output_selector,
                created_by
            ) values (
                $1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13, $14
            )
            returning
                id,
                application_id,
                flow_id,
                flow_version_id,
                compiled_plan_id,
                version_sequence,
                active,
                api_enabled,
                flow_schema_version,
                document_hash,
                document_snapshot,
                mapping_snapshot,
                runtime_profile_snapshot,
                output_selector,
                created_by,
                created_at
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.application_id)
        .bind(input.flow_id)
        .bind(input.flow_version_id)
        .bind(input.compiled_plan_id)
        .bind(version_sequence)
        .bind(input.api_enabled)
        .bind(&input.flow_schema_version)
        .bind(&input.document_hash)
        .bind(&input.document_snapshot)
        .bind(serde_json::to_value(&input.mapping_snapshot)?)
        .bind(&input.runtime_profile_snapshot)
        .bind(&input.output_selector)
        .bind(input.actor_user_id)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        map_publication_row(row)
    }

    async fn get_application_publication_version(
        &self,
        publication_id: Uuid,
    ) -> Result<Option<ApplicationPublicationVersionRecord>> {
        let row = sqlx::query(publication_select_sql("where id = $1").as_str())
            .bind(publication_id)
            .fetch_optional(self.pool())
            .await?;

        row.map(map_publication_row).transpose()
    }

    async fn list_application_publication_versions(
        &self,
        application_id: Uuid,
    ) -> Result<Vec<ApplicationPublicationVersionRecord>> {
        let rows = sqlx::query(
            publication_select_sql(
                "where application_id = $1 order by version_sequence desc, id desc",
            )
            .as_str(),
        )
        .bind(application_id)
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_publication_row).collect()
    }

    async fn load_active_application_publication(
        &self,
        application_id: Uuid,
    ) -> Result<Option<ApplicationPublicationVersionRecord>> {
        let row = sqlx::query(
            publication_select_sql("where application_id = $1 and active = true").as_str(),
        )
        .bind(application_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(map_publication_row).transpose()
    }

    async fn set_application_api_enabled(
        &self,
        input: &SetApplicationApiEnabledInput,
    ) -> Result<()> {
        let mut tx = self.pool().begin().await?;
        let updated_application = sqlx::query(
            "update applications set api_enabled = $2, updated_by = $3, updated_at = now() where id = $1",
        )
        .bind(input.application_id)
        .bind(input.api_enabled)
        .bind(input.actor_user_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if updated_application == 0 {
            return Err(ControlPlaneError::NotFound("application").into());
        }

        sqlx::query(
            "update application_publication_versions set api_enabled = $2 where application_id = $1 and active = true",
        )
        .bind(input.application_id)
        .bind(input.api_enabled)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
}

fn publication_select_sql(predicate: &str) -> String {
    format!(
        r#"
        select
            id,
            application_id,
            flow_id,
            flow_version_id,
            compiled_plan_id,
            version_sequence,
            active,
            api_enabled,
            flow_schema_version,
            document_hash,
            document_snapshot,
            mapping_snapshot,
            runtime_profile_snapshot,
            output_selector,
            created_by,
            created_at
        from application_publication_versions
        {predicate}
        "#
    )
}

fn map_publication_row(row: sqlx::postgres::PgRow) -> Result<ApplicationPublicationVersionRecord> {
    Ok(ApplicationPublicationVersionRecord {
        id: row.get("id"),
        application_id: row.get("application_id"),
        flow_id: row.get("flow_id"),
        flow_version_id: row.get("flow_version_id"),
        compiled_plan_id: row.get("compiled_plan_id"),
        version_sequence: row.get("version_sequence"),
        active: row.get("active"),
        api_enabled: row.get("api_enabled"),
        flow_schema_version: row.get("flow_schema_version"),
        document_hash: row.get("document_hash"),
        document_snapshot: row.get("document_snapshot"),
        mapping_snapshot: serde_json::from_value(row.get("mapping_snapshot"))?,
        runtime_profile_snapshot: row.get("runtime_profile_snapshot"),
        output_selector: row.get("output_selector"),
        created_by: row.get("created_by"),
        created_at: row.get("created_at"),
    })
}
