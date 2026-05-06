use control_plane::model_definition::{
    AddModelFieldCommand, CreateModelDefinitionCommand, CreateScopeDataModelGrantCommand,
    DeleteModelDefinitionCommand, DeleteModelFieldCommand, DeleteScopeDataModelGrantCommand,
    InMemoryModelDefinitionRepository, ModelDefinitionService, PublishModelCommand,
    UpdateModelDefinitionStatusCommand, UpdateModelFieldCommand, UpdateScopeDataModelGrantCommand,
};
use control_plane::ports::{
    AddModelFieldInput, ApiKeyDataModelReadinessRecord, CreateModelDefinitionInput,
    CreateScopeDataModelGrantInput, ModelDefinitionRepository, UpdateModelDefinitionInput,
    UpdateModelDefinitionStatusInput, UpdateModelFieldInput, UpdateScopeDataModelGrantInput,
};
use domain::{
    ActorContext, ApiExposureStatus, AuditLogRecord, DataModelOwnerKind, DataModelProtection,
    DataModelScopeKind, DataModelStatus, DataSourceDefaults, ModelDefinitionRecord, ModelFieldKind,
    ModelFieldRecord, ScopeDataModelGrantRecord, SYSTEM_SCOPE_ID,
};
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

#[derive(Clone)]
struct ScopedModelDefinitionRepository {
    actor: ActorContext,
    models: Arc<Mutex<HashMap<Uuid, ModelDefinitionRecord>>>,
    data_source_defaults: Arc<Mutex<HashMap<(Uuid, Uuid), DataSourceDefaults>>>,
    grants: Arc<Mutex<Vec<ScopeDataModelGrantRecord>>>,
    api_key_readiness: Arc<Mutex<Vec<ApiKeyDataModelReadinessRecord>>>,
    audit_logs: Arc<Mutex<Vec<AuditLogRecord>>>,
}

impl ScopedModelDefinitionRepository {
    fn new(actor: ActorContext) -> Self {
        Self {
            actor,
            models: Arc::default(),
            data_source_defaults: Arc::default(),
            grants: Arc::default(),
            api_key_readiness: Arc::default(),
            audit_logs: Arc::default(),
        }
    }

    fn with_model(self, model: ModelDefinitionRecord) -> Self {
        self.models
            .lock()
            .expect("model lock poisoned")
            .insert(model.id, model);
        self
    }

    fn with_grant(self, grant: ScopeDataModelGrantRecord) -> Self {
        self.grants.lock().expect("grant lock poisoned").push(grant);
        self
    }

    fn with_data_source_defaults(
        self,
        workspace_id: Uuid,
        data_source_instance_id: Uuid,
        defaults: DataSourceDefaults,
    ) -> Self {
        self.data_source_defaults
            .lock()
            .expect("data source defaults lock poisoned")
            .insert((workspace_id, data_source_instance_id), defaults);
        self
    }

    fn audit_events(&self) -> Vec<String> {
        self.audit_logs
            .lock()
            .expect("audit log lock poisoned")
            .iter()
            .map(|event| event.event_code.clone())
            .collect()
    }
}

