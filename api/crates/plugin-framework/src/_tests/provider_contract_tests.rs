use plugin_framework::{
    installation::PluginTaskStatus,
    provider_contract::{ModelDiscoveryMode, ProviderRuntimeError, ProviderRuntimeErrorKind, ProviderUsage},
};

#[test]
fn model_discovery_mode_accepts_all_supported_wire_values() {
    assert_eq!(
        ModelDiscoveryMode::try_from("static").unwrap(),
        ModelDiscoveryMode::Static
    );
    assert_eq!(
        ModelDiscoveryMode::try_from("dynamic").unwrap(),
        ModelDiscoveryMode::Dynamic
    );
    assert_eq!(
        ModelDiscoveryMode::try_from("hybrid").unwrap(),
        ModelDiscoveryMode::Hybrid
    );
    assert!(ModelDiscoveryMode::try_from("unknown").is_err());
}

#[test]
fn provider_usage_total_tokens_falls_back_to_known_segments() {
    let usage = ProviderUsage {
        input_tokens: Some(120),
        output_tokens: Some(45),
        reasoning_tokens: Some(12),
        cache_read_tokens: Some(9),
        cache_write_tokens: Some(3),
        total_tokens: None,
    };

    assert_eq!(usage.total_tokens(), Some(189));
}

#[test]
fn provider_runtime_error_normalizes_common_vendor_failures() {
    let auth_failed = ProviderRuntimeError::normalize(
        "invalid_api_key",
        "401 unauthorized",
        Some("upstream rejected api key"),
    );
    assert_eq!(auth_failed.kind, ProviderRuntimeErrorKind::AuthFailed);

    let endpoint_unreachable =
        ProviderRuntimeError::normalize("upstream_timeout", "connect timeout", None);
    assert_eq!(
        endpoint_unreachable.kind,
        ProviderRuntimeErrorKind::EndpointUnreachable
    );

    let rate_limited = ProviderRuntimeError::normalize("quota_exceeded", "429", None);
    assert_eq!(rate_limited.kind, ProviderRuntimeErrorKind::RateLimited);

    let unknown = ProviderRuntimeError::normalize("unexpected_shape", "bad payload", None);
    assert_eq!(unknown.kind, ProviderRuntimeErrorKind::ProviderInvalidResponse);
}

#[test]
fn plugin_task_status_marks_only_terminal_states() {
    assert!(!PluginTaskStatus::Pending.is_terminal());
    assert!(!PluginTaskStatus::Running.is_terminal());
    assert!(PluginTaskStatus::Success.is_terminal());
    assert!(PluginTaskStatus::Failed.is_terminal());
    assert!(PluginTaskStatus::Canceled.is_terminal());
    assert!(PluginTaskStatus::TimedOut.is_terminal());
}
