use domain::{ModelDefinitionRecord, ModelFieldRecord};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredModelDefinitionRow {
    pub id: Uuid,
    pub scope_kind: String,
    pub scope_id: Uuid,
    pub code: String,
    pub title: String,
    pub physical_table_name: String,
    pub acl_namespace: String,
    pub audit_namespace: String,
    pub availability_status: String,
    pub fields: Vec<ModelFieldRecord>,
}

pub struct PgModelDefinitionMapper;

impl PgModelDefinitionMapper {
    pub fn to_model_definition_record(row: StoredModelDefinitionRow) -> ModelDefinitionRecord {
        ModelDefinitionRecord {
            id: row.id,
            scope_kind: domain::DataModelScopeKind::from_db(&row.scope_kind),
            scope_id: row.scope_id,
            code: row.code,
            title: row.title,
            physical_table_name: row.physical_table_name,
            acl_namespace: row.acl_namespace,
            audit_namespace: row.audit_namespace,
            fields: row.fields,
            availability_status: domain::MetadataAvailabilityStatus::from_db(
                &row.availability_status,
            ),
        }
    }
}