#[async_trait::async_trait]
impl ModelDefinitionRepository for ScopedModelDefinitionRepository {
    async fn load_actor_context_for_user(
        &self,
        _actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext> {
        Ok(self.actor.clone())
    }

    async fn list_model_definitions(
        &self,
        _workspace_id: Uuid,
    ) -> anyhow::Result<Vec<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .values()
            .cloned()
            .collect())
    }

    async fn get_model_definition(
        &self,
        workspace_id: Uuid,
        model_id: Uuid,
    ) -> anyhow::Result<Option<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .get(&model_id)
            .filter(|model| {
                workspace_id.is_nil()
                    || !matches!(model.scope_kind, DataModelScopeKind::Workspace)
                    || model.scope_id == workspace_id
            })
            .cloned())
    }

    async fn get_data_source_defaults(
        &self,
        workspace_id: Uuid,
        data_source_instance_id: Uuid,
    ) -> anyhow::Result<DataSourceDefaults> {
        self.data_source_defaults
            .lock()
            .expect("data source defaults lock poisoned")
            .get(&(workspace_id, data_source_instance_id))
            .copied()
            .ok_or_else(|| {
                control_plane::errors::ControlPlaneError::NotFound("data_source_instance").into()
            })
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> anyhow::Result<ModelDefinitionRecord> {
        let model = ModelDefinitionRecord {
            id: Uuid::now_v7(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            data_source_instance_id: input.data_source_instance_id,
            source_kind: input.source_kind,
            external_resource_key: input.external_resource_key.clone(),
            external_table_id: input.external_table_id.clone(),
            external_capability_snapshot: input.external_capability_snapshot.clone(),
            code: input.code.clone(),
            title: input.title.clone(),
            physical_table_name: format!("rtm_workspace_{}", input.code),
            acl_namespace: format!("state_model.{}", input.code),
            audit_namespace: format!("audit.state_model.{}", input.code),
            fields: vec![],
            availability_status: domain::MetadataAvailabilityStatus::Available,
            status: input.status,
            api_exposure_status: input.api_exposure_status,
            protection: input.protection.clone(),
        };
        self.models
            .lock()
            .expect("model lock poisoned")
            .insert(model.id, model.clone());
        Ok(model)
    }

    async fn update_model_definition(
        &self,
        input: &UpdateModelDefinitionInput,
    ) -> anyhow::Result<ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models.get_mut(&input.model_id).ok_or(
            control_plane::errors::ControlPlaneError::NotFound("model_definition"),
        )?;
        model.title = input.title.clone();
        Ok(model.clone())
    }

    async fn update_model_definition_status(
        &self,
        input: &UpdateModelDefinitionStatusInput,
    ) -> anyhow::Result<ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .filter(|model| {
                input.workspace_id.is_nil()
                    || !matches!(model.scope_kind, DataModelScopeKind::Workspace)
                    || model.scope_id == input.workspace_id
            })
            .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                "model_definition",
            ))?;
        model.status = input.status;
        model.api_exposure_status = input.api_exposure_status;
        Ok(model.clone())
    }

    async fn add_model_field(
        &self,
        _input: &AddModelFieldInput,
    ) -> anyhow::Result<ModelFieldRecord> {
        unimplemented!("not needed for scoped service tests")
    }

    async fn update_model_field(
        &self,
        input: &UpdateModelFieldInput,
    ) -> anyhow::Result<ModelFieldRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models.get_mut(&input.model_id).ok_or(
            control_plane::errors::ControlPlaneError::NotFound("model_definition"),
        )?;
        let field = model
            .fields
            .iter_mut()
            .find(|field| field.id == input.field_id)
            .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                "model_field",
            ))?;
        field.title = input.title.clone();
        field.is_required = input.is_required;
        field.is_unique = input.is_unique;
        field.default_value = input.default_value.clone();
        field.display_interface = input.display_interface.clone();
        field.display_options = input.display_options.clone();
        field.relation_options = input.relation_options.clone();
        Ok(field.clone())
    }

    async fn delete_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> anyhow::Result<()> {
        self.models
            .lock()
            .expect("model lock poisoned")
            .remove(&model_id)
            .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                "model_definition",
            ))?;
        Ok(())
    }

    async fn delete_model_field(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
        field_id: Uuid,
    ) -> anyhow::Result<()> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model =
            models
                .get_mut(&model_id)
                .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                    "model_definition",
                ))?;
        let original_len = model.fields.len();
        model.fields.retain(|field| field.id != field_id);
        if model.fields.len() == original_len {
            return Err(control_plane::errors::ControlPlaneError::NotFound("model_field").into());
        }
        Ok(())
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> anyhow::Result<ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model =
            models
                .get_mut(&model_id)
                .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                    "model_definition",
                ))?;
        model.status = DataModelStatus::Published;
        Ok(model.clone())
    }

    async fn create_scope_data_model_grant(
        &self,
        input: &CreateScopeDataModelGrantInput,
    ) -> anyhow::Result<ScopeDataModelGrantRecord> {
        let now = time::OffsetDateTime::now_utc();
        let grant = ScopeDataModelGrantRecord {
            id: input.grant_id,
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            data_model_id: input.data_model_id,
            enabled: input.enabled,
            permission_profile: input.permission_profile,
            created_by: input.created_by,
            created_at: now,
            updated_at: now,
        };
        self.grants
            .lock()
            .expect("grant lock poisoned")
            .push(grant.clone());
        Ok(grant)
    }

    async fn update_scope_data_model_grant(
        &self,
        input: &UpdateScopeDataModelGrantInput,
    ) -> anyhow::Result<ScopeDataModelGrantRecord> {
        let mut grants = self.grants.lock().expect("grant lock poisoned");
        let grant = grants
            .iter_mut()
            .find(|grant| grant.id == input.grant_id && grant.data_model_id == input.data_model_id)
            .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                "scope_data_model_grant",
            ))?;
        grant.enabled = input.enabled;
        grant.permission_profile = input.permission_profile;
        grant.updated_at = time::OffsetDateTime::now_utc();
        Ok(grant.clone())
    }

    async fn delete_scope_data_model_grant(
        &self,
        data_model_id: Uuid,
        grant_id: Uuid,
    ) -> anyhow::Result<ScopeDataModelGrantRecord> {
        let mut grants = self.grants.lock().expect("grant lock poisoned");
        let index = grants
            .iter()
            .position(|grant| grant.id == grant_id && grant.data_model_id == data_model_id)
            .ok_or(control_plane::errors::ControlPlaneError::NotFound(
                "scope_data_model_grant",
            ))?;
        Ok(grants.remove(index))
    }

    async fn get_scope_data_model_grant(
        &self,
        data_model_id: Uuid,
        grant_id: Uuid,
    ) -> anyhow::Result<Option<ScopeDataModelGrantRecord>> {
        Ok(self
            .grants
            .lock()
            .expect("grant lock poisoned")
            .iter()
            .find(|grant| grant.id == grant_id && grant.data_model_id == data_model_id)
            .cloned())
    }

    async fn list_scope_data_model_grants(
        &self,
        scope_kind: DataModelScopeKind,
        scope_id: Uuid,
    ) -> anyhow::Result<Vec<ScopeDataModelGrantRecord>> {
        Ok(self
            .grants
            .lock()
            .expect("grant lock poisoned")
            .iter()
            .filter(|grant| grant.scope_kind == scope_kind && grant.scope_id == scope_id)
            .cloned()
            .collect())
    }

    async fn list_api_key_data_model_readiness(
        &self,
        data_model_id: Uuid,
    ) -> anyhow::Result<Vec<ApiKeyDataModelReadinessRecord>> {
        Ok(self
            .api_key_readiness
            .lock()
            .expect("api key readiness lock poisoned")
            .iter()
            .filter(|readiness| readiness.data_model_id == data_model_id)
            .cloned()
            .collect())
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()> {
        self.audit_logs
            .lock()
            .expect("audit log lock poisoned")
            .push(event.clone());
        Ok(())
    }
}

fn actor_in_workspace(actor_user_id: Uuid, workspace_id: Uuid) -> ActorContext {
    ActorContext::root(actor_user_id, workspace_id, "root")
}

fn scoped_manager_in_workspace(actor_user_id: Uuid, workspace_id: Uuid) -> ActorContext {
    ActorContext::scoped(
        actor_user_id,
        workspace_id,
        "manager",
        [
            "state_model.view.all".into(),
            "state_model.manage.all".into(),
        ],
    )
}

fn system_model(model_id: Uuid) -> ModelDefinitionRecord {
    ModelDefinitionRecord {
        id: model_id,
        scope_kind: DataModelScopeKind::System,
        scope_id: SYSTEM_SCOPE_ID,
        code: "system_orders".into(),
        title: "System Orders".into(),
        physical_table_name: "rtm_system_orders".into(),
        acl_namespace: "state_model.system_orders".into(),
        audit_namespace: "audit.state_model.system_orders".into(),
        fields: vec![],
        availability_status: domain::MetadataAvailabilityStatus::Available,
        data_source_instance_id: None,
        source_kind: domain::DataModelSourceKind::MainSource,
        external_resource_key: None,
        external_table_id: None,
        external_capability_snapshot: None,
        status: DataModelStatus::Published,
        api_exposure_status: ApiExposureStatus::PublishedNotExposed,
        protection: DataModelProtection::default(),
    }
}

fn protected_extension_model(model_id: Uuid) -> ModelDefinitionRecord {
    ModelDefinitionRecord {
        protection: DataModelProtection {
            owner_kind: DataModelOwnerKind::RuntimeExtension,
            owner_id: Some("ext.crm".into()),
            is_protected: true,
        },
        fields: vec![ModelFieldRecord {
            id: Uuid::now_v7(),
            data_model_id: model_id,
            code: "email".into(),
            title: "Email".into(),
            physical_column_name: "email".into(),
            external_field_key: Some("email".into()),
            field_kind: ModelFieldKind::String,
            is_system: false,
            is_writable: true,
            is_required: false,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: json!({}),
            relation_target_model_id: None,
            relation_options: json!({}),
            sort_order: 0,
            availability_status: domain::MetadataAvailabilityStatus::Available,
        }],
        ..system_model(model_id)
    }
}

