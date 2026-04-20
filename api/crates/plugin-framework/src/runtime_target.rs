use crate::error::{FrameworkResult, PluginFrameworkError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTarget {
    pub rust_target_triple: String,
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
}

impl RuntimeTarget {
    fn new(raw: &str, os: &str, arch: &str, libc: Option<&str>) -> Self {
        Self {
            rust_target_triple: raw.trim().to_string(),
            os: os.to_string(),
            arch: arch.to_string(),
            libc: libc.map(str::to_string),
        }
    }

    pub fn from_rust_target_triple(raw: &str) -> FrameworkResult<Self> {
        match raw.trim() {
            "x86_64-unknown-linux-musl" => Ok(Self::new(raw, "linux", "amd64", Some("musl"))),
            "aarch64-unknown-linux-musl" => Ok(Self::new(raw, "linux", "arm64", Some("musl"))),
            "x86_64-apple-darwin" => Ok(Self::new(raw, "darwin", "amd64", None)),
            "aarch64-apple-darwin" => Ok(Self::new(raw, "darwin", "arm64", None)),
            "x86_64-pc-windows-msvc" => Ok(Self::new(raw, "windows", "amd64", Some("msvc"))),
            "aarch64-pc-windows-msvc" => Ok(Self::new(raw, "windows", "arm64", Some("msvc"))),
            other => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported rust target triple: {other}"
            ))),
        }
    }

    pub fn from_host_parts(os: &str, arch: &str) -> FrameworkResult<Self> {
        match (os, arch) {
            ("linux", "x86_64") => Self::from_rust_target_triple("x86_64-unknown-linux-musl"),
            ("linux", "aarch64") => Self::from_rust_target_triple("aarch64-unknown-linux-musl"),
            ("macos", "x86_64") => Self::from_rust_target_triple("x86_64-apple-darwin"),
            ("macos", "aarch64") => Self::from_rust_target_triple("aarch64-apple-darwin"),
            ("windows", "x86_64") => Self::from_rust_target_triple("x86_64-pc-windows-msvc"),
            ("windows", "aarch64") => Self::from_rust_target_triple("aarch64-pc-windows-msvc"),
            (left_os, left_arch) => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported host target: {left_os}/{left_arch}"
            ))),
        }
    }

    pub fn asset_suffix(&self) -> String {
        format!("{}-{}", self.os, self.arch)
    }

    pub fn executable_suffix(&self) -> &'static str {
        if self.os == "windows" {
            ".exe"
        } else {
            ""
        }
    }

    pub fn current_host() -> FrameworkResult<Self> {
        Self::from_host_parts(std::env::consts::OS, std::env::consts::ARCH)
    }
}
