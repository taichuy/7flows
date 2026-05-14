use control_plane::application_public_api::{
    api_keys::{ApplicationApiKeyService, CreateApplicationApiKeyCommand},
    mapping::{
        ApplicationApiMappingConfig, ApplicationApiMappingInput, ApplicationApiMappingOutput,
    },
    native::{CreateNativeRunCommand, NativeRunRequest, NativeRunValidationError},
    publications::{ApplicationPublicationService, PublishApplicationCommand},
    run_service::ApplicationPublishedRunService,
    ApplicationPublicApiTestHarness,
};
use serde_json::json;
use uuid::Uuid;

fn actor_user_id() -> Uuid {
    Uuid::from_u128(0x11111111111111111111111111111111)
}

fn native_request(response_mode: &str, idempotency_key: Option<&str>) -> NativeRunRequest {
    let execution = idempotency_key
        .map(|key| json!({ "idempotency_key": key }))
        .unwrap_or_else(|| json!({}));
    serde_json::from_value(json!({
        "query": "Summarize the incident",
        "model": "public-model/pass-through",
        "inputs": {
            "priority": "high"
        },
        "conversation": {
            "id": "conversation-1",
            "user": "customer-1"
        },
        "response_mode": response_mode,
        "execution": execution,
        "metadata": {
            "trace_id": "trace-1",
            "request_id": "req-1"
        },
        "compatibility_mode": "native-v1"
    }))
    .unwrap()
}

fn published_mapping() -> ApplicationApiMappingConfig {
    ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "node-start.query".into(),
            model_target: None,
            inputs_target: Some("node-start".into()),
            history_target: None,
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput::default(),
    }
}

async fn issue_key(harness: &ApplicationPublicApiTestHarness, application_id: Uuid) -> String {
    ApplicationApiKeyService::new(harness.repository())
        .create_api_key(CreateApplicationApiKeyCommand {
            actor_user_id: actor_user_id(),
            application_id,
            name: "Native runner".into(),
            expires_at: None,
        })
        .await
        .unwrap()
        .token
}

#[tokio::test]
async fn start_native_run_creates_published_api_flow_run_from_frozen_publication() {
    let harness = ApplicationPublicApiTestHarness::new();
    let repository = harness.repository();
    let application = harness.seed_application(actor_user_id(), "Published Native App");
    let token = issue_key(&harness, application.id).await;
    let publication = ApplicationPublicationService::new(repository.clone())
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: published_mapping(),
            api_enabled: true,
        })
        .await
        .unwrap();
    let service = ApplicationPublishedRunService::new(repository.clone());

    let result = service
        .start_native_run(CreateNativeRunCommand {
            bearer_token: token,
            request: native_request("streaming", None),
        })
        .await
        .unwrap();
    let flow_run = repository
        .get_flow_run(application.id, result.id)
        .await
        .unwrap()
        .expect("published flow run should be durable");

    assert_eq!(flow_run.run_mode, domain::FlowRunMode::PublishedApiRun);
    assert_eq!(flow_run.created_by, actor_user_id());
    assert_eq!(flow_run.flow_id, publication.flow_id);
    assert_eq!(
        flow_run.compiled_plan_id,
        Some(publication.compiled_plan_id)
    );
    assert_eq!(
        flow_run.flow_schema_version,
        publication.flow_schema_version
    );
    assert_eq!(flow_run.document_hash, publication.document_hash);
    assert_eq!(flow_run.publication_version_id, Some(publication.id));
    assert_eq!(flow_run.title, "Summarize the incident");
    assert_eq!(flow_run.external_user.as_deref(), Some("customer-1"));
    assert_eq!(
        flow_run.external_conversation_id.as_deref(),
        Some("conversation-1")
    );
    assert_eq!(flow_run.external_trace_id.as_deref(), Some("trace-1"));
    assert_eq!(flow_run.compatibility_mode.as_deref(), Some("native-v1"));
    assert_eq!(
        flow_run.input_payload,
        json!({
            "node-start": {
                "query": "Summarize the incident",
                "priority": "high"
            }
        })
    );
    assert_eq!(result.metadata["model"], json!("public-model/pass-through"));
}