fn unsafe_external_system_model(model_id: Uuid) -> ModelDefinitionRecord {
    ModelDefinitionRecord {
        data_source_instance_id: Some(Uuid::now_v7()),
        source_kind: domain::DataModelSourceKind::ExternalSource,
        external_resource_key: Some("unsafe.contacts".into()),
        external_table_id: None,
        external_capability_snapshot: Some(json!({
            "supports_list": true,
            "supports_scope_filter": false
        })),
        ..system_model(model_id)
    }
}

fn safe_external_system_model(model_id: Uuid) -> ModelDefinitionRecord {
    ModelDefinitionRecord {
        data_source_instance_id: Some(Uuid::now_v7()),
        source_kind: domain::DataModelSourceKind::ExternalSource,
        external_resource_key: Some("safe.contacts".into()),
        external_table_id: None,
        external_capability_snapshot: Some(json!({
            "supports_list": true,
            "supports_scope_filter": true
        })),
        ..system_model(model_id)
    }
}

fn model_in_workspace(model_id: Uuid, workspace_id: Uuid) -> ModelDefinitionRecord {
    ModelDefinitionRecord {
        id: model_id,
        scope_kind: DataModelScopeKind::Workspace,
        scope_id: workspace_id,
        code: "foreign_orders".into(),
        title: "Foreign Orders".into(),
        physical_table_name: "rtm_workspace_foreign_orders".into(),
        acl_namespace: "state_model.foreign_orders".into(),
        audit_namespace: "audit.state_model.foreign_orders".into(),
        fields: vec![],
        availability_status: domain::MetadataAvailabilityStatus::Available,
        data_source_instance_id: None,
        source_kind: domain::DataModelSourceKind::MainSource,
        external_resource_key: None,
        external_table_id: None,
        external_capability_snapshot: None,
        status: DataModelStatus::Published,
        api_exposure_status: ApiExposureStatus::PublishedNotExposed,
        protection: DataModelProtection::default(),
    }
}

fn scope_grant(
    grant_id: Uuid,
    model_id: Uuid,
    scope_kind: DataModelScopeKind,
    scope_id: Uuid,
) -> ScopeDataModelGrantRecord {
    let now = time::OffsetDateTime::now_utc();
    ScopeDataModelGrantRecord {
        id: grant_id,
        scope_kind,
        scope_id,
        data_model_id: model_id,
        enabled: true,
        permission_profile: domain::ScopeDataModelPermissionProfile::ScopeAll,
        created_by: None,
        created_at: now,
        updated_at: now,
    }
}

#[tokio::test]
async fn add_field_returns_immediately_usable_metadata_without_publish_step() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "orders".into(),
            title: "Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    let field = service
        .add_field(AddModelFieldCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            code: "status".into(),
            title: "Status".into(),
            external_field_key: None,
            field_kind: ModelFieldKind::Enum,
            is_required: true,
            is_unique: false,
            default_value: Some(json!("draft")),
            display_interface: Some("select".into()),
            display_options: json!({ "options": ["draft", "paid"] }),
            relation_target_model_id: None,
            relation_options: json!({}),
        })
        .await
        .unwrap();

    assert_eq!(field.physical_column_name, "status");

    let updated = service.get_model(Uuid::nil(), created.id).await.unwrap();
    assert_eq!(updated.fields.len(), 1);
}

#[tokio::test]
async fn delete_model_requires_explicit_confirmation() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "orders".into(),
            title: "Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    let error = service
        .delete_model(DeleteModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            confirmed: false,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("confirmation"));
}

#[tokio::test]
async fn create_system_model_uses_fixed_system_scope_id() {
    let service = ModelDefinitionService::for_tests();

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::System,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "system_orders".into(),
            title: "System Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    assert_eq!(created.scope_kind, DataModelScopeKind::System);
    assert_eq!(created.scope_id, SYSTEM_SCOPE_ID);
}

#[tokio::test]
async fn create_workspace_model_creates_system_model_and_workspace_grant() {
    let service = ModelDefinitionService::for_tests();

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "workspace_orders".into(),
            title: "Workspace Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    assert_eq!(created.scope_kind, DataModelScopeKind::System);
    assert_eq!(created.scope_id, SYSTEM_SCOPE_ID);

    let grant = service
        .load_runtime_scope_grant(
            &ActorContext::root(Uuid::nil(), Uuid::nil(), "root"),
            created.id,
        )
        .await
        .unwrap()
        .expect("workspace create path should persist a workspace grant");
    assert_eq!(grant.scope_kind, DataModelScopeKind::Workspace);
    assert_eq!(grant.scope_id, Uuid::nil());
    assert_eq!(
        grant.permission_profile,
        domain::ScopeDataModelPermissionProfile::ScopeAll
    );
}

#[tokio::test]
async fn create_model_defaults_to_main_source_published_not_exposed() {
    let service = ModelDefinitionService::for_tests();

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "main_source_orders".into(),
            title: "Main Source Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    assert_eq!(created.status, DataModelStatus::Published);
    assert_eq!(
        created.api_exposure_status,
        ApiExposureStatus::PublishedNotExposed
    );
    assert_eq!(created.data_source_instance_id, None);
}

#[tokio::test]
async fn api_key_readiness_treats_system_all_as_not_ready_for_non_root_runtime_actor() {
    let repository = InMemoryModelDefinitionRepository::default();
    let service = ModelDefinitionService::new(repository.clone());
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::System,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "system_all_api_key_orders".into(),
            title: "System All API Key Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    repository.replace_grant_permission_profile_for_tests(
        created.id,
        domain::ScopeDataModelPermissionProfile::SystemAll,
    );
    repository.add_api_key_readiness(ApiKeyDataModelReadinessRecord {
        api_key_id: Uuid::now_v7(),
        data_model_id: created.id,
        scope_kind: DataModelScopeKind::System,
        scope_id: SYSTEM_SCOPE_ID,
        key_enabled: true,
        expires_at: None,
        allow_list: true,
        allow_get: false,
        allow_create: false,
        allow_update: false,
        allow_delete: false,
    });

    let effective = service.get_model(Uuid::nil(), created.id).await.unwrap();

    assert_eq!(
        effective.api_exposure_status,
        ApiExposureStatus::ApiExposedNoPermission
    );
}

