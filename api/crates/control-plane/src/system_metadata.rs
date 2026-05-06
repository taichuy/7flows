use anyhow::Result;
use domain::{DataModelScopeKind, ModelFieldKind, SYSTEM_SCOPE_ID};
use uuid::Uuid;

use crate::ports::{
    AddModelFieldInput, CreateModelDefinitionInput, CreateScopeDataModelGrantInput,
    ModelDefinitionRepository,
};

#[derive(Debug, Clone)]
pub struct SystemMetadataFieldTemplate {
    pub code: &'static str,
    pub title: &'static str,
    pub physical_column_name: Option<&'static str>,
    pub field_kind: ModelFieldKind,
    pub is_system: bool,
    pub is_writable: bool,
    pub apply_physical_schema: bool,
    pub is_required: bool,
    pub is_unique: bool,
}

#[derive(Debug, Clone)]
pub struct SystemMetadataModelTemplate {
    pub code: &'static str,
    pub title: &'static str,
    pub fields: Vec<SystemMetadataFieldTemplate>,
}

fn metadata_field(
    code: &'static str,
    title: &'static str,
    field_kind: ModelFieldKind,
    is_required: bool,
    is_unique: bool,
) -> SystemMetadataFieldTemplate {
    SystemMetadataFieldTemplate {
        code,
        title,
        physical_column_name: None,
        field_kind,
        is_system: false,
        is_writable: true,
        apply_physical_schema: true,
        is_required,
        is_unique,
    }
}

fn platform_metadata_field(
    code: &'static str,
    title: &'static str,
    physical_column_name: &'static str,
    field_kind: ModelFieldKind,
) -> SystemMetadataFieldTemplate {
    SystemMetadataFieldTemplate {
        code,
        title,
        physical_column_name: Some(physical_column_name),
        field_kind,
        is_system: true,
        is_writable: false,
        apply_physical_schema: false,
        is_required: true,
        is_unique: true,
    }
}

pub fn user_metadata_template() -> SystemMetadataModelTemplate {
    SystemMetadataModelTemplate {
        code: "users",
        title: "用户",
        fields: vec![
            platform_metadata_field("id", "用户 ID", "id", ModelFieldKind::String),
            metadata_field("username", "用户名", ModelFieldKind::String, true, true),
            metadata_field(
                "display_name",
                "显示名称",
                ModelFieldKind::String,
                true,
                false,
            ),
            metadata_field("email", "邮箱", ModelFieldKind::String, false, true),
            metadata_field("status", "状态", ModelFieldKind::String, true, false),
            metadata_field("role_codes", "角色", ModelFieldKind::Json, false, false),
            metadata_field(
                "created_time",
                "创建时间",
                ModelFieldKind::Datetime,
                true,
                false,
            ),
            metadata_field(
                "last_login_at",
                "最后登录时间",
                ModelFieldKind::Datetime,
                false,
                false,
            ),
        ],
    }
}

pub fn role_metadata_template() -> SystemMetadataModelTemplate {
    SystemMetadataModelTemplate {
        code: "roles",
        title: "角色",
        fields: vec![
            metadata_field("code", "角色标识", ModelFieldKind::String, true, true),
            metadata_field("name", "角色名称", ModelFieldKind::String, true, false),
            metadata_field("scope_kind", "作用域", ModelFieldKind::String, true, false),
            metadata_field(
                "is_builtin",
                "内置角色",
                ModelFieldKind::Boolean,
                true,
                false,
            ),
            metadata_field(
                "is_default_member_role",
                "默认成员角色",
                ModelFieldKind::Boolean,
                true,
                false,
            ),
            metadata_field(
                "created_time",
                "创建时间",
                ModelFieldKind::Datetime,
                true,
                false,
            ),
        ],
    }
}

pub fn system_metadata_templates() -> Vec<SystemMetadataModelTemplate> {
    vec![user_metadata_template(), role_metadata_template()]
}

pub struct SystemMetadataBootstrapService<R> {
    repository: R,
}

