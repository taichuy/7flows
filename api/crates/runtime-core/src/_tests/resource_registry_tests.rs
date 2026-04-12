use runtime_core::{
    resource_descriptor::{
        Exposure, Plane, ResourceDescriptor, ResourceKind, TenantScope, TrustLevel,
    },
    resource_registry::ResourceRegistry,
};

#[test]
fn host_only_registry_rejects_runtime_extension_resource_registration() {
    let mut registry = ResourceRegistry::default();
    let descriptor = ResourceDescriptor::new(
        "members",
        ResourceKind::Static,
        Plane::Control,
        Exposure::Console,
        TenantScope::System,
        TrustLevel::RuntimeExtension,
    );

    assert!(registry.register(descriptor).is_err());
}
