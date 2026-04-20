extern crate self as plugin_framework;

pub mod assignment;
pub mod capability_kind;
pub mod error;
pub mod installation;
pub mod manifest_v1;
pub mod package_intake;
pub mod provider_contract;
pub mod provider_package;
pub mod runtime_target;

pub use assignment::*;
pub use capability_kind::*;
pub use error::*;
pub use installation::*;
pub use manifest_v1::{
    parse_plugin_manifest, NodeContributionDependencyManifest, NodeContributionManifest,
    PluginExecutionMode, PluginManifestV1, PluginPermissionManifest, PluginRuntimeLimits,
    PluginRuntimeManifest,
};
pub use package_intake::*;
pub use provider_contract::*;
pub use provider_package::*;
pub use runtime_target::*;

pub fn crate_name() -> &'static str {
    "plugin-framework"
}

#[cfg(test)]
pub mod _tests;
