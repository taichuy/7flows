use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    plugin_management::{
        AssignPluginCommand, DeletePluginFamilyCommand, EnablePluginCommand, InstallPluginCommand,
        PluginCatalogFilter, PluginManagementService, SwitchPluginVersionCommand,
        UpgradeLatestPluginFamilyCommand,
    },
    ports::{
        CreatePluginAssignmentInput, DownloadedOfficialPluginPackage, ModelProviderRepository,
        OfficialPluginCatalogSnapshot, OfficialPluginCatalogSource, OfficialPluginSourceEntry,
        OfficialPluginSourcePort, PluginRepository,
    },
};
use domain::{PluginDesiredState, PluginTaskKind, PluginTaskStatus};

use super::support::{
    actor_with_permissions, create_provider_fixture, requested_locales, seed_test_installation,
    MemoryOfficialPluginSource, MemoryPluginManagementRepository, MemoryProviderRuntime,
};

#[tokio::test]
async fn plugin_management_service_switches_to_a_local_version_without_redownloading() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let install_root = std::env::temp_dir().join(format!("plugin-switch-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );

    let current_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    let target_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.2.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let task = service
        .switch_version(SwitchPluginVersionCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
            target_installation_id: target_installation,
        })
        .await
        .unwrap();

    let assignments = repository.list_assignments(workspace_id).await.unwrap();
    assert_eq!(assignments.len(), 1);
    assert_eq!(assignments[0].installation_id, target_installation);
    assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
    assert_eq!(task.status, PluginTaskStatus::Succeeded);
}

#[tokio::test]
async fn plugin_management_service_switches_version_and_invalidates_provider_caches() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let install_root =
        std::env::temp_dir().join(format!("plugin-switch-migrate-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );

    let current_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    let target_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.2.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();
    repository
        .seed_instance_with_ready_cache(
            current_installation,
            "fixture_provider",
            "Fixture Provider Prod",
        )
        .await;
    repository
        .seed_instance_with_ready_cache(
            current_installation,
            "fixture_provider",
            "Fixture Provider Staging",
        )
        .await;

    let task = service
        .switch_version(SwitchPluginVersionCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
            target_installation_id: target_installation,
        })
        .await
        .unwrap();

    assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
    assert_eq!(task.detail_json["migrated_instance_count"], 2);
    assert_eq!(
        repository
            .assignment_installation_id("fixture_provider")
            .await,
        target_installation
    );
    assert_eq!(
        repository.cache_refresh_statuses().await,
        vec!["idle", "idle"]
    );
}

