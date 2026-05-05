use control_plane::{
    errors::ControlPlaneError,
    ports::{
        CreateMemberInput, CreateWorkspaceRoleInput, MemberRepository, RoleRepository,
        UpdateWorkspaceRoleInput,
    },
};
use domain::{PermissionDefinition, RoleScopeKind, UserStatus};
use sqlx::PgPool;
use storage_postgres::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase".into())
}

async fn isolated_database_url() -> String {
    let admin_pool = PgPool::connect(&base_database_url()).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().to_string().replace('-', ""));
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();

    format!("{}?options=-csearch_path%3D{schema}", base_database_url())
}

async fn bootstrapped_store() -> (PgControlPlaneStore, Uuid, Uuid) {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let tenant = store.upsert_root_tenant().await.unwrap();
    let workspace = store
        .upsert_workspace(tenant.id, "1flowbase")
        .await
        .unwrap();

    store
        .upsert_permission_catalog(&access_control::permission_catalog())
        .await
        .unwrap();
    store.upsert_builtin_roles(workspace.id).await.unwrap();
    store
        .upsert_authenticator(&domain::AuthenticatorRecord {
            name: "password-local".into(),
            auth_type: "password-local".into(),
            title: "Password".into(),
            enabled: true,
            is_builtin: true,
            options: serde_json::json!({}),
        })
        .await
        .unwrap();
    let root = store
        .upsert_root_user(
            workspace.id,
            "root",
            "root@example.com",
            "root-hash",
            "Root",
            "Root",
        )
        .await
        .unwrap();

    (store, workspace.id, root.id)
}

async fn create_workspace_role(
    store: &PgControlPlaneStore,
    workspace_id: Uuid,
    actor_user_id: Uuid,
    code: &str,
) {
    <PgControlPlaneStore as RoleRepository>::create_team_role(
        store,
        &CreateWorkspaceRoleInput {
            actor_user_id,
            workspace_id,
            code: code.to_string(),
            name: code.to_string(),
            introduction: format!("{code} role"),
            auto_grant_new_permissions: false,
            is_default_member_role: false,
        },
    )
    .await
    .unwrap();
}

async fn role_codes_for_user(store: &PgControlPlaneStore, user_id: Uuid) -> Vec<String> {
    sqlx::query_scalar(
        r#"
        select r.code
        from user_role_bindings urb
        join roles r on r.id = urb.role_id
        where urb.user_id = $1
        order by r.code asc
        "#,
    )
    .bind(user_id)
    .fetch_all(store.pool())
    .await
    .unwrap()
}

