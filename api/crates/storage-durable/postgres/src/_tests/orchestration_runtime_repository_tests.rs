use control_plane::{
    errors::ControlPlaneError,
    ports::{
        AppendCreditLedgerInput, AppendModelFailoverAttemptLedgerInput, AppendRunEventInput,
        AppendRuntimeEventInput, AppendRuntimeSpanInput, AppendUsageLedgerInput,
        ApplicationRepository, AttachCompiledPlanToFlowRunInput, CreateApplicationInput,
        CreateCallbackTaskInput, CreateCheckpointInput, CreateFlowRunInput,
        CreateFlowRunShellInput, CreateNodeRunInput, CreateRuntimeDebugArtifactInput,
        FlowRepository, GetRuntimeDebugArtifactInput, LinkUsageLedgerToModelFailoverAttemptInput,
        OrchestrationRuntimeRepository, UpdateFlowRunInput, UpdateFlowRunPayloadsInput,
        UpdateNodeRunInput, UpdateNodeRunPayloadsInput, UpdateRunEventPayloadInput,
        UpsertCompiledPlanInput, UpsertDataModelSideEffectReceiptInput,
    },
};
use domain::{ApplicationType, CallbackTaskStatus, FlowRunMode, FlowRunStatus, NodeRunStatus};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use storage_postgres::{connect, run_migrations, PgControlPlaneStore};
use time::{macros::datetime, Duration, OffsetDateTime};
use tokio::sync::Barrier;
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase".into())
}

async fn isolated_database_url() -> String {
    let admin_pool = PgPool::connect(&base_database_url()).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().simple());
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();

    format!("{}?options=-csearch_path%3D{schema}", base_database_url())
}

async fn root_tenant_id(store: &PgControlPlaneStore) -> Uuid {
    sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap()
}

async fn seed_workspace(store: &PgControlPlaneStore, name: &str) -> Uuid {
    let workspace_id = Uuid::now_v7();
    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(workspace_id)
    .bind(root_tenant_id(store).await)
    .bind(name)
    .execute(store.pool())
    .await
    .unwrap();
    workspace_id
}

async fn seed_user(store: &PgControlPlaneStore, workspace_id: Uuid, account_prefix: &str) -> Uuid {
    let user_id = Uuid::now_v7();
    let account = format!("{account_prefix}-{}", user_id.simple());
    sqlx::query(
        r#"
        insert into users (
            id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
            default_display_role, email_login_enabled, phone_login_enabled, status, session_version,
            created_by, updated_by
        ) values (
            $1, $2, $3, null, 'hash', $4, $5, null, '', 'manager', true, false, 'active', 1, null, null
        )
        "#,
    )
    .bind(user_id)
    .bind(&account)
    .bind(format!("{account}@example.com"))
    .bind(&account)
    .bind(&account)
    .execute(store.pool())
    .await
    .unwrap();

    sqlx::query(
        "insert into workspace_memberships (id, workspace_id, user_id, introduction) values ($1, $2, $3, '')",
    )
    .bind(Uuid::now_v7())
    .bind(workspace_id)
    .bind(user_id)
    .execute(store.pool())
    .await
    .unwrap();

    user_id
}

#[derive(Debug, Clone)]
struct RuntimeSeedState {
    workspace_id: Uuid,
    application_id: Uuid,
    actor_user_id: Uuid,
    flow_id: Uuid,
    draft_id: Uuid,
    draft_updated_at: OffsetDateTime,
}

async fn seed_runtime_base(store: &PgControlPlaneStore) -> RuntimeSeedState {
    seed_runtime_base_with_workspace_name(store, "Runtime").await
}

async fn seed_runtime_base_with_workspace_name(
    store: &PgControlPlaneStore,
    workspace_name: &str,
) -> RuntimeSeedState {
    let workspace_id = seed_workspace(store, workspace_name).await;
    let actor_user_id = seed_user(store, workspace_id, "runtime-owner").await;
    let application = <PgControlPlaneStore as ApplicationRepository>::create_application(
        store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: ApplicationType::AgentFlow,
            name: "Runtime App".into(),
            description: "runtime".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap();
    let editor_state = <PgControlPlaneStore as FlowRepository>::get_or_create_editor_state(
        store,
        workspace_id,
        application.id,
        actor_user_id,
    )
    .await
    .unwrap();

    RuntimeSeedState {
        workspace_id,
        application_id: application.id,
        actor_user_id,
        flow_id: editor_state.flow.id,
        draft_id: editor_state.draft.id,
        draft_updated_at: editor_state.draft.updated_at,
    }
}

async fn seed_compiled_plan(
    store: &PgControlPlaneStore,
    seeded: &RuntimeSeedState,
) -> domain::CompiledPlanRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_compiled_plan(
        store,
        &UpsertCompiledPlanInput {
            actor_user_id: seeded.actor_user_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            schema_version: "1flowbase.flow/v2".into(),
            document_hash: "test-document-hash".to_string(),
            document_updated_at: seeded.draft_updated_at,
            plan: json!({
                "schema_version": "1flowbase.flow/v2",
                "topological_order": ["node-start", "node-llm"]
            }),
        },
    )
    .await
    .unwrap()
}

async fn seed_flow_run(
    store: &PgControlPlaneStore,
    seeded: &RuntimeSeedState,
    compiled: &domain::CompiledPlanRecord,
    started_at: OffsetDateTime,
) -> domain::FlowRunRecord {
    seed_flow_run_with_mode(
        store,
        seeded,
        compiled,
        started_at,
        FlowRunMode::DebugNodePreview,
        Some("node-llm".into()),
    )
    .await
}

async fn seed_flow_run_with_mode(
    store: &PgControlPlaneStore,
    seeded: &RuntimeSeedState,
    compiled: &domain::CompiledPlanRecord,
    started_at: OffsetDateTime,
    run_mode: FlowRunMode,
    target_node_id: Option<String>,
) -> domain::FlowRunRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run(
        store,
        &CreateFlowRunInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            compiled_plan_id: compiled.id,
            debug_session_id: "test-debug-session".to_string(),
            flow_schema_version: compiled.schema_version.clone(),
            document_hash: "test-document-hash".to_string(),
            run_mode,
            target_node_id,
            status: FlowRunStatus::Running,
            input_payload: json!({ "node-start": { "query": "总结退款政策" } }),
            started_at,
            api_key_id: None,
            publication_version_id: None,
            external_user: None,
            external_conversation_id: None,
            external_trace_id: None,
            compatibility_mode: None,
            idempotency_key: None,
        },
    )
    .await
    .unwrap()
}

