use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::resource_descriptor::ResourceDescriptor;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelMetadata {
    pub model_id: Uuid,
    pub published_version: Option<i64>,
    pub resource: ResourceDescriptor,
}
