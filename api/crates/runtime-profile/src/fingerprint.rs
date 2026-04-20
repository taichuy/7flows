use anyhow::{anyhow, Result};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostFingerprintInput {
    pub machine_id: Option<String>,
    pub stable_ids: Vec<String>,
}

pub fn build_host_fingerprint(input: HostFingerprintInput) -> String {
    let normalized = normalize_fingerprint_identifiers(input);
    let digest = Sha256::digest(normalized.join("|").as_bytes());
    let encoded = format!("{digest:x}");
    format!("host_{}", &encoded[..32])
}

pub fn detect_host_fingerprint() -> Result<String> {
    let machine_id = read_first_non_empty(&["/etc/machine-id", "/var/lib/dbus/machine-id"]);
    let stable_ids = collect_fallback_identifiers();
    if machine_id.is_none() && stable_ids.is_empty() {
        return Err(anyhow!("failed to derive a stable host fingerprint"));
    }

    Ok(build_host_fingerprint(HostFingerprintInput {
        machine_id,
        stable_ids,
    }))
}

fn normalize_fingerprint_identifiers(input: HostFingerprintInput) -> Vec<String> {
    let mut normalized = if let Some(machine_id) = input
        .machine_id
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
    {
        vec![machine_id]
    } else {
        let mut ids = input
            .stable_ids
            .into_iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        ids.sort();
        ids
    };

    if normalized.is_empty() {
        normalized.push("unknown-host".into());
    }

    normalized.sort();
    normalized
}

fn read_first_non_empty(paths: &[&str]) -> Option<String> {
    paths.iter().find_map(|path| {
        std::fs::read_to_string(path)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn collect_fallback_identifiers() -> Vec<String> {
    let mut stable_ids = Vec::new();
    for key in ["COMPUTERNAME", "HOSTNAME", "USER", "USERNAME"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                stable_ids.push(format!("env:{key}:{trimmed}"));
            }
        }
    }

    stable_ids.push(format!(
        "platform:{}:{}",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    stable_ids
}
