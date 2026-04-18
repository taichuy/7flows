use api_server::config::{ApiConfig, ApiEnvironment};

#[test]
fn api_config_uses_expected_cookie_defaults() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .unwrap();

    assert_eq!(config.cookie_name, "flowse_console_session");
    assert_eq!(config.session_ttl_days, 7);
}

#[test]
fn api_config_defaults_to_development_and_unrestricted_cors() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .unwrap();

    assert_eq!(config.env, ApiEnvironment::Development);
    assert!(config.cors_allowed_origins.is_none());
}

#[test]
fn api_config_rejects_production_without_allowed_origins() {
    let error = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("API_ENV", "production"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .expect_err("production config should require explicit API_ALLOWED_ORIGINS");

    assert!(error.to_string().contains("API_ALLOWED_ORIGINS"));
}

#[test]
fn api_config_accepts_production_with_explicit_allowed_origins() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("API_ENV", "production"),
        (
            "API_ALLOWED_ORIGINS",
            "https://console.example.com,https://ops.example.com",
        ),
        ("API_PROVIDER_SECRET_MASTER_KEY", "provider-secret-key"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .unwrap();

    assert_eq!(config.env, ApiEnvironment::Production);
    let origins = config
        .cors_allowed_origins
        .expect("production should keep explicit cors origins");
    let values = origins
        .iter()
        .map(|value| value.to_str().unwrap().to_string())
        .collect::<Vec<_>>();

    assert_eq!(
        values,
        vec![
            "https://console.example.com".to_string(),
            "https://ops.example.com".to_string()
        ]
    );
}

#[test]
fn api_config_reads_bootstrap_workspace_name() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .unwrap();

    assert_eq!(config.bootstrap_workspace_name, "1Flowbase");
}

#[test]
fn api_config_reads_provider_secret_master_key() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("API_PROVIDER_SECRET_MASTER_KEY", "provider-secret-key"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .unwrap();

    assert_eq!(config.provider_secret_master_key, "provider-secret-key");
}

#[test]
fn api_config_reads_official_plugin_repository_settings() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        (
            "API_OFFICIAL_PLUGIN_REPOSITORY",
            "taichuy/1flowbase-official-plugins",
        ),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
    ])
    .unwrap();

    assert_eq!(
        config.official_plugin_repository,
        "taichuy/1flowbase-official-plugins"
    );
}
