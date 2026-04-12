use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::TeamRepository;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::team_mapper::{PgTeamMapper, StoredTeamRow},
    repositories::PgControlPlaneStore,
};

#[async_trait]
impl TeamRepository for PgControlPlaneStore {
    async fn get_team(&self, team_id: Uuid) -> Result<Option<domain::TeamRecord>> {
        let row = sqlx::query("select id, name, logo_url, introduction from teams where id = $1")
            .bind(team_id)
            .fetch_optional(self.pool())
            .await?;

        Ok(row.map(|row| {
            PgTeamMapper::to_team_record(StoredTeamRow {
                id: row.get("id"),
                name: row.get("name"),
                logo_url: row.get("logo_url"),
                introduction: row.get("introduction"),
            })
        }))
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
            returning id, name, logo_url, introduction
            "#,
        )
        .bind(team_id)
        .bind(name)
        .bind(logo_url)
        .bind(introduction)
        .bind(actor_user_id)
        .fetch_one(self.pool())
        .await?;

        Ok(PgTeamMapper::to_team_record(StoredTeamRow {
            id: row.get("id"),
            name: row.get("name"),
            logo_url: row.get("logo_url"),
            introduction: row.get("introduction"),
        }))
    }
}