async fn seed_application_api_key(store: &PgControlPlaneStore, seeded: &RuntimeSeedState) -> Uuid {
    let api_key_id = Uuid::now_v7();
    sqlx::query(
        r#"
        insert into api_keys (
            id,
            name,
            token_hash,
            token_prefix,
            creator_user_id,
            tenant_id,
            scope_kind,
            scope_id,
            key_kind,
            application_id
        ) values ($1, $2, $3, $4, $5, $6, 'workspace', $7, 'application_api_key', $8)
        "#,
    )
    .bind(api_key_id)
    .bind("application api key")
    .bind(format!("hash-{}", api_key_id.simple()))
    .bind("fb_test")
    .bind(seeded.actor_user_id)
    .bind(root_tenant_id(store).await)
    .bind(seeded.workspace_id)
    .bind(seeded.application_id)
    .execute(store.pool())
    .await
    .unwrap();

    api_key_id
}

async fn seed_node_run(
    store: &PgControlPlaneStore,
    flow_run: &domain::FlowRunRecord,
    started_at: OffsetDateTime,
) -> domain::NodeRunRecord {
    seed_node_run_for(
        store,
        flow_run,
        "node-llm",
        "llm",
        "LLM",
        json!({ "prompt_messages": ["总结退款政策"] }),
        started_at,
    )
    .await
}

async fn seed_node_run_for(
    store: &PgControlPlaneStore,
    flow_run: &domain::FlowRunRecord,
    node_id: &str,
    node_type: &str,
    node_alias: &str,
    input_payload: serde_json::Value,
    started_at: OffsetDateTime,
) -> domain::NodeRunRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_node_run(
        store,
        &CreateNodeRunInput {
            flow_run_id: flow_run.id,
            node_id: node_id.into(),
            node_type: node_type.into(),
            node_alias: node_alias.into(),
            status: NodeRunStatus::Running,
            input_payload,
            debug_payload: json!({}),
            started_at,
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn orchestration_runtime_repository_round_trips_published_public_run_metadata() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let api_key_id = seed_application_api_key(&store, &seeded).await;
    let publication_version_id = Uuid::now_v7();
    let started_at = datetime!(2026-05-09 23:55:00 UTC);

    let created = <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run(
        &store,
        &CreateFlowRunInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            compiled_plan_id: compiled.id,
            debug_session_id: "published-public-run".to_string(),
            flow_schema_version: compiled.schema_version.clone(),
            document_hash: compiled.document_hash.clone(),
            run_mode: FlowRunMode::PublishedApiRun,
            target_node_id: None,
            status: FlowRunStatus::Running,
            input_payload: json!({ "message": "hello" }),
            started_at,
            api_key_id: Some(api_key_id),
            publication_version_id: Some(publication_version_id),
            external_user: Some("external-user-1".to_string()),
            external_conversation_id: Some("conversation-1".to_string()),
            external_trace_id: Some("trace-1".to_string()),
            compatibility_mode: Some("native-v1".to_string()),
            idempotency_key: Some("idem-1".to_string()),
        },
    )
    .await
    .unwrap();

    assert_eq!(created.run_mode, FlowRunMode::PublishedApiRun);
    assert_eq!(created.run_mode.as_str(), "published_api_run");
    assert_eq!(created.api_key_id, Some(api_key_id));
    assert_eq!(created.publication_version_id, Some(publication_version_id));
    assert_eq!(created.external_user.as_deref(), Some("external-user-1"));
    assert_eq!(
        created.external_conversation_id.as_deref(),
        Some("conversation-1")
    );
    assert_eq!(created.external_trace_id.as_deref(), Some("trace-1"));
    assert_eq!(created.compatibility_mode.as_deref(), Some("native-v1"));
    assert_eq!(created.idempotency_key.as_deref(), Some("idem-1"));

    let fetched = <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_flow_run(
        &store,
        seeded.application_id,
        created.id,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(fetched.api_key_id, Some(api_key_id));
    assert_eq!(fetched.publication_version_id, Some(publication_version_id));
    assert_eq!(fetched.external_user.as_deref(), Some("external-user-1"));
    assert_eq!(
        fetched.external_conversation_id.as_deref(),
        Some("conversation-1")
    );
    assert_eq!(fetched.external_trace_id.as_deref(), Some("trace-1"));
    assert_eq!(fetched.compatibility_mode.as_deref(), Some("native-v1"));
    assert_eq!(fetched.idempotency_key.as_deref(), Some("idem-1"));

    let completed = <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_flow_run(
        &store,
        &UpdateFlowRunInput {
            flow_run_id: created.id,
            status: FlowRunStatus::Succeeded,
            output_payload: json!({ "ok": true }),
            error_payload: None,
            finished_at: Some(started_at + Duration::seconds(3)),
        },
    )
    .await
    .unwrap();
    assert_eq!(completed.api_key_id, Some(api_key_id));
    assert_eq!(
        completed.publication_version_id,
        Some(publication_version_id)
    );
    assert_eq!(completed.external_user.as_deref(), Some("external-user-1"));
    assert_eq!(
        completed.external_conversation_id.as_deref(),
        Some("conversation-1")
    );
    assert_eq!(completed.external_trace_id.as_deref(), Some("trace-1"));
    assert_eq!(completed.compatibility_mode.as_deref(), Some("native-v1"));
    assert_eq!(completed.idempotency_key.as_deref(), Some("idem-1"));
}

#[tokio::test]
async fn data_model_side_effect_receipts_upsert_and_get_by_workspace_key() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-05-08 10:00:00 UTC);
    let run = seed_flow_run(&store, &seeded, &compiled, started_at).await;
    let node_run = seed_node_run_for(
        &store,
        &run,
        "node-create",
        "data_model_create",
        "Data Model Create",
        json!({ "payload": { "title": "Order A" } }),
        started_at,
    )
    .await;
    let payload_hash = "sha256:test".to_string();
    let idempotency_key = format!(
        "data_model:{}:{}:{}:{}:{}:{}:{}",
        seeded.workspace_id,
        seeded.application_id,
        seeded.draft_id,
        run.id,
        node_run.node_id,
        "create",
        payload_hash
    );
    let input = UpsertDataModelSideEffectReceiptInput {
        workspace_id: seeded.workspace_id,
        application_id: seeded.application_id,
        draft_id: seeded.draft_id,
        flow_run_id: run.id,
        node_run_id: node_run.id,
        node_id: node_run.node_id.clone(),
        action: "create".to_string(),
        model_code: "orders".to_string(),
        record_id: Some("record-1".to_string()),
        deleted_id: None,
        affected_count: 1,
        idempotency_key: idempotency_key.clone(),
        payload_hash,
        actor_user_id: seeded.actor_user_id,
        scope_id: seeded.workspace_id,
        status: "succeeded".to_string(),
        output_payload: json!({
            "record": {
                "id": "record-1",
                "title": "Order A"
            }
        }),
    };

    let claim =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::claim_data_model_side_effect_receipt(
            &store, &input,
        )
        .await
        .unwrap();
    assert!(claim.claimed);
    assert_eq!(claim.record.status, "pending");

    let first =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_data_model_side_effect_receipt(
            &store, &input,
        )
        .await
        .unwrap();
    assert_eq!(first.id, claim.record.id);
    assert_eq!(first.status, "succeeded");
    let mut replay_input = input.clone();
    replay_input.record_id = Some("record-2".to_string());
    replay_input.output_payload = json!({
        "record": {
            "id": "record-2",
            "title": "Order B"
        }
    });
    let replay =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_data_model_side_effect_receipt(
            &store,
            &replay_input,
        )
        .await
        .unwrap();
    let loaded =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_data_model_side_effect_receipt(
            &store,
            seeded.workspace_id,
            &idempotency_key,
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(replay.id, first.id);
    assert_eq!(loaded.id, first.id);
    assert_eq!(loaded.record_id.as_deref(), Some("record-1"));
    assert_eq!(loaded.output_payload["record"]["id"], json!("record-1"));
    assert!(
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_data_model_side_effect_receipt(
            &store,
            Uuid::now_v7(),
            &idempotency_key,
        )
        .await
        .unwrap()
        .is_none()
    );
}

