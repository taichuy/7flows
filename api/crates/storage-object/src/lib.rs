extern crate self as storage_object;

mod driver;
pub mod drivers;
mod errors;
mod registry;
mod types;

pub use driver::FileStorageDriver;
pub use errors::{FileStorageError, FileStorageResult};
pub use registry::{builtin_driver_registry, FileStorageDriverRegistry};
pub use types::*;

pub fn crate_name() -> &'static str {
    "storage-object"
}

#[cfg(test)]
mod _tests;
