extern crate self as plugin_framework;

pub mod assignment;
pub mod capability_kind;
pub mod error;
pub mod installation;
pub mod provider_contract;
pub mod provider_package;

pub use assignment::*;
pub use capability_kind::*;
pub use error::*;
pub use installation::*;
pub use provider_contract::*;
pub use provider_package::*;

pub fn crate_name() -> &'static str {
    "plugin-framework"
}

#[cfg(test)]
pub mod _tests;
