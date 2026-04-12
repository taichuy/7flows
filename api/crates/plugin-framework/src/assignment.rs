use anyhow::{anyhow, Result};
use uuid::Uuid;

use crate::capability_kind::PluginConsumptionKind;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BindingTarget {
    Team(Uuid),
    App(Uuid),
    Model(Uuid),
}

#[derive(Debug, Clone)]
pub struct PluginAssignment {
    pub plugin_id: Uuid,
    pub kind: PluginConsumptionKind,
    pub binding_target: Option<BindingTarget>,
    pub requires_explicit_selection: bool,
}

impl PluginAssignment {
    pub fn new(
        plugin_id: Uuid,
        kind: PluginConsumptionKind,
        binding_target: Option<BindingTarget>,
    ) -> Result<Self> {
        if matches!(kind, PluginConsumptionKind::RuntimeExtension) && binding_target.is_none() {
            return Err(anyhow!("runtime extension requires model or app binding"));
        }

        Ok(Self {
            plugin_id,
            kind,
            binding_target,
            requires_explicit_selection: matches!(kind, PluginConsumptionKind::CapabilityPlugin),
        })
    }
}
