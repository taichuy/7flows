use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AuditLogRecord {
    pub id: Uuid,
    pub team_id: Option<Uuid>,
    pub actor_user_id: Option<Uuid>,
    pub target_type: String,
    pub target_id: Option<Uuid>,
    pub event_code: String,
    pub payload: Value,
    pub created_at: OffsetDateTime,
}
