extern crate self as access_control;

mod catalog;
mod evaluator;

pub use catalog::{builtin_role_templates, permission_catalog};
pub use evaluator::ensure_permission;

pub fn crate_name() -> &'static str {
    "access-control"
}

#[cfg(test)]
mod _tests;
