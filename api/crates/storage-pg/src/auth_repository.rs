use anyhow::{anyhow, Result};
use async_trait::async_trait;
use control_plane::ports::{AuthRepository, BootstrapRepository, UpdateProfileInput};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, BoundRole, PermissionDefinition,
    RoleScopeKind, ScopeContext, TenantRecord, UserRecord,
};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::{
    mappers::{
        auth_mapper::{PgAuthMapper, StoredAuthenticatorRow},
        member_mapper::{PgMemberMapper, StoredMemberRow},
        team_mapper::{PgTeamMapper, StoredTeamRow},
    },
    repositories::{
        decode_role_scope_kind, tenant_id_for_team, PgControlPlaneStore, ROOT_TENANT_CODE,
        ROOT_TENANT_ID, ROOT_TENANT_NAME,
    },
};

async fn load_bound_roles(pool: &PgPool, user_id: Uuid) -> Result<Vec<BoundRole>> {
    let rows = sqlx::query(
        r#"
        select r.code, r.scope_kind, r.team_id as workspace_id
        from user_role_bindings urb
        join roles r on r.id = urb.role_id
        where urb.user_id = $1
        order by r.scope_kind asc, r.code asc
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| BoundRole {
            code: row.get("code"),
            scope_kind: decode_role_scope_kind(row.get::<String, _>("scope_kind").as_str()),
            workspace_id: row.get("workspace_id"),
        })
        .collect())
}

pub(crate) async fn map_user_row(pool: &PgPool, row: sqlx::postgres::PgRow) -> Result<UserRecord> {
    let user_id = row.get("id");
    let roles = load_bound_roles(pool, user_id)
        .await?
        .into_iter()
        .map(|role| (role.code, role.scope_kind, role.workspace_id))
        .collect();

    Ok(PgMemberMapper::to_user_record(StoredMemberRow {
        id: user_id,
        account: row.get("account"),
        email: row.get("email"),
        phone: row.get("phone"),
        password_hash: row.get("password_hash"),
        name: row.get("name"),
        nickname: row.get("nickname"),
        avatar_url: row.get("avatar_url"),
        introduction: row.get("introduction"),
        default_display_role: row.get("default_display_role"),
        email_login_enabled: row.get("email_login_enabled"),
        phone_login_enabled: row.get("phone_login_enabled"),
        status: row.get("status"),
        session_version: row.get("session_version"),
        roles,
    }))
}

