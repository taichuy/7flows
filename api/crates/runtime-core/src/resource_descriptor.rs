use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResourceKind {
    Static,
    ModelDefinition,
    RuntimeModel,
    Virtual,
    Plugin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Plane {
    Public,
    Control,
    Runtime,
    Internal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Exposure {
    Internal,
    Console,
    Public,
    Callback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TenantScope {
    System,
    Team,
    App,
    User,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrustLevel {
    Core,
    HostExtension,
    RuntimeExtension,
    CapabilityPlugin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceDescriptor {
    pub code: String,
    pub kind: ResourceKind,
    pub plane: Plane,
    pub exposure: Exposure,
    pub tenant_scope: TenantScope,
    pub trust_level: TrustLevel,
}

impl ResourceDescriptor {
    pub fn new(
        code: impl Into<String>,
        kind: ResourceKind,
        plane: Plane,
        exposure: Exposure,
        tenant_scope: TenantScope,
        trust_level: TrustLevel,
    ) -> Self {
        Self {
            code: code.into(),
            kind,
            plane,
            exposure,
            tenant_scope,
            trust_level,
        }
    }

    pub fn runtime_model(model_id: Uuid) -> Self {
        Self::new(
            domain::runtime_model_resource_code(model_id),
            ResourceKind::RuntimeModel,
            Plane::Runtime,
            Exposure::Console,
            TenantScope::App,
            TrustLevel::Core,
        )
    }
}
