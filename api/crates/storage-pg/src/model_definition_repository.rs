use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{AuthRepository, CreateModelDefinitionInput, ModelDefinitionRepository},
};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::{
        model_definition_mapper::{PgModelDefinitionMapper, StoredModelDefinitionRow},
        model_field_mapper::{PgModelFieldMapper, StoredModelFieldRow},
    },
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
        let fields_by_model_id = load_fields_by_model_id(self.pool()).await?;
        let rows = sqlx::query(
            r#"
            select id, scope_kind, scope_id, code, title, physical_table_name, acl_namespace, audit_namespace
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
                    scope_kind: row.get("scope_kind"),
                    scope_id: row.get("scope_id"),
                    code: row.get("code"),
                    title: row.get("title"),
                    physical_table_name: row.get("physical_table_name"),
                    acl_namespace: row.get("acl_namespace"),
                    audit_namespace: row.get("audit_namespace"),
                    fields: fields_by_model_id
                        .get(&row.get::<Uuid, _>("id"))
                        .cloned()
                        .unwrap_or_default(),
                })
            })
            .collect())
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let physical_table_name = build_physical_table_name(input.scope_kind, &input.code);
        let row = sqlx::query(
            r#"
            insert into model_definitions (
                id, scope_kind, scope_id, code, title, physical_table_name, acl_namespace, audit_namespace, created_by, updated_by
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
            returning id, scope_kind, scope_id, code, title, physical_table_name, acl_namespace, audit_namespace
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(input.scope_kind.as_str())
        .bind(input.scope_id)
        .bind(&input.code)
        .bind(&input.title)
        .bind(&physical_table_name)
        .bind(format!("state_model.{}", input.code))
        .bind(format!("audit.state_model.{}", input.code))
        .bind(nullable_actor_user_id(input.actor_user_id))
        .fetch_one(self.pool())
        .await?;

        Ok(PgModelDefinitionMapper::to_model_definition_record(
            StoredModelDefinitionRow {
                id: row.get("id"),
                scope_kind: row.get("scope_kind"),
                scope_id: row.get("scope_id"),
                code: row.get("code"),
                title: row.get("title"),
                physical_table_name: row.get("physical_table_name"),
                acl_namespace: row.get("acl_namespace"),
                audit_namespace: row.get("audit_namespace"),
                fields: vec![],
            },
        ))
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<domain::ModelDefinitionRecord> {
        let fields_by_model_id = load_fields_by_model_id(self.pool()).await?;
        let row = sqlx::query(
            r#"
            select id, scope_kind, scope_id, code, title, physical_table_name, acl_namespace, audit_namespace
            from model_definitions
            where id = $1
            "#,
        )
        .bind(model_id)
        .fetch_optional(self.pool())
        .await?
        .ok_or(ControlPlaneError::NotFound("model_definition"))?;

        Ok(PgModelDefinitionMapper::to_model_definition_record(
            StoredModelDefinitionRow {
                id: row.get("id"),
                scope_kind: row.get("scope_kind"),
                scope_id: row.get("scope_id"),
                code: row.get("code"),
                title: row.get("title"),
                physical_table_name: row.get("physical_table_name"),
                acl_namespace: row.get("acl_namespace"),
                audit_namespace: row.get("audit_namespace"),
                fields: fields_by_model_id
                    .get(&model_id)
                    .cloned()
                    .unwrap_or_default(),
            },
        ))
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        AuthRepository::append_audit_log(self, event).await
    }
}

async fn load_fields_by_model_id(
    pool: &sqlx::PgPool,
) -> Result<HashMap<Uuid, Vec<domain::ModelFieldRecord>>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            data_model_id,
            code,
            title,
            physical_column_name,
            field_kind,
            is_required,
            is_unique,
            default_value,
            display_interface,
            display_options,
            relation_target_model_id,
            relation_options,
            sort_order
        from model_fields
        order by data_model_id asc, sort_order asc, created_at asc
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut fields_by_model_id = HashMap::new();
    for row in rows {
        let field = PgModelFieldMapper::to_model_field_record(StoredModelFieldRow {
            id: row.get("id"),
            data_model_id: row.get("data_model_id"),
            code: row.get("code"),
            title: row.get("title"),
            physical_column_name: row.get("physical_column_name"),
            field_kind: row.get("field_kind"),
            is_required: row.get("is_required"),
            is_unique: row.get("is_unique"),
            default_value: row.get("default_value"),
            display_interface: row.get("display_interface"),
            display_options: row.get("display_options"),
            relation_target_model_id: row.get("relation_target_model_id"),
            relation_options: row.get("relation_options"),
            sort_order: row.get("sort_order"),
        });
        fields_by_model_id
            .entry(field.data_model_id)
            .or_insert_with(Vec::new)
            .push(field);
    }

    Ok(fields_by_model_id)
}

fn build_physical_table_name(scope_kind: domain::DataModelScopeKind, code: &str) -> String {
    let prefix = match scope_kind {
        domain::DataModelScopeKind::Team => "team",
        domain::DataModelScopeKind::App => "app",
    };
    let suffix = Uuid::now_v7().simple().to_string();
    let sanitized_code = code.replace('-', "_");

    format!("rtm_{prefix}_{}_{}", &suffix[..8], sanitized_code)
}

fn nullable_actor_user_id(actor_user_id: Uuid) -> Option<Uuid> {
    (!actor_user_id.is_nil()).then_some(actor_user_id)
}