async fn seed_file_storage(
    store: &PgControlPlaneStore,
    actor_user_id: Uuid,
) -> domain::FileStorageRecord {
    let storage_id = Uuid::now_v7();
    sqlx::query(
        r#"
        insert into file_storages (
            id,
            code,
            title,
            driver_type,
            enabled,
            is_default,
            config_json,
            rule_json,
            created_by,
            updated_by
        )
        values ($1, $2, 'Runtime Debug', 'local', true, false, $3, '{}'::jsonb, $4, $4)
        "#,
    )
    .bind(storage_id)
    .bind(format!("runtime_debug_{}", storage_id.simple()))
    .bind(json!({ "root_path": "/tmp/1flowbase-runtime-debug-test" }))
    .bind(actor_user_id)
    .execute(store.pool())
    .await
    .unwrap();

    <PgControlPlaneStore as control_plane::ports::FileManagementRepository>::get_file_storage(
        store, storage_id,
    )
    .await
    .unwrap()
    .unwrap()
}

#[tokio::test]
async fn runtime_debug_artifacts_are_scoped_and_payload_previews_are_persisted() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-05-08 09:40:00 UTC);
    let run = seed_flow_run(&store, &seeded, &compiled, started_at).await;
    let node_run = seed_node_run(&store, &run, started_at).await;
    let run_event = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_run_event(
        &store,
        &AppendRunEventInput {
            flow_run_id: run.id,
            node_run_id: Some(node_run.id),
            event_type: "text_delta".into(),
            payload: json!({ "text": "x".repeat(128) }),
        },
    )
    .await
    .unwrap();
    let storage = seed_file_storage(&store, seeded.actor_user_id).await;
    let artifact_id = Uuid::now_v7();

    let artifact =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_runtime_debug_artifact(
            &store,
            &CreateRuntimeDebugArtifactInput {
                artifact_id,
                workspace_id: seeded.workspace_id,
                application_id: seeded.application_id,
                flow_run_id: Some(run.id),
                node_run_id: Some(node_run.id),
                run_event_id: Some(run_event.id),
                artifact_kind: "node_output_payload".into(),
                content_type: "application/json".into(),
                original_size_bytes: 4096,
                preview_size_bytes: 512,
                storage_id: storage.id,
                storage_ref: "runtime-debug/test/artifact.json".into(),
                retention_state: "active".into(),
            },
        )
        .await
        .unwrap();

    assert_eq!(artifact.id, artifact_id);
    assert_eq!(artifact.workspace_id, seeded.workspace_id);
    assert_eq!(artifact.application_id, seeded.application_id);
    assert_eq!(artifact.flow_run_id, Some(run.id));
    assert_eq!(artifact.node_run_id, Some(node_run.id));
    assert_eq!(artifact.run_event_id, Some(run_event.id));

    let loaded =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_runtime_debug_artifact(
            &store,
            &GetRuntimeDebugArtifactInput {
                workspace_id: seeded.workspace_id,
                application_id: seeded.application_id,
                artifact_id,
            },
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(loaded.storage_ref, "runtime-debug/test/artifact.json");
    assert!(
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_runtime_debug_artifact(
            &store,
            &GetRuntimeDebugArtifactInput {
                workspace_id: Uuid::now_v7(),
                application_id: seeded.application_id,
                artifact_id,
            },
        )
        .await
        .unwrap()
        .is_none()
    );
    let pending_delete_artifact_id = Uuid::now_v7();
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_runtime_debug_artifact(
        &store,
        &CreateRuntimeDebugArtifactInput {
            artifact_id: pending_delete_artifact_id,
            workspace_id: seeded.workspace_id,
            application_id: seeded.application_id,
            flow_run_id: Some(run.id),
            node_run_id: Some(node_run.id),
            run_event_id: Some(run_event.id),
            artifact_kind: "node_output_payload".into(),
            content_type: "application/json".into(),
            original_size_bytes: 1024,
            preview_size_bytes: 128,
            storage_id: storage.id,
            storage_ref: "runtime-debug/test/pending.json".into(),
            retention_state: "pending_delete".into(),
        },
    )
    .await
    .unwrap();
    assert!(
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_runtime_debug_artifact(
            &store,
            &GetRuntimeDebugArtifactInput {
                workspace_id: seeded.workspace_id,
                application_id: seeded.application_id,
                artifact_id: pending_delete_artifact_id,
            },
        )
        .await
        .unwrap()
        .is_none()
    );
    let deleted_artifact_id = Uuid::now_v7();
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_runtime_debug_artifact(
        &store,
        &CreateRuntimeDebugArtifactInput {
            artifact_id: deleted_artifact_id,
            workspace_id: seeded.workspace_id,
            application_id: seeded.application_id,
            flow_run_id: Some(run.id),
            node_run_id: Some(node_run.id),
            run_event_id: Some(run_event.id),
            artifact_kind: "node_output_payload".into(),
            content_type: "application/json".into(),
            original_size_bytes: 1024,
            preview_size_bytes: 128,
            storage_id: storage.id,
            storage_ref: "runtime-debug/test/deleted.json".into(),
            retention_state: "deleted".into(),
        },
    )
    .await
    .unwrap();
    assert!(
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_runtime_debug_artifact(
            &store,
            &GetRuntimeDebugArtifactInput {
                workspace_id: seeded.workspace_id,
                application_id: seeded.application_id,
                artifact_id: deleted_artifact_id,
            },
        )
        .await
        .unwrap()
        .is_none()
    );

    let flow_run =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_flow_run_payloads(
            &store,
            &UpdateFlowRunPayloadsInput {
                flow_run_id: run.id,
                input_payload: json!({
                    "__runtime_debug_artifact": true,
                    "artifact_ref": artifact_id.to_string(),
                    "is_truncated": true
                }),
                output_payload: json!({}),
                error_payload: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        flow_run.input_payload["artifact_ref"],
        artifact_id.to_string()
    );

    let node_run =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_node_run_payloads(
            &store,
            &UpdateNodeRunPayloadsInput {
                node_run_id: node_run.id,
                input_payload: json!({}),
                output_payload: json!({
                    "__runtime_debug_artifact": true,
                    "artifact_ref": artifact_id.to_string(),
                    "is_truncated": true
                }),
                error_payload: None,
                metrics_payload: json!({}),
                debug_payload: json!({}),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        node_run.output_payload["artifact_ref"],
        artifact_id.to_string()
    );

    let run_event =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_run_event_payload(
            &store,
            &UpdateRunEventPayloadInput {
                run_event_id: run_event.id,
                payload: json!({
                    "__runtime_debug_artifact": true,
                    "artifact_ref": artifact_id.to_string(),
                    "is_truncated": true
                }),
            },
        )
        .await
        .unwrap();
    assert_eq!(run_event.payload["artifact_ref"], artifact_id.to_string());
}

#[tokio::test]
async fn creates_flow_run_shell_and_attaches_compiled_plan() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;

    let shell = <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run_shell(
        &store,
        &CreateFlowRunShellInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            debug_session_id: "test-debug-session".to_string(),
            flow_schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "test-document-hash".to_string(),
            run_mode: FlowRunMode::DebugFlowRun,
            target_node_id: None,
            status: FlowRunStatus::Queued,
            input_payload: json!({ "node-start": { "query": "hello" } }),
            started_at: OffsetDateTime::now_utc(),
            api_key_id: None,
            publication_version_id: None,
            external_user: None,
            external_conversation_id: None,
            external_trace_id: None,
            compatibility_mode: None,
            idempotency_key: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(shell.compiled_plan_id, None);
    assert_eq!(shell.status, domain::FlowRunStatus::Queued);

    let compiled = <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_compiled_plan(
        &store,
        &UpsertCompiledPlanInput {
            actor_user_id: seeded.actor_user_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "test-document-hash".to_string(),
            document_updated_at: seeded.draft_updated_at,
            plan: json!({ "nodes": {}, "topological_order": [] }),
        },
    )
    .await
    .unwrap();

    let attached =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::attach_compiled_plan_to_flow_run(
            &store,
            &AttachCompiledPlanToFlowRunInput {
                flow_run_id: shell.id,
                compiled_plan_id: compiled.id,
                flow_schema_version: compiled.schema_version.clone(),
                document_hash: "test-document-hash".to_string(),
                status: FlowRunStatus::Running,
            },
        )
        .await
        .unwrap();

    assert_eq!(attached.compiled_plan_id, Some(compiled.id));
    assert_eq!(attached.status, FlowRunStatus::Running);
}

#[tokio::test]
async fn compiled_plan_rows_are_immutable_per_compile_and_attach_checks_document_scope() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;

    let first = <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_compiled_plan(
        &store,
        &UpsertCompiledPlanInput {
            actor_user_id: seeded.actor_user_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "document-hash-a".to_string(),
            document_updated_at: seeded.draft_updated_at,
            plan: json!({ "marker": "a", "nodes": {}, "topological_order": [] }),
        },
    )
    .await
    .unwrap();
    let second = <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_compiled_plan(
        &store,
        &UpsertCompiledPlanInput {
            actor_user_id: seeded.actor_user_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "document-hash-b".to_string(),
            document_updated_at: seeded.draft_updated_at + time::Duration::seconds(1),
            plan: json!({ "marker": "b", "nodes": {}, "topological_order": [] }),
        },
    )
    .await
    .unwrap();

    assert_ne!(first.id, second.id);
    let stored_first = <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_compiled_plan(
        &store, first.id,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(stored_first.document_hash, "document-hash-a");
    assert_eq!(stored_first.plan["marker"], "a");

    let shell = <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run_shell(
        &store,
        &CreateFlowRunShellInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            debug_session_id: "test-debug-session".to_string(),
            flow_schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "document-hash-a".to_string(),
            run_mode: FlowRunMode::DebugFlowRun,
            target_node_id: None,
            status: FlowRunStatus::Queued,
            input_payload: json!({ "node-start": { "query": "hello" } }),
            started_at: OffsetDateTime::now_utc(),
            api_key_id: None,
            publication_version_id: None,
            external_user: None,
            external_conversation_id: None,
            external_trace_id: None,
            compatibility_mode: None,
            idempotency_key: None,
        },
    )
    .await
    .unwrap();

    let err =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::attach_compiled_plan_to_flow_run(
            &store,
            &AttachCompiledPlanToFlowRunInput {
                flow_run_id: shell.id,
                compiled_plan_id: second.id,
                flow_schema_version: second.schema_version.clone(),
                document_hash: second.document_hash.clone(),
                status: FlowRunStatus::Running,
            },
        )
        .await
        .unwrap_err();

    assert!(err
        .to_string()
        .contains("flow run compiled plan cannot be attached"));
}

#[tokio::test]
async fn creates_flow_run_shell_and_attaches_compiled_plan_rejects_already_attached_shell() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;

    let shell = <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run_shell(
        &store,
        &CreateFlowRunShellInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            debug_session_id: "test-debug-session".to_string(),
            flow_schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "test-document-hash".to_string(),
            run_mode: FlowRunMode::DebugFlowRun,
            target_node_id: None,
            status: FlowRunStatus::Queued,
            input_payload: json!({ "node-start": { "query": "hello" } }),
            started_at: OffsetDateTime::now_utc(),
            api_key_id: None,
            publication_version_id: None,
            external_user: None,
            external_conversation_id: None,
            external_trace_id: None,
            compatibility_mode: None,
            idempotency_key: None,
        },
    )
    .await
    .unwrap();
    let compiled = seed_compiled_plan(&store, &seeded).await;

    <PgControlPlaneStore as OrchestrationRuntimeRepository>::attach_compiled_plan_to_flow_run(
        &store,
        &AttachCompiledPlanToFlowRunInput {
            flow_run_id: shell.id,
            compiled_plan_id: compiled.id,
            flow_schema_version: compiled.schema_version.clone(),
            document_hash: "test-document-hash".to_string(),
            status: FlowRunStatus::Running,
        },
    )
    .await
    .unwrap();

    let err =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::attach_compiled_plan_to_flow_run(
            &store,
            &AttachCompiledPlanToFlowRunInput {
                flow_run_id: shell.id,
                compiled_plan_id: compiled.id,
                flow_schema_version: compiled.schema_version.clone(),
                document_hash: "test-document-hash".to_string(),
                status: FlowRunStatus::Running,
            },
        )
        .await
        .unwrap_err();

    assert!(err
        .to_string()
        .contains("flow run compiled plan cannot be attached"));
    let stored = <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_flow_run(
        &store,
        seeded.application_id,
        shell.id,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(stored.compiled_plan_id, Some(compiled.id));
    assert_eq!(stored.status, FlowRunStatus::Running);
}

