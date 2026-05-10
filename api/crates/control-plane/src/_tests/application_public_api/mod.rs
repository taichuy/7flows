use control_plane::{
    application_public_api::{
        api_keys::{
            ApplicationApiKeyService, CreateApplicationApiKeyCommand,
            ListApplicationApiKeysCommand, RevokeApplicationApiKeyCommand,
        },
        mapping::{
            validate_application_api_mapping, ApplicationApiMappingConfig,
            ApplicationApiMappingInput, ApplicationApiMappingOutput, ApplicationApiMappingService,
            GetApplicationApiMappingCommand, ReplaceApplicationApiMappingCommand,
        },
        publications::{
            ApplicationPublicationService, LoadActiveApplicationPublicationCommand,
            PublishApplicationCommand,
        },
        ApplicationPublicApiTestHarness,
    },
    auth::{ApiKeyService, CreateApiKeyCommand},
};
use uuid::Uuid;

mod anthropic_compat;
mod conversations;
mod native_run;
mod openai_compat;
mod resume;
mod run_service;

fn actor_user_id() -> Uuid {
    Uuid::from_u128(0x11111111111111111111111111111111)
}

fn other_user_id() -> Uuid {
    Uuid::from_u128(0x22222222222222222222222222222222)
}

fn root_user_id() -> Uuid {
    Uuid::from_u128(0x33333333333333333333333333333333)
}

#[tokio::test]
async fn application_public_api_key_service_requires_application_edit_permission_for_create() {
    let harness =
        ApplicationPublicApiTestHarness::new_with_permissions(vec!["application.view.all"]);
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationApiKeyService::new(harness.repository());

    let error = service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            name: "Native clients".into(),
            expires_at: None,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}

#[tokio::test]
async fn application_public_api_create_returns_apk_token_exactly_once() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationApiKeyService::new(harness.repository());

    let created = service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            name: "Native clients".into(),
            expires_at: None,
        })
        .await
        .unwrap();

    assert!(created.token.starts_with("apk_"));
    assert!(created.api_key.token_prefix.starts_with("apk_"));
    assert_ne!(created.api_key.token_prefix, created.token);

    let listed = service
        .list_api_keys(ListApplicationApiKeysCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
        })
        .await
        .unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.api_key.id);
    assert_eq!(listed[0].token_prefix, created.api_key.token_prefix);
    assert_ne!(listed[0].token_prefix, created.token);
}

#[tokio::test]
async fn application_public_api_list_only_returns_current_actor_keys_for_current_application() {
    let harness = ApplicationPublicApiTestHarness::new();
    let first_app = harness.seed_application(actor_user_id(), "First App");
    let second_app = harness.seed_application(actor_user_id(), "Second App");
    let service = ApplicationApiKeyService::new(harness.repository());

    let mine = service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: first_app.id,
            name: "Mine".into(),
            expires_at: None,
        })
        .await
        .unwrap();
    service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: other_user_id(),
            application_id: first_app.id,
            name: "Other user".into(),
            expires_at: None,
        })
        .await
        .unwrap();
    service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: second_app.id,
            name: "Other app".into(),
            expires_at: None,
        })
        .await
        .unwrap();

    let listed = service
        .list_api_keys(ListApplicationApiKeysCommand {
            actor_user_id: actor_user_id(),
            application_id: first_app.id,
        })
        .await
        .unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, mine.api_key.id);
    assert_eq!(listed[0].application_id, Some(first_app.id));
    assert_eq!(listed[0].creator_user_id, actor_user_id());
}

#[tokio::test]
async fn application_public_api_delete_removes_key_and_makes_token_unusable() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationApiKeyService::new(harness.repository());
    let created = service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            name: "Temporary".into(),
            expires_at: None,
        })
        .await
        .unwrap();

    service
        .revoke_api_key(RevokeApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            api_key_id: created.api_key.id,
        })
        .await
        .unwrap();

    let listed = service
        .list_api_keys(ListApplicationApiKeysCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
        })
        .await
        .unwrap();
    let auth_error = service
        .authenticate_bearer_token(&created.token)
        .await
        .unwrap_err();

    assert!(!harness.repository().contains_api_key(created.api_key.id));
    assert!(listed.is_empty());
    assert!(auth_error.to_string().contains("not_authenticated"));
}

