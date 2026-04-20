extern crate self as control_plane;

pub mod application;
pub mod audit;
pub mod auth;
pub mod bootstrap;
pub mod errors;
pub mod flow;
pub mod i18n;
pub mod member;
pub mod model_definition;
pub mod model_provider;
pub mod node_contribution;
pub mod orchestration_runtime;
pub mod plugin_management;
pub mod ports;
pub mod profile;
pub mod role;
pub mod runtime_registry_sync;
pub mod session_security;
pub mod state_transition;
pub mod system_runtime;
pub mod workspace;
pub mod workspace_session;

pub fn crate_name() -> &'static str {
    "control-plane"
}

#[cfg(test)]
pub mod _tests;