#[tokio::test]
async fn plugin_management_service_upgrades_to_latest_without_redownloading_when_already_installed_locally(
) {
    #[derive(Clone)]
    struct LatestAlreadyInstalledSource {
        download_calls: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl OfficialPluginSourcePort for LatestAlreadyInstalledSource {
        async fn list_official_catalog(&self) -> Result<OfficialPluginCatalogSnapshot> {
            Ok(OfficialPluginCatalogSnapshot {
                source: OfficialPluginCatalogSource {
                    source_kind: "official_registry".into(),
                    source_label: "官方源".into(),
                    registry_url: "https://example.com/official-registry.json".into(),
                },
                entries: vec![OfficialPluginSourceEntry {
                    plugin_id: "1flowbase.fixture_provider".into(),
                    plugin_type: "model_provider".into(),
                    provider_code: "fixture_provider".into(),
                    namespace: "plugin.fixture_provider".into(),
                    protocol: "openai_compatible".into(),
                    latest_version: "0.2.0".into(),
                    selected_artifact: super::support::sample_artifact(
                        "linux",
                        "amd64",
                        Some("musl"),
                    ),
                    i18n_summary: super::support::sample_i18n_summary(),
                    release_tag: "fixture_provider-v0.2.0".into(),
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
            self.download_calls.fetch_add(1, Ordering::SeqCst);
            anyhow::bail!("download should not be called when latest is already installed")
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
    let runtime = MemoryProviderRuntime::default();
    let download_calls = Arc::new(AtomicUsize::new(0));
    let install_root =
        std::env::temp_dir().join(format!("plugin-upgrade-latest-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(LatestAlreadyInstalledSource {
            download_calls: download_calls.clone(),
        }),
        &install_root,
    );

    let current_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    let target_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.2.0",
        PluginDesiredState::Disabled,
    )
    .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let task = service
        .upgrade_latest(UpgradeLatestPluginFamilyCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
        })
        .await
        .unwrap();

    let assignments = repository.list_assignments(workspace_id).await.unwrap();
    assert_eq!(assignments.len(), 1);
    assert_eq!(assignments[0].installation_id, target_installation);
    assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
    assert_eq!(task.status, PluginTaskStatus::Succeeded);
    assert_eq!(download_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn plugin_management_service_deletes_provider_family_with_instances_and_artifacts() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let install_root =
        std::env::temp_dir().join(format!("plugin-delete-family-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );

    let current_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.1.0",
        PluginDesiredState::ActiveRequested,
    )
    .await;
    let old_installation = seed_test_installation(
        &repository,
        &install_root,
        "fixture_provider",
        "0.0.9",
        PluginDesiredState::Disabled,
    )
    .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();
    repository
        .seed_instance_with_ready_cache(
            current_installation,
            "fixture_provider",
            "Fixture Provider Prod",
        )
        .await;
    repository
        .seed_instance_with_ready_cache(
            old_installation,
            "fixture_provider",
            "Fixture Provider Staging",
        )
        .await;

    let current_path = PathBuf::from(
        &repository
            .get_installation(current_installation)
            .await
            .unwrap()
            .unwrap()
            .installed_path,
    );
    let old_path = PathBuf::from(
        &repository
            .get_installation(old_installation)
            .await
            .unwrap()
            .unwrap()
            .installed_path,
    );

    let task = service
        .delete_family(DeletePluginFamilyCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
        })
        .await
        .unwrap();

    assert_eq!(task.task_kind, PluginTaskKind::Uninstall);
    assert_eq!(task.status, PluginTaskStatus::Succeeded);
    assert_eq!(task.detail_json["deleted_instance_count"], 2);
    assert_eq!(task.detail_json["deleted_installation_count"], 2);
    assert_eq!(repository.list_installations().await.unwrap().len(), 0);
    assert_eq!(
        repository
            .list_assignments(workspace_id)
            .await
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        repository.list_instances(workspace_id).await.unwrap().len(),
        0
    );
    assert!(!current_path.exists());
    assert!(!old_path.exists());
    assert_eq!(
        repository.audit_events().await,
        vec!["plugin.family_deleted"]
    );
}

#[tokio::test]
async fn plugin_management_service_installs_enables_assigns_and_lists_tasks() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let nonce = Uuid::now_v7().to_string();
    let package_root = std::env::temp_dir().join(format!("plugin-source-{nonce}"));
    let install_root = std::env::temp_dir().join(format!("plugin-installed-{nonce}"));
    create_provider_fixture(&package_root);

    let service = PluginManagementService::new(
        repository.clone(),
        runtime.clone(),
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );

    let install = service
        .install_plugin(InstallPluginCommand {
            actor_user_id: repository.actor.user_id,
            package_root: package_root.display().to_string(),
        })
        .await
        .unwrap();
    assert_eq!(install.task.status, PluginTaskStatus::Succeeded);
    assert!(matches!(
        install.installation.desired_state,
        PluginDesiredState::Disabled
    ));
    assert!(PathBuf::from(&install.installation.installed_path).is_dir());
    assert!(!std::path::Path::new(&install.installation.installed_path)
        .join("demo")
        .exists());
    assert!(!std::path::Path::new(&install.installation.installed_path)
        .join("scripts")
        .exists());

    let enable = service
        .enable_plugin(EnablePluginCommand {
            actor_user_id: repository.actor.user_id,
            installation_id: install.installation.id,
        })
        .await
        .unwrap();
    assert_eq!(enable.status, PluginTaskStatus::Succeeded);

    let assign = service
        .assign_plugin(AssignPluginCommand {
            actor_user_id: repository.actor.user_id,
            installation_id: install.installation.id,
        })
        .await
        .unwrap();
    assert_eq!(assign.status, PluginTaskStatus::Succeeded);

    let catalog = service
        .list_catalog(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.entries.len(), 1);
    assert!(catalog.entries[0].assigned_to_current_workspace);
    assert_eq!(catalog.entries[0].model_discovery_mode, "hybrid");

    let tasks = service.list_tasks(repository.actor.user_id).await.unwrap();
    assert_eq!(tasks.len(), 3);
    let fetched = service
        .get_task(repository.actor.user_id, install.task.id)
        .await
        .unwrap();
    assert_eq!(fetched.task_kind, PluginTaskKind::Install);
    assert_eq!(
        runtime.loaded_installations().await,
        vec![install.installation.id]
    );
    assert_eq!(
        repository.audit_events().await,
        vec!["plugin.installed", "plugin.enabled", "plugin.assigned"]
    );
}
