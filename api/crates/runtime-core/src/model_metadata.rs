use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::resource_descriptor::ResourceDescriptor;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelMetadata {
    pub model_id: Uuid,
    pub model_code: String,
    pub scope_kind: domain::DataModelScopeKind,
    pub scope_id: Uuid,
    pub physical_table_name: String,
    pub scope_column_name: String,
    pub fields: Vec<domain::ModelFieldRecord>,
    pub resource: ResourceDescriptor,
}

impl ModelMetadata {
    pub fn field_by_code(&self, field_code: &str) -> Option<&domain::ModelFieldRecord> {
        self.fields.iter().find(|field| field.code == field_code)
    }
}
