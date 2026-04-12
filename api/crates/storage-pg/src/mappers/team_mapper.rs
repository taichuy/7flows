use domain::TeamRecord;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredTeamRow {
    pub id: Uuid,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}

pub struct PgTeamMapper;

impl PgTeamMapper {
    pub fn to_team_record(row: StoredTeamRow) -> TeamRecord {
        TeamRecord {
            id: row.id,
            name: row.name,
            logo_url: row.logo_url,
            introduction: row.introduction,
        }
    }
}
