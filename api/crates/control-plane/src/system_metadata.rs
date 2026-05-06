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
    pub field_kind: ModelFieldKind,
    pub is_required: bool,
    pub is_unique: bool,
}

#[derive(Debug, Clone)]
pub struct SystemMetadataModelTemplate {
    pub code: &'static str,
    pub title: &'static str,
    pub fields: Vec<SystemMetadataFieldTemplate>,
}

pub fn user_metadata_template() -> SystemMetadataModelTemplate {
    SystemMetadataModelTemplate {
        code: "users",
        title: "用户",
        fields: vec![
            SystemMetadataFieldTemplate {
                code: "username",
                title: "用户名",
                field_kind: ModelFieldKind::String,
                is_required: true,
                is_unique: true,
            },
            SystemMetadataFieldTemplate {
                code: "display_name",
                title: "显示名称",
                field_kind: ModelFieldKind::String,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "email",
                title: "邮箱",
                field_kind: ModelFieldKind::String,
                is_required: false,
                is_unique: true,
            },
            SystemMetadataFieldTemplate {
                code: "status",
                title: "状态",
                field_kind: ModelFieldKind::String,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "role_codes",
                title: "角色",
                field_kind: ModelFieldKind::Json,
                is_required: false,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "created_time",
                title: "创建时间",
                field_kind: ModelFieldKind::Datetime,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "last_login_at",
                title: "最后登录时间",
                field_kind: ModelFieldKind::Datetime,
                is_required: false,
                is_unique: false,
            },
        ],
    }
}

pub fn role_metadata_template() -> SystemMetadataModelTemplate {
    SystemMetadataModelTemplate {
        code: "roles",
        title: "角色",
        fields: vec![
            SystemMetadataFieldTemplate {
                code: "code",
                title: "角色标识",
                field_kind: ModelFieldKind::String,
                is_required: true,
                is_unique: true,
            },
            SystemMetadataFieldTemplate {
                code: "name",
                title: "角色名称",
                field_kind: ModelFieldKind::String,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "scope_kind",
                title: "作用域",
                field_kind: ModelFieldKind::String,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "is_builtin",
                title: "内置角色",
                field_kind: ModelFieldKind::Boolean,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "is_default_member_role",
                title: "默认成员角色",
                field_kind: ModelFieldKind::Boolean,
                is_required: true,
                is_unique: false,
            },
            SystemMetadataFieldTemplate {
                code: "created_time",
                title: "创建时间",
                field_kind: ModelFieldKind::Datetime,
                is_required: true,
                is_unique: false,
            },
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
                    external_field_key: None,
                    code: field.code.to_string(),
                    title: field.title.to_string(),
                    field_kind: field.field_kind,
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