#[tokio::test]
async fn creates_flow_run_shell_and_attaches_compiled_plan_rejects_mismatched_compiled_plan() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let other_seeded = seed_runtime_base_with_workspace_name(&store, "Runtime Other").await;

    let shell = <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run_shell(
        &store,
        &CreateFlowRunShellInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            debug_session_id: "test-debug-session".to_string(),
            flow_schema_version: "1flowbase.flow/v2".to_string(),
            document_hash: "test-document-hash".to_string(),
            run_mode: FlowRunMode::DebugFlowRun,
            target_node_id: None,
            status: FlowRunStatus::Queued,
            input_payload: json!({ "node-start": { "query": "hello" } }),
            started_at: OffsetDateTime::now_utc(),
            api_key_id: None,
            publication_version_id: None,
            external_user: None,
            external_conversation_id: None,
            external_trace_id: None,
            compatibility_mode: None,
            idempotency_key: None,
        },
    )
    .await
    .unwrap();
    let other_compiled = seed_compiled_plan(&store, &other_seeded).await;

    let err =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::attach_compiled_plan_to_flow_run(
            &store,
            &AttachCompiledPlanToFlowRunInput {
                flow_run_id: shell.id,
                compiled_plan_id: other_compiled.id,
                flow_schema_version: other_compiled.schema_version.clone(),
                document_hash: "test-document-hash".to_string(),
                status: FlowRunStatus::Running,
            },
        )
        .await
        .unwrap_err();

    assert!(err
        .to_string()
        .contains("flow run compiled plan cannot be attached"));
    let stored = <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_flow_run(
        &store,
        seeded.application_id,
        shell.id,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(stored.compiled_plan_id, None);
    assert_eq!(stored.status, FlowRunStatus::Queued);
}