#[tokio::test]
async fn application_public_api_root_has_no_global_view_every_users_key_list_path() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationApiKeyService::new(harness.repository());
    service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            name: "Owner key".into(),
            expires_at: None,
        })
        .await
        .unwrap();

    let root_visible = service
        .list_api_keys(ListApplicationApiKeysCommand {
            actor_user_id: root_user_id(),
            application_id: application.id,
        })
        .await
        .unwrap();

    assert!(
        root_visible.is_empty(),
        "root may manage explicitly authorized app resources, but key list remains current-actor scoped"
    );
}

#[tokio::test]
async fn application_public_api_dmk_keys_still_authenticate_only_for_data_model_runtime() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let repository = harness.repository();
    let data_model_key_service = ApiKeyService::new(repository.clone());
    let application_key_service = ApplicationApiKeyService::new(repository);

    let dmk = data_model_key_service
        .create_api_key(CreateApiKeyCommand {
            actor_user_id: actor_user_id(),
            name: "Data Model runtime".into(),
            scope_kind: None,
            scope_id: None,
            expires_at: None,
            permissions: Vec::new(),
        })
        .await
        .unwrap();
    let apk = application_key_service
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            name: "Application runtime".into(),
            expires_at: None,
        })
        .await
        .unwrap();

    assert!(dmk.token.starts_with("dmk_"));
    assert!(apk.token.starts_with("apk_"));
    data_model_key_service
        .authenticate_bearer_token(&dmk.token)
        .await
        .unwrap();
    application_key_service
        .authenticate_bearer_token(&apk.token)
        .await
        .unwrap();
    assert!(data_model_key_service
        .authenticate_bearer_token(&apk.token)
        .await
        .is_err());
    assert!(application_key_service
        .authenticate_bearer_token(&dmk.token)
        .await
        .is_err());
}

#[tokio::test]
async fn application_public_api_mapping_service_returns_default_then_replaces_stored_mapping() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationApiMappingService::new(harness.repository());

    let default_mapping = service
        .get_mapping(GetApplicationApiMappingCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
        })
        .await
        .unwrap();
    let replacement = ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "node-start.query".into(),
            model_target: None,
            inputs_target: Some("node-start".into()),
            history_target: Some("node-start.history".into()),
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput {
            answer_selector: Some("answer.text".into()),
            usage_selector: None,
            files_selector: None,
            error_selector: None,
        },
    };
    service
        .replace_mapping(ReplaceApplicationApiMappingCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: replacement.clone(),
        })
        .await
        .unwrap();
    let stored = service
        .get_mapping(GetApplicationApiMappingCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
        })
        .await
        .unwrap();

    assert_eq!(
        default_mapping,
        ApplicationApiMappingConfig::default_native()
    );
    assert_eq!(stored, replacement);
}

#[tokio::test]
async fn application_public_api_mapping_service_requires_edit_permission_for_replace() {
    let harness =
        ApplicationPublicApiTestHarness::new_with_permissions(vec!["application.view.all"]);
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationApiMappingService::new(harness.repository());

    let error = service
        .replace_mapping(ReplaceApplicationApiMappingCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig::default_native(),
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}

#[tokio::test]
async fn application_public_api_publish_creates_immutable_publication_version_record() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationPublicationService::new(harness.repository());

    let first = service
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig::default_native(),
            api_enabled: true,
        })
        .await
        .unwrap();
    let second = service
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig {
                input: ApplicationApiMappingInput {
                    query_target: "node-start.query".into(),
                    model_target: None,
                    inputs_target: Some("node-start".into()),
                    history_target: None,
                    attachments_target: None,
                },
                output: ApplicationApiMappingOutput::default(),
            },
            api_enabled: true,
        })
        .await
        .unwrap();

    let reloaded_first = service
        .get_publication_version(first.id)
        .await
        .unwrap()
        .unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(reloaded_first.mapping_snapshot, first.mapping_snapshot);
    assert_eq!(reloaded_first.compiled_plan_id, first.compiled_plan_id);
    assert!(!reloaded_first.active);
}

