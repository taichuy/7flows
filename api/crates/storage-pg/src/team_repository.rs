use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::TeamRepository;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::team_mapper::{PgTeamMapper, StoredTeamRow},
    repositories::{is_root_user, PgControlPlaneStore},
};

fn map_team_record(row: sqlx::postgres::PgRow) -> domain::TeamRecord {
    PgTeamMapper::to_team_record(StoredTeamRow {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        name: row.get("name"),
        logo_url: row.get("logo_url"),
        introduction: row.get("introduction"),
    })
}

#[async_trait]
impl TeamRepository for PgControlPlaneStore {
    async fn get_team(&self, team_id: Uuid) -> Result<Option<domain::TeamRecord>> {
        let row = sqlx::query(
            "select id, tenant_id, name, logo_url, introduction from teams where id = $1",
        )
        .bind(team_id)
        .fetch_optional(self.pool())
        .await?;

        Ok(row.map(map_team_record))
    }

    async fn list_accessible_workspaces(&self, user_id: Uuid) -> Result<Vec<domain::TeamRecord>> {
        let rows = if is_root_user(self.pool(), user_id).await? {
            sqlx::query(
                r#"
                select id, tenant_id, name, logo_url, introduction
                from teams
                order by lower(name), created_at asc, id asc
                "#,
            )
            .fetch_all(self.pool())
            .await?
        } else {
            sqlx::query(
                r#"
                select t.id, t.tenant_id, t.name, t.logo_url, t.introduction
                from teams t
                where exists (
                  select 1
                  from team_memberships tm
                  where tm.team_id = t.id
                    and tm.user_id = $1
                )
                order by lower(t.name), t.created_at asc, t.id asc
                "#,
            )
            .bind(user_id)
            .fetch_all(self.pool())
            .await?
        };

        Ok(rows.into_iter().map(map_team_record).collect())
    }

    async fn get_accessible_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Option<domain::TeamRecord>> {
        let row = if is_root_user(self.pool(), user_id).await? {
            sqlx::query(
                r#"
                select id, tenant_id, name, logo_url, introduction
                from teams
                where id = $1
                "#,
            )
            .bind(workspace_id)
            .fetch_optional(self.pool())
            .await?
        } else {
            sqlx::query(
                r#"
                select t.id, t.tenant_id, t.name, t.logo_url, t.introduction
                from teams t
                where t.id = $2
                  and exists (
                    select 1
                    from team_memberships tm
                    where tm.team_id = t.id
                      and tm.user_id = $1
                  )
                "#,
            )
            .bind(user_id)
            .bind(workspace_id)
            .fetch_optional(self.pool())
            .await?
        };

        Ok(row.map(map_team_record))
    }

    async fn update_team(
        &self,
        actor_user_id: Uuid,
        team_id: Uuid,
        name: &str,
        logo_url: Option<&str>,
        introduction: &str,
    ) -> Result<domain::TeamRecord> {
        let row = sqlx::query(
            r#"
            update teams
            set name = $2,
                logo_url = $3,
                introduction = $4,
                updated_by = $5,
                updated_at = now()
            where id = $1
            returning id, tenant_id, name, logo_url, introduction
            "#,
        )
        .bind(team_id)
        .bind(name)
        .bind(logo_url)
        .bind(introduction)
        .bind(actor_user_id)
        .fetch_one(self.pool())
        .await?;

        Ok(map_team_record(row))
    }
}
