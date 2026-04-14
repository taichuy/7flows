use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const SYSTEM_SCOPE_ID: Uuid = uuid::uuid!("00000000-0000-0000-0000-000000000000");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TenantRecord {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub is_root: bool,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceRecord {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScopeContext {
    pub tenant_id: Uuid,
    pub workspace_id: Uuid,
}