#[tokio::test]
async fn update_flow_run_if_status_does_not_overwrite_cancelled_run() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let run = seed_flow_run_with_mode(
        &store,
        &seeded,
        &compiled,
        OffsetDateTime::now_utc(),
        FlowRunMode::DebugFlowRun,
        None,
    )
    .await;

    let cancelled = <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_flow_run(
        &store,
        &UpdateFlowRunInput {
            flow_run_id: run.id,
            status: FlowRunStatus::Cancelled,
            output_payload: json!({}),
            error_payload: None,
            finished_at: Some(OffsetDateTime::now_utc()),
        },
    )
    .await
    .unwrap();
    assert_eq!(cancelled.status, FlowRunStatus::Cancelled);

    let updated =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_flow_run_if_status(
            &store,
            &UpdateFlowRunInput {
                flow_run_id: run.id,
                status: FlowRunStatus::Succeeded,
                output_payload: json!({ "answer": "done" }),
                error_payload: None,
                finished_at: Some(OffsetDateTime::now_utc()),
            },
            FlowRunStatus::Running,
        )
        .await
        .unwrap();

    assert!(updated.is_none());
    let stored = <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_flow_run(
        &store,
        seeded.application_id,
        run.id,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(stored.status, FlowRunStatus::Cancelled);
    assert_eq!(stored.output_payload, json!({}));
}

