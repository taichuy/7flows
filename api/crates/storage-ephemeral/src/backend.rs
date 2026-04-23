use anyhow::{anyhow, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EphemeralBackendKind {
    Memory,
    Redis,
}

impl EphemeralBackendKind {
    pub fn from_env_value(raw: &str) -> Result<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "memory" => Ok(Self::Memory),
            "redis" => Ok(Self::Redis),
            value => Err(anyhow!("invalid ephemeral backend `{value}`")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Memory => "memory",
            Self::Redis => "redis",
        }
    }
}
