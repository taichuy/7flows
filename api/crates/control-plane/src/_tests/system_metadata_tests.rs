use control_plane::_tests::support::MemoryProvisioningRepository;
use control_plane::ports::{
    AddModelFieldInput, CreateModelDefinitionInput, ModelDefinitionRepository,
};
use control_plane::system_metadata::{
    role_metadata_template, user_metadata_template, SystemMetadataBootstrapService,
};
use domain::{
    ApiExposureStatus, DataModelProtection, DataModelScopeKind, DataModelSourceKind,
    DataModelStatus, ModelFieldKind, ScopeDataModelPermissionProfile, SYSTEM_SCOPE_ID,
};
use uuid::Uuid;

#[test]
fn user_and_role_metadata_templates_match_system_table_contract() {
    let user_codes = user_metadata_template()
        .fields
        .into_iter()
        .map(|field| field.code)
        .collect::<Vec<_>>();
    assert_eq!(
        user_codes,
        vec![
            "id",
            "username",
            "display_name",
            "email",
            "status",
            "role_codes",
            "created_time",
            "last_login_at",
        ]
    );

    let role_codes = role_metadata_template()
        .fields
        .into_iter()
        .map(|field| field.code)
        .collect::<Vec<_>>();
    assert_eq!(
        role_codes,
        vec![
            "code",
            "name",
            "scope_kind",
            "is_builtin",
            "is_default_member_role",
            "created_time",
        ]
    );
}

#[tokio::test]
async fn bootstrap_creates_builtin_user_and_role_models_once() {
    let repository = MemoryProvisioningRepository::default();
    let service = SystemMetadataBootstrapService::new(repository.clone());

    let first = service
        .ensure_builtin_user_and_role_models(Uuid::now_v7())
        .await
        .unwrap();
    let second = service
        .ensure_builtin_user_and_role_models(Uuid::now_v7())
        .await
        .unwrap();

    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
    assert_eq!(first[0].id, second[0].id);
    assert_eq!(first[1].id, second[1].id);

    let models = ModelDefinitionRepository::list_model_definitions(&repository, SYSTEM_SCOPE_ID)
        .await
        .unwrap();
    let users = models
        .iter()
        .find(|model| model.code == "users")
        .expect("users metadata model should exist");
    let roles = models
        .iter()
        .find(|model| model.code == "roles")
        .expect("roles metadata model should exist");

    assert_eq!(models.len(), 2);
    assert_eq!(users.title, "用户");
    assert_eq!(roles.title, "角色");
    assert_eq!(users.scope_kind, DataModelScopeKind::System);
    assert_eq!(users.scope_id, SYSTEM_SCOPE_ID);
    assert_eq!(users.source_kind, DataModelSourceKind::MainSource);
    assert_eq!(users.fields.len(), 8);
    assert_eq!(roles.fields.len(), 6);

    let grants = ModelDefinitionRepository::list_scope_data_model_grants(
        &repository,
        DataModelScopeKind::System,
        SYSTEM_SCOPE_ID,
    )
    .await
    .unwrap();
    assert_eq!(grants.len(), 2);
    assert!(grants.iter().all(|grant| {
        grant.permission_profile == ScopeDataModelPermissionProfile::ScopeAll
            && (grant.data_model_id == users.id || grant.data_model_id == roles.id)
    }));
}

#[tokio::test]
async fn bootstrap_repairs_existing_partial_system_metadata_models() {
    let repository = MemoryProvisioningRepository::default();
    let actor_user_id = Uuid::now_v7();
    let partial_users = repository
        .create_model_definition(&CreateModelDefinitionInput {
            actor_user_id,
            scope_kind: DataModelScopeKind::System,
            scope_id: SYSTEM_SCOPE_ID,
            data_source_instance_id: None,
            source_kind: DataModelSourceKind::MainSource,
            external_resource_key: None,
            external_table_id: None,
            external_capability_snapshot: None,
            status: DataModelStatus::Draft,
            api_exposure_status: ApiExposureStatus::PublishedNotExposed,
            protection: DataModelProtection::default(),
            code: "users".into(),
            title: "用户".into(),
        })
        .await
        .unwrap();
    repository
        .add_model_field(&AddModelFieldInput {
            actor_user_id,
            model_id: partial_users.id,
            physical_column_name: None,
            external_field_key: None,
            code: "username".into(),
            title: "用户名".into(),
            field_kind: ModelFieldKind::String,
            is_system: false,
            is_writable: true,
            apply_physical_schema: true,
            is_required: true,
            is_unique: true,
            default_value: None,
            display_interface: None,
            display_options: serde_json::json!({}),
            relation_target_model_id: None,
            relation_options: serde_json::json!({}),
        })
        .await
        .unwrap();

    SystemMetadataBootstrapService::new(repository.clone())
        .ensure_builtin_user_and_role_models(actor_user_id)
        .await
        .unwrap();

    let models = ModelDefinitionRepository::list_model_definitions(&repository, SYSTEM_SCOPE_ID)
        .await
        .unwrap();
    let repaired_users = models
        .iter()
        .find(|model| model.id == partial_users.id)
        .expect("partial users model should be repaired in place");
    let user_field_codes = repaired_users
        .fields
        .iter()
        .map(|field| field.code.as_str())
        .collect::<Vec<_>>();

    assert_eq!(user_field_codes.len(), 8);
    assert!(user_field_codes.contains(&"id"));
    assert!(user_field_codes.contains(&"username"));
    assert!(user_field_codes.contains(&"created_time"));

    let grants = ModelDefinitionRepository::list_scope_data_model_grants(
        &repository,
        DataModelScopeKind::System,
        SYSTEM_SCOPE_ID,
    )
    .await
    .unwrap();
    assert!(grants
        .iter()
        .any(|grant| grant.data_model_id == partial_users.id));
}
