use std::sync::Arc;

use crate::{
    plugin_management::{
        InstallOfficialPluginCommand, InstallPluginCommand, InstallUploadedPluginCommand,
        PluginCatalogFilter, PluginManagementService,
    },
    ports::NodeContributionRepository,
};
use domain::{NodeContributionDependencyStatus, PluginTaskStatus};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::support::{
    actor_with_permissions, build_openai_compatible_package_bytes,
    build_signed_openai_upload_package, create_provider_fixture,
    create_provider_fixture_with_node_contribution, requested_locales, MemoryOfficialPluginSource,
    MemoryPluginManagementRepository, MemoryProviderRuntime,
};

#[tokio::test]
async fn plugin_management_service_blocks_manage_actions_without_configure_permission() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource::default()),
        std::env::temp_dir().join(format!("plugin-installed-{}", Uuid::now_v7())),
    );

    let catalog = service
        .list_catalog(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    assert!(catalog.entries.is_empty());

    let error = service
        .install_plugin(InstallPluginCommand {
            actor_user_id: repository.actor.user_id,
            package_root: "/tmp/missing".to_string(),
        })
        .await
        .unwrap_err();
    assert!(matches!(
        error.downcast_ref::<crate::errors::ControlPlaneError>(),
        Some(crate::errors::ControlPlaneError::PermissionDenied(
            "permission_denied"
        ))
    ));
}

#[tokio::test]
async fn plugin_management_service_lists_official_catalog_and_installs_latest_release_asset() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource::default()),
        std::env::temp_dir().join(format!("plugin-installed-{}", Uuid::now_v7())),
    );

    let catalog = service
        .list_official_catalog(
            repository.actor.user_id,
            PluginCatalogFilter::default(),
            requested_locales(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.source_kind, "official_registry");
    assert_eq!(catalog.source_label, "官方源");
    assert_eq!(catalog.entries.len(), 1);
    assert_eq!(catalog.entries[0].plugin_id, "1flowbase.openai_compatible");

    let expected_package_bytes = build_openai_compatible_package_bytes("0.1.0", false);

    let install = service
        .install_official_plugin(InstallOfficialPluginCommand {
            actor_user_id: repository.actor.user_id,
            plugin_id: "1flowbase.openai_compatible".to_string(),
        })
        .await
        .unwrap();

    assert_eq!(install.installation.provider_code, "openai_compatible");
    assert_eq!(install.installation.source_kind, "official_registry");
    assert_eq!(
        install.installation.checksum.as_deref(),
        Some(format!("sha256:{:x}", Sha256::digest(&expected_package_bytes)).as_str())
    );
    assert_eq!(
        install.installation.signature_status.as_deref(),
        Some("unsigned")
    );
    assert_eq!(install.task.status, PluginTaskStatus::Succeeded);
}

#[tokio::test]
async fn plugin_management_service_rejects_unsigned_signature_required_official_package() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(MemoryOfficialPluginSource::unsigned_required()),
        std::env::temp_dir().join(format!("plugin-installed-{}", Uuid::now_v7())),
    );

    let error = service
        .install_official_plugin(InstallOfficialPluginCommand {
            actor_user_id: repository.actor.user_id,
            plugin_id: "1flowbase.openai_compatible".into(),
        })
        .await
        .expect_err("unsigned official package must fail");

    assert!(error
        .to_string()
        .contains("requires a valid official signature"));
}

#[tokio::test]
async fn plugin_management_service_installs_uploaded_signed_package_as_verified_official() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let fixture = build_signed_openai_upload_package("0.2.0");
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(MemoryOfficialPluginSource::with_trusted_public_keys(vec![
            fixture.public_key.clone(),
        ])),
        std::env::temp_dir().join(format!("plugin-uploaded-{}", Uuid::now_v7())),
    );

    let result = service
        .install_uploaded_plugin(InstallUploadedPluginCommand {
            actor_user_id: repository.actor.user_id,
            file_name: "openai_compatible-0.2.0.1flowbasepkg".into(),
            package_bytes: fixture.package_bytes.clone(),
        })
        .await
        .unwrap();

    assert_eq!(result.installation.source_kind, "uploaded");
    assert_eq!(result.installation.trust_level, "verified_official");
    assert_eq!(
        result.installation.signature_status.as_deref(),
        Some("verified")
    );
}

#[tokio::test]
async fn plugin_management_service_rejects_restarting_terminal_task() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let nonce = Uuid::now_v7().to_string();
    let package_root = std::env::temp_dir().join(format!("plugin-terminal-task-source-{nonce}"));
    let install_root = std::env::temp_dir().join(format!("plugin-terminal-task-installed-{nonce}"));
    create_provider_fixture(&package_root);
    repository
        .set_created_task_status_override(domain::PluginTaskStatus::Succeeded)
        .await;

    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );

    let error = service
        .install_plugin(InstallPluginCommand {
            actor_user_id: repository.actor.user_id,
            package_root: package_root.display().to_string(),
        })
        .await
        .unwrap_err();

    assert!(matches!(
        error.downcast_ref::<crate::errors::ControlPlaneError>(),
        Some(crate::errors::ControlPlaneError::InvalidStateTransition { resource, from, to, .. })
            if *resource == "plugin_task" && from == "succeeded" && to == "running"
    ));
}

#[tokio::test]
async fn plugin_management_service_syncs_manifest_node_contributions_on_install() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let nonce = Uuid::now_v7().to_string();
    let package_root =
        std::env::temp_dir().join(format!("plugin-node-contribution-source-{nonce}"));
    let install_root =
        std::env::temp_dir().join(format!("plugin-node-contribution-installed-{nonce}"));
    create_provider_fixture_with_node_contribution(&package_root);

    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource::default()),
        &install_root,
    );

    let installation = service
        .install_plugin(InstallPluginCommand {
            actor_user_id: repository.actor.user_id,
            package_root: package_root.display().to_string(),
        })
        .await
        .unwrap()
        .installation;
    let entries = NodeContributionRepository::list_node_contributions(&repository, workspace_id)
        .await
        .unwrap();

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].installation_id, installation.id);
    assert_eq!(entries[0].contribution_code, "openai_prompt");
    assert_eq!(
        entries[0].dependency_status,
        NodeContributionDependencyStatus::MissingPlugin
    );
}
