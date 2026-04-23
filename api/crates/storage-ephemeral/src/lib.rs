extern crate self as storage_ephemeral;

mod backend;
mod kv_store;
mod session_store;
pub mod memory;
pub mod redis;

pub use backend::EphemeralBackendKind;
pub use kv_store::EphemeralKvStore;
pub use memory::MemoryKvStore;
pub use memory::MemorySessionStore;
pub use redis::RedisSessionStore;

#[cfg(test)]
mod _tests;
