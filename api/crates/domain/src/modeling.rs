use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ModelDefinitionStatus {
    Draft,
    Published,
}

impl ModelDefinitionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Published => "published",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "published" => Self::Published,
            _ => Self::Draft,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelDefinitionRecord {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub status: ModelDefinitionStatus,
    pub published_version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelDefinitionVersionRecord {
    pub id: Uuid,
    pub model_id: Uuid,
    pub version: i64,
    pub payload: serde_json::Value,
}
