use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UserStatus {
    Active,
    Disabled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoleScopeKind {
    App,
    Team,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BoundRole {
    pub code: String,
    pub scope_kind: RoleScopeKind,
    pub team_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserRecord {
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
    pub status: UserStatus,
    pub session_version: i64,
    pub roles: Vec<BoundRole>,
}

impl UserRecord {
    pub fn resolved_display_role(&self) -> Option<String> {
        if let Some(default_display_role) = &self.default_display_role {
            if self
                .roles
                .iter()
                .any(|role| role.code == *default_display_role)
            {
                return Some(default_display_role.clone());
            }
        }

        self.roles.first().map(|role| role.code.clone())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActorContext {
    pub user_id: Uuid,
    pub team_id: Uuid,
    pub effective_display_role: String,
    pub is_root: bool,
    pub permissions: HashSet<String>,
}

impl ActorContext {
    pub fn root(user_id: Uuid, team_id: Uuid, effective_display_role: &str) -> Self {
        Self {
            user_id,
            team_id,
            effective_display_role: effective_display_role.to_string(),
            is_root: true,
            permissions: HashSet::new(),
        }
    }

    pub fn scoped(
        user_id: Uuid,
        team_id: Uuid,
        effective_display_role: &str,
        permissions: impl IntoIterator<Item = String>,
    ) -> Self {
        Self {
            user_id,
            team_id,
            effective_display_role: effective_display_role.to_string(),
            is_root: false,
            permissions: permissions.into_iter().collect(),
        }
    }

    pub fn has_permission(&self, code: &str) -> bool {
        self.is_root || self.permissions.contains(code)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PermissionDefinition {
    pub code: String,
    pub resource: String,
    pub action: String,
    pub scope: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoleTemplate {
    pub code: String,
    pub name: String,
    pub scope_kind: RoleScopeKind,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AuthenticatorRecord {
    pub name: String,
    pub auth_type: String,
    pub title: String,
    pub enabled: bool,
    pub is_builtin: bool,
    pub options: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserAuthIdentity {
    pub user_id: Uuid,
    pub authenticator_name: String,
    pub subject_type: String,
    pub subject_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionRecord {
    pub session_id: String,
    pub user_id: Uuid,
    pub team_id: Uuid,
    pub session_version: i64,
    pub csrf_token: String,
    pub expires_at_unix: i64,
}
