use control_plane::{
    application_public_api::mapping::{
        ApplicationApiMappingConfig, ApplicationApiMappingInput, ApplicationApiMappingOutput,
    },
    ports::{
        ApplicationApiMappingRepository, ApplicationPublicationRepository,
        CreateApplicationPublicationVersionInput, ReplaceApplicationApiMappingInput,
    },
};
use sqlx::PgPool;
use storage_postgres::{connect, run_migrations, PgControlPlaneStore};
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

async fn current_schema(pool: &PgPool) -> String {
    sqlx::query_scalar("select current_schema()")
        .fetch_one(pool)
        .await
        .unwrap()
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

async fn seed_application(
    store: &PgControlPlaneStore,
    workspace_id: Uuid,
    actor_user_id: Uuid,
    name: &str,
) -> Uuid {
    let application_id = Uuid::now_v7();
    sqlx::query(
        r#"
        insert into applications (
            id, workspace_id, application_type, name, description, created_by, updated_by
        ) values ($1, $2, 'agent_flow', $3, '', $4, $4)
        "#,
    )
    .bind(application_id)
    .bind(workspace_id)
    .bind(name)
    .bind(actor_user_id)
    .execute(store.pool())
    .await
    .unwrap();
    application_id
}

async fn seed_flow_version_and_compiled_plan(
    store: &PgControlPlaneStore,
    application_id: Uuid,
    actor_user_id: Uuid,
) -> (Uuid, Uuid, Uuid, serde_json::Value) {
    let flow_id = Uuid::now_v7();
    let draft_id = Uuid::now_v7();
    let version_id = Uuid::now_v7();
    let compiled_plan_id = Uuid::now_v7();
    let document = domain::default_flow_document(flow_id);

    sqlx::query(
        "insert into flows (id, application_id, created_by, updated_by) values ($1, $2, $3, $3)",
    )
    .bind(flow_id)
    .bind(application_id)
    .bind(actor_user_id)
    .execute(store.pool())
    .await
    .unwrap();
    sqlx::query(
        "insert into flow_drafts (id, flow_id, schema_version, document, updated_by) values ($1, $2, $3, $4, $5)",
    )
    .bind(draft_id)
    .bind(flow_id)
    .bind(domain::FLOW_SCHEMA_VERSION)
    .bind(&document)
    .bind(actor_user_id)
    .execute(store.pool())
    .await
    .unwrap();
    sqlx::query(
        r#"
        insert into flow_versions (
            id, flow_id, sequence, trigger, change_kind, summary,
            summary_is_custom, is_protected, document, created_by
        ) values ($1, $2, 1, 'autosave', 'logical', 'published', false, true, $3, $4)
        "#,
    )
    .bind(version_id)
    .bind(flow_id)
    .bind(&document)
    .bind(actor_user_id)
    .execute(store.pool())
    .await
    .unwrap();
    sqlx::query(
        r#"
        insert into flow_compiled_plans (
            id, flow_id, flow_draft_id, schema_version, document_hash,
            document_updated_at, plan, created_by
        )
        select $1, $2, $3, $4, 'sha256:test', updated_at, $5, $6
        from flow_drafts
        where id = $3
        "#,
    )
    .bind(compiled_plan_id)
    .bind(flow_id)
    .bind(draft_id)
    .bind(domain::FLOW_SCHEMA_VERSION)
    .bind(serde_json::json!({"schema_version": domain::FLOW_SCHEMA_VERSION}))
    .bind(actor_user_id)
    .execute(store.pool())
    .await
    .unwrap();

    (flow_id, version_id, compiled_plan_id, document)
}

#[tokio::test]
async fn application_public_api_repository_api_keys_key_kind_separates_data_model_and_application_keys(
) {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool.clone());
    let schema = current_schema(&pool).await;
    let workspace_id = seed_workspace(&store, "Application API Keys").await;
    let actor_user_id = seed_user(&store, workspace_id, "api-key-owner").await;
    let application_id = seed_application(&store, workspace_id, actor_user_id, "Public App").await;

    let api_key_columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_schema = $1
          and table_name = 'api_keys'
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(api_key_columns.contains(&"key_kind".to_string()));
    assert!(api_key_columns.contains(&"application_id".to_string()));

    sqlx::query(
        r#"
        insert into api_keys (
            id, name, token_hash, token_prefix, creator_user_id, tenant_id,
            scope_kind, scope_id, key_kind, application_id, enabled
        ) values
            ($1, 'Data Model Key', 'dmk-hash', 'dmk_prefix', $2, $3,
             'workspace', $4, 'data_model_api_key', null, true),
            ($5, 'Application Key', 'apk-hash', 'apk_prefix', $2, $3,
             'workspace', $4, 'application_api_key', $6, true)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(actor_user_id)
    .bind(root_tenant_id(&store).await)
    .bind(workspace_id)
    .bind(Uuid::now_v7())
    .bind(application_id)
    .execute(&pool)
    .await
    .unwrap();

    let counts: Vec<(String, i64)> = sqlx::query_as(
        r#"
        select key_kind, count(*)::bigint
        from api_keys
        group by key_kind
        order by key_kind
        "#,
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(
        counts,
        vec![
            ("application_api_key".to_string(), 1),
            ("data_model_api_key".to_string(), 1),
        ]
    );

    let invalid_application_key = sqlx::query(
        r#"
        insert into api_keys (
            id, name, token_hash, token_prefix, creator_user_id, tenant_id,
            scope_kind, scope_id, key_kind, application_id, enabled
        ) values (
            $1, 'Broken Application Key', 'apk-broken', 'apk_broken', $2, $3,
            'workspace', $4, 'application_api_key', null, true
        )
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(actor_user_id)
    .bind(root_tenant_id(&store).await)
    .bind(workspace_id)
    .execute(&pool)
    .await;

    assert!(
        invalid_application_key.is_err(),
        "application_api_key rows must carry an application_id"
    );
}

#[tokio::test]
async fn application_public_api_repository_mapping_round_trips_default_and_replacement() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool.clone());
    let workspace_id = seed_workspace(&store, "Application Mapping").await;
    let actor_user_id = seed_user(&store, workspace_id, "mapping-owner").await;
    let application_id = seed_application(&store, workspace_id, actor_user_id, "Public App").await;

    let default_mapping =
        ApplicationApiMappingRepository::get_application_api_mapping(&store, application_id)
            .await
            .unwrap()
            .unwrap_or_else(ApplicationApiMappingConfig::default_native);
    let replacement = ApplicationApiMappingConfig {
        input: ApplicationApiMappingInput {
            query_target: "start.query".into(),
            model_target: None,
            inputs_target: Some("start.inputs".into()),
            history_target: Some("start.history".into()),
            attachments_target: None,
        },
        output: ApplicationApiMappingOutput {
            answer_selector: Some("answer.text".into()),
            usage_selector: None,
            files_selector: None,
            error_selector: None,
        },
    };
    ApplicationApiMappingRepository::replace_application_api_mapping(
        &store,
        &ReplaceApplicationApiMappingInput {
            actor_user_id,
            application_id,
            mapping: replacement.clone(),
        },
    )
    .await
    .unwrap();
    let stored =
        ApplicationApiMappingRepository::get_application_api_mapping(&store, application_id)
            .await
            .unwrap()
            .unwrap();

    assert_eq!(
        default_mapping,
        ApplicationApiMappingConfig::default_native()
    );
    assert_eq!(stored, replacement);
}

#[tokio::test]
async fn application_public_api_repository_publication_insert_uses_real_foreign_key_rows() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool.clone());
    let workspace_id = seed_workspace(&store, "Application Publication").await;
    let actor_user_id = seed_user(&store, workspace_id, "publication-owner").await;
    let application_id = seed_application(&store, workspace_id, actor_user_id, "Public App").await;
    let (flow_id, flow_version_id, compiled_plan_id, document) =
        seed_flow_version_and_compiled_plan(&store, application_id, actor_user_id).await;

    let publication =
        ApplicationPublicationRepository::create_active_application_publication_version(
            &store,
            &CreateApplicationPublicationVersionInput {
                actor_user_id,
                application_id,
                mapping_snapshot: ApplicationApiMappingConfig::default_native(),
                api_enabled: true,
                compiled_plan_id,
                flow_id,
                flow_version_id,
                flow_schema_version: domain::FLOW_SCHEMA_VERSION.to_string(),
                document_hash: "sha256:test".into(),
                document_snapshot: document.clone(),
                runtime_profile_snapshot: serde_json::json!({"profile": "test"}),
                output_selector: serde_json::json!({"answer_selector": "answer.text"}),
            },
        )
        .await
        .unwrap();
    let active = ApplicationPublicationRepository::load_active_application_publication(
        &store,
        application_id,
    )
    .await
    .unwrap()
    .unwrap();
    let stored_api_enabled: bool =
        sqlx::query_scalar("select api_enabled from applications where id = $1")
            .bind(application_id)
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(publication.flow_id, flow_id);
    assert_eq!(publication.flow_version_id, flow_version_id);
    assert_eq!(publication.compiled_plan_id, compiled_plan_id);
    assert_eq!(publication.document_snapshot, document);
    assert_eq!(active.id, publication.id);
    assert!(stored_api_enabled);
}

