use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TeamRecord {
    pub id: Uuid,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}
