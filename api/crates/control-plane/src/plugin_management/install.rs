use super::*;
use super::{catalog::normalize_official_entries, filesystem::copy_installation_artifact};

pub struct InstallPluginCommand {
    pub actor_user_id: Uuid,
    pub package_root: String,
}

pub struct InstallOfficialPluginCommand {
    pub actor_user_id: Uuid,
    pub plugin_id: String,
}

pub struct InstallUploadedPluginCommand {
    pub actor_user_id: Uuid,
    pub file_name: String,
    pub package_bytes: Vec<u8>,
}

pub struct UpgradeLatestPluginFamilyCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
}

#[derive(Debug, Clone)]
pub struct InstallPluginResult {
    pub installation: domain::PluginInstallationRecord,
    pub task: domain::PluginTaskRecord,
}

struct InstallSourceMetadata {
    source_kind: String,
    trust_level: String,
    checksum: Option<String>,
    signature_status: Option<String>,
    signature_algorithm: Option<String>,
    signing_key_id: Option<String>,
    package_bytes: Option<Vec<u8>>,
}

impl InstallSourceMetadata {
    fn uploaded_manual_install() -> Self {
        Self {
            source_kind: "uploaded".to_string(),
            trust_level: "checksum_only".to_string(),
            checksum: None,
            signature_status: Some("unsigned".to_string()),
            signature_algorithm: None,
            signing_key_id: None,
            package_bytes: None,
        }
    }
}

pub(super) async fn load_actor_context_for_user<R>(
    repository: &R,
    actor_user_id: Uuid,
) -> Result<domain::ActorContext>
where
    R: AuthRepository,
{
    let scope = repository.default_scope_for_user(actor_user_id).await?;
    repository
        .load_actor_context(actor_user_id, scope.tenant_id, scope.workspace_id, None)
        .await
}

pub(super) fn load_provider_package(path: impl AsRef<Path>) -> Result<ProviderPackage> {
    ProviderPackage::load_from_dir(path.as_ref()).map_err(map_framework_error)
}

fn load_plugin_manifest(path: impl AsRef<Path>) -> Result<PluginManifestV1> {
    let manifest_path = path.as_ref().join("manifest.yaml");
    let raw = fs::read_to_string(&manifest_path).with_context(|| {
        format!(
            "failed to read plugin manifest at {}",
            manifest_path.display()
        )
    })?;
    parse_plugin_manifest(&raw).map_err(map_framework_error)
}

fn build_node_contribution_sync_input(
    installation: &domain::PluginInstallationRecord,
    manifest: &PluginManifestV1,
) -> ReplaceInstallationNodeContributionsInput {
    ReplaceInstallationNodeContributionsInput {
        installation_id: installation.id,
        provider_code: installation.provider_code.clone(),
        plugin_id: installation.plugin_id.clone(),
        plugin_version: installation.plugin_version.clone(),
        entries: manifest
            .node_contributions
            .iter()
            .map(|entry| NodeContributionRegistryInput {
                contribution_code: entry.contribution_code.clone(),
                node_shell: entry.node_shell.clone(),
                category: entry.category.clone(),
                title: entry.title.clone(),
                description: entry.description.clone(),
                icon: entry.icon.clone(),
                schema_ui: entry.schema_ui.clone(),
                schema_version: entry.schema_version.clone(),
                output_schema: entry.output_schema.clone(),
                required_auth: entry.required_auth.clone(),
                visibility: entry.visibility.clone(),
                experimental: entry.experimental,
                dependency_installation_kind: entry.dependency.installation_kind.clone(),
                dependency_plugin_version_range: entry.dependency.plugin_version_range.clone(),
            })
            .collect(),
    }
}

pub(super) fn map_model_discovery_mode(
    mode: plugin_framework::provider_contract::ModelDiscoveryMode,
) -> domain::ModelProviderDiscoveryMode {
    match mode {
        plugin_framework::provider_contract::ModelDiscoveryMode::Static => {
            domain::ModelProviderDiscoveryMode::Static
        }
        plugin_framework::provider_contract::ModelDiscoveryMode::Dynamic => {
            domain::ModelProviderDiscoveryMode::Dynamic
        }
        plugin_framework::provider_contract::ModelDiscoveryMode::Hybrid => {
            domain::ModelProviderDiscoveryMode::Hybrid
        }
    }
}

