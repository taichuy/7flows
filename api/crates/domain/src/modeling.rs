use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataModelScopeKind {
    Team,
    App,
}

impl DataModelScopeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Team => "team",
            Self::App => "app",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "app" => Self::App,
            _ => Self::Team,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelFieldKind {
    String,
    Number,
    Boolean,
    Datetime,
    Enum,
    Text,
    Json,
    ManyToOne,
    OneToMany,
    ManyToMany,
}

impl ModelFieldKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::String => "string",
            Self::Number => "number",
            Self::Boolean => "boolean",
            Self::Datetime => "datetime",
            Self::Enum => "enum",
            Self::Text => "text",
            Self::Json => "json",
            Self::ManyToOne => "many_to_one",
            Self::OneToMany => "one_to_many",
            Self::ManyToMany => "many_to_many",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "number" => Self::Number,
            "boolean" => Self::Boolean,
            "datetime" => Self::Datetime,
            "enum" => Self::Enum,
            "text" => Self::Text,
            "json" => Self::Json,
            "many_to_one" => Self::ManyToOne,
            "one_to_many" => Self::OneToMany,
            "many_to_many" => Self::ManyToMany,
            _ => Self::String,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelFieldRecord {
    pub id: Uuid,
    pub data_model_id: Uuid,
    pub code: String,
    pub title: String,
    pub physical_column_name: String,
    pub field_kind: ModelFieldKind,
    pub is_required: bool,
    pub is_unique: bool,
    pub default_value: Option<Value>,
    pub display_interface: Option<String>,
    pub display_options: Value,
    pub relation_target_model_id: Option<Uuid>,
    pub relation_options: Value,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelDefinitionRecord {
    pub id: Uuid,
    pub scope_kind: DataModelScopeKind,
    pub scope_id: Uuid,
    pub code: String,
    pub title: String,
    pub physical_table_name: String,
    pub acl_namespace: String,
    pub audit_namespace: String,
    pub fields: Vec<ModelFieldRecord>,
}
