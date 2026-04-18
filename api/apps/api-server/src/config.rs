use anyhow::{anyhow, Result};
use axum::http::HeaderValue;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiEnvironment {
    Development,
    Production,
}

impl ApiEnvironment {
    fn parse(raw: Option<&str>) -> Result<Self> {
        match raw
            .unwrap_or("development")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "development" | "dev" | "local" => Ok(Self::Development),
            "production" | "prod" => Ok(Self::Production),
            value => Err(anyhow!("invalid API_ENV `{value}`")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub env: ApiEnvironment,
    pub database_url: String,
    pub redis_url: String,
    pub cookie_name: String,
    pub session_ttl_days: i64,
    pub cors_allowed_origins: Option<Vec<HeaderValue>>,
    pub provider_install_root: String,
    pub provider_secret_master_key: String,
    pub official_plugin_repository: String,
    pub official_plugin_registry_url: String,
    pub bootstrap_workspace_name: String,
    pub bootstrap_root_account: String,
    pub bootstrap_root_email: String,
    pub bootstrap_root_password: String,
    pub bootstrap_root_name: String,
    pub bootstrap_root_nickname: String,
}

impl ApiConfig {
    pub fn from_env() -> Result<Self> {
        let vars = std::env::vars().collect::<Vec<_>>();
        let refs = vars
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect::<Vec<_>>();

        Self::from_env_map(&refs)
    }

    pub fn from_env_map(entries: &[(&str, &str)]) -> Result<Self> {
        let map = entries
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect::<BTreeMap<_, _>>();

        let get = |key: &str| -> Result<String> {
            map.get(key)
                .cloned()
                .ok_or_else(|| anyhow!("missing env {key}"))
        };
        let env = ApiEnvironment::parse(map.get("API_ENV").map(String::as_str))?;
        let cors_allowed_origins = parse_cors_allowed_origins(map.get("API_ALLOWED_ORIGINS"))?;
        let provider_install_root = map
            .get("API_PROVIDER_INSTALL_ROOT")
            .cloned()
            .unwrap_or_else(|| {
                std::env::temp_dir()
                    .join("1flowbase-plugin-installed")
                    .display()
                    .to_string()
            });
        let provider_secret_master_key = map
            .get("API_PROVIDER_SECRET_MASTER_KEY")
            .cloned()
            .unwrap_or_else(|| "dev-provider-secret-master-key-unsafe".to_string());
        let official_plugin_repository = map
            .get("API_OFFICIAL_PLUGIN_REPOSITORY")
            .cloned()
            .unwrap_or_else(|| "taichuy/1flowbase-official-plugins".to_string());
        let official_plugin_registry_url = map
            .get("API_OFFICIAL_PLUGIN_REGISTRY_URL")
            .cloned()
            .unwrap_or_else(|| {
                format!(
                    "https://raw.githubusercontent.com/{official_plugin_repository}/main/official-registry.json"
                )
            });

        if env == ApiEnvironment::Production && cors_allowed_origins.is_none() {
            return Err(anyhow!(
                "missing env API_ALLOWED_ORIGINS when API_ENV=production"
            ));
        }
        if env == ApiEnvironment::Production && !map.contains_key("API_PROVIDER_SECRET_MASTER_KEY")
        {
            return Err(anyhow!(
                "missing env API_PROVIDER_SECRET_MASTER_KEY when API_ENV=production"
            ));
        }

        Ok(Self {
            env,
            database_url: get("API_DATABASE_URL")?,
            redis_url: get("API_REDIS_URL")?,
            cookie_name: map
                .get("API_COOKIE_NAME")
                .cloned()
                .unwrap_or_else(|| "flowse_console_session".to_string()),
            session_ttl_days: map
                .get("API_SESSION_TTL_DAYS")
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(7),
            cors_allowed_origins,
            provider_install_root,
            provider_secret_master_key,
            official_plugin_repository,
            official_plugin_registry_url,
            bootstrap_workspace_name: get("BOOTSTRAP_WORKSPACE_NAME")?,
            bootstrap_root_account: get("BOOTSTRAP_ROOT_ACCOUNT")?,
            bootstrap_root_email: get("BOOTSTRAP_ROOT_EMAIL")?,
            bootstrap_root_password: get("BOOTSTRAP_ROOT_PASSWORD")?,
            bootstrap_root_name: map
                .get("BOOTSTRAP_ROOT_NAME")
                .cloned()
                .unwrap_or_else(|| "Root".to_string()),
            bootstrap_root_nickname: map
                .get("BOOTSTRAP_ROOT_NICKNAME")
                .cloned()
                .unwrap_or_else(|| "Root".to_string()),
        })
    }
}

fn parse_cors_allowed_origins(value: Option<&String>) -> Result<Option<Vec<HeaderValue>>> {
    let Some(value) = value else {
        return Ok(None);
    };

    let origins = value
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(|entry| {
            HeaderValue::from_str(entry)
                .map_err(|_| anyhow!("invalid origin in API_ALLOWED_ORIGINS: `{entry}`"))
        })
        .collect::<Result<Vec<_>>>()?;

    if origins.is_empty() {
        return Ok(None);
    }

    Ok(Some(origins))
}