#[tokio::test]
async fn application_public_api_publish_uses_real_flow_version_and_compiled_plan_records() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let repository = harness.repository();
    let service = ApplicationPublicationService::new(repository.clone());

    let publication = service
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig::default_native(),
            api_enabled: true,
        })
        .await
        .unwrap();
    let editor_state = repository
        .get_or_create_editor_state(application.workspace_id, application.id, actor_user_id())
        .await
        .unwrap();
    let compiled_plan = repository
        .get_compiled_plan(publication.compiled_plan_id)
        .await
        .unwrap()
        .expect("publish should persist a compiled plan");

    assert_eq!(publication.flow_id, editor_state.flow.id);
    assert!(editor_state
        .versions
        .iter()
        .any(|version| version.id == publication.flow_version_id && version.is_protected));
    assert_eq!(compiled_plan.flow_id, editor_state.flow.id);
    assert_eq!(publication.document_snapshot, editor_state.draft.document);
    assert_ne!(
        publication.flow_schema_version,
        "application-public-api-placeholder-v1"
    );
    assert_ne!(
        publication.document_snapshot["source"],
        "application_public_api_placeholder"
    );
}

#[tokio::test]
async fn application_public_api_publish_requires_application_edit_permission() {
    let harness =
        ApplicationPublicApiTestHarness::new_with_permissions(vec!["application.view.all"]);
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationPublicationService::new(harness.repository());

    let error = service
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig::default_native(),
            api_enabled: true,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}

#[tokio::test]
async fn application_public_api_only_one_active_publication_exists_per_application() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationPublicationService::new(harness.repository());

    service
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig::default_native(),
            api_enabled: true,
        })
        .await
        .unwrap();
    let latest = service
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: ApplicationApiMappingConfig::default_native(),
            api_enabled: true,
        })
        .await
        .unwrap();

    let versions = service
        .list_publication_versions(application.id)
        .await
        .unwrap();
    let active = versions
        .iter()
        .filter(|version| version.active)
        .collect::<Vec<_>>();

    assert_eq!(active.len(), 1);
    assert_eq!(active[0].id, latest.id);
}

#[tokio::test]
async fn application_public_api_public_lookup_returns_application_not_published_without_active_publication(
) {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Support Bot");
    let service = ApplicationPublicationService::new(harness.repository());

    let error = service
        .load_active_publication(LoadActiveApplicationPublicationCommand {
            application_id: application.id,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("application_not_published"));
}

#[test]
fn application_public_api_mapping_validation_rejects_missing_query_target_and_invalid_selector() {
    let missing_query_target = ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "".into(),
            model_target: None,
            inputs_target: None,
            history_target: None,
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput::default(),
    };
    let invalid_selector = ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "start.messages[0].content".into(),
            model_target: None,
            inputs_target: None,
            history_target: None,
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput::default(),
    };

    assert!(validate_application_api_mapping(&missing_query_target)
        .unwrap_err()
        .to_string()
        .contains("query_target"));
    assert!(validate_application_api_mapping(&invalid_selector)
        .unwrap_err()
        .to_string()
        .contains("selector"));
}

#[test]
fn application_public_api_mapping_validation_accepts_null_model_target() {
    let mapping = ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "node-start.query".into(),
            model_target: None,
            inputs_target: None,
            history_target: None,
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput::default(),
    };

    validate_application_api_mapping(&mapping).unwrap();
}
