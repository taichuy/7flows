use crate::error::{FrameworkResult, PluginFrameworkError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTarget {
    pub rust_target_triple: String,
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
}

impl RuntimeTarget {
    pub fn from_rust_target_triple(raw: &str) -> FrameworkResult<Self> {
        let normalized = raw.trim();
        match normalized {
            "x86_64-unknown-linux-musl" => Ok(Self {
                rust_target_triple: normalized.to_string(),
                os: "linux".into(),
                arch: "amd64".into(),
                libc: Some("musl".into()),
            }),
            "aarch64-unknown-linux-musl" => Ok(Self {
                rust_target_triple: normalized.to_string(),
                os: "linux".into(),
                arch: "arm64".into(),
                libc: Some("musl".into()),
            }),
            other => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported rust target triple: {other}"
            ))),
        }
    }

    pub fn asset_suffix(&self) -> String {
        format!("{}-{}", self.os, self.arch)
    }

    pub fn current_host() -> FrameworkResult<Self> {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("linux", "x86_64") => Ok(Self {
                rust_target_triple: "x86_64-unknown-linux-gnu".into(),
                os: "linux".into(),
                arch: "amd64".into(),
                libc: Some("gnu".into()),
            }),
            ("linux", "aarch64") => Ok(Self {
                rust_target_triple: "aarch64-unknown-linux-gnu".into(),
                os: "linux".into(),
                arch: "arm64".into(),
                libc: Some("gnu".into()),
            }),
            (os, arch) => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported host target: {os}/{arch}"
            ))),
        }
    }
}
