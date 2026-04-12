use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{AuthRepository, CreateModelDefinitionInput, ModelDefinitionRepository},
};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::model_definition_mapper::{PgModelDefinitionMapper, StoredModelDefinitionRow},
    repositories::{team_id_for_user, PgControlPlaneStore},
};

#[async_trait]
impl ModelDefinitionRepository for PgControlPlaneStore {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        let team_id = team_id_for_user(self.pool(), actor_user_id).await?;
        AuthRepository::load_actor_context(self, actor_user_id, team_id, None).await
    }

    async fn list_model_definitions(&self) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let rows = sqlx::query(
            r#"
            select id, code, name, status, published_version
            from model_definitions
            order by created_at asc
            "#,
        )
        .fetch_all(self.pool())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                PgModelDefinitionMapper::to_model_definition_record(StoredModelDefinitionRow {
                    id: row.get("id"),
                    code: row.get("code"),
                    name: row.get("name"),
                    status: row.get("status"),
                    published_version: row.get("published_version"),
                })
            })
            .collect())
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let row = sqlx::query(
            r#"
            insert into model_definitions (
                id, code, name, status, published_version, created_by, updated_by
            )
            values ($1, $2, $3, 'draft', null, $4, $4)
            returning id, code, name, status, published_version
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(&input.code)
        .bind(&input.name)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        Ok(PgModelDefinitionMapper::to_model_definition_record(
            StoredModelDefinitionRow {
                id: row.get("id"),
                code: row.get("code"),
                name: row.get("name"),
                status: row.get("status"),
                published_version: row.get("published_version"),
            },
        ))
    }

    async fn publish_model_definition(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<domain::ModelDefinitionRecord> {
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            r#"
            select id, code, name, status, published_version
            from model_definitions
            where id = $1
            for update
            "#,
        )
        .bind(model_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ControlPlaneError::NotFound("model_definition"))?;

        let next_version = row.get::<Option<i64>, _>("published_version").unwrap_or(0) + 1;
        let code: String = row.get("code");
        let name: String = row.get("name");

        sqlx::query(
            r#"
            insert into model_definition_versions (id, model_id, version, payload, created_by)
            values ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(model_id)
        .bind(next_version)
        .bind(serde_json::json!({
            "code": code,
            "name": name,
        }))
        .bind(actor_user_id)
        .execute(&mut *tx)
        .await?;

        let updated = sqlx::query(
            r#"
            update model_definitions
            set status = 'published',
                published_version = $2,
                updated_by = $3,
                updated_at = now()
            where id = $1
            returning id, code, name, status, published_version
            "#,
        )
        .bind(model_id)
        .bind(next_version)
        .bind(actor_user_id)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(PgModelDefinitionMapper::to_model_definition_record(
            StoredModelDefinitionRow {
                id: updated.get("id"),
                code: updated.get("code"),
                name: updated.get("name"),
                status: updated.get("status"),
                published_version: updated.get("published_version"),
            },
        ))
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        AuthRepository::append_audit_log(self, event).await
    }
}