#[tokio::test]
async fn update_flow_run_if_status_returns_not_found_for_missing_run() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let error = <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_flow_run_if_status(
        &store,
        &UpdateFlowRunInput {
            flow_run_id: Uuid::now_v7(),
            status: FlowRunStatus::Succeeded,
            output_payload: json!({ "answer": "done" }),
            error_payload: None,
            finished_at: Some(OffsetDateTime::now_utc()),
        },
        FlowRunStatus::Running,
    )
    .await
    .unwrap_err();

    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::NotFound("flow_run"))
    ));
}

async fn append_event(
    store: &PgControlPlaneStore,
    flow_run: &domain::FlowRunRecord,
    node_run: Option<&domain::NodeRunRecord>,
    event_type: &str,
) -> domain::RunEventRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_run_event(
        store,
        &AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: node_run.map(|value| value.id),
            event_type: event_type.into(),
            payload: json!({ "event_type": event_type }),
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn orchestration_runtime_repository_persists_compiled_plan_runs_and_events() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-17 09:00:00 UTC);
    let run = seed_flow_run(&store, &seeded, &compiled, started_at).await;
    let node_run = seed_node_run(&store, &run, started_at + Duration::seconds(1)).await;
    append_event(&store, &run, Some(&node_run), "node_run_completed").await;

    let detail =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_application_run_detail(
            &store,
            run.application_id,
            run.id,
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.flow_run.id, run.id);
    assert_eq!(detail.node_runs.len(), 1);
    assert_eq!(detail.events[0].event_type, "node_run_completed");
}

#[tokio::test]
async fn orchestration_runtime_repository_batch_appends_run_and_runtime_events() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-17 09:00:00 UTC);
    let run = seed_flow_run(&store, &seeded, &compiled, started_at).await;

    let run_events = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_run_events(
        &store,
        &[
            AppendRunEventInput {
                flow_run_id: run.id,
                node_run_id: None,
                event_type: "text_delta".into(),
                payload: json!({ "delta": "hello" }),
            },
            AppendRunEventInput {
                flow_run_id: run.id,
                node_run_id: None,
                event_type: "finish".into(),
                payload: json!({ "reason": "stop" }),
            },
        ],
    )
    .await
    .unwrap();
    let runtime_events =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_runtime_events(
            &store,
            &[
                AppendRuntimeEventInput {
                    flow_run_id: run.id,
                    node_run_id: None,
                    span_id: None,
                    parent_span_id: None,
                    event_type: "text_delta".into(),
                    layer: domain::RuntimeEventLayer::ProviderRaw,
                    source: domain::RuntimeEventSource::Host,
                    trust_level: domain::RuntimeTrustLevel::HostFact,
                    item_id: None,
                    ledger_ref: None,
                    payload: json!({ "delta": "hello" }),
                    visibility: domain::RuntimeEventVisibility::Workspace,
                    durability: domain::RuntimeEventDurability::Durable,
                },
                AppendRuntimeEventInput {
                    flow_run_id: run.id,
                    node_run_id: None,
                    span_id: None,
                    parent_span_id: None,
                    event_type: "finish".into(),
                    layer: domain::RuntimeEventLayer::ProviderRaw,
                    source: domain::RuntimeEventSource::Host,
                    trust_level: domain::RuntimeTrustLevel::HostFact,
                    item_id: None,
                    ledger_ref: None,
                    payload: json!({ "reason": "stop" }),
                    visibility: domain::RuntimeEventVisibility::Workspace,
                    durability: domain::RuntimeEventDurability::Durable,
                },
            ],
        )
        .await
        .unwrap();

    assert_eq!(
        run_events
            .iter()
            .map(|event| (event.sequence, event.event_type.as_str()))
            .collect::<Vec<_>>(),
        vec![(1, "text_delta"), (2, "finish")]
    );
    assert_eq!(
        runtime_events
            .iter()
            .map(|event| (event.sequence, event.event_type.as_str()))
            .collect::<Vec<_>>(),
        vec![(1, "text_delta"), (2, "finish")]
    );
}

#[tokio::test]
async fn orchestration_runtime_repository_serializes_concurrent_run_event_sequences() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-17 09:00:00 UTC);
    let run = seed_flow_run(&store, &seeded, &compiled, started_at).await;
    let barrier = Arc::new(Barrier::new(12));
    let mut handles = Vec::new();

    for index in 0..12 {
        let store = store.clone();
        let barrier = Arc::clone(&barrier);
        let flow_run_id = run.id;
        handles.push(tokio::spawn(async move {
            barrier.wait().await;
            <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_run_event(
                &store,
                &AppendRunEventInput {
                    flow_run_id,
                    node_run_id: None,
                    event_type: format!("event_{index}"),
                    payload: json!({ "index": index }),
                },
            )
            .await
        }));
    }

    let mut events = Vec::new();
    for handle in handles {
        events.push(handle.await.unwrap().unwrap());
    }
    events.sort_by_key(|event| event.sequence);

    assert_eq!(
        events
            .iter()
            .map(|event| event.sequence)
            .collect::<Vec<_>>(),
        (1..=12).collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn orchestration_runtime_repository_persists_waiting_human_checkpoint() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-17 10:00:00 UTC);
    let run = seed_flow_run_with_mode(
        &store,
        &seeded,
        &compiled,
        started_at,
        FlowRunMode::DebugFlowRun,
        None,
    )
    .await;
    let node_run = seed_node_run_for(
        &store,
        &run,
        "node-human",
        "human_input",
        "Human Input",
        json!({ "prompt": "请人工审核" }),
        started_at + Duration::seconds(1),
    )
    .await;

    <PgControlPlaneStore as OrchestrationRuntimeRepository>::update_node_run(
        &store,
        &UpdateNodeRunInput {
            node_run_id: node_run.id,
            status: NodeRunStatus::WaitingHuman,
            output_payload: json!({}),
            error_payload: None,
            metrics_payload: json!({}),
            debug_payload: json!({ "waiting_reason": "manual_review" }),
            finished_at: None,
        },
    )
    .await
    .unwrap();
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_checkpoint(
        &store,
        &CreateCheckpointInput {
            flow_run_id: run.id,
            node_run_id: Some(node_run.id),
            status: "waiting_human".to_string(),
            reason: "等待人工输入".to_string(),
            locator_payload: json!({ "node_id": "node-human", "next_node_index": 3 }),
            variable_snapshot: json!({ "node-llm": { "text": "草稿回复" } }),
            external_ref_payload: Some(json!({ "prompt": "请人工审核" })),
        },
    )
    .await
    .unwrap();

    let detail =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_application_run_detail(
            &store,
            run.application_id,
            run.id,
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.flow_run.run_mode.as_str(), "debug_flow_run");
    assert_eq!(
        detail.node_runs[0].debug_payload,
        json!({ "waiting_reason": "manual_review" })
    );
    assert_eq!(detail.checkpoints[0].status, "waiting_human");
    assert_eq!(
        detail.checkpoints[0].external_ref_payload.as_ref().unwrap()["prompt"],
        json!("请人工审核")
    );
}