#[tokio::test]
async fn external_model_missing_scope_filter_capability_is_unsafe_without_or_with_api_key_path() {
    let model_id = Uuid::now_v7();
    let mut model = model_in_workspace(model_id, Uuid::nil());
    model.data_source_instance_id = Some(Uuid::now_v7());
    model.source_kind = domain::DataModelSourceKind::ExternalSource;
    model.external_resource_key = Some("contacts".into());
    model.external_capability_snapshot = Some(json!({
        "supports_owner_filter": false,
        "supports_write": false
    }));
    let repository =
        ScopedModelDefinitionRepository::new(ActorContext::root(Uuid::nil(), Uuid::nil(), "root"))
            .with_model(model)
            .with_grant(scope_grant(
                Uuid::now_v7(),
                model_id,
                DataModelScopeKind::Workspace,
                Uuid::nil(),
            ));
    let service = ModelDefinitionService::new(repository.clone());

    let unsafe_without_key = service.get_model(Uuid::nil(), model_id).await.unwrap();

    assert_eq!(
        unsafe_without_key.api_exposure_status,
        ApiExposureStatus::UnsafeExternalSource
    );

    repository
        .api_key_readiness
        .lock()
        .expect("api key readiness lock poisoned")
        .push(ApiKeyDataModelReadinessRecord {
            api_key_id: Uuid::now_v7(),
            data_model_id: model_id,
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: Uuid::nil(),
            key_enabled: true,
            expires_at: None,
            allow_list: true,
            allow_get: true,
            allow_create: false,
            allow_update: false,
            allow_delete: false,
        });

    let effective = service.get_model(Uuid::nil(), model_id).await.unwrap();

    assert_eq!(
        effective.api_exposure_status,
        ApiExposureStatus::UnsafeExternalSource
    );
}

#[tokio::test]
async fn external_model_with_scope_filter_capability_can_be_api_exposed_ready() {
    let model_id = Uuid::now_v7();
    let mut model = model_in_workspace(model_id, Uuid::nil());
    model.data_source_instance_id = Some(Uuid::now_v7());
    model.source_kind = domain::DataModelSourceKind::ExternalSource;
    model.external_resource_key = Some("contacts".into());
    model.external_capability_snapshot = Some(json!({
        "supports_owner_filter": false,
        "supports_scope_filter": true,
        "supports_write": false
    }));
    let repository =
        ScopedModelDefinitionRepository::new(ActorContext::root(Uuid::nil(), Uuid::nil(), "root"))
            .with_model(model)
            .with_grant(scope_grant(
                Uuid::now_v7(),
                model_id,
                DataModelScopeKind::Workspace,
                Uuid::nil(),
            ));
    let service = ModelDefinitionService::new(repository.clone());
    repository
        .api_key_readiness
        .lock()
        .expect("api key readiness lock poisoned")
        .push(ApiKeyDataModelReadinessRecord {
            api_key_id: Uuid::now_v7(),
            data_model_id: model_id,
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: Uuid::nil(),
            key_enabled: true,
            expires_at: None,
            allow_list: true,
            allow_get: false,
            allow_create: false,
            allow_update: false,
            allow_delete: false,
        });

    let effective = service.get_model(Uuid::nil(), model_id).await.unwrap();

    assert_eq!(
        effective.external_capability_snapshot,
        Some(json!({
            "supports_owner_filter": false,
            "supports_scope_filter": true,
            "supports_write": false
        }))
    );
    assert_eq!(
        effective.api_exposure_status,
        ApiExposureStatus::ApiExposedReady
    );
}

#[tokio::test]
async fn main_source_ready_path_is_not_blocked_by_external_source_safety() {
    let repository = InMemoryModelDefinitionRepository::default();
    let service = ModelDefinitionService::new(repository.clone());
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "main_source_ready_orders".into(),
            title: "Main Source Ready Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    repository.add_api_key_readiness(ApiKeyDataModelReadinessRecord {
        api_key_id: Uuid::now_v7(),
        data_model_id: created.id,
        scope_kind: DataModelScopeKind::Workspace,
        scope_id: Uuid::nil(),
        key_enabled: true,
        expires_at: None,
        allow_list: true,
        allow_get: false,
        allow_create: false,
        allow_update: false,
        allow_delete: false,
    });

    let effective = service.get_model(Uuid::nil(), created.id).await.unwrap();

    assert_eq!(
        effective.api_exposure_status,
        ApiExposureStatus::ApiExposedReady
    );
}

#[tokio::test]
async fn create_model_persists_explicit_draft_status_in_initial_create_path() {
    let service = ModelDefinitionService::for_tests();

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "explicit_draft_orders".into(),
            title: "Explicit Draft Orders".into(),
            status: Some(DataModelStatus::Draft),
        })
        .await
        .unwrap();

    assert_eq!(created.status, DataModelStatus::Draft);
    assert_eq!(created.api_exposure_status, ApiExposureStatus::Draft);
}

#[tokio::test]
async fn create_model_inherits_data_source_defaults_when_instance_is_selected() {
    let data_source_instance_id = Uuid::now_v7();
    let repository = InMemoryModelDefinitionRepository::with_data_source_defaults(
        data_source_instance_id,
        DataSourceDefaults {
            data_model_status: DataModelStatus::Draft,
            api_exposure_status: ApiExposureStatus::Draft,
        },
    );
    let service = ModelDefinitionService::new(repository);

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: Some(data_source_instance_id),
            external_resource_key: Some("contacts".into()),
            external_table_id: None,
            code: "external_contacts".into(),
            title: "External Contacts".into(),
            status: None,
        })
        .await
        .unwrap();

    assert_eq!(
        created.data_source_instance_id,
        Some(data_source_instance_id)
    );
    assert_eq!(created.status, DataModelStatus::Draft);
    assert_eq!(created.api_exposure_status, ApiExposureStatus::Draft);
}

#[tokio::test]
async fn external_create_requires_external_resource_key_and_main_source_rejects_it() {
    let data_source_instance_id = Uuid::now_v7();
    let repository = InMemoryModelDefinitionRepository::with_data_source_defaults(
        data_source_instance_id,
        DataSourceDefaults::default(),
    );
    let service = ModelDefinitionService::new(repository);

    let missing_external_key = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: Some(data_source_instance_id),
            external_resource_key: None,
            external_table_id: None,
            code: "external_missing_key".into(),
            title: "External Missing Key".into(),
            status: None,
        })
        .await
        .unwrap_err();
    assert!(missing_external_key
        .to_string()
        .contains("external_resource_key"));

    let main_source_external_key = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: Some("contacts".into()),
            external_table_id: None,
            code: "main_source_external_key".into(),
            title: "Main Source External Key".into(),
            status: None,
        })
        .await
        .unwrap_err();
    assert!(main_source_external_key
        .to_string()
        .contains("external_resource_key"));
}

