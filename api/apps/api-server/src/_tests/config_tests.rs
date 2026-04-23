use api_server::config::{ApiConfig, ApiEnvironment};
use std::path::PathBuf;

fn current_workspace_root() -> PathBuf {
    std::env::current_dir()
        .unwrap()
        .ancestors()
        .find(|path| {
            path.join(".git").exists() && path.join("api").is_dir() && path.join("web").is_dir()
        })
        .unwrap()
        .to_path_buf()
}

fn base_env_without_ephemeral_backend() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ]
}

fn base_env_with_backend(backend: &'static str) -> Vec<(&'static str, &'static str)> {
    let mut env = base_env_without_ephemeral_backend();
    env.push(("API_EPHEMERAL_BACKEND", backend));
    env
}

#[test]
fn api_config_defaults_ephemeral_backend_to_memory() {
    let env = base_env_without_ephemeral_backend();
    let config = ApiConfig::from_env_map(&env).unwrap();

    assert_eq!(config.ephemeral_backend.as_str(), "memory");
    assert_eq!(config.ephemeral_redis_url, None);
}

#[test]
fn api_config_requires_redis_url_when_ephemeral_backend_is_redis() {
    let env = base_env_with_backend("redis");
    let error = ApiConfig::from_env_map(&env).unwrap_err();

    assert!(error.to_string().contains("API_EPHEMERAL_REDIS_URL"));
}

#[test]
fn api_config_uses_expected_cookie_defaults() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(config.cookie_name, "flowbase_console_session");
    assert_eq!(config.session_ttl_days, 7);
}

#[test]
fn api_config_defaults_to_development_and_unrestricted_cors() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(config.env, ApiEnvironment::Development);
    assert!(config.cors_allowed_origins.is_none());
}

#[test]
fn api_config_defaults_provider_install_root_to_api_workspace_plugins_directory() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    let expected_root = current_workspace_root().join("api").join("plugins");
    assert_eq!(PathBuf::from(&config.provider_install_root), expected_root);
    assert_eq!(
        PathBuf::from(&config.host_extension_dropin_root),
        expected_root.join("host-extension").join("dropins")
    );
}

#[test]
fn api_config_rejects_production_without_allowed_origins() {
    let error = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("API_ENV", "production"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .expect_err("production config should require explicit API_ALLOWED_ORIGINS");

    assert!(error.to_string().contains("API_ALLOWED_ORIGINS"));
}

#[test]
fn api_config_accepts_production_with_explicit_allowed_origins() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("API_ENV", "production"),
        (
            "API_ALLOWED_ORIGINS",
            "https://console.example.com,https://ops.example.com",
        ),
        ("API_PROVIDER_SECRET_MASTER_KEY", "provider-secret-key"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
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
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(config.bootstrap_workspace_name, "1flowbase");
}

#[test]
fn api_config_defaults_host_extension_settings() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("API_PROVIDER_INSTALL_ROOT", "/srv/1flowbase/plugins"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(
        config.host_extension_dropin_root,
        "/srv/1flowbase/plugins/host-extension/dropins"
    );
    assert!(config.allow_unverified_filesystem_dropins);
    assert!(!config.allow_uploaded_host_extensions);
}

#[test]
fn api_config_reads_host_extension_overrides() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("API_HOST_EXTENSION_DROPIN_ROOT", "/opt/host-dropins"),
        ("API_PLUGIN_ALLOW_UNVERIFIED_FILESYSTEM_DROPINS", "false"),
        ("API_PLUGIN_ALLOW_UPLOADED_HOST_EXTENSIONS", "true"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(config.host_extension_dropin_root, "/opt/host-dropins");
    assert!(!config.allow_unverified_filesystem_dropins);
    assert!(config.allow_uploaded_host_extensions);
}

#[test]
fn api_config_reads_provider_secret_master_key() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("API_PROVIDER_SECRET_MASTER_KEY", "provider-secret-key"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(config.provider_secret_master_key, "provider-secret-key");
}

#[test]
fn api_config_defaults_plugin_runner_internal_base_url() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(
        config.plugin_runner_internal_base_url,
        "http://127.0.0.1:7801"
    );
}

#[test]
fn api_config_reads_plugin_runner_internal_base_url() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        (
            "API_PLUGIN_RUNNER_INTERNAL_BASE_URL",
            "http://plugin-runner.internal:7801",
        ),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(
        config.plugin_runner_internal_base_url,
        "http://plugin-runner.internal:7801"
    );
}

#[test]
fn api_config_reads_official_plugin_repository_settings() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        (
            "API_OFFICIAL_PLUGIN_REPOSITORY",
            "taichuy/1flowbase-official-plugins",
        ),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    assert_eq!(
        config.official_plugin_repository,
        "taichuy/1flowbase-official-plugins"
    );
}

#[test]
fn api_config_prefers_mirror_registry_when_present() {
    let config = ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        (
            "API_OFFICIAL_PLUGIN_DEFAULT_REGISTRY_URL",
            "https://official.example.com/official-registry.json",
        ),
        (
            "API_OFFICIAL_PLUGIN_MIRROR_REGISTRY_URL",
            "https://mirror.example.com/official-registry.json",
        ),
        (
            "API_OFFICIAL_PLUGIN_TRUSTED_PUBLIC_KEYS_JSON",
            r#"[{"key_id":"official-key-2026-04","algorithm":"ed25519","public_key_pem":"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA7n50M0Xkq4n3aQm7x0Whv14jArlTc95xJ3Adxpv8uKk=\n-----END PUBLIC KEY-----"}]"#,
        ),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    let resolved = config.resolve_official_plugin_source();
    assert_eq!(resolved.source_kind, "mirror_registry");
    assert_eq!(
        resolved.registry_url,
        "https://mirror.example.com/official-registry.json"
    );
}