async fn create_member(
    store: &PgControlPlaneStore,
    workspace_id: Uuid,
    actor_user_id: Uuid,
    account: &str,
) -> domain::UserRecord {
    <PgControlPlaneStore as MemberRepository>::create_member_with_default_role(
        store,
        &CreateMemberInput {
            actor_user_id,
            workspace_id,
            account: account.to_string(),
            email: format!("{account}@example.com"),
            phone: None,
            password_hash: "member-hash".to_string(),
            name: account.to_string(),
            nickname: account.to_string(),
            introduction: String::new(),
            email_login_enabled: true,
            phone_login_enabled: false,
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn create_member_with_default_role_assigns_default_role_and_login_identities() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;

    let member = <PgControlPlaneStore as MemberRepository>::create_member_with_default_role(
        &store,
        &CreateMemberInput {
            actor_user_id,
            workspace_id,
            account: "alice".to_string(),
            email: "alice@example.com".to_string(),
            phone: Some("18800001111".to_string()),
            password_hash: "member-hash".to_string(),
            name: "Alice".to_string(),
            nickname: "Alice".to_string(),
            introduction: "workspace member".to_string(),
            email_login_enabled: true,
            phone_login_enabled: true,
        },
    )
    .await
    .unwrap();

    assert_eq!(member.account, "alice");
    assert_eq!(member.status, UserStatus::Active);
    assert_eq!(member.default_display_role.as_deref(), Some("manager"));
    assert_eq!(
        role_codes_for_user(&store, member.id).await,
        vec!["manager"]
    );

    let membership_count: i64 = sqlx::query_scalar(
        "select count(*) from workspace_memberships where workspace_id = $1 and user_id = $2",
    )
    .bind(workspace_id)
    .bind(member.id)
    .fetch_one(store.pool())
    .await
    .unwrap();
    assert_eq!(membership_count, 1);

    let identities: Vec<(String, String)> = sqlx::query_as(
        r#"
        select subject_type, subject_value
        from user_auth_identities
        where user_id = $1
        order by subject_type asc
        "#,
    )
    .bind(member.id)
    .fetch_all(store.pool())
    .await
    .unwrap();
    assert_eq!(
        identities,
        vec![
            ("account".to_string(), "alice".to_string()),
            ("email".to_string(), "alice@example.com".to_string()),
            ("phone".to_string(), "18800001111".to_string()),
        ]
    );
}

#[tokio::test]
async fn replace_member_roles_normalizes_codes_and_replaces_workspace_roles() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;
    create_workspace_role(&store, workspace_id, actor_user_id, "auditor").await;
    create_workspace_role(&store, workspace_id, actor_user_id, "editor").await;
    let member = create_member(&store, workspace_id, actor_user_id, "bob").await;

    <PgControlPlaneStore as MemberRepository>::replace_member_roles(
        &store,
        actor_user_id,
        workspace_id,
        member.id,
        &[
            " editor ".to_string(),
            "auditor".to_string(),
            "editor".to_string(),
            String::new(),
        ],
    )
    .await
    .unwrap();

    assert_eq!(
        role_codes_for_user(&store, member.id).await,
        vec!["auditor", "editor"]
    );
}

#[tokio::test]
async fn member_status_and_password_updates_reject_root_and_bump_session_version() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;
    let member = create_member(&store, workspace_id, actor_user_id, "carol").await;

    <PgControlPlaneStore as MemberRepository>::reset_member_password(
        &store,
        actor_user_id,
        member.id,
        "new-member-hash",
    )
    .await
    .unwrap();
    <PgControlPlaneStore as MemberRepository>::disable_member(&store, actor_user_id, member.id)
        .await
        .unwrap();

    let updated: (String, i64, String) =
        sqlx::query_as("select status, session_version, password_hash from users where id = $1")
            .bind(member.id)
            .fetch_one(store.pool())
            .await
            .unwrap();
    assert_eq!(
        updated,
        ("disabled".to_string(), 3, "new-member-hash".to_string())
    );

    let root_disable = <PgControlPlaneStore as MemberRepository>::disable_member(
        &store,
        actor_user_id,
        actor_user_id,
    )
    .await
    .unwrap_err();
    assert!(matches!(
        root_disable.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::PermissionDenied("root_user_immutable"))
    ));

    let root_reset = <PgControlPlaneStore as MemberRepository>::reset_member_password(
        &store,
        actor_user_id,
        actor_user_id,
        "root-new-hash",
    )
    .await
    .unwrap_err();
    assert!(matches!(
        root_reset.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::PermissionDenied("root_user_immutable"))
    ));
}

#[tokio::test]
async fn replace_member_roles_rejects_unknown_code_without_clearing_existing_bindings() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;
    let member = create_member(&store, workspace_id, actor_user_id, "dana").await;

    let result = <PgControlPlaneStore as MemberRepository>::replace_member_roles(
        &store,
        actor_user_id,
        workspace_id,
        member.id,
        &["missing-role".to_string()],
    )
    .await;

    let error = result.unwrap_err();
    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::InvalidInput("role_code"))
    ));
    assert_eq!(
        role_codes_for_user(&store, member.id).await,
        vec!["manager"]
    );
}

#[tokio::test]
async fn create_and_update_workspace_role_keep_single_default_member_role() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;

    <PgControlPlaneStore as RoleRepository>::create_team_role(
        &store,
        &CreateWorkspaceRoleInput {
            actor_user_id,
            workspace_id,
            code: "operator".to_string(),
            name: "Operator".to_string(),
            introduction: "Ops role".to_string(),
            auto_grant_new_permissions: false,
            is_default_member_role: true,
        },
    )
    .await
    .unwrap();

    let initial_defaults: Vec<String> = sqlx::query_scalar(
        r#"
        select code
        from roles
        where scope_kind = 'workspace'
          and workspace_id = $1
          and is_default_member_role = true
        order by code asc
        "#,
    )
    .bind(workspace_id)
    .fetch_all(store.pool())
    .await
    .unwrap();
    assert_eq!(initial_defaults, vec!["operator"]);

    create_workspace_role(&store, workspace_id, actor_user_id, "reviewer").await;
    <PgControlPlaneStore as RoleRepository>::update_team_role(
        &store,
        &UpdateWorkspaceRoleInput {
            actor_user_id,
            workspace_id,
            role_code: "reviewer".to_string(),
            name: "Reviewer".to_string(),
            introduction: "Review role".to_string(),
            auto_grant_new_permissions: Some(true),
            is_default_member_role: Some(true),
        },
    )
    .await
    .unwrap();

    let roles = <PgControlPlaneStore as RoleRepository>::list_roles(&store, workspace_id)
        .await
        .unwrap();
    let default_roles: Vec<String> = roles
        .iter()
        .filter(|role| role.is_default_member_role)
        .map(|role| role.code.clone())
        .collect();
    let reviewer = roles
        .iter()
        .find(|role| role.code == "reviewer")
        .expect("reviewer role should exist");

    assert_eq!(default_roles, vec!["reviewer"]);
    assert_eq!(reviewer.scope_kind, RoleScopeKind::Workspace);
    assert!(reviewer.auto_grant_new_permissions);
    assert!(reviewer.is_editable);
}