#[tokio::test]
async fn external_add_field_requires_external_field_key_and_main_source_rejects_it() {
    let data_source_instance_id = Uuid::now_v7();
    let repository = InMemoryModelDefinitionRepository::with_data_source_defaults(
        data_source_instance_id,
        DataSourceDefaults::default(),
    );
    let service = ModelDefinitionService::new(repository);
    let external_model = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: Some(data_source_instance_id),
            external_resource_key: Some("contacts".into()),
            external_table_id: None,
            code: "external_contacts_fields".into(),
            title: "External Contacts Fields".into(),
            status: None,
        })
        .await
        .unwrap();

    let missing_external_field_key = service
        .add_field(AddModelFieldCommand {
            actor_user_id: Uuid::nil(),
            model_id: external_model.id,
            code: "email".into(),
            title: "Email".into(),
            external_field_key: None,
            field_kind: ModelFieldKind::String,
            is_required: false,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: json!({}),
            relation_target_model_id: None,
            relation_options: json!({}),
        })
        .await
        .unwrap_err();
    assert!(missing_external_field_key
        .to_string()
        .contains("external_field_key"));

    let main_model = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "main_source_fields".into(),
            title: "Main Source Fields".into(),
            status: None,
        })
        .await
        .unwrap();
    let main_source_external_field_key = service
        .add_field(AddModelFieldCommand {
            actor_user_id: Uuid::nil(),
            model_id: main_model.id,
            code: "email".into(),
            title: "Email".into(),
            external_field_key: Some("properties.email".into()),
            field_kind: ModelFieldKind::String,
            is_required: false,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: json!({}),
            relation_target_model_id: None,
            relation_options: json!({}),
        })
        .await
        .unwrap_err();
    assert!(main_source_external_field_key
        .to_string()
        .contains("external_field_key"));
}

#[tokio::test]
async fn create_model_rejects_data_source_defaults_outside_actor_workspace() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let foreign_workspace_id = Uuid::now_v7();
    let data_source_instance_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_data_source_defaults(
                foreign_workspace_id,
                data_source_instance_id,
                DataSourceDefaults {
                    data_model_status: DataModelStatus::Draft,
                    api_exposure_status: ApiExposureStatus::Draft,
                },
            );
    let service = ModelDefinitionService::new(repository);

    let error = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: Some(data_source_instance_id),
            external_resource_key: Some("contacts".into()),
            external_table_id: None,
            code: "external_contacts".into(),
            title: "External Contacts".into(),
            status: None,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("data_source_instance"));
}

#[tokio::test]
async fn update_model_status_forces_draft_exposure_and_downgrades_direct_ready() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "status_orders".into(),
            title: "Status Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    let draft = service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            status: DataModelStatus::Draft,
            api_exposure_status: ApiExposureStatus::PublishedNotExposed,
        })
        .await
        .unwrap();
    assert_eq!(draft.status, DataModelStatus::Draft);
    assert_eq!(draft.api_exposure_status, ApiExposureStatus::Draft);

    let direct_ready = service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            status: DataModelStatus::Published,
            api_exposure_status: ApiExposureStatus::ApiExposedReady,
        })
        .await
        .unwrap();

    assert_eq!(
        direct_ready.api_exposure_status,
        ApiExposureStatus::PublishedNotExposed
    );
}

#[tokio::test]
async fn update_model_status_downgrades_raw_ready_without_readiness_facts() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "raw_ready_orders".into(),
            title: "Raw Ready Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    let updated = service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            status: DataModelStatus::Published,
            api_exposure_status: ApiExposureStatus::ApiExposedReady,
        })
        .await
        .unwrap();

    assert_eq!(updated.status, DataModelStatus::Published);
    assert_eq!(
        updated.api_exposure_status,
        ApiExposureStatus::PublishedNotExposed
    );
}

#[tokio::test]
async fn get_model_maps_stored_ready_or_no_permission_without_api_key_to_not_exposed() {
    let actor_user_id = Uuid::now_v7();
    let workspace_id = Uuid::now_v7();
    for stored_status in [
        ApiExposureStatus::ApiExposedReady,
        ApiExposureStatus::ApiExposedNoPermission,
    ] {
        let model_id = Uuid::now_v7();
        let repository =
            ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, workspace_id))
                .with_model(ModelDefinitionRecord {
                    api_exposure_status: stored_status,
                    ..model_in_workspace(model_id, workspace_id)
                });
        let service = ModelDefinitionService::new(repository);

        let model = service.get_model(actor_user_id, model_id).await.unwrap();

        assert_eq!(
            model.api_exposure_status,
            ApiExposureStatus::PublishedNotExposed
        );
    }
}

#[tokio::test]
async fn get_model_computes_ready_from_api_key_scope_grant_and_audit_facts() {
    let repository = InMemoryModelDefinitionRepository::default();
    let service = ModelDefinitionService::new(repository.clone());
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "ready_orders".into(),
            title: "Ready Orders".into(),
            status: None,
        })
        .await
        .unwrap();
    repository.add_api_key_readiness(ApiKeyDataModelReadinessRecord {
        api_key_id: Uuid::now_v7(),
        data_model_id: created.id,
        scope_kind: DataModelScopeKind::Workspace,
        scope_id: Uuid::nil(),
        key_enabled: true,
        expires_at: None,
        allow_list: true,
        allow_get: false,
        allow_create: false,
        allow_update: false,
        allow_delete: false,
    });

    let ready = service.get_model(Uuid::nil(), created.id).await.unwrap();

    assert_eq!(
        ready.api_exposure_status,
        ApiExposureStatus::ApiExposedReady
    );
}

#[tokio::test]
async fn update_model_status_keeps_disabled_effective_exposure_not_ready() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "disabled_ready_orders".into(),
            title: "Disabled Ready Orders".into(),
            status: None,
        })
        .await
        .unwrap();

    let updated = service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            status: DataModelStatus::Disabled,
            api_exposure_status: ApiExposureStatus::ApiExposedReady,
        })
        .await
        .unwrap();

    assert_eq!(updated.status, DataModelStatus::Disabled);
    assert_eq!(
        updated.api_exposure_status,
        ApiExposureStatus::ApiExposedNoPermission
    );
}

