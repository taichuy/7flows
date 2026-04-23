extern crate self as storage_ephemeral;

mod backend;
mod kv_store;
mod lease_store;
pub mod memory;
pub mod redis;
mod session_store;
mod wakeup_signal;

pub use backend::EphemeralBackendKind;
pub use kv_store::EphemeralKvStore;
pub use lease_store::LeaseStore;
pub use memory::MemoryKvStore;
pub use memory::MemoryLeaseStore;
pub use memory::MemorySessionStore;
pub use memory::MemoryWakeupSignalBus;
pub use redis::RedisBackedSessionStore;
pub use wakeup_signal::WakeupSignalBus;

#[cfg(test)]
mod _tests;
