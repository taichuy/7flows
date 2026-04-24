use plugin_framework::RuntimeTarget;
use serde_json::json;

use crate::official_plugin_registry::{
    select_artifact_for_host, OfficialRegistryArtifact, OfficialRegistryEntry,
    OfficialRegistryI18nSummary,
};

#[test]
fn select_artifact_prefers_exact_linux_match() {
    let host = RuntimeTarget {
        rust_target_triple: "x86_64-unknown-linux-gnu".into(),
        os: "linux".into(),
        arch: "amd64".into(),
        libc: Some("gnu".into()),
    };
    let entry = OfficialRegistryEntry {
        plugin_id: "1flowbase.openai_compatible".into(),
        plugin_type: "model_provider".into(),
        provider_code: "openai_compatible".into(),
        display_name: "OpenAI-Compatible API Provider".into(),
        protocol: "openai_compatible".into(),
        latest_version: "0.2.1".into(),
        icon: None,
        help_url: None,
        model_discovery_mode: "hybrid".into(),
        i18n_summary: OfficialRegistryI18nSummary {
            default_locale: "en_US".into(),
            available_locales: vec!["en_US".into(), "zh_Hans".into()],
            bundles: std::collections::BTreeMap::from([
                (
                    "en_US".into(),
                    json!({ "plugin": { "label": "OpenAI-Compatible API Provider" } }),
                ),
                (
                    "zh_Hans".into(),
                    json!({ "plugin": { "label": "OpenAI-Compatible API Provider" } }),
                ),
            ]),
        },
        artifacts: vec![
            OfficialRegistryArtifact {
                os: "linux".into(),
                arch: "amd64".into(),
                libc: Some("musl".into()),
                rust_target: "x86_64-unknown-linux-musl".into(),
                download_url: "https://example.com/linux-amd64.1flowbasepkg".into(),
                checksum: "sha256:linux-amd64".into(),
                signature_algorithm: Some("ed25519".into()),
                signing_key_id: Some("official-key-2026-04".into()),
            },
            OfficialRegistryArtifact {
                os: "linux".into(),
                arch: "arm64".into(),
                libc: Some("musl".into()),
                rust_target: "aarch64-unknown-linux-musl".into(),
                download_url: "https://example.com/linux-arm64.1flowbasepkg".into(),
                checksum: "sha256:linux-arm64".into(),
                signature_algorithm: Some("ed25519".into()),
                signing_key_id: Some("official-key-2026-04".into()),
            },
        ],
    };

    let selected = select_artifact_for_host(&entry, &host).unwrap();
    assert_eq!(
        selected.download_url,
        "https://example.com/linux-amd64.1flowbasepkg"
    );
}

#[test]
fn select_artifact_returns_none_when_no_platform_matches() {
    let host = RuntimeTarget {
        rust_target_triple: "aarch64-apple-darwin".into(),
        os: "macos".into(),
        arch: "arm64".into(),
        libc: None,
    };
    let entry = OfficialRegistryEntry {
        plugin_id: "1flowbase.openai_compatible".into(),
        plugin_type: "model_provider".into(),
        provider_code: "openai_compatible".into(),
        display_name: "OpenAI-Compatible API Provider".into(),
        protocol: "openai_compatible".into(),
        latest_version: "0.2.1".into(),
        icon: None,
        help_url: None,
        model_discovery_mode: "hybrid".into(),
        i18n_summary: OfficialRegistryI18nSummary {
            default_locale: "en_US".into(),
            available_locales: vec!["en_US".into(), "zh_Hans".into()],
            bundles: std::collections::BTreeMap::from([
                (
                    "en_US".into(),
                    json!({ "plugin": { "label": "OpenAI-Compatible API Provider" } }),
                ),
                (
                    "zh_Hans".into(),
                    json!({ "plugin": { "label": "OpenAI-Compatible API Provider" } }),
                ),
            ]),
        },
        artifacts: vec![OfficialRegistryArtifact {
            os: "linux".into(),
            arch: "amd64".into(),
            libc: Some("musl".into()),
            rust_target: "x86_64-unknown-linux-musl".into(),
            download_url: "https://example.com/linux-amd64.1flowbasepkg".into(),
            checksum: "sha256:linux-amd64".into(),
            signature_algorithm: None,
            signing_key_id: None,
        }],
    };

    assert!(select_artifact_for_host(&entry, &host).is_none());
}