impl<R> SystemMetadataBootstrapService<R>
where
    R: ModelDefinitionRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn ensure_builtin_user_and_role_models(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let mut ensured = Vec::new();
        for template in system_metadata_templates() {
            ensured.push(self.ensure_template(actor_user_id, template).await?);
        }
        Ok(ensured)
    }

    async fn ensure_template(
        &self,
        actor_user_id: Uuid,
        template: SystemMetadataModelTemplate,
    ) -> Result<domain::ModelDefinitionRecord> {
        if let Some(existing) = self
            .repository
            .list_model_definitions(SYSTEM_SCOPE_ID)
            .await?
            .into_iter()
            .find(|model| {
                model.scope_kind == DataModelScopeKind::System
                    && model.scope_id == SYSTEM_SCOPE_ID
                    && model.source_kind == domain::DataModelSourceKind::MainSource
                    && model.code == template.code
            })
        {
            return self
                .ensure_existing_template(actor_user_id, existing, template)
                .await;
        }

        let model = self
            .repository
            .create_model_definition(&CreateModelDefinitionInput {
                actor_user_id,
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                data_source_instance_id: None,
                source_kind: domain::DataModelSourceKind::MainSource,
                external_resource_key: None,
                external_table_id: None,
                external_capability_snapshot: None,
                status: domain::DataModelStatus::Published,
                api_exposure_status: domain::ApiExposureStatus::PublishedNotExposed,
                protection: domain::DataModelProtection::default(),
                code: template.code.to_string(),
                title: template.title.to_string(),
            })
            .await?;

        self.ensure_template_fields(actor_user_id, model.id, &[], &template)
            .await?;

        let published = self
            .repository
            .publish_model_definition(actor_user_id, model.id)
            .await?;

        self.ensure_system_scope_grant(actor_user_id, published.id)
            .await?;

        Ok(published)
    }

    async fn ensure_existing_template(
        &self,
        actor_user_id: Uuid,
        existing: domain::ModelDefinitionRecord,
        template: SystemMetadataModelTemplate,
    ) -> Result<domain::ModelDefinitionRecord> {
        self.ensure_template_fields(actor_user_id, existing.id, &existing.fields, &template)
            .await?;

        let published = if existing.status == domain::DataModelStatus::Published {
            existing
        } else {
            self.repository
                .publish_model_definition(actor_user_id, existing.id)
                .await?
        };

        self.ensure_system_scope_grant(actor_user_id, published.id)
            .await?;

        Ok(published)
    }

    async fn ensure_template_fields(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
        existing_fields: &[domain::ModelFieldRecord],
        template: &SystemMetadataModelTemplate,
    ) -> Result<()> {
        for field in template.fields.iter().filter(|field| {
            !existing_fields
                .iter()
                .any(|existing| existing.code == field.code)
        }) {
            self.repository
                .add_model_field(&AddModelFieldInput {
                    actor_user_id,
                    model_id,
                    physical_column_name: field.physical_column_name.map(str::to_string),
                    external_field_key: None,
                    code: field.code.to_string(),
                    title: field.title.to_string(),
                    field_kind: field.field_kind,
                    is_system: field.is_system,
                    is_writable: field.is_writable,
                    apply_physical_schema: field.apply_physical_schema,
                    is_required: field.is_required,
                    is_unique: field.is_unique,
                    default_value: None,
                    display_interface: None,
                    display_options: serde_json::json!({}),
                    relation_target_model_id: None,
                    relation_options: serde_json::json!({}),
                })
                .await?;
        }

        Ok(())
    }

    async fn ensure_system_scope_grant(&self, actor_user_id: Uuid, model_id: Uuid) -> Result<()> {
        let grants = self
            .repository
            .list_scope_data_model_grants(DataModelScopeKind::System, SYSTEM_SCOPE_ID)
            .await?;
        if grants.iter().any(|grant| grant.data_model_id == model_id) {
            return Ok(());
        }

        self.repository
            .create_scope_data_model_grant(&CreateScopeDataModelGrantInput {
                grant_id: Uuid::now_v7(),
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                data_model_id: model_id,
                enabled: true,
                permission_profile: domain::ScopeDataModelPermissionProfile::ScopeAll,
                created_by: Some(actor_user_id),
            })
            .await?;

        Ok(())
    }
}
