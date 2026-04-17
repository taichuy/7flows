extern crate self as orchestration_runtime;

pub mod compiled_plan;
pub mod compiler;
pub mod preview_executor;

pub fn crate_name() -> &'static str {
    "orchestration-runtime"
}

#[cfg(test)]
pub mod _tests;