#[tokio::test]
async fn update_model_status_audits_effective_api_exposure_transition() {
    let repository = InMemoryModelDefinitionRepository::default();
    let service = ModelDefinitionService::new(repository.clone());
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "transition_audit_orders".into(),
            title: "Transition Audit Orders".into(),
            status: Some(DataModelStatus::Draft),
        })
        .await
        .unwrap();
    repository.add_api_key_readiness(ApiKeyDataModelReadinessRecord {
        api_key_id: Uuid::now_v7(),
        data_model_id: created.id,
        scope_kind: DataModelScopeKind::Workspace,
        scope_id: Uuid::nil(),
        key_enabled: true,
        expires_at: None,
        allow_list: true,
        allow_get: false,
        allow_create: false,
        allow_update: false,
        allow_delete: false,
    });

    service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            status: DataModelStatus::Published,
            api_exposure_status: ApiExposureStatus::ApiExposedReady,
        })
        .await
        .unwrap();

    assert!(repository
        .audit_events()
        .contains(&"state_model.api_exposure_status_changed".to_string()));
}

#[tokio::test]
async fn update_scope_grant_records_audit_event() {
    let repository = InMemoryModelDefinitionRepository::default();
    let service = ModelDefinitionService::new(repository.clone());
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "scope_grant_audit_orders".into(),
            title: "Scope Grant Audit Orders".into(),
            status: None,
        })
        .await
        .unwrap();
    let grant = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id: Uuid::nil(),
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                data_model_id: created.id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap();

    service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id: Uuid::nil(),
            data_model_id: created.id,
            grant_id: grant.id,
            enabled: Some(false),
            permission_profile: Some("owner".into()),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap();

    assert!(repository
        .audit_events()
        .contains(&"state_model.scope_grant_updated".to_string()));
}

#[tokio::test]
async fn non_root_scope_grant_create_rejects_system_and_other_workspace_scope() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let other_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let repository = ScopedModelDefinitionRepository::new(scoped_manager_in_workspace(
        actor_user_id,
        actor_workspace_id,
    ))
    .with_model(system_model(model_id));
    let service = ModelDefinitionService::new(repository);

    let system_error = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id,
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                data_model_id: model_id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap_err();
    assert!(system_error.to_string().contains("permission_denied"));

    let other_workspace_error = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id,
                scope_kind: DataModelScopeKind::Workspace,
                scope_id: other_workspace_id,
                data_model_id: model_id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap_err();
    assert!(other_workspace_error
        .to_string()
        .contains("permission_denied"));

    let current_workspace_grant = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id,
                scope_kind: DataModelScopeKind::Workspace,
                scope_id: actor_workspace_id,
                data_model_id: model_id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap();
    assert_eq!(current_workspace_grant.scope_id, actor_workspace_id);
}

#[tokio::test]
async fn non_root_scope_grant_update_delete_authorizes_existing_grant_scope() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let other_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let system_grant_id = Uuid::now_v7();
    let other_workspace_grant_id = Uuid::now_v7();
    let current_workspace_grant_id = Uuid::now_v7();
    let repository = ScopedModelDefinitionRepository::new(scoped_manager_in_workspace(
        actor_user_id,
        actor_workspace_id,
    ))
    .with_model(system_model(model_id))
    .with_grant(scope_grant(
        system_grant_id,
        model_id,
        DataModelScopeKind::System,
        SYSTEM_SCOPE_ID,
    ))
    .with_grant(scope_grant(
        other_workspace_grant_id,
        model_id,
        DataModelScopeKind::Workspace,
        other_workspace_id,
    ))
    .with_grant(scope_grant(
        current_workspace_grant_id,
        model_id,
        DataModelScopeKind::Workspace,
        actor_workspace_id,
    ));
    let service = ModelDefinitionService::new(repository);

    for grant_id in [system_grant_id, other_workspace_grant_id] {
        let update_error = service
            .update_scope_grant(UpdateScopeDataModelGrantCommand {
                actor_user_id,
                data_model_id: model_id,
                grant_id,
                enabled: Some(false),
                permission_profile: None,
                confirm_unsafe_external_source_system_all: false,
            })
            .await
            .unwrap_err();
        assert!(update_error.to_string().contains("permission_denied"));

        let delete_error = service
            .delete_scope_grant(DeleteScopeDataModelGrantCommand {
                actor_user_id,
                data_model_id: model_id,
                grant_id,
            })
            .await
            .unwrap_err();
        assert!(delete_error.to_string().contains("permission_denied"));
    }

    let updated = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id: current_workspace_grant_id,
            enabled: Some(false),
            permission_profile: Some("owner".into()),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap();
    assert_eq!(updated.scope_id, actor_workspace_id);
    assert!(!updated.enabled);

    let deleted = service
        .delete_scope_grant(DeleteScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id: current_workspace_grant_id,
        })
        .await
        .unwrap();
    assert_eq!(deleted.scope_id, actor_workspace_id);
}

#[tokio::test]
async fn root_scope_grant_lifecycle_can_manage_any_scope() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let other_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(system_model(model_id));
    let service = ModelDefinitionService::new(repository);

    let system_grant = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id,
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                data_model_id: model_id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap();
    assert_eq!(system_grant.scope_kind, DataModelScopeKind::System);

    let other_workspace_grant = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id,
                scope_kind: DataModelScopeKind::Workspace,
                scope_id: other_workspace_id,
                data_model_id: model_id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap();
    assert_eq!(other_workspace_grant.scope_id, other_workspace_id);

    let updated = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id: system_grant.id,
            enabled: Some(false),
            permission_profile: Some("owner".into()),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap();
    assert_eq!(updated.scope_kind, DataModelScopeKind::System);
    assert!(!updated.enabled);

    let deleted = service
        .delete_scope_grant(DeleteScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id: other_workspace_grant.id,
        })
        .await
        .unwrap();
    assert_eq!(deleted.scope_id, other_workspace_id);
}

#[tokio::test]
async fn unsafe_external_system_all_scope_grant_requires_explicit_confirmation() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(unsafe_external_system_model(model_id));
    let service = ModelDefinitionService::new(repository);

    let error = service
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::System,
            scope_id: SYSTEM_SCOPE_ID,
            data_model_id: model_id,
            enabled: true,
            permission_profile: "system_all".into(),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap_err();
    assert!(error.to_string().contains("confirmation"));

    let grant = service
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::System,
            scope_id: SYSTEM_SCOPE_ID,
            data_model_id: model_id,
            enabled: true,
            permission_profile: "system_all".into(),
            confirm_unsafe_external_source_system_all: true,
        })
        .await
        .unwrap();
    assert_eq!(
        grant.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );
}