#[tokio::test]
async fn orchestration_runtime_repository_returns_callback_tasks_with_run_detail() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-17 11:00:00 UTC);
    let run = seed_flow_run_with_mode(
        &store,
        &seeded,
        &compiled,
        started_at,
        FlowRunMode::DebugFlowRun,
        None,
    )
    .await;
    let node_run = seed_node_run_for(
        &store,
        &run,
        "node-tool",
        "tool",
        "Tool",
        json!({ "tool_name": "lookup_order" }),
        started_at + Duration::seconds(1),
    )
    .await;

    let task = <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_callback_task(
        &store,
        &CreateCallbackTaskInput {
            flow_run_id: run.id,
            node_run_id: node_run.id,
            callback_kind: "tool".to_string(),
            request_payload: json!({ "tool_name": "lookup_order" }),
            external_ref_payload: Some(json!({ "tool_name": "lookup_order" })),
        },
    )
    .await
    .unwrap();

    let detail =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_application_run_detail(
            &store,
            run.application_id,
            run.id,
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.callback_tasks.len(), 1);
    assert_eq!(detail.callback_tasks[0].callback_kind, "tool");
    assert_eq!(detail.callback_tasks[0].status, CallbackTaskStatus::Pending);
    assert_eq!(detail.callback_tasks[0].id, task.id);

    <PgControlPlaneStore as OrchestrationRuntimeRepository>::complete_callback_task(
        &store,
        &control_plane::ports::CompleteCallbackTaskInput {
            callback_task_id: task.id,
            response_payload: json!({ "result": "ok" }),
            completed_at: started_at + Duration::seconds(5),
        },
    )
    .await
    .unwrap();
    let duplicate =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::complete_callback_task(
            &store,
            &control_plane::ports::CompleteCallbackTaskInput {
                callback_task_id: task.id,
                response_payload: json!({ "result": "again" }),
                completed_at: started_at + Duration::seconds(6),
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(
        duplicate.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::Conflict("callback_task_not_pending"))
    ));
}

#[tokio::test]
async fn latest_node_run_returns_most_recent_run_for_node() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let first_started_at = datetime!(2026-04-17 09:00:00 UTC);
    let second_started_at = first_started_at + Duration::minutes(5);
    let first_run = seed_flow_run(&store, &seeded, &compiled, first_started_at).await;
    let _ = seed_node_run(&store, &first_run, first_started_at + Duration::seconds(1)).await;
    let second_run = seed_flow_run(&store, &seeded, &compiled, second_started_at).await;
    let second_node_run = seed_node_run(
        &store,
        &second_run,
        second_started_at + Duration::seconds(1),
    )
    .await;

    let node_last_run =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_latest_node_run(
            &store,
            seeded.application_id,
            "node-llm",
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(node_last_run.node_run.id, second_node_run.id);
}

#[tokio::test]
async fn runtime_fact_spine_preserves_span_sequence_and_trust_level() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-27 09:00:00 UTC);
    let run = seed_flow_run_with_mode(
        &store,
        &seeded,
        &compiled,
        started_at,
        FlowRunMode::DebugFlowRun,
        None,
    )
    .await;

    let span = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_runtime_span(
        &store,
        &AppendRuntimeSpanInput {
            flow_run_id: run.id,
            node_run_id: None,
            parent_span_id: None,
            kind: domain::RuntimeSpanKind::Flow,
            name: "debug flow".into(),
            status: domain::RuntimeSpanStatus::Running,
            capability_id: None,
            input_ref: None,
            output_ref: None,
            error_payload: None,
            metadata: json!({ "mode": "debug_flow_run" }),
            started_at,
            finished_at: None,
        },
    )
    .await
    .unwrap();

    let event = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_runtime_event(
        &store,
        &AppendRuntimeEventInput {
            flow_run_id: run.id,
            node_run_id: None,
            span_id: Some(span.id),
            parent_span_id: None,
            event_type: "run_started".into(),
            layer: domain::RuntimeEventLayer::RuntimeItem,
            source: domain::RuntimeEventSource::Host,
            trust_level: domain::RuntimeTrustLevel::HostFact,
            item_id: None,
            ledger_ref: None,
            payload: json!({ "run_id": run.id }),
            visibility: domain::RuntimeEventVisibility::Workspace,
            durability: domain::RuntimeEventDurability::Durable,
        },
    )
    .await
    .unwrap();

    let spans =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::list_runtime_spans(&store, run.id)
            .await
            .unwrap();
    let events = <PgControlPlaneStore as OrchestrationRuntimeRepository>::list_runtime_events(
        &store, run.id, 0,
    )
    .await
    .unwrap();

    assert_eq!(spans[0].id, span.id);
    assert_eq!(events[0].id, event.id);
    assert_eq!(events[0].sequence, 1);
    assert_eq!(events[0].trust_level, domain::RuntimeTrustLevel::HostFact);
}