#[tokio::test]
async fn start_native_run_uses_user_id_alias_and_truncates_title() {
    let harness = ApplicationPublicApiTestHarness::new();
    let repository = harness.repository();
    let application = harness.seed_application(actor_user_id(), "Aliased Native User App");
    let token = issue_key(&harness, application.id).await;
    ApplicationPublicationService::new(repository.clone())
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: published_mapping(),
            api_enabled: true,
        })
        .await
        .unwrap();
    let service = ApplicationPublishedRunService::new(repository.clone());
    let long_query = "Q".repeat(300);
    let expected_title = "Q".repeat(255);

    let result = service
        .start_native_run(CreateNativeRunCommand {
            bearer_token: token,
            request: serde_json::from_value(json!({
                "query": long_query,
                "model": "public-model/pass-through",
                "inputs": {
                    "priority": "high"
                },
                "user_id": "customer-alias-1",
                "response_mode": "blocking",
                "execution": {},
                "metadata": {
                    "trace_id": "trace-1"
                }
            }))
            .unwrap(),
        })
        .await
        .unwrap();
    let flow_run = repository
        .get_flow_run(application.id, result.id)
        .await
        .unwrap()
        .expect("published flow run should be durable");

    assert_eq!(flow_run.external_user.as_deref(), Some("customer-alias-1"));
    assert!(flow_run
        .external_conversation_id
        .as_deref()
        .is_some_and(|value| value.starts_with("conv_")));
    assert_eq!(flow_run.title, expected_title);
}

#[tokio::test]
async fn start_native_run_replays_existing_run_for_same_idempotency_key() {
    let harness = ApplicationPublicApiTestHarness::new();
    let repository = harness.repository();
    let application = harness.seed_application(actor_user_id(), "Idempotent Native App");
    let token = issue_key(&harness, application.id).await;
    ApplicationPublicationService::new(repository.clone())
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: published_mapping(),
            api_enabled: true,
        })
        .await
        .unwrap();
    let service = ApplicationPublishedRunService::new(repository.clone());

    let first = service
        .start_native_run(CreateNativeRunCommand {
            bearer_token: token.clone(),
            request: native_request("blocking", Some("idem-1")),
        })
        .await
        .unwrap();
    let second = service
        .start_native_run(CreateNativeRunCommand {
            bearer_token: token,
            request: native_request("blocking", Some("idem-1")),
        })
        .await
        .unwrap();

    assert_eq!(first.id, second.id);
    assert_eq!(repository.flow_run_count(), 1);
}

#[tokio::test]
async fn start_native_run_does_not_read_editor_state_after_publication() {
    let harness = ApplicationPublicApiTestHarness::new();
    let repository = harness.repository();
    let application = harness.seed_application(actor_user_id(), "Frozen Native App");
    let token = issue_key(&harness, application.id).await;
    ApplicationPublicationService::new(repository.clone())
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: application.id,
            mapping: published_mapping(),
            api_enabled: true,
        })
        .await
        .unwrap();
    repository.reset_editor_state_read_count();
    let service = ApplicationPublishedRunService::new(repository.clone());

    service
        .start_native_run(CreateNativeRunCommand {
            bearer_token: token,
            request: native_request("streaming", None),
        })
        .await
        .unwrap();

    assert_eq!(repository.editor_state_read_count(), 0);
}

#[tokio::test]
async fn start_native_run_returns_application_not_published_for_unpublished_or_disabled_application(
) {
    let harness = ApplicationPublicApiTestHarness::new();
    let repository = harness.repository();
    let unpublished = harness.seed_application(actor_user_id(), "Unpublished App");
    let unpublished_token = issue_key(&harness, unpublished.id).await;
    let disabled = harness.seed_application(actor_user_id(), "Disabled App");
    let disabled_token = issue_key(&harness, disabled.id).await;
    ApplicationPublicationService::new(repository.clone())
        .publish_active_version(PublishApplicationCommand {
            actor_user_id: actor_user_id(),
            application_id: disabled.id,
            mapping: published_mapping(),
            api_enabled: false,
        })
        .await
        .unwrap();
    let service = ApplicationPublishedRunService::new(repository);

    for token in [unpublished_token, disabled_token] {
        let error = service
            .start_native_run(CreateNativeRunCommand {
                bearer_token: token,
                request: native_request("blocking", None),
            })
            .await
            .unwrap_err();

        assert_eq!(error, NativeRunValidationError::ApplicationNotPublished);
    }
}