pub(super) fn map_catalog_source(
    mode: plugin_framework::provider_contract::ModelDiscoveryMode,
) -> domain::ModelProviderCatalogSource {
    match mode {
        plugin_framework::provider_contract::ModelDiscoveryMode::Static => {
            domain::ModelProviderCatalogSource::Static
        }
        plugin_framework::provider_contract::ModelDiscoveryMode::Dynamic => {
            domain::ModelProviderCatalogSource::Dynamic
        }
        plugin_framework::provider_contract::ModelDiscoveryMode::Hybrid => {
            domain::ModelProviderCatalogSource::Hybrid
        }
    }
}

fn map_framework_error(error: plugin_framework::error::PluginFrameworkError) -> anyhow::Error {
    use plugin_framework::error::PluginFrameworkErrorKind;

    match error.kind() {
        PluginFrameworkErrorKind::InvalidAssignment
        | PluginFrameworkErrorKind::InvalidProviderPackage
        | PluginFrameworkErrorKind::InvalidProviderContract
        | PluginFrameworkErrorKind::Serialization => {
            ControlPlaneError::InvalidInput("provider_package").into()
        }
        PluginFrameworkErrorKind::Io | PluginFrameworkErrorKind::RuntimeContract => {
            ControlPlaneError::UpstreamUnavailable("provider_runtime").into()
        }
    }
}

