extern crate self as storage_ephemeral;

mod backend;
mod kv_store;
pub mod memory;

pub use backend::EphemeralBackendKind;
pub use kv_store::EphemeralKvStore;
pub use memory::MemoryKvStore;

#[cfg(test)]
mod _tests;
