use std::{fs, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    i18n::RequestedLocales,
    plugin_management::{PluginCatalogFilter, PluginManagementService},
    ports::{
        CreatePluginAssignmentInput, DownloadedOfficialPluginPackage,
        OfficialPluginCatalogSnapshot, OfficialPluginCatalogSource, OfficialPluginSourceEntry,
        OfficialPluginSourcePort, PluginRepository,
    },
};
use domain::PluginDesiredState;

use super::support::{
    actor_with_permissions, requested_locales, sample_artifact, sample_i18n_summary,
    seed_test_installation, MemoryOfficialPluginSource, MemoryPluginManagementRepository,
    MemoryProviderRuntime,
};

#[tokio::test]
async fn plugin_management_service_lists_provider_families_with_current_and_latest_versions() {
    #[derive(Clone)]
    struct OutdatedOfficialSource;

    #[async_trait]
    impl OfficialPluginSourcePort for OutdatedOfficialSource {
        async fn list_official_catalog(&self) -> Result<OfficialPluginCatalogSnapshot> {
            Ok(OfficialPluginCatalogSnapshot {
                source: OfficialPluginCatalogSource {
                    source_kind: "official_registry".into(),
                    source_label: "官方源".into(),
                    registry_url: "https://example.com/official-registry.json".into(),
                },
                entries: vec![OfficialPluginSourceEntry {
                    plugin_id: "1flowbase.openai_compatible".into(),
                    plugin_type: "model_provider".into(),
                    provider_code: "openai_compatible".into(),
                    namespace: "plugin.openai_compatible".into(),
                    protocol: "openai_compatible".into(),
                    latest_version: "0.2.0".into(),
                    selected_artifact: sample_artifact("linux", "amd64", Some("musl")),
                    i18n_summary: sample_i18n_summary(),
                    release_tag: "openai_compatible-v0.2.0".into(),
                    trust_mode: "allow_unsigned".into(),
                    help_url: Some("https://example.com/help".into()),
                    model_discovery_mode: "hybrid".into(),
                }],
            })
        }

        async fn download_plugin(
            &self,
            _entry: &OfficialPluginSourceEntry,
        ) -> Result<DownloadedOfficialPluginPackage> {
            unreachable!("download is not used in this read-only test");
        }

        fn trusted_public_keys(&self) -> Vec<plugin_framework::TrustedPublicKey> {
            Vec::new()
        }
    }

    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let install_root = std::env::temp_dir().join(format!("plugin-family-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(OutdatedOfficialSource),
        &install_root,
    );

    let installation_v1 = seed_test_installation(
        &repository,
        &install_root,
        "openai_compatible",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    let _installation_v2 = seed_test_installation(
        &repository,
        &install_root,
        "openai_compatible",
        "0.2.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: installation_v1,
            workspace_id: repository.actor.current_workspace_id,
            provider_code: "openai_compatible".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let families = service
        .list_families(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    assert_eq!(families.entries.len(), 1);
    assert_eq!(families.entries[0].provider_code, "openai_compatible");
    assert_eq!(families.entries[0].current_version, "0.1.0");
    assert_eq!(families.entries[0].latest_version.as_deref(), Some("0.2.0"));
    assert!(families.entries[0].has_update);
}

#[tokio::test]
async fn plugin_management_service_keeps_only_latest_official_entry_per_provider() {
    #[derive(Clone)]
    struct DuplicateOfficialSource;

    #[async_trait]
    impl OfficialPluginSourcePort for DuplicateOfficialSource {
        async fn list_official_catalog(&self) -> Result<OfficialPluginCatalogSnapshot> {
            Ok(OfficialPluginCatalogSnapshot {
                source: OfficialPluginCatalogSource {
                    source_kind: "official_registry".into(),
                    source_label: "官方源".into(),
                    registry_url: "https://example.com/official-registry.json".into(),
                },
                entries: vec![
                    OfficialPluginSourceEntry {
                        plugin_id: "1flowbase.openai_compatible".into(),
                        plugin_type: "model_provider".into(),
                        provider_code: "openai_compatible".into(),
                        namespace: "plugin.openai_compatible".into(),
                        protocol: "openai_compatible".into(),
                        latest_version: "0.2.0".into(),
                        selected_artifact: sample_artifact("linux", "amd64", Some("musl")),
                        i18n_summary: sample_i18n_summary(),
                        release_tag: "openai_compatible-v0.2.0".into(),
                        trust_mode: "allow_unsigned".into(),
                        help_url: Some("https://example.com/help".into()),
                        model_discovery_mode: "hybrid".into(),
                    },
                    OfficialPluginSourceEntry {
                        plugin_id: "1flowse.openai_compatible".into(),
                        plugin_type: "model_provider".into(),
                        provider_code: "openai_compatible".into(),
                        namespace: "plugin.openai_compatible".into(),
                        protocol: "openai_compatible".into(),
                        latest_version: "0.1.0".into(),
                        selected_artifact: sample_artifact("linux", "amd64", Some("musl")),
                        i18n_summary: sample_i18n_summary(),
                        release_tag: "openai_compatible-v0.1.0".into(),
                        trust_mode: "allow_unsigned".into(),
                        help_url: Some("https://example.com/help".into()),
                        model_discovery_mode: "hybrid".into(),
                    },
                ],
            })
        }

        async fn download_plugin(
            &self,
            _entry: &OfficialPluginSourceEntry,
        ) -> Result<DownloadedOfficialPluginPackage> {
            unreachable!("download is not used in this read-only test");
        }

        fn trusted_public_keys(&self) -> Vec<plugin_framework::TrustedPublicKey> {
            Vec::new()
        }
    }

    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let install_root = std::env::temp_dir().join(format!("plugin-family-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(DuplicateOfficialSource),
        &install_root,
    );

    let installation_v1 = seed_test_installation(
        &repository,
        &install_root,
        "openai_compatible",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: installation_v1,
            workspace_id: repository.actor.current_workspace_id,
            provider_code: "openai_compatible".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let catalog = service
        .list_official_catalog(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.entries.len(), 1);
    assert_eq!(catalog.entries[0].plugin_id, "1flowbase.openai_compatible");
    assert_eq!(catalog.entries[0].latest_version, "0.2.0");

    let families = service
        .list_families(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    assert_eq!(families.entries.len(), 1);
    assert_eq!(families.entries[0].current_version, "0.1.0");
    assert_eq!(families.entries[0].latest_version.as_deref(), Some("0.2.0"));
    assert!(families.entries[0].has_update);
}

#[tokio::test]
async fn plugin_management_service_degrades_catalog_entry_when_artifact_is_missing() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let install_root =
        std::env::temp_dir().join(format!("plugin-missing-catalog-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );
    let installation_id = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    let install_path = repository
        .get_installation(installation_id)
        .await
        .unwrap()
        .unwrap()
        .installed_path;
    fs::remove_dir_all(&install_path).unwrap();

    let catalog = service
        .list_catalog(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    let installation = repository
        .get_installation(installation_id)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(catalog.entries.len(), 1);
    assert_eq!(
        catalog.entries[0].installation.artifact_status,
        domain::PluginArtifactStatus::Missing
    );
    assert_eq!(
        catalog.entries[0].installation.availability_status,
        domain::PluginAvailabilityStatus::ArtifactMissing
    );
    assert_eq!(catalog.entries[0].model_discovery_mode, "hybrid");
    assert_eq!(
        installation.availability_status,
        domain::PluginAvailabilityStatus::ArtifactMissing
    );
}

#[tokio::test]
async fn list_official_catalog_filters_by_plugin_type_and_trims_i18n_bundles() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all"],
    ));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(MemoryOfficialPluginSource::default()),
        std::env::temp_dir().join(format!("plugin-list-{}", Uuid::now_v7())),
    );

    let view = service
        .list_official_catalog(
            repository.actor.user_id,
            PluginCatalogFilter {
                plugin_type: Some("model_provider".into()),
            },
            RequestedLocales::new("zh_Hans", "en_US"),
        )
        .await
        .unwrap();
    let entry = &view.entries[0];

    let reference = OfficialPluginSourceEntry {
        plugin_id: "1flowbase.openai_compatible".into(),
        plugin_type: "model_provider".into(),
        provider_code: "openai_compatible".into(),
        namespace: "plugin.openai_compatible".into(),
        protocol: "openai_compatible".into(),
        latest_version: "0.2.1".into(),
        selected_artifact: sample_artifact("linux", "amd64", Some("musl")),
        i18n_summary: sample_i18n_summary(),
        release_tag: "openai_compatible-v0.2.1".into(),
        trust_mode: "signature_required".into(),
        help_url: Some("https://example.test/help".into()),
        model_discovery_mode: "hybrid".into(),
    };

    assert_eq!(view.entries.len(), 1);
    assert_eq!(entry.plugin_type, reference.plugin_type);
    assert_eq!(entry.namespace, reference.namespace);
    assert!(view.i18n_catalog["plugin.openai_compatible"].contains_key("zh_Hans"));
    assert!(!view.i18n_catalog["plugin.openai_compatible"].contains_key("fr_FR"));
}