#[async_trait]
impl BootstrapRepository for PgControlPlaneStore {
    async fn upsert_authenticator(&self, authenticator: &AuthenticatorRecord) -> Result<()> {
        sqlx::query(
            r#"
            insert into authenticators (id, name, auth_type, title, enabled, is_builtin, sort_order, options)
            values ($1, $2, $3, $4, $5, $6, 0, $7)
            on conflict (name) do update
              set auth_type = excluded.auth_type,
                  title = excluded.title,
                  enabled = excluded.enabled,
                  is_builtin = excluded.is_builtin,
                  options = excluded.options,
                  updated_at = now()
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(&authenticator.name)
        .bind(&authenticator.auth_type)
        .bind(&authenticator.title)
        .bind(authenticator.enabled)
        .bind(authenticator.is_builtin)
        .bind(&authenticator.options)
        .execute(self.pool())
        .await?;

        Ok(())
    }

    async fn upsert_permission_catalog(&self, permissions: &[PermissionDefinition]) -> Result<()> {
        let mut tx = self.pool().begin().await?;

        for permission in permissions {
            sqlx::query(
                r#"
                insert into permission_definitions (id, resource, action, scope, code, name, introduction)
                values ($1, $2, $3, $4, $5, $6, '')
                on conflict (code) do update
                  set resource = excluded.resource,
                      action = excluded.action,
                      scope = excluded.scope,
                      name = excluded.name,
                      updated_at = now()
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(&permission.resource)
            .bind(&permission.action)
            .bind(&permission.scope)
            .bind(&permission.code)
            .bind(&permission.name)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn upsert_root_tenant(&self) -> Result<TenantRecord> {
        let tenant_id = Uuid::parse_str(ROOT_TENANT_ID).expect("root tenant id should be valid");
        let row = sqlx::query(
            r#"
            insert into tenants (id, code, name, is_root, is_hidden)
            values ($1, $2, $3, true, true)
            on conflict (code) do update
              set name = excluded.name,
                  is_root = true,
                  is_hidden = true,
                  updated_at = now()
            returning id, code, name, is_root, is_hidden
            "#,
        )
        .bind(tenant_id)
        .bind(ROOT_TENANT_CODE)
        .bind(ROOT_TENANT_NAME)
        .fetch_one(self.pool())
        .await?;

        Ok(TenantRecord {
            id: row.get("id"),
            code: row.get("code"),
            name: row.get("name"),
            is_root: row.get("is_root"),
            is_hidden: row.get("is_hidden"),
        })
    }

    async fn upsert_workspace(
        &self,
        tenant_id: Uuid,
        workspace_name: &str,
    ) -> Result<domain::TeamRecord> {
        let existing = sqlx::query(
            r#"
            select id, tenant_id, name, logo_url, introduction
            from teams
            where tenant_id = $1 and lower(name) = lower($2)
            order by created_at asc
            limit 1
            "#,
        )
        .bind(tenant_id)
        .bind(workspace_name)
        .fetch_optional(self.pool())
        .await?;

        if let Some(row) = existing {
            return Ok(PgTeamMapper::to_team_record(StoredTeamRow {
                id: row.get("id"),
                tenant_id: row.get("tenant_id"),
                name: row.get("name"),
                logo_url: row.get("logo_url"),
                introduction: row.get("introduction"),
            }));
        }

        let id = Uuid::now_v7();
        sqlx::query(
            "insert into teams (id, tenant_id, name, logo_url, introduction) values ($1, $2, $3, null, '')",
        )
        .bind(id)
        .bind(tenant_id)
        .bind(workspace_name)
        .execute(self.pool())
        .await?;

        Ok(PgTeamMapper::to_team_record(StoredTeamRow {
            id,
            tenant_id,
            name: workspace_name.to_string(),
            logo_url: None,
            introduction: String::new(),
        }))
    }

    async fn upsert_builtin_roles(&self, workspace_id: Uuid) -> Result<()> {
        let mut tx = self.pool().begin().await?;

        for role in access_control::builtin_role_templates() {
            let scope_kind = match role.scope_kind {
                RoleScopeKind::System => "system",
                RoleScopeKind::Workspace => "workspace",
            };
            let scoped_workspace_id = if matches!(role.scope_kind, RoleScopeKind::Workspace) {
                Some(workspace_id)
            } else {
                None
            };

            let inserted_role_id: Option<Uuid> = sqlx::query_scalar(
                r#"
                insert into roles (id, scope_kind, team_id, code, name, introduction, is_builtin, is_editable, system_kind)
                values ($1, $2, $3, $4, $5, '', $6, $7, $8)
                on conflict do nothing
                returning id
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(scope_kind)
            .bind(scoped_workspace_id)
            .bind(&role.code)
            .bind(&role.name)
            .bind(role.is_builtin)
            .bind(role.is_editable)
            .bind(&role.code)
            .fetch_optional(&mut *tx)
            .await?;

            let role_id: Uuid = match role.scope_kind {
                RoleScopeKind::System => {
                    sqlx::query_scalar(
                        "select id from roles where scope_kind = 'system' and code = $1",
                    )
                    .bind(&role.code)
                    .fetch_one(&mut *tx)
                    .await?
                }
                RoleScopeKind::Workspace => sqlx::query_scalar(
                    "select id from roles where scope_kind = 'workspace' and team_id = $1 and code = $2",
                )
                .bind(workspace_id)
                .bind(&role.code)
                .fetch_one(&mut *tx)
                .await?,
            };

            if inserted_role_id.is_some() {
                for permission_code in role.permissions {
                    sqlx::query(
                        r#"
                        insert into role_permissions (id, role_id, permission_id)
                        select $1, $2, id
                        from permission_definitions
                        where code = $3
                        on conflict (role_id, permission_id) do nothing
                        "#,
                    )
                    .bind(Uuid::now_v7())
                    .bind(role_id)
                    .bind(permission_code)
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }

        tx.commit().await?;
        Ok(())
    }

    async fn upsert_root_user(
        &self,
        workspace_id: Uuid,
        account: &str,
        email: &str,
        password_hash: &str,
        name: &str,
        nickname: &str,
    ) -> Result<UserRecord> {
        if let Some(user) = self.find_user_for_password_login(account).await? {
            return Ok(user);
        }

        let user_id = Uuid::now_v7();
        let mut tx = self.pool().begin().await?;

        sqlx::query(
            r#"
            insert into users (
                id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
                default_display_role, email_login_enabled, phone_login_enabled, status, session_version
            )
            values ($1, $2, $3, null, $4, $5, $6, null, '', 'root', true, false, 'active', 1)
            "#,
        )
        .bind(user_id)
        .bind(account)
        .bind(email)
        .bind(password_hash)
        .bind(name)
        .bind(nickname)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "insert into team_memberships (id, team_id, user_id, introduction) values ($1, $2, $3, '') on conflict (team_id, user_id) do nothing",
        )
        .bind(Uuid::now_v7())
        .bind(workspace_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            insert into user_role_bindings (id, user_id, role_id)
            select $1, $2, id from roles where code = 'root' and scope_kind = 'system'
            on conflict (user_id, role_id) do nothing
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        self.find_user_by_id(user_id)
            .await?
            .ok_or_else(|| anyhow!("root user missing after bootstrap"))
    }
}

#[async_trait]
impl AuthRepository for PgControlPlaneStore {
    async fn find_authenticator(&self, name: &str) -> Result<Option<AuthenticatorRecord>> {
        let row = sqlx::query(
            "select name, auth_type, title, enabled, is_builtin, options from authenticators where name = $1",
        )
        .bind(name)
        .fetch_optional(self.pool())
        .await?;

        Ok(row.map(|row| {
            PgAuthMapper::to_authenticator_record(StoredAuthenticatorRow {
                name: row.get("name"),
                auth_type: row.get("auth_type"),
                title: row.get("title"),
                enabled: row.get("enabled"),
                is_builtin: row.get("is_builtin"),
                options: row.get("options"),
            })
        }))
    }

    async fn find_user_for_password_login(&self, identifier: &str) -> Result<Option<UserRecord>> {
        let lowered = identifier.trim().to_lowercase();
        let row = sqlx::query(
            r#"
            select
              u.id, u.account, u.email, u.phone, u.password_hash, u.name, u.nickname, u.avatar_url,
              u.introduction, u.default_display_role, u.email_login_enabled, u.phone_login_enabled,
              u.status, u.session_version
            from users u
            where lower(u.account) = $1
               or (u.email_login_enabled = true and lower(u.email) = $1)
               or (u.phone_login_enabled = true and lower(coalesce(u.phone, '')) = $1)
            limit 1
            "#,
        )
        .bind(lowered)
        .fetch_optional(self.pool())
        .await?;

        match row {
            Some(row) => Ok(Some(map_user_row(self.pool(), row).await?)),
            None => Ok(None),
        }
    }

    async fn find_user_by_id(&self, user_id: Uuid) -> Result<Option<UserRecord>> {
        let row = sqlx::query(
            r#"
            select id, account, email, phone, password_hash, name, nickname, avatar_url,
                   introduction, default_display_role, email_login_enabled, phone_login_enabled,
                   status, session_version
            from users where id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(self.pool())
        .await?;

        match row {
            Some(row) => Ok(Some(map_user_row(self.pool(), row).await?)),
            None => Ok(None),
        }
    }

    async fn default_scope_for_user(&self, user_id: Uuid) -> Result<ScopeContext> {
        if let Some(row) = sqlx::query(
            r#"
            select t.tenant_id, tm.team_id as workspace_id
            from team_memberships tm
            join teams t on t.id = tm.team_id
            where tm.user_id = $1
            order by tm.created_at asc
            limit 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(self.pool())
        .await?
        {
            return Ok(ScopeContext {
                tenant_id: row.get("tenant_id"),
                workspace_id: row.get("workspace_id"),
            });
        }

        let workspace_id = crate::repositories::primary_team_id(self.pool()).await?;
        Ok(ScopeContext {
            tenant_id: tenant_id_for_team(self.pool(), workspace_id).await?,
            workspace_id,
        })
    }

    async fn load_actor_context(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        workspace_id: Uuid,
        display_role: Option<&str>,
    ) -> Result<ActorContext> {
        let codes: Vec<String> = sqlx::query_scalar(
            r#"
            select r.code
            from user_role_bindings urb
            join roles r on r.id = urb.role_id
            where urb.user_id = $1 and (r.scope_kind = 'system' or r.team_id = $2)
            order by r.scope_kind asc, r.code asc
            "#,
        )
        .bind(user_id)
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        let permissions: Vec<String> = sqlx::query_scalar(
            r#"
            select distinct pd.code
            from user_role_bindings urb
            join roles r on r.id = urb.role_id
            join role_permissions rp on rp.role_id = r.id
            join permission_definitions pd on pd.id = rp.permission_id
            where urb.user_id = $1 and (r.scope_kind = 'system' or r.team_id = $2)
            order by pd.code asc
            "#,
        )
        .bind(user_id)
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        let effective_display_role = display_role
            .filter(|candidate| codes.iter().any(|code| code == *candidate))
            .map(str::to_string)
            .or_else(|| codes.first().cloned())
            .unwrap_or_else(|| "manager".to_string());

        if codes.iter().any(|code| code == "root") {
            return Ok(ActorContext::root_in_scope(
                user_id,
                tenant_id,
                workspace_id,
                &effective_display_role,
            ));
        }

        Ok(ActorContext::scoped_in_scope(
            user_id,
            tenant_id,
            workspace_id,
            &effective_display_role,
            permissions,
        ))
    }

    async fn update_password_hash(
        &self,
        user_id: Uuid,
        password_hash: &str,
        actor_id: Uuid,
    ) -> Result<i64> {
        let row = sqlx::query(
            r#"
            update users
            set password_hash = $2,
                session_version = session_version + 1,
                updated_by = $3,
                updated_at = now()
            where id = $1
            returning session_version
            "#,
        )
        .bind(user_id)
        .bind(password_hash)
        .bind(actor_id)
        .fetch_one(self.pool())
        .await?;

        Ok(row.get("session_version"))
    }

    async fn update_profile(&self, input: &UpdateProfileInput) -> Result<UserRecord> {
        let row = sqlx::query(
            r#"
            update users
            set name = $2,
                nickname = $3,
                email = $4,
                phone = $5,
                avatar_url = $6,
                introduction = $7,
                updated_by = $8,
                updated_at = now()
            where id = $1
            returning id, account, email, phone, password_hash, name, nickname, avatar_url,
                      introduction, default_display_role, email_login_enabled, phone_login_enabled,
                      status, session_version
            "#,
        )
        .bind(input.user_id)
        .bind(&input.name)
        .bind(&input.nickname)
        .bind(&input.email)
        .bind(&input.phone)
        .bind(&input.avatar_url)
        .bind(&input.introduction)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        map_user_row(self.pool(), row).await
    }

    async fn bump_session_version(&self, user_id: Uuid, actor_id: Uuid) -> Result<i64> {
        let row = sqlx::query(
            r#"
            update users
            set session_version = session_version + 1,
                updated_by = $2,
                updated_at = now()
            where id = $1
            returning session_version
            "#,
        )
        .bind(user_id)
        .bind(actor_id)
        .fetch_one(self.pool())
        .await?;

        Ok(row.get("session_version"))
    }

    async fn list_permissions(&self) -> Result<Vec<PermissionDefinition>> {
        let rows = sqlx::query(
            "select code, resource, action, scope, name from permission_definitions order by code asc",
        )
        .fetch_all(self.pool())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| PermissionDefinition {
                code: row.get("code"),
                resource: row.get("resource"),
                action: row.get("action"),
                scope: row.get("scope"),
                name: row.get("name"),
            })
            .collect())
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        sqlx::query(
            r#"
            insert into audit_logs (id, team_id, actor_user_id, target_type, target_id, event_code, payload, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(event.id)
        .bind(event.team_id)
        .bind(event.actor_user_id)
        .bind(&event.target_type)
        .bind(event.target_id)
        .bind(&event.event_code)
        .bind(&event.payload)
        .bind(event.created_at)
        .execute(self.pool())
        .await?;

        Ok(())
    }
}
