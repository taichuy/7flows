extern crate self as plugin_framework;

pub mod assignment;
pub mod capability_kind;

pub use assignment::*;
pub use capability_kind::*;

pub fn crate_name() -> &'static str {
    "plugin-framework"
}

#[cfg(test)]
pub mod _tests;
