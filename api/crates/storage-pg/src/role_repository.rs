use std::collections::BTreeSet;

use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{AuthRepository, RoleRepository},
};
use domain::{ActorContext, AuditLogRecord, RoleScopeKind};
use uuid::Uuid;

use crate::{
    mappers::role_mapper::PgRoleMapper,
    repositories::{
        find_role_by_code, permission_codes_for_role, stored_role_from_row, team_id_for_user,
        tenant_id_for_team, PgControlPlaneStore,
    },
};

#[async_trait]
impl RoleRepository for PgControlPlaneStore {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        let team_id = team_id_for_user(self.pool(), actor_user_id).await?;
        let tenant_id = tenant_id_for_team(self.pool(), team_id).await?;
        AuthRepository::load_actor_context(self, actor_user_id, tenant_id, team_id, None).await
    }

    async fn list_roles(&self, workspace_id: Uuid) -> Result<Vec<domain::RoleTemplate>> {
        let rows = sqlx::query(
            r#"
            select id, code, name, scope_kind, is_builtin, is_editable
            from roles
            where scope_kind = 'workspace' and team_id = $1
            order by scope_kind asc, code asc
            "#,
        )
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        let mut roles = Vec::with_capacity(rows.len());
        for row in rows {
            let role = stored_role_from_row(row);
            let permissions = permission_codes_for_role(self.pool(), role.id).await?;
            roles.push(PgRoleMapper::to_role_template(role, permissions));
        }

        Ok(roles)
    }

    async fn create_team_role(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        code: &str,
        name: &str,
        introduction: &str,
    ) -> Result<()> {
        if find_role_by_code(self.pool(), workspace_id, code)
            .await?
            .is_some()
        {
            return Err(ControlPlaneError::Conflict("role_code").into());
        }

        sqlx::query(
            r#"
            insert into roles (
                id, scope_kind, team_id, code, name, introduction, is_builtin, is_editable,
                created_by, updated_by
            )
            values ($1, 'workspace', $2, $3, $4, $5, false, true, $6, $6)
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(workspace_id)
        .bind(code)
        .bind(name)
        .bind(introduction)
        .bind(actor_user_id)
        .execute(self.pool())
        .await?;

        Ok(())
    }

    async fn update_team_role(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
        name: &str,
        introduction: &str,
    ) -> Result<()> {
        let role = find_role_by_code(self.pool(), workspace_id, role_code)
            .await?
            .ok_or(ControlPlaneError::NotFound("role"))?;
        if role.code == "root"
            || !role.is_editable
            || matches!(role.scope_kind, RoleScopeKind::System)
        {
            return Err(ControlPlaneError::PermissionDenied("root_role_immutable").into());
        }

        let result = sqlx::query(
            r#"
            update roles
            set name = $2,
                introduction = $3,
                updated_by = $4,
                updated_at = now()
            where id = $1
            "#,
        )
        .bind(role.id)
        .bind(name)
        .bind(introduction)
        .bind(actor_user_id)
        .execute(self.pool())
        .await?;

        if result.rows_affected() == 0 {
            return Err(ControlPlaneError::NotFound("role").into());
        }

        Ok(())
    }

    async fn delete_team_role(
        &self,
        _actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
    ) -> Result<()> {
        let role = find_role_by_code(self.pool(), workspace_id, role_code)
            .await?
            .ok_or(ControlPlaneError::NotFound("role"))?;
        if role.code == "root"
            || role.is_builtin
            || matches!(role.scope_kind, RoleScopeKind::System)
        {
            return Err(ControlPlaneError::PermissionDenied("builtin_role_immutable").into());
        }

        let binding_count: i64 =
            sqlx::query_scalar("select count(*) from user_role_bindings where role_id = $1")
                .bind(role.id)
                .fetch_one(self.pool())
                .await?;
        if binding_count > 0 {
            return Err(ControlPlaneError::Conflict("role_in_use").into());
        }

        sqlx::query("delete from roles where id = $1")
            .bind(role.id)
            .execute(self.pool())
            .await?;
        Ok(())
    }

    async fn replace_role_permissions(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
        permission_codes: &[String],
    ) -> Result<()> {
        let role = find_role_by_code(self.pool(), workspace_id, role_code)
            .await?
            .ok_or(ControlPlaneError::NotFound("role"))?;
        if role.code == "root" || !role.is_editable {
            return Err(ControlPlaneError::PermissionDenied("root_role_immutable").into());
        }

        let normalized_codes = permission_codes
            .iter()
            .map(|code| code.trim())
            .filter(|code| !code.is_empty())
            .map(str::to_string)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let mut permission_ids = Vec::with_capacity(normalized_codes.len());
        for permission_code in &normalized_codes {
            let permission_id: Uuid =
                sqlx::query_scalar("select id from permission_definitions where code = $1")
                    .bind(permission_code)
                    .fetch_optional(self.pool())
                    .await?
                    .ok_or(ControlPlaneError::InvalidInput("permission_code"))?;
            permission_ids.push(permission_id);
        }

        let mut tx = self.pool().begin().await?;
        sqlx::query("delete from role_permissions where role_id = $1")
            .bind(role.id)
            .execute(&mut *tx)
            .await?;

        for permission_id in permission_ids {
            sqlx::query(
                r#"
                insert into role_permissions (id, role_id, permission_id, created_by, updated_by)
                values ($1, $2, $3, $4, $4)
                on conflict (role_id, permission_id) do nothing
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(role.id)
            .bind(permission_id)
            .bind(actor_user_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn list_role_permissions(
        &self,
        workspace_id: Uuid,
        role_code: &str,
    ) -> Result<Vec<String>> {
        let role = find_role_by_code(self.pool(), workspace_id, role_code)
            .await?
            .ok_or(ControlPlaneError::NotFound("role"))?;

        permission_codes_for_role(self.pool(), role.id).await
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        AuthRepository::append_audit_log(self, event).await
    }
}
