use control_plane::application_public_api::{
    api_keys::{ApplicationApiKeyService, CreateApplicationApiKeyCommand},
    mapping::{
        ApplicationApiMappingConfig, ApplicationApiMappingInput, ApplicationApiMappingOutput,
    },
    native::{
        ApplicationNativeRunService, CreateNativeRunCommand, NativeRunValidationError,
        ResumeNativeRunCommand,
    },
    publications::{ApplicationPublicationService, PublishApplicationCommand},
    ApplicationPublicApiTestHarness,
};
use serde_json::json;
use uuid::Uuid;

fn actor_user_id() -> Uuid {
    Uuid::from_u128(0x11111111111111111111111111111111)
}

fn other_user_id() -> Uuid {
    Uuid::from_u128(0x22222222222222222222222222222222)
}

fn published_mapping() -> ApplicationApiMappingConfig {
    ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "start.query".into(),
            model_target: None,
            inputs_target: None,
            history_target: None,
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput::default(),
    }
}

async fn issue_key(
    harness: &ApplicationPublicApiTestHarness,
    application_id: Uuid,
    owner_user_id: Uuid,
) -> String {
    ApplicationApiKeyService::new(harness.repository())
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: owner_user_id,
            application_id,
            name: "Native runner".into(),
            expires_at: None,
        })
        .await
        .unwrap()
        .token
}

async fn publish_application(
    harness: &ApplicationPublicApiTestHarness,
    application_id: Uuid,
    owner_user_id: Uuid,
) {
    ApplicationPublicationService::new(harness.repository())
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: owner_user_id,
            application_id,
            mapping: published_mapping(),
            api_enabled: true,
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn native_resume_rejects_callback_task_from_another_run() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Resume App");
    let token = issue_key(&harness, application.id, actor_user_id()).await;
    publish_application(&harness, application.id, actor_user_id()).await;
    let repository = harness.repository();
    let service = ApplicationNativeRunService::new(repository.clone());
    let first = service
        .create_native_run(CreateNativeRunCommand {
            bearer_token: token.clone(),
            request: serde_json::from_value(json!({ "query": "First" })).unwrap(),
        })
        .await
        .unwrap();
    let second = service
        .create_native_run(CreateNativeRunCommand {
            bearer_token: token.clone(),
            request: serde_json::from_value(json!({ "query": "Second" })).unwrap(),
        })
        .await
        .unwrap();
    let callback_task = repository.seed_pending_callback_task(second.id);

    let error = service
        .resume_native_run(ResumeNativeRunCommand {
            bearer_token: token,
            run_id: first.id,
            callback_task_id: callback_task.id,
            response_payload: json!({ "answer": "approved" }),
            response_mode: Some("blocking".into()),
        })
        .await
        .unwrap_err();

    assert_eq!(error, NativeRunValidationError::Forbidden);
}

#[tokio::test]
async fn native_resume_validates_ownership_before_execution_continuation_boundary() {
    let harness = ApplicationPublicApiTestHarness::new();
    let first_application = harness.seed_application(actor_user_id(), "Owned Resume App");
    let second_application = harness.seed_application(other_user_id(), "Other Resume App");
    let first_token = issue_key(&harness, first_application.id, actor_user_id()).await;
    let second_token = issue_key(&harness, second_application.id, other_user_id()).await;
    publish_application(&harness, first_application.id, actor_user_id()).await;
    publish_application(&harness, second_application.id, other_user_id()).await;
    let repository = harness.repository();
    let service = ApplicationNativeRunService::new(repository.clone());
    let run = service
        .create_native_run(CreateNativeRunCommand {
            bearer_token: first_token,
            request: serde_json::from_value(json!({ "query": "First" })).unwrap(),
        })
        .await
        .unwrap();
    let callback_task = repository.seed_pending_callback_task(run.id);

    let error = service
        .resume_native_run(ResumeNativeRunCommand {
            bearer_token: second_token,
            run_id: run.id,
            callback_task_id: callback_task.id,
            response_payload: json!({ "answer": "approved" }),
            response_mode: Some("streaming".into()),
        })
        .await
        .unwrap_err();

    assert_eq!(error, NativeRunValidationError::Forbidden);
}

#[tokio::test]
async fn native_resume_owned_callback_stops_at_explicit_continuation_todo_boundary() {
    let harness = ApplicationPublicApiTestHarness::new();
    let application = harness.seed_application(actor_user_id(), "Resume TODO App");
    let token = issue_key(&harness, application.id, actor_user_id()).await;
    publish_application(&harness, application.id, actor_user_id()).await;
    let repository = harness.repository();
    let service = ApplicationNativeRunService::new(repository.clone());
    let run = service
        .create_native_run(CreateNativeRunCommand {
            bearer_token: token.clone(),
            request: serde_json::from_value(json!({ "query": "First" })).unwrap(),
        })
        .await
        .unwrap();
    let callback_task = repository.seed_pending_callback_task(run.id);

    let error = service
        .resume_native_run(ResumeNativeRunCommand {
            bearer_token: token,
            run_id: run.id,
            callback_task_id: callback_task.id,
            response_payload: json!({ "answer": "approved" }),
            response_mode: Some("blocking".into()),
        })
        .await
        .unwrap_err();

    assert_eq!(
        error,
        NativeRunValidationError::ResumeContinuationNotImplemented
    );
    assert!(repository
        .run_event_types(run.id)
        .contains(&"public_run_resume_requested".to_string()));
}