impl<R, H> PluginManagementService<R, H>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository + NodeContributionRepository,
    H: ProviderRuntimePort,
{
    pub async fn install_plugin(
        &self,
        command: InstallPluginCommand,
    ) -> Result<InstallPluginResult> {
        let package_root = command.package_root.clone();
        self.install_plugin_with_metadata(
            command,
            InstallSourceMetadata::uploaded_manual_install(),
            json!({
                "install_kind": "uploaded_manual_install",
                "package_root": package_root,
            }),
        )
        .await
    }

    pub async fn reconcile_all_installations(&self) -> Result<()> {
        for installation in self.repository.list_installations().await? {
            let _ = reconcile_installation_snapshot(&self.repository, installation.id).await?;
        }

        Ok(())
    }

    pub async fn install_uploaded_plugin(
        &self,
        command: InstallUploadedPluginCommand,
    ) -> Result<InstallPluginResult> {
        let file_name = command.file_name.clone();
        let intake = intake_package_bytes(
            &command.package_bytes,
            &PackageIntakePolicy {
                source_kind: "uploaded".to_string(),
                trust_mode: "allow_unsigned".to_string(),
                expected_artifact_sha256: None,
                trusted_public_keys: self.official_source.trusted_public_keys(),
                original_filename: Some(file_name.clone()),
            },
        )
        .await?;
        self.install_intake_result(
            command.actor_user_id,
            intake,
            Some(command.package_bytes),
            json!({
                "install_kind": "upload",
                "file_name": file_name,
            }),
        )
        .await
    }

    pub async fn install_official_plugin(
        &self,
        command: InstallOfficialPluginCommand,
    ) -> Result<InstallPluginResult> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let snapshot = self.official_source.list_official_catalog().await?;
        let entry = snapshot
            .entries
            .into_iter()
            .find(|item| item.plugin_id == command.plugin_id)
            .ok_or(ControlPlaneError::NotFound("official_plugin"))?;
        let downloaded = self.official_source.download_plugin(&entry).await?;
        let intake = intake_package_bytes(
            &downloaded.package_bytes,
            &PackageIntakePolicy {
                source_kind: snapshot.source.source_kind.clone(),
                trust_mode: entry.trust_mode.clone(),
                expected_artifact_sha256: Some(entry.selected_artifact.checksum.clone()),
                trusted_public_keys: self.official_source.trusted_public_keys(),
                original_filename: Some(downloaded.file_name.clone()),
            },
        )
        .await?;
        let result = async {
            let install = self
                .install_intake_result(
                    command.actor_user_id,
                    intake,
                    Some(downloaded.package_bytes.clone()),
                    json!({
                        "install_kind": "official_source",
                        "plugin_id": command.plugin_id,
                        "file_name": downloaded.file_name,
                    }),
                )
                .await?;
            if is_host_extension_installation(&install.installation) {
                return Ok::<InstallPluginResult, anyhow::Error>(install);
            }
            self.enable_plugin(EnablePluginCommand {
                actor_user_id: command.actor_user_id,
                installation_id: install.installation.id,
            })
            .await?;
            let task = self
                .assign_plugin(AssignPluginCommand {
                    actor_user_id: command.actor_user_id,
                    installation_id: install.installation.id,
                })
                .await?;
            let installation = self
                .repository
                .get_installation(install.installation.id)
                .await?
                .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
            Ok::<InstallPluginResult, anyhow::Error>(InstallPluginResult { installation, task })
        }
        .await;
        result
    }

    pub async fn upgrade_latest(
        &self,
        command: UpgradeLatestPluginFamilyCommand,
    ) -> Result<domain::PluginTaskRecord> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let current = self
            .load_current_family_installation(actor.current_workspace_id, &command.provider_code)
            .await?;
        let official_entry = self.official_source.list_official_catalog().await?.entries;
        let official_entry = normalize_official_entries(official_entry)
            .into_iter()
            .find(|entry| entry.provider_code == command.provider_code)
            .ok_or(ControlPlaneError::NotFound("official_plugin"))?;
        let installed_target = self
            .repository
            .list_installations()
            .await?
            .into_iter()
            .find(|installation| {
                installation.provider_code == command.provider_code
                    && installation.plugin_version == official_entry.latest_version
            });
        let target = match installed_target {
            Some(installation) => installation,
            None => {
                let downloaded = self
                    .official_source
                    .download_plugin(&official_entry)
                    .await?;
                let snapshot = self.official_source.list_official_catalog().await?;
                let snapshot_entry = normalize_official_entries(snapshot.entries)
                    .into_iter()
                    .find(|entry| entry.provider_code == command.provider_code)
                    .ok_or(ControlPlaneError::NotFound("official_plugin"))?;
                let intake = intake_package_bytes(
                    &downloaded.package_bytes,
                    &PackageIntakePolicy {
                        source_kind: snapshot.source.source_kind.clone(),
                        trust_mode: snapshot_entry.trust_mode.clone(),
                        expected_artifact_sha256: Some(
                            snapshot_entry.selected_artifact.checksum.clone(),
                        ),
                        trusted_public_keys: self.official_source.trusted_public_keys(),
                        original_filename: Some(downloaded.file_name.clone()),
                    },
                )
                .await?;
                self.install_intake_result(
                    command.actor_user_id,
                    intake,
                    Some(downloaded.package_bytes.clone()),
                    json!({
                        "install_kind": "official_upgrade",
                        "plugin_id": snapshot_entry.plugin_id,
                        "provider_code": snapshot_entry.provider_code,
                        "file_name": downloaded.file_name,
                    }),
                )
                .await?
                .installation
            }
        };
        if current.id == target.id {
            return Err(ControlPlaneError::Conflict("plugin_version_already_current").into());
        }

        self.switch_family_installation(
            &actor,
            &command.provider_code,
            &current,
            &target,
            command.actor_user_id,
        )
        .await
    }

    async fn install_intake_result(
        &self,
        actor_user_id: Uuid,
        intake: PackageIntakeResult,
        package_bytes: Option<Vec<u8>>,
        detail_json: serde_json::Value,
    ) -> Result<InstallPluginResult> {
        let package_root = intake.extracted_root.clone();
        let result = self
            .install_plugin_with_metadata(
                InstallPluginCommand {
                    actor_user_id,
                    package_root: package_root.display().to_string(),
                },
                InstallSourceMetadata {
                    source_kind: intake.source_kind,
                    trust_level: intake.trust_level,
                    checksum: intake.checksum,
                    signature_status: Some(intake.signature_status),
                    signature_algorithm: intake.signature_algorithm,
                    signing_key_id: intake.signing_key_id,
                    package_bytes,
                },
                detail_json,
            )
            .await;
        let _ = fs::remove_dir_all(&package_root);
        result
    }

    async fn install_plugin_with_metadata(
        &self,
        command: InstallPluginCommand,
        source_metadata: InstallSourceMetadata,
        detail_json: serde_json::Value,
    ) -> Result<InstallPluginResult> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let task_id = Uuid::now_v7();
        let task = self
            .repository
            .create_task(&CreatePluginTaskInput {
                task_id,
                installation_id: None,
                workspace_id: None,
                provider_code: "pending_provider".to_string(),
                task_kind: domain::PluginTaskKind::Install,
                status: domain::PluginTaskStatus::Queued,
                status_message: Some("pending".to_string()),
                detail_json: detail_json.clone(),
                actor_user_id: Some(command.actor_user_id),
            })
            .await?;
        let running_task = self
            .transition_task(
                &task,
                domain::PluginTaskStatus::Running,
                Some("running".to_string()),
                detail_json.clone(),
            )
            .await?;

        let installation_result = async {
            let manifest = load_plugin_manifest(&command.package_root)?;
            let plugin_code = plugin_code_from_plugin_id(&manifest.plugin_id)?;
            let install_path = self
                .install_root
                .join("installed")
                .join(&plugin_code)
                .join(&manifest.version);
            let package_archive_path = self
                .install_root
                .join("packages")
                .join(&plugin_code)
                .join(format!("{}.1flowbasepkg", manifest.plugin_id));
            if let Some(package_bytes) = source_metadata.package_bytes.as_ref() {
                if let Some(parent) = package_archive_path.parent() {
                    fs::create_dir_all(parent).with_context(|| {
                        format!(
                            "failed to create plugin package archive directory {}",
                            parent.display()
                        )
                    })?;
                }
                fs::write(&package_archive_path, package_bytes).with_context(|| {
                    format!(
                        "failed to persist plugin package archive at {}",
                        package_archive_path.display()
                    )
                })?;
            }
            copy_installation_artifact(Path::new(&command.package_root), &install_path)?;
            let manifest_fingerprint =
                compute_manifest_fingerprint(&install_path.join("manifest.yaml"))
                    .map_err(map_framework_error)?;
            if is_host_extension_manifest(&manifest) {
                ensure_root_actor(&actor)?;
                ensure_uploaded_host_extensions_enabled(self.allow_uploaded_host_extensions)?;
                let mut metadata_json = json!({});
                if let Some(install_kind) = detail_json.get("install_kind").cloned() {
                    metadata_json["install_kind"] = install_kind;
                }
                let installation = self
                    .repository
                    .upsert_installation(&UpsertPluginInstallationInput {
                        installation_id: Uuid::now_v7(),
                        provider_code: plugin_code.clone(),
                        plugin_id: manifest.plugin_id.clone(),
                        plugin_version: manifest.version.clone(),
                        contract_version: manifest.contract_version.clone(),
                        protocol: manifest.runtime.protocol.clone(),
                        display_name: manifest.display_name.clone(),
                        source_kind: source_metadata.source_kind.clone(),
                        trust_level: source_metadata.trust_level.clone(),
                        verification_status: domain::PluginVerificationStatus::Valid,
                        desired_state: domain::PluginDesiredState::PendingRestart,
                        artifact_status: domain::PluginArtifactStatus::Ready,
                        runtime_status: domain::PluginRuntimeStatus::Inactive,
                        availability_status: derive_availability_status(
                            domain::PluginDesiredState::PendingRestart,
                            domain::PluginArtifactStatus::Ready,
                            domain::PluginRuntimeStatus::Inactive,
                        ),
                        package_path: source_metadata.package_bytes.as_ref().map(|_| {
                            package_archive_path.display().to_string()
                        }),
                        installed_path: install_path.display().to_string(),
                        checksum: source_metadata.checksum.clone(),
                        manifest_fingerprint: Some(manifest_fingerprint),
                        signature_status: source_metadata.signature_status.clone(),
                        signature_algorithm: source_metadata.signature_algorithm.clone(),
                        signing_key_id: source_metadata.signing_key_id.clone(),
                        last_load_error: None,
                        metadata_json,
                        actor_user_id: command.actor_user_id,
                    })
                    .await?;
                self.repository
                    .append_audit_log(&audit_log(
                        Some(actor.current_workspace_id),
                        Some(command.actor_user_id),
                        "plugin_installation",
                        Some(installation.id),
                        "plugin.installed",
                        json!({
                            "provider_code": installation.provider_code,
                            "plugin_id": installation.plugin_id,
                            "restart_required": true,
                        }),
                    ))
                    .await?;
                return Ok::<domain::PluginInstallationRecord, anyhow::Error>(installation);
            }

            let installed_package = load_provider_package(&install_path)?;
            let mut metadata_json = json!({
                "help_url": installed_package.provider.help_url,
                "default_base_url": installed_package.provider.default_base_url,
                "model_discovery_mode": format!("{:?}", installed_package.provider.model_discovery_mode).to_ascii_lowercase(),
                "supported_model_types": ["llm"],
            });
            if let Some(install_kind) = detail_json.get("install_kind").cloned() {
                metadata_json["install_kind"] = install_kind;
            }
            let installation = self
                .repository
                .upsert_installation(&UpsertPluginInstallationInput {
                    installation_id: Uuid::now_v7(),
                    provider_code: installed_package.provider.provider_code.clone(),
                    plugin_id: installed_package.identifier(),
                    plugin_version: installed_package.manifest.version.clone(),
                    contract_version: installed_package.manifest.contract_version.clone(),
                    protocol: installed_package.provider.protocol.clone(),
                    display_name: installed_package.provider.display_name.clone(),
                    source_kind: source_metadata.source_kind.clone(),
                    trust_level: source_metadata.trust_level.clone(),
                    verification_status: domain::PluginVerificationStatus::Valid,
                    desired_state: domain::PluginDesiredState::Disabled,
                    artifact_status: domain::PluginArtifactStatus::Ready,
                    runtime_status: domain::PluginRuntimeStatus::Inactive,
                    availability_status: derive_availability_status(
                        domain::PluginDesiredState::Disabled,
                        domain::PluginArtifactStatus::Ready,
                        domain::PluginRuntimeStatus::Inactive,
                    ),
                    package_path: source_metadata.package_bytes.as_ref().map(|_| {
                        package_archive_path.display().to_string()
                    }),
                    installed_path: install_path.display().to_string(),
                    checksum: source_metadata.checksum.clone(),
                    manifest_fingerprint: Some(manifest_fingerprint),
                    signature_status: source_metadata.signature_status.clone(),
                    signature_algorithm: source_metadata.signature_algorithm.clone(),
                    signing_key_id: source_metadata.signing_key_id.clone(),
                    last_load_error: None,
                    metadata_json,
                    actor_user_id: command.actor_user_id,
                })
                .await?;
            let manifest = load_plugin_manifest(&install_path)?;
            self.repository
                .replace_installation_node_contributions(
                    &build_node_contribution_sync_input(&installation, &manifest),
                )
                .await?;
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(command.actor_user_id),
                    "plugin_installation",
                    Some(installation.id),
                    "plugin.installed",
                    json!({
                        "provider_code": installation.provider_code,
                        "plugin_id": installation.plugin_id,
                    }),
                ))
                .await?;
            Ok::<domain::PluginInstallationRecord, anyhow::Error>(installation)
        }
        .await;

        match installation_result {
            Ok(installation) => {
                let installed_message = if is_host_extension_installation(&installation) {
                    "installed; restart required"
                } else {
                    "installed"
                };
                let task = self
                    .transition_task(
                        &running_task,
                        domain::PluginTaskStatus::Succeeded,
                        Some(installed_message.to_string()),
                        json!({
                            "installation_id": installation.id,
                            "provider_code": installation.provider_code,
                            "plugin_id": installation.plugin_id,
                            "installed_path": installation.installed_path,
                        }),
                    )
                    .await?;
                Ok(InstallPluginResult { installation, task })
            }
            Err(error) => {
                let _ = self
                    .transition_task(
                        &running_task,
                        domain::PluginTaskStatus::Failed,
                        Some(error.to_string()),
                        detail_json,
                    )
                    .await;
                Err(error)
            }
        }
    }
}
