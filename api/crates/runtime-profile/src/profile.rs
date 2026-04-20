use anyhow::Result;
use plugin_framework::RuntimeTarget;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use time::OffsetDateTime;

use crate::detect_host_fingerprint;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimePlatform {
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
    pub rust_target: String,
}

impl RuntimePlatform {
    pub fn from_target(target: &RuntimeTarget) -> Self {
        Self {
            os: target.os.clone(),
            arch: target.arch.clone(),
            libc: target.libc.clone(),
            rust_target: target.rust_target_triple.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeCpu {
    pub logical_count: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeMemory {
    pub total_bytes: u64,
    pub total_gb: f64,
    pub available_bytes: u64,
    pub available_gb: f64,
    pub process_bytes: u64,
    pub process_gb: f64,
}

impl RuntimeMemory {
    pub fn from_bytes(total_bytes: u64, available_bytes: u64, process_bytes: u64) -> Self {
        Self {
            total_bytes,
            total_gb: bytes_to_gb(total_bytes),
            available_bytes,
            available_gb: bytes_to_gb(available_bytes),
            process_bytes,
            process_gb: bytes_to_gb(process_bytes),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeProfile {
    pub host_fingerprint: String,
    pub platform: RuntimePlatform,
    pub cpu: RuntimeCpu,
    pub memory: RuntimeMemory,
    pub uptime_seconds: u64,
    pub started_at: OffsetDateTime,
    pub captured_at: OffsetDateTime,
    pub service: String,
    pub service_version: String,
    pub service_status: String,
}

pub fn bytes_to_gb(bytes: u64) -> f64 {
    ((bytes as f64 / 1024_f64.powi(3)) * 100.0).round() / 100.0
}

pub fn collect_runtime_profile(
    service: &'static str,
    service_version: &'static str,
    process_start: OffsetDateTime,
    status: &'static str,
) -> Result<RuntimeProfile> {
    let mut system = System::new_all();
    system.refresh_all();

    let target = RuntimeTarget::current_host()?;
    let process_memory = sysinfo::get_current_pid()
        .ok()
        .and_then(|pid| system.process(pid))
        .map(|entry| entry.memory())
        .unwrap_or_default();

    Ok(RuntimeProfile {
        host_fingerprint: detect_host_fingerprint()?,
        platform: RuntimePlatform::from_target(&target),
        cpu: RuntimeCpu {
            logical_count: system.cpus().len() as u64,
        },
        memory: RuntimeMemory::from_bytes(
            system.total_memory(),
            system.available_memory(),
            process_memory,
        ),
        uptime_seconds: System::uptime(),
        started_at: process_start,
        captured_at: OffsetDateTime::now_utc(),
        service: service.to_string(),
        service_version: service_version.to_string(),
        service_status: status.to_string(),
    })
}
