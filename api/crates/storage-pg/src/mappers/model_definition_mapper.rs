use domain::{ModelDefinitionRecord, ModelDefinitionStatus};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredModelDefinitionRow {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub status: String,
    pub published_version: Option<i64>,
}

pub struct PgModelDefinitionMapper;

impl PgModelDefinitionMapper {
    pub fn to_model_definition_record(row: StoredModelDefinitionRow) -> ModelDefinitionRecord {
        ModelDefinitionRecord {
            id: row.id,
            code: row.code,
            name: row.name,
            status: ModelDefinitionStatus::from_db(&row.status),
            published_version: row.published_version,
        }
    }
}