#[tokio::test]
async fn orchestration_runtime_repository_persists_model_failover_attempt_and_input_cache_usage_ledger(
) {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-27 09:00:00 UTC);
    let run = seed_flow_run_with_mode(
        &store,
        &seeded,
        &compiled,
        started_at,
        FlowRunMode::DebugFlowRun,
        None,
    )
    .await;
    let node_run = seed_node_run(&store, &run, started_at).await;
    let span = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_runtime_span(
        &store,
        &AppendRuntimeSpanInput {
            flow_run_id: run.id,
            node_run_id: Some(node_run.id),
            parent_span_id: None,
            kind: domain::RuntimeSpanKind::LlmTurn,
            name: "LLM".into(),
            status: domain::RuntimeSpanStatus::Running,
            capability_id: None,
            input_ref: None,
            output_ref: None,
            error_payload: None,
            metadata: json!({}),
            started_at,
            finished_at: None,
        },
    )
    .await
    .unwrap();
    let attempt =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_model_failover_attempt_ledger(
            &store,
            &AppendModelFailoverAttemptLedgerInput {
                flow_run_id: run.id,
                node_run_id: Some(node_run.id),
                llm_turn_span_id: Some(span.id),
                queue_snapshot_id: None,
                attempt_index: 0,
                provider_instance_id: None,
                provider_code: "fixture_provider".into(),
                upstream_model_id: "gpt-5.4-mini".into(),
                protocol: "openai_compatible".into(),
                request_ref: Some("runtime_artifact:inline:req".into()),
                request_hash: Some("sha256:req".into()),
                started_at,
                first_token_at: None,
                finished_at: Some(started_at + Duration::seconds(1)),
                status: "succeeded".into(),
                failed_after_first_token: false,
                upstream_request_id: Some("req-1".into()),
                error_code: None,
                error_message_ref: None,
                usage_ledger_id: None,
                cost_ledger_id: None,
                response_ref: Some("runtime_artifact:inline:res".into()),
            },
        )
        .await
        .unwrap();
    let usage = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_usage_ledger(
        &store,
        &AppendUsageLedgerInput {
            flow_run_id: run.id,
            node_run_id: Some(node_run.id),
            span_id: Some(span.id),
            failover_attempt_id: Some(attempt.id),
            provider_instance_id: None,
            gateway_route_id: None,
            model_id: Some("gpt-5.4-mini".into()),
            upstream_model_id: Some("gpt-5.4-mini".into()),
            upstream_request_id: Some("req-1".into()),
            input_tokens: Some(1),
            cached_input_tokens: None,
            output_tokens: Some(2),
            reasoning_output_tokens: None,
            total_tokens: Some(3),
            input_cache_hit_tokens: Some(40),
            input_cache_miss_tokens: Some(60),
            cache_read_tokens: None,
            cache_write_tokens: None,
            price_snapshot: None,
            cost_snapshot: None,
            usage_status: domain::UsageLedgerStatus::Recorded,
            raw_usage: json!({ "total_tokens": 3 }),
            normalized_usage: json!({ "total_tokens": 3 }),
        },
    )
    .await
    .unwrap();
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::link_usage_ledger_to_model_failover_attempt(
        &store,
        &LinkUsageLedgerToModelFailoverAttemptInput {
            failover_attempt_id: attempt.id,
            usage_ledger_id: usage.id,
        },
    )
    .await
    .unwrap();

    let attempts =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::list_model_failover_attempt_ledger(
            &store,
            run.id,
        )
        .await
        .unwrap();
    let usage_records =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::list_usage_ledger(&store, run.id)
            .await
            .unwrap();

    assert_eq!(attempts.len(), 1);
    assert_eq!(attempts[0].id, attempt.id);
    assert_eq!(attempts[0].usage_ledger_id, Some(usage.id));
    assert_eq!(usage_records[0].failover_attempt_id, Some(attempt.id));
    assert_eq!(usage_records[0].input_cache_hit_tokens, Some(40));
    assert_eq!(usage_records[0].input_cache_miss_tokens, Some(60));

    let cache_usage = sqlx::query_as::<_, (Option<i64>, Option<i64>)>(
        "select input_cache_hit_tokens, input_cache_miss_tokens from runtime_usage_ledger where id = $1",
    )
    .bind(usage.id)
    .fetch_one(store.pool())
    .await
    .unwrap();
    assert_eq!(cache_usage.0, Some(40));
    assert_eq!(cache_usage.1, Some(60));
}

#[tokio::test]
async fn credit_ledger_idempotency_prevents_double_debit() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Billing").await;
    let credit_ledger_columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'runtime_credit_ledger'
        "#,
    )
    .fetch_all(store.pool())
    .await
    .unwrap();

    assert!(credit_ledger_columns.contains(&"application_id".to_string()));
    assert!(!credit_ledger_columns.contains(&"app_id".to_string()));

    let first = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_credit_ledger(
        &store,
        &AppendCreditLedgerInput {
            workspace_id,
            user_id: None,
            application_id: None,
            agent_id: None,
            flow_run_id: None,
            span_id: None,
            cost_ledger_id: None,
            transaction_type: "debit".into(),
            amount: "3.50".into(),
            balance_after: Some("96.50".into()),
            credit_unit: "credit".into(),
            reason: "gateway_settle".into(),
            idempotency_key: "idem-1".into(),
            status: "posted".into(),
        },
    )
    .await
    .unwrap();

    let replay = <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_credit_ledger(
        &store,
        &AppendCreditLedgerInput {
            workspace_id,
            idempotency_key: "idem-1".into(),
            amount: "3.50".into(),
            transaction_type: "debit".into(),
            credit_unit: "credit".into(),
            reason: "gateway_settle".into(),
            status: "posted".into(),
            user_id: None,
            application_id: None,
            agent_id: None,
            flow_run_id: None,
            span_id: None,
            cost_ledger_id: None,
            balance_after: Some("96.50".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(first.id, replay.id);
}

#[tokio::test]
async fn audit_hash_chain_links_runtime_facts() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let run = seed_flow_run(
        &store,
        &seeded,
        &compiled,
        datetime!(2026-04-27 12:00:00 UTC),
    )
    .await;

    let first = store
        .append_audit_hash(
            run.id,
            "runtime_events",
            Uuid::now_v7(),
            serde_json::json!({"a":1}),
        )
        .await
        .unwrap();
    let second = store
        .append_audit_hash(
            run.id,
            "runtime_events",
            Uuid::now_v7(),
            serde_json::json!({"a":2}),
        )
        .await
        .unwrap();

    assert_eq!(second.prev_hash.as_deref(), Some(first.row_hash.as_str()));
}