#[tokio::test]
async fn unsafe_external_workspace_scope_system_all_grant_requires_explicit_confirmation() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(unsafe_external_system_model(model_id));
    let service = ModelDefinitionService::new(repository);

    let error = service
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: actor_workspace_id,
            data_model_id: model_id,
            enabled: true,
            permission_profile: "system_all".into(),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap_err();
    assert!(error.to_string().contains("confirmation"));

    let grant = service
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: actor_workspace_id,
            data_model_id: model_id,
            enabled: true,
            permission_profile: "system_all".into(),
            confirm_unsafe_external_source_system_all: true,
        })
        .await
        .unwrap();
    assert_eq!(grant.scope_kind, DataModelScopeKind::Workspace);
    assert_eq!(grant.scope_id, actor_workspace_id);
    assert_eq!(
        grant.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );
}

#[tokio::test]
async fn unsafe_external_system_all_scope_grant_update_requires_explicit_confirmation() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let grant_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(unsafe_external_system_model(model_id))
            .with_grant(scope_grant(
                grant_id,
                model_id,
                DataModelScopeKind::System,
                SYSTEM_SCOPE_ID,
            ));
    let service = ModelDefinitionService::new(repository);

    let error = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id,
            enabled: Some(true),
            permission_profile: Some("system_all".into()),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap_err();
    assert!(error.to_string().contains("confirmation"));

    let grant = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id,
            enabled: Some(true),
            permission_profile: Some("system_all".into()),
            confirm_unsafe_external_source_system_all: true,
        })
        .await
        .unwrap();
    assert_eq!(
        grant.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );
}

#[tokio::test]
async fn unsafe_external_workspace_scope_system_all_grant_update_requires_explicit_confirmation() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let grant_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(unsafe_external_system_model(model_id))
            .with_grant(scope_grant(
                grant_id,
                model_id,
                DataModelScopeKind::Workspace,
                actor_workspace_id,
            ));
    let service = ModelDefinitionService::new(repository);

    let error = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id,
            enabled: Some(true),
            permission_profile: Some("system_all".into()),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap_err();
    assert!(error.to_string().contains("confirmation"));

    let grant = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id,
            enabled: Some(true),
            permission_profile: Some("system_all".into()),
            confirm_unsafe_external_source_system_all: true,
        })
        .await
        .unwrap();
    assert_eq!(grant.scope_kind, DataModelScopeKind::Workspace);
    assert_eq!(grant.scope_id, actor_workspace_id);
    assert_eq!(
        grant.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );
}

#[tokio::test]
async fn safe_external_system_all_scope_grant_does_not_require_risk_confirmation() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let grant_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(safe_external_system_model(model_id))
            .with_grant(scope_grant(
                grant_id,
                model_id,
                DataModelScopeKind::Workspace,
                actor_workspace_id,
            ));
    let service = ModelDefinitionService::new(repository);

    let created = service
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: actor_workspace_id,
            data_model_id: model_id,
            enabled: true,
            permission_profile: "system_all".into(),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap();
    assert_eq!(
        created.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );

    let updated = service
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: model_id,
            grant_id,
            enabled: Some(true),
            permission_profile: Some("system_all".into()),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap();
    assert_eq!(
        updated.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );
}

#[tokio::test]
async fn main_source_system_all_scope_grant_does_not_require_external_risk_confirmation() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(system_model(model_id));
    let service = ModelDefinitionService::new(repository);

    let grant = service
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id,
            scope_kind: DataModelScopeKind::System,
            scope_id: SYSTEM_SCOPE_ID,
            data_model_id: model_id,
            enabled: true,
            permission_profile: "system_all".into(),
            confirm_unsafe_external_source_system_all: false,
        })
        .await
        .unwrap();

    assert_eq!(
        grant.permission_profile,
        domain::ScopeDataModelPermissionProfile::SystemAll
    );
}

#[tokio::test]
async fn delete_scope_grant_records_audit_event() {
    let repository = InMemoryModelDefinitionRepository::default();
    let service = ModelDefinitionService::new(repository.clone());
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            data_source_instance_id: None,
            external_resource_key: None,
            external_table_id: None,
            code: "delete_scope_grant_audit_orders".into(),
            title: "Delete Scope Grant Audit Orders".into(),
            status: None,
        })
        .await
        .unwrap();
    let grant = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id: Uuid::nil(),
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                data_model_id: created.id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap();

    service
        .delete_scope_grant(DeleteScopeDataModelGrantCommand {
            actor_user_id: Uuid::nil(),
            data_model_id: created.id,
            grant_id: grant.id,
        })
        .await
        .unwrap();

    assert!(repository
        .audit_events()
        .contains(&"state_model.scope_grant_deleted".to_string()));
}

#[tokio::test]
async fn delete_scope_grant_rejects_invisible_model_and_wrong_model_grant_pair() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let foreign_workspace_id = Uuid::now_v7();
    let foreign_model_id = Uuid::now_v7();
    let grant_model_id = Uuid::now_v7();
    let wrong_model_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(model_in_workspace(foreign_model_id, foreign_workspace_id))
            .with_model(model_in_workspace(grant_model_id, actor_workspace_id))
            .with_model(model_in_workspace(wrong_model_id, actor_workspace_id));
    let service = ModelDefinitionService::new(repository.clone());
    let grant = service
        .create_scope_grant(
            control_plane::model_definition::CreateScopeDataModelGrantCommand {
                actor_user_id,
                scope_kind: DataModelScopeKind::Workspace,
                scope_id: actor_workspace_id,
                data_model_id: grant_model_id,
                enabled: true,
                permission_profile: "scope_all".into(),
                confirm_unsafe_external_source_system_all: false,
            },
        )
        .await
        .unwrap();

    let invisible_error = service
        .delete_scope_grant(DeleteScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: foreign_model_id,
            grant_id: grant.id,
        })
        .await
        .unwrap_err();
    assert!(invisible_error.to_string().contains("model_definition"));

    let wrong_pair_error = service
        .delete_scope_grant(DeleteScopeDataModelGrantCommand {
            actor_user_id,
            data_model_id: wrong_model_id,
            grant_id: grant.id,
        })
        .await
        .unwrap_err();
    assert!(wrong_pair_error
        .to_string()
        .contains("scope_data_model_grant"));

    assert!(!repository
        .audit_events()
        .contains(&"state_model.scope_grant_deleted".to_string()));
}

#[tokio::test]
async fn update_model_status_rejects_model_outside_actor_workspace() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let foreign_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(model_in_workspace(model_id, foreign_workspace_id));
    let service = ModelDefinitionService::new(repository.clone());

    let error = service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id,
            model_id,
            status: DataModelStatus::Draft,
            api_exposure_status: ApiExposureStatus::Draft,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("model_definition"));
    let stored = repository
        .models
        .lock()
        .expect("model lock poisoned")
        .get(&model_id)
        .cloned()
        .unwrap();
    assert_eq!(stored.status, DataModelStatus::Published);
    assert_eq!(
        stored.api_exposure_status,
        ApiExposureStatus::PublishedNotExposed
    );
}

