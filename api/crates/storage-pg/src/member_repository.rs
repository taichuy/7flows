use std::collections::BTreeSet;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{AuthRepository, CreateMemberInput, MemberRepository},
};
use domain::{ActorContext, AuditLogRecord};
use uuid::Uuid;

use crate::{
    auth_repository::map_user_row,
    repositories::{is_root_user, primary_team_id, team_id_for_user, PgControlPlaneStore},
};

#[async_trait]
impl MemberRepository for PgControlPlaneStore {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        let team_id = team_id_for_user(self.pool(), actor_user_id).await?;
        AuthRepository::load_actor_context(self, actor_user_id, team_id, None).await
    }

    async fn create_member_with_default_role(
        &self,
        input: &CreateMemberInput,
    ) -> Result<domain::UserRecord> {
        let team_id = primary_team_id(self.pool()).await?;
        let manager_role_id: Uuid = sqlx::query_scalar(
            "select id from roles where scope_kind = 'team' and team_id = $1 and code = 'manager'",
        )
        .bind(team_id)
        .fetch_optional(self.pool())
        .await?
        .ok_or(ControlPlaneError::NotFound("manager_role"))?;
        let user_id = Uuid::now_v7();
        let mut tx = self.pool().begin().await?;

        sqlx::query(
            r#"
            insert into users (
                id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
                default_display_role, email_login_enabled, phone_login_enabled, status, session_version,
                created_by, updated_by
            )
            values (
                $1, $2, $3, $4, $5, $6, $7, null, $8,
                'manager', $9, $10, 'active', 1, $11, $11
            )
            "#,
        )
        .bind(user_id)
        .bind(&input.account)
        .bind(&input.email)
        .bind(&input.phone)
        .bind(&input.password_hash)
        .bind(&input.name)
        .bind(&input.nickname)
        .bind(&input.introduction)
        .bind(input.email_login_enabled)
        .bind(input.phone_login_enabled)
        .bind(input.actor_user_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            insert into team_memberships (id, team_id, user_id, introduction, created_by, updated_by)
            values ($1, $2, $3, $4, $5, $5)
            on conflict (team_id, user_id) do nothing
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(team_id)
        .bind(user_id)
        .bind(&input.introduction)
        .bind(input.actor_user_id)
        .execute(&mut *tx)
        .await?;

        for (subject_type, subject_value) in [
            ("account", Some(input.account.as_str())),
            ("email", Some(input.email.as_str())),
            ("phone", input.phone.as_deref()),
        ] {
            if let Some(subject_value) = subject_value {
                sqlx::query(
                    r#"
                    insert into user_auth_identities (
                        id, user_id, authenticator_name, subject_type, subject_value, metadata,
                        created_by, updated_by
                    )
                    values ($1, $2, 'password-local', $3, $4, '{}'::jsonb, $5, $5)
                    on conflict (authenticator_name, subject_type, lower(subject_value)) do nothing
                    "#,
                )
                .bind(Uuid::now_v7())
                .bind(user_id)
                .bind(subject_type)
                .bind(subject_value)
                .bind(input.actor_user_id)
                .execute(&mut *tx)
                .await?;
            }
        }

        sqlx::query(
            r#"
            insert into user_role_bindings (id, user_id, role_id, created_by, updated_by)
            values ($1, $2, $3, $4, $4)
            on conflict (user_id, role_id) do nothing
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(user_id)
        .bind(manager_role_id)
        .bind(input.actor_user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        self.find_user_by_id(user_id)
            .await?
            .ok_or_else(|| anyhow!("member missing after creation"))
    }

    async fn disable_member(&self, actor_user_id: Uuid, target_user_id: Uuid) -> Result<()> {
        if is_root_user(self.pool(), target_user_id).await? {
            return Err(ControlPlaneError::PermissionDenied("root_user_immutable").into());
        }

        let result = sqlx::query(
            r#"
            update users
            set status = 'disabled',
                session_version = session_version + 1,
                updated_by = $2,
                updated_at = now()
            where id = $1
            "#,
        )
        .bind(target_user_id)
        .bind(actor_user_id)
        .execute(self.pool())
        .await?;

        if result.rows_affected() == 0 {
            return Err(ControlPlaneError::NotFound("user").into());
        }

        Ok(())
    }

    async fn reset_member_password(
        &self,
        actor_user_id: Uuid,
        target_user_id: Uuid,
        password_hash: &str,
    ) -> Result<()> {
        if is_root_user(self.pool(), target_user_id).await? {
            return Err(ControlPlaneError::PermissionDenied("root_user_immutable").into());
        }

        let result = sqlx::query(
            r#"
            update users
            set password_hash = $2,
                session_version = session_version + 1,
                updated_by = $3,
                updated_at = now()
            where id = $1
            "#,
        )
        .bind(target_user_id)
        .bind(password_hash)
        .bind(actor_user_id)
        .execute(self.pool())
        .await?;

        if result.rows_affected() == 0 {
            return Err(ControlPlaneError::NotFound("user").into());
        }

        Ok(())
    }

    async fn replace_member_roles(
        &self,
        actor_user_id: Uuid,
        target_user_id: Uuid,
        role_codes: &[String],
    ) -> Result<()> {
        if is_root_user(self.pool(), target_user_id).await? {
            return Err(ControlPlaneError::PermissionDenied("root_user_immutable").into());
        }

        let team_id = primary_team_id(self.pool()).await?;
        let normalized_codes = role_codes
            .iter()
            .map(|code| code.trim())
            .filter(|code| !code.is_empty())
            .map(str::to_string)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();

        let mut role_ids = Vec::new();
        for role_code in &normalized_codes {
            let role_id: Uuid = sqlx::query_scalar(
                "select id from roles where scope_kind = 'team' and team_id = $1 and code = $2",
            )
            .bind(team_id)
            .bind(role_code)
            .fetch_optional(self.pool())
            .await?
            .ok_or(ControlPlaneError::InvalidInput("role_code"))?;
            role_ids.push(role_id);
        }

        let mut tx = self.pool().begin().await?;
        sqlx::query(
            r#"
            delete from user_role_bindings urb
            using roles r
            where urb.role_id = r.id
              and urb.user_id = $1
              and r.scope_kind = 'team'
              and r.team_id = $2
            "#,
        )
        .bind(target_user_id)
        .bind(team_id)
        .execute(&mut *tx)
        .await?;

        for role_id in role_ids {
            sqlx::query(
                r#"
                insert into user_role_bindings (id, user_id, role_id, created_by, updated_by)
                values ($1, $2, $3, $4, $4)
                on conflict (user_id, role_id) do nothing
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(target_user_id)
            .bind(role_id)
            .bind(actor_user_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn list_members(&self) -> Result<Vec<domain::UserRecord>> {
        let team_id = primary_team_id(self.pool()).await?;
        let rows = sqlx::query(
            r#"
            select
              u.id, u.account, u.email, u.phone, u.password_hash, u.name, u.nickname, u.avatar_url,
              u.introduction, u.default_display_role, u.email_login_enabled, u.phone_login_enabled,
              u.status, u.session_version
            from team_memberships tm
            join users u on u.id = tm.user_id
            where tm.team_id = $1
            order by tm.created_at asc, u.created_at asc
            "#,
        )
        .bind(team_id)
        .fetch_all(self.pool())
        .await?;

        let mut members = Vec::with_capacity(rows.len());
        for row in rows {
            members.push(map_user_row(self.pool(), row).await?);
        }

        Ok(members)
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        AuthRepository::append_audit_log(self, event).await
    }
}
