use domain::{BoundRole, RoleScopeKind, UserRecord, UserStatus};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredMemberRow {
    pub id: Uuid,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: String,
    pub name: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
    pub introduction: String,
    pub default_display_role: Option<String>,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
    pub status: String,
    pub session_version: i64,
    pub roles: Vec<(String, RoleScopeKind, Option<Uuid>)>,
}

pub struct PgMemberMapper;

impl PgMemberMapper {
    pub fn to_user_record(row: StoredMemberRow) -> UserRecord {
        UserRecord {
            id: row.id,
            account: row.account,
            email: row.email,
            phone: row.phone,
            password_hash: row.password_hash,
            name: row.name,
            nickname: row.nickname,
            avatar_url: row.avatar_url,
            introduction: row.introduction,
            default_display_role: row.default_display_role,
            email_login_enabled: row.email_login_enabled,
            phone_login_enabled: row.phone_login_enabled,
            status: if row.status == "active" {
                UserStatus::Active
            } else {
                UserStatus::Disabled
            },
            session_version: row.session_version,
            roles: row
                .roles
                .into_iter()
                .map(|(code, scope_kind, team_id)| BoundRole {
                    code,
                    scope_kind,
                    team_id,
                })
                .collect(),
        }
    }
}