#[tokio::test]
async fn non_root_admin_cannot_mutate_protected_data_model() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let model = protected_extension_model(model_id);
    let field_id = model.fields[0].id;
    let repository = ScopedModelDefinitionRepository::new(scoped_manager_in_workspace(
        actor_user_id,
        actor_workspace_id,
    ))
    .with_model(model);
    let service = ModelDefinitionService::new(repository.clone());

    let status_error = service
        .update_model_status(UpdateModelDefinitionStatusCommand {
            actor_user_id,
            model_id,
            status: DataModelStatus::Disabled,
            api_exposure_status: ApiExposureStatus::PublishedNotExposed,
        })
        .await
        .unwrap_err();
    assert!(status_error.to_string().contains("protected_data_model"));

    let update_field_error = service
        .update_field(UpdateModelFieldCommand {
            actor_user_id,
            model_id,
            field_id,
            title: "Work Email".into(),
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: json!({}),
            relation_options: json!({}),
        })
        .await
        .unwrap_err();
    assert!(update_field_error
        .to_string()
        .contains("protected_data_model"));

    let delete_field_error = service
        .delete_field(DeleteModelFieldCommand {
            actor_user_id,
            model_id,
            field_id,
            confirmed: true,
        })
        .await
        .unwrap_err();
    assert!(delete_field_error
        .to_string()
        .contains("protected_data_model"));

    let publish_error = match service
        .publish_model(PublishModelCommand {
            actor_user_id,
            model_id,
        })
        .await
    {
        Ok(_) => panic!("protected publish should be rejected for non-root admin"),
        Err(error) => error,
    };
    assert!(publish_error.to_string().contains("protected_data_model"));

    let delete_model_error = service
        .delete_model(DeleteModelDefinitionCommand {
            actor_user_id,
            model_id,
            confirmed: true,
        })
        .await
        .unwrap_err();
    assert!(delete_model_error
        .to_string()
        .contains("protected_data_model"));

    let stored = repository
        .models
        .lock()
        .expect("model lock poisoned")
        .get(&model_id)
        .cloned()
        .unwrap();
    assert_eq!(stored.status, DataModelStatus::Published);
    assert_eq!(stored.fields[0].title, "Email");
}

#[tokio::test]
async fn root_can_override_protected_data_model_enforcement() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let model = protected_extension_model(model_id);
    let field_id = model.fields[0].id;
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(model);
    let service = ModelDefinitionService::new(repository.clone());

    let updated = service
        .update_field(UpdateModelFieldCommand {
            actor_user_id,
            model_id,
            field_id,
            title: "Emergency Email".into(),
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: json!({}),
            relation_options: json!({}),
        })
        .await
        .unwrap();
    assert_eq!(updated.title, "Emergency Email");

    service
        .delete_model(DeleteModelDefinitionCommand {
            actor_user_id,
            model_id,
            confirmed: true,
        })
        .await
        .unwrap();

    assert!(!repository
        .models
        .lock()
        .expect("model lock poisoned")
        .contains_key(&model_id));
}

#[tokio::test]
async fn advisor_findings_report_exposure_protection_permission_and_field_risks() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let mut model = protected_extension_model(model_id);
    model.audit_namespace = "".into();
    model.api_exposure_status = ApiExposureStatus::ApiExposedReady;
    model.fields.push(ModelFieldRecord {
        id: Uuid::now_v7(),
        data_model_id: model_id,
        code: "email".into(),
        title: "Email Duplicate".into(),
        physical_column_name: "email_dup".into(),
        external_field_key: Some("email".into()),
        field_kind: ModelFieldKind::Json,
        is_system: false,
        is_writable: true,
        is_required: false,
        is_unique: true,
        default_value: None,
        display_interface: None,
        display_options: json!({}),
        relation_target_model_id: None,
        relation_options: json!({}),
        sort_order: 1,
        availability_status: domain::MetadataAvailabilityStatus::Available,
    });
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(model);
    repository
        .api_key_readiness
        .lock()
        .expect("api key readiness lock poisoned")
        .push(ApiKeyDataModelReadinessRecord {
            api_key_id: Uuid::now_v7(),
            data_model_id: model_id,
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: actor_workspace_id,
            key_enabled: true,
            expires_at: None,
            allow_list: false,
            allow_get: false,
            allow_create: true,
            allow_update: false,
            allow_delete: false,
        });
    let service = ModelDefinitionService::new(repository);

    let findings = service
        .advisor_findings(actor_user_id, model_id)
        .await
        .unwrap();
    let codes = findings
        .iter()
        .map(|finding| finding.code.as_str())
        .collect::<Vec<_>>();

    assert!(codes.contains(&"api_exposed_no_permission"));
    assert!(codes.contains(&"missing_audit_for_write_api"));
    assert!(codes.contains(&"missing_scope_filter"));
    assert!(codes.contains(&"protected_model_exposure_attempt"));
    assert!(codes.contains(&"duplicate_risky_field_configuration"));
    assert!(findings
        .iter()
        .any(|finding| finding.severity == domain::DataModelAdvisorSeverity::Blocking));
}

#[tokio::test]
async fn advisor_findings_report_published_not_exposed_and_unsafe_external_source() {
    let actor_user_id = Uuid::now_v7();
    let actor_workspace_id = Uuid::now_v7();
    let not_exposed_id = Uuid::now_v7();
    let unsafe_external_id = Uuid::now_v7();
    let repository =
        ScopedModelDefinitionRepository::new(actor_in_workspace(actor_user_id, actor_workspace_id))
            .with_model(system_model(not_exposed_id))
            .with_model(unsafe_external_system_model(unsafe_external_id));
    let service = ModelDefinitionService::new(repository);

    let not_exposed = service
        .advisor_findings(actor_user_id, not_exposed_id)
        .await
        .unwrap();
    assert!(not_exposed.iter().any(|finding| {
        finding.code == "published_not_exposed"
            && finding.severity == domain::DataModelAdvisorSeverity::Info
    }));

    let unsafe_external = service
        .advisor_findings(actor_user_id, unsafe_external_id)
        .await
        .unwrap();
    assert!(unsafe_external.iter().any(|finding| {
        finding.code == "unsafe_external_source"
            && finding.severity == domain::DataModelAdvisorSeverity::Blocking
    }));
}
