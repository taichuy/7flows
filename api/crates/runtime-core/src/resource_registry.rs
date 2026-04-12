use anyhow::{anyhow, Result};

use crate::resource_descriptor::{Exposure, ResourceDescriptor, TrustLevel};

#[derive(Debug, Default)]
pub struct ResourceRegistry {
    descriptors: Vec<ResourceDescriptor>,
}

impl ResourceRegistry {
    pub fn register(&mut self, descriptor: ResourceDescriptor) -> Result<()> {
        let externally_visible = !matches!(descriptor.exposure, Exposure::Internal);
        let trusted = matches!(
            descriptor.trust_level,
            TrustLevel::Core | TrustLevel::HostExtension
        );

        if externally_visible && !trusted {
            return Err(anyhow!(
                "externally visible resources are reserved for core or host extensions"
            ));
        }

        self.descriptors.push(descriptor);
        Ok(())
    }

    pub fn descriptors(&self) -> &[ResourceDescriptor] {
        &self.descriptors
    }
}
