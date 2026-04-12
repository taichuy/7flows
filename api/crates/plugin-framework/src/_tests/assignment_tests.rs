use plugin_framework::{
    assignment::{BindingTarget, PluginAssignment},
    capability_kind::PluginConsumptionKind,
};
use uuid::Uuid;

#[test]
fn runtime_extension_requires_binding_target() {
    let assignment = PluginAssignment::new(
        Uuid::now_v7(),
        PluginConsumptionKind::RuntimeExtension,
        None,
    );

    assert!(assignment.is_err());
}

#[test]
fn capability_plugin_can_be_assigned_to_single_app_then_selected_in_config() {
    let assignment = PluginAssignment::new(
        Uuid::now_v7(),
        PluginConsumptionKind::CapabilityPlugin,
        Some(BindingTarget::App(Uuid::nil())),
    )
    .unwrap();

    assert!(assignment.requires_explicit_selection);
}