#[tokio::test]
async fn application_public_api_repository_migration_creates_publication_core_tables_and_indexes() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let schema = current_schema(&pool).await;

    let tables: Vec<String> = sqlx::query_scalar(
        r#"
        select table_name
        from information_schema.tables
        where table_schema = $1
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .unwrap();
    let application_columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_schema = $1
          and table_name = 'applications'
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .unwrap();
    let publication_columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_schema = $1
          and table_name = 'application_publication_versions'
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .unwrap();
    let active_publication_indexes: Vec<String> = sqlx::query_scalar(
        r#"
        select indexdef
        from pg_indexes
        where schemaname = $1
          and tablename = 'application_publication_versions'
          and indexdef ilike '%where active%'
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(tables.contains(&"application_api_mappings".to_string()));
    assert!(tables.contains(&"application_publication_versions".to_string()));
    assert!(application_columns.contains(&"api_enabled".to_string()));
    for expected_column in [
        "application_id",
        "flow_id",
        "flow_version_id",
        "compiled_plan_id",
        "version_sequence",
        "active",
        "api_enabled",
        "document_snapshot",
        "mapping_snapshot",
        "runtime_profile_snapshot",
        "output_selector",
    ] {
        assert!(
            publication_columns.contains(&expected_column.to_string()),
            "missing application_publication_versions.{expected_column}"
        );
    }
    assert_eq!(
        active_publication_indexes.len(),
        1,
        "exactly one partial active-publication index should enforce one active version per application"
    );
}
