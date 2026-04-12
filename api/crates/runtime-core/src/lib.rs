extern crate self as runtime_core;

pub mod model_metadata;
pub mod resource_descriptor;
pub mod resource_registry;

pub fn crate_name() -> &'static str {
    "runtime-core"
}

#[cfg(test)]
pub mod _tests;
