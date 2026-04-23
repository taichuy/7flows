extern crate self as storage_ephemeral;

mod backend;
mod kv_store;
mod lease_store;
mod session_store;
mod wakeup_signal;
pub mod memory;
pub mod redis;

pub use backend::EphemeralBackendKind;
pub use kv_store::EphemeralKvStore;
pub use lease_store::LeaseStore;
pub use memory::MemoryKvStore;
pub use memory::MemoryLeaseStore;
pub use memory::MemorySessionStore;
pub use memory::MemoryWakeupSignalBus;
pub use redis::RedisSessionStore;
pub use wakeup_signal::WakeupSignalBus;

#[cfg(test)]
mod _tests;