#[tokio::test]
async fn replace_role_permissions_normalizes_codes_and_replaces_existing_permissions() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;
    create_workspace_role(&store, workspace_id, actor_user_id, "support").await;
    store
        .upsert_permission_catalog(&[
            PermissionDefinition {
                code: "workspace.support.read".to_string(),
                resource: "workspace".to_string(),
                action: "support.read".to_string(),
                scope: "workspace".to_string(),
                name: "Support read".to_string(),
            },
            PermissionDefinition {
                code: "workspace.support.write".to_string(),
                resource: "workspace".to_string(),
                action: "support.write".to_string(),
                scope: "workspace".to_string(),
                name: "Support write".to_string(),
            },
        ])
        .await
        .unwrap();

    <PgControlPlaneStore as RoleRepository>::replace_role_permissions(
        &store,
        actor_user_id,
        workspace_id,
        "support",
        &[
            " workspace.support.read ".to_string(),
            "workspace.support.write".to_string(),
            "workspace.support.read".to_string(),
            String::new(),
        ],
    )
    .await
    .unwrap();
    <PgControlPlaneStore as RoleRepository>::replace_role_permissions(
        &store,
        actor_user_id,
        workspace_id,
        "support",
        &["workspace.support.write".to_string()],
    )
    .await
    .unwrap();

    let permissions = <PgControlPlaneStore as RoleRepository>::list_role_permissions(
        &store,
        workspace_id,
        "support",
    )
    .await
    .unwrap();

    assert_eq!(permissions, vec!["workspace.support.write"]);
}

#[tokio::test]
async fn role_deletion_rejects_default_and_bound_roles_before_deleting_unused_custom_role() {
    let (store, workspace_id, actor_user_id) = bootstrapped_store().await;
    create_workspace_role(&store, workspace_id, actor_user_id, "temporary").await;
    create_workspace_role(&store, workspace_id, actor_user_id, "assigned").await;
    let member = create_member(&store, workspace_id, actor_user_id, "erin").await;

    <PgControlPlaneStore as MemberRepository>::replace_member_roles(
        &store,
        actor_user_id,
        workspace_id,
        member.id,
        &["assigned".to_string()],
    )
    .await
    .unwrap();

    let default_role_result = <PgControlPlaneStore as RoleRepository>::delete_team_role(
        &store,
        actor_user_id,
        workspace_id,
        "manager",
    )
    .await;
    let default_role_error = default_role_result.unwrap_err();
    assert!(matches!(
        default_role_error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::PermissionDenied(
            "builtin_role_immutable"
        )) | Some(ControlPlaneError::InvalidInput(
            "default_member_role_required"
        ))
    ));

    let bound_role_result = <PgControlPlaneStore as RoleRepository>::delete_team_role(
        &store,
        actor_user_id,
        workspace_id,
        "assigned",
    )
    .await;
    let bound_role_error = bound_role_result.unwrap_err();
    assert!(matches!(
        bound_role_error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::Conflict("role_in_use"))
    ));

    <PgControlPlaneStore as RoleRepository>::delete_team_role(
        &store,
        actor_user_id,
        workspace_id,
        "temporary",
    )
    .await
    .unwrap();
    let role_count: i64 = sqlx::query_scalar(
        "select count(*) from roles where workspace_id = $1 and code = 'temporary'",
    )
    .bind(workspace_id)
    .fetch_one(store.pool())
    .await
    .unwrap();
    assert_eq!(role_count, 0);
}
