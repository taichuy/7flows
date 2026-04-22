use super::*;
use super::{
    filesystem::remove_path_if_exists,
    install::{
        load_actor_context_for_user, load_provider_package, map_catalog_source,
        map_model_discovery_mode,
    },
};

pub struct EnablePluginCommand {
    pub actor_user_id: Uuid,
    pub installation_id: Uuid,
}

pub struct AssignPluginCommand {
    pub actor_user_id: Uuid,
    pub installation_id: Uuid,
}

pub struct SwitchPluginVersionCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
    pub target_installation_id: Uuid,
}

pub struct DeletePluginFamilyCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
}

impl<R, H> PluginManagementService<R, H>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository + NodeContributionRepository,
    H: ProviderRuntimePort,
{
    pub(super) async fn transition_task(
        &self,
        task: &domain::PluginTaskRecord,
        next_status: domain::PluginTaskStatus,
        status_message: Option<String>,
        detail_json: serde_json::Value,
    ) -> Result<domain::PluginTaskRecord> {
        ensure_plugin_task_transition(task.status, next_status, "plugin_task_progress")?;
        self.repository
            .update_task_status(&UpdatePluginTaskStatusInput {
                task_id: task.id,
                status: next_status,
                status_message,
                detail_json,
            })
            .await
    }

    pub async fn enable_plugin(
        &self,
        command: EnablePluginCommand,
    ) -> Result<domain::PluginTaskRecord> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        let installation = self
            .repository
            .get_installation(command.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        if is_host_extension_installation(&installation) {
            return Err(ControlPlaneError::Conflict("plugin_installation_requires_restart").into());
        }

        let task_id = Uuid::now_v7();
        let task = self
            .repository
            .create_task(&CreatePluginTaskInput {
                task_id,
                installation_id: Some(command.installation_id),
                workspace_id: None,
                provider_code: installation.provider_code.clone(),
                task_kind: domain::PluginTaskKind::Enable,
                status: domain::PluginTaskStatus::Queued,
                status_message: Some("pending".to_string()),
                detail_json: json!({}),
                actor_user_id: Some(command.actor_user_id),
            })
            .await?;
        let running_task = self
            .transition_task(
                &task,
                domain::PluginTaskStatus::Running,
                Some("running".to_string()),
                json!({}),
            )
            .await?;

        let enable_result = async {
            let updated = self
                .repository
                .update_desired_state(&UpdatePluginDesiredStateInput {
                    installation_id: command.installation_id,
                    desired_state: domain::PluginDesiredState::ActiveRequested,
                    availability_status: derive_availability_status(
                        domain::PluginDesiredState::ActiveRequested,
                        installation.artifact_status,
                        installation.runtime_status,
                    ),
                })
                .await?;
            let loaded = match self.runtime.ensure_loaded(&updated).await {
                Ok(()) => {
                    self.repository
                        .update_runtime_snapshot(&UpdatePluginRuntimeSnapshotInput {
                            installation_id: updated.id,
                            runtime_status: domain::PluginRuntimeStatus::Active,
                            availability_status: derive_availability_status(
                                updated.desired_state,
                                updated.artifact_status,
                                domain::PluginRuntimeStatus::Active,
                            ),
                            last_load_error: None,
                        })
                        .await?
                }
                Err(error) => {
                    self.repository
                        .update_runtime_snapshot(&UpdatePluginRuntimeSnapshotInput {
                            installation_id: updated.id,
                            runtime_status: domain::PluginRuntimeStatus::LoadFailed,
                            availability_status: derive_availability_status(
                                updated.desired_state,
                                updated.artifact_status,
                                domain::PluginRuntimeStatus::LoadFailed,
                            ),
                            last_load_error: Some(error.to_string()),
                        })
                        .await?;
                    return Err(error);
                }
            };
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(command.actor_user_id),
                    "plugin_installation",
                    Some(loaded.id),
                    "plugin.enabled",
                    json!({
                        "provider_code": loaded.provider_code,
                    }),
                ))
                .await?;
            Ok::<domain::PluginInstallationRecord, anyhow::Error>(loaded)
        }
        .await;

        match enable_result {
            Ok(updated) => {
                self.transition_task(
                    &running_task,
                    domain::PluginTaskStatus::Succeeded,
                    Some("enabled".to_string()),
                    json!({
                        "installation_id": updated.id,
                        "enabled": !matches!(
                            updated.desired_state,
                            domain::PluginDesiredState::Disabled
                        ),
                    }),
                )
                .await
            }
            Err(error) => {
                let _ = self
                    .transition_task(
                        &running_task,
                        domain::PluginTaskStatus::Failed,
                        Some(error.to_string()),
                        json!({
                            "installation_id": command.installation_id,
                        }),
                    )
                    .await;
                Err(error)
            }
        }
    }

    pub async fn assign_plugin(
        &self,
        command: AssignPluginCommand,
    ) -> Result<domain::PluginTaskRecord> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        let installation = self
            .repository
            .get_installation(command.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        if !is_model_provider_installation(&installation) {
            return Err(ControlPlaneError::Conflict("plugin_assignment_not_supported").into());
        }
        if matches!(
            installation.desired_state,
            domain::PluginDesiredState::Disabled
        ) {
            return Err(ControlPlaneError::Conflict("plugin_installation_disabled").into());
        }

        let task_id = Uuid::now_v7();
        let task = self
            .repository
            .create_task(&CreatePluginTaskInput {
                task_id,
                installation_id: Some(command.installation_id),
                workspace_id: Some(actor.current_workspace_id),
                provider_code: installation.provider_code.clone(),
                task_kind: domain::PluginTaskKind::Assign,
                status: domain::PluginTaskStatus::Queued,
                status_message: Some("pending".to_string()),
                detail_json: json!({}),
                actor_user_id: Some(command.actor_user_id),
            })
            .await?;
        let running_task = self
            .transition_task(
                &task,
                domain::PluginTaskStatus::Running,
                Some("running".to_string()),
                json!({}),
            )
            .await?;

        let assign_result = async {
            self.repository
                .create_assignment(&CreatePluginAssignmentInput {
                    installation_id: command.installation_id,
                    workspace_id: actor.current_workspace_id,
                    provider_code: installation.provider_code.clone(),
                    actor_user_id: command.actor_user_id,
                })
                .await?;
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(command.actor_user_id),
                    "plugin_assignment",
                    Some(command.installation_id),
                    "plugin.assigned",
                    json!({
                        "provider_code": installation.provider_code,
                    }),
                ))
                .await?;
            Ok::<(), anyhow::Error>(())
        }
        .await;

        match assign_result {
            Ok(()) => {
                self.transition_task(
                    &running_task,
                    domain::PluginTaskStatus::Succeeded,
                    Some("assigned".to_string()),
                    json!({
                        "installation_id": command.installation_id,
                        "workspace_id": actor.current_workspace_id,
                    }),
                )
                .await
            }
            Err(error) => {
                let _ = self
                    .transition_task(
                        &running_task,
                        domain::PluginTaskStatus::Failed,
                        Some(error.to_string()),
                        json!({
                            "installation_id": command.installation_id,
                            "workspace_id": actor.current_workspace_id,
                        }),
                    )
                    .await;
                Err(error)
            }
        }
    }

    pub async fn switch_version(
        &self,
        command: SwitchPluginVersionCommand,
    ) -> Result<domain::PluginTaskRecord> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let current = self
            .load_current_family_installation(actor.current_workspace_id, &command.provider_code)
            .await?;
        let target = self
            .repository
            .get_installation(command.target_installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        if target.provider_code != command.provider_code {
            return Err(ControlPlaneError::InvalidInput("plugin_family_target_mismatch").into());
        }
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

    pub async fn delete_family(
        &self,
        command: DeletePluginFamilyCommand,
    ) -> Result<domain::PluginTaskRecord> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let installations = self
            .repository
            .list_installations()
            .await?
            .into_iter()
            .filter(|installation| installation.provider_code == command.provider_code)
            .collect::<Vec<_>>();
        if installations.is_empty() {
            return Err(ControlPlaneError::NotFound("plugin_family").into());
        }

        let current_installation_id = self
            .repository
            .list_assignments(actor.current_workspace_id)
            .await?
            .into_iter()
            .find(|assignment| assignment.provider_code == command.provider_code)
            .map(|assignment| assignment.installation_id)
            .or_else(|| installations.first().map(|installation| installation.id));

        let task_id = Uuid::now_v7();
        let task = self
            .repository
            .create_task(&CreatePluginTaskInput {
                task_id,
                installation_id: current_installation_id,
                workspace_id: Some(actor.current_workspace_id),
                provider_code: command.provider_code.clone(),
                task_kind: domain::PluginTaskKind::Uninstall,
                status: domain::PluginTaskStatus::Queued,
                status_message: Some("pending".into()),
                detail_json: json!({}),
                actor_user_id: Some(command.actor_user_id),
            })
            .await?;
        let running_task = self
            .transition_task(
                &task,
                domain::PluginTaskStatus::Running,
                Some("running".into()),
                json!({
                    "provider_code": command.provider_code,
                    "installation_ids": installations
                        .iter()
                        .map(|installation| installation.id)
                        .collect::<Vec<_>>(),
                }),
            )
            .await?;

        let delete_result = async {
            let instances = self
                .repository
                .list_instances_by_provider_code(&command.provider_code)
                .await?;
            let mut referenced_flow_count = 0_u64;
            for instance in &instances {
                referenced_flow_count += self
                    .repository
                    .count_instance_references(instance.workspace_id, instance.id)
                    .await?;
            }

            for instance in &instances {
                self.repository
                    .delete_instance(instance.workspace_id, instance.id)
                    .await?;
            }

            let mut removed_paths = HashSet::<PathBuf>::new();
            for installation in &installations {
                self.repository.delete_installation(installation.id).await?;

                removed_paths.insert(PathBuf::from(&installation.installed_path));
                if let Some(package_path) = &installation.package_path {
                    removed_paths.insert(PathBuf::from(package_path));
                }
            }

            for path in &removed_paths {
                remove_path_if_exists(path)?;
            }

            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(command.actor_user_id),
                    "plugin_family",
                    None,
                    "plugin.family_deleted",
                    json!({
                        "provider_code": command.provider_code,
                        "deleted_instance_count": instances.len(),
                        "deleted_installation_count": installations.len(),
                        "referenced_flow_count": referenced_flow_count,
                    }),
                ))
                .await?;

            Ok::<(usize, usize, u64), anyhow::Error>((
                instances.len(),
                installations.len(),
                referenced_flow_count,
            ))
        }
        .await;

        match delete_result {
            Ok((deleted_instance_count, deleted_installation_count, referenced_flow_count)) => {
                self.transition_task(
                    &running_task,
                    domain::PluginTaskStatus::Succeeded,
                    Some("deleted".into()),
                    json!({
                        "provider_code": command.provider_code,
                        "deleted_instance_count": deleted_instance_count,
                        "deleted_installation_count": deleted_installation_count,
                        "referenced_flow_count": referenced_flow_count,
                    }),
                )
                .await
            }
            Err(error) => {
                let _ = self
                    .transition_task(
                        &running_task,
                        domain::PluginTaskStatus::Failed,
                        Some(error.to_string()),
                        json!({
                            "provider_code": command.provider_code,
                        }),
                    )
                    .await;
                Err(error)
            }
        }
    }

    pub async fn list_tasks(&self, actor_user_id: Uuid) -> Result<Vec<domain::PluginTaskRecord>> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository.list_tasks().await
    }

    pub async fn get_task(
        &self,
        actor_user_id: Uuid,
        task_id: Uuid,
    ) -> Result<domain::PluginTaskRecord> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .get_task(task_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_task").into())
    }

    pub(super) async fn load_current_family_installation(
        &self,
        workspace_id: Uuid,
        provider_code: &str,
    ) -> Result<domain::PluginInstallationRecord> {
        let assignment = self
            .repository
            .list_assignments(workspace_id)
            .await?
            .into_iter()
            .find(|item| item.provider_code == provider_code)
            .ok_or(ControlPlaneError::NotFound("plugin_assignment"))?;

        self.repository
            .get_installation(assignment.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation").into())
    }

    pub(super) async fn switch_family_installation(
        &self,
        actor: &domain::ActorContext,
        provider_code: &str,
        current: &domain::PluginInstallationRecord,
        target: &domain::PluginInstallationRecord,
        actor_user_id: Uuid,
    ) -> Result<domain::PluginTaskRecord> {
        if matches!(target.desired_state, domain::PluginDesiredState::Disabled) {
            self.enable_plugin(EnablePluginCommand {
                actor_user_id,
                installation_id: target.id,
            })
            .await?;
        }

        let task_id = Uuid::now_v7();
        let task = self
            .repository
            .create_task(&CreatePluginTaskInput {
                task_id,
                installation_id: Some(target.id),
                workspace_id: Some(actor.current_workspace_id),
                provider_code: provider_code.to_string(),
                task_kind: domain::PluginTaskKind::SwitchVersion,
                status: domain::PluginTaskStatus::Queued,
                status_message: Some("pending".into()),
                detail_json: json!({}),
                actor_user_id: Some(actor_user_id),
            })
            .await?;
        let running_task = self
            .transition_task(
                &task,
                domain::PluginTaskStatus::Running,
                Some("running".into()),
                json!({
                    "provider_code": provider_code,
                    "previous_installation_id": current.id,
                    "previous_version": current.plugin_version,
                    "target_installation_id": target.id,
                    "target_version": target.plugin_version,
                }),
            )
            .await?;

        let switch_result = async {
            let package = load_provider_package(&target.installed_path)?;
            let migrated_instances = self
                .repository
                .reassign_instances_to_installation(&ReassignModelProviderInstancesInput {
                    workspace_id: actor.current_workspace_id,
                    provider_code: provider_code.to_string(),
                    target_installation_id: target.id,
                    target_protocol: target.protocol.clone(),
                    updated_by: actor_user_id,
                })
                .await?;

            for instance in &migrated_instances {
                self.repository
                    .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                        provider_instance_id: instance.id,
                        model_discovery_mode: map_model_discovery_mode(
                            package.provider.model_discovery_mode,
                        ),
                        refresh_status: domain::ModelProviderCatalogRefreshStatus::Idle,
                        source: map_catalog_source(package.provider.model_discovery_mode),
                        models_json: json!([]),
                        last_error_message: None,
                        refreshed_at: None,
                    })
                    .await?;
            }
            self.repository
                .create_assignment(&CreatePluginAssignmentInput {
                    installation_id: target.id,
                    workspace_id: actor.current_workspace_id,
                    provider_code: provider_code.to_string(),
                    actor_user_id,
                })
                .await?;
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(actor_user_id),
                    "plugin_assignment",
                    Some(target.id),
                    "plugin.version_switched",
                    json!({
                        "provider_code": provider_code,
                        "previous_installation_id": current.id,
                        "previous_version": current.plugin_version,
                        "target_installation_id": target.id,
                        "target_version": target.plugin_version,
                    }),
                ))
                .await?;
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(actor_user_id),
                    "model_provider_instance",
                    None,
                    "provider.instances_migrated_after_plugin_switch",
                    json!({
                        "provider_code": provider_code,
                        "migrated_instance_count": migrated_instances.len(),
                    }),
                ))
                .await?;
            Ok::<usize, anyhow::Error>(migrated_instances.len())
        }
        .await;

        match switch_result {
            Ok(migrated_instance_count) => {
                self.transition_task(
                    &running_task,
                    domain::PluginTaskStatus::Succeeded,
                    Some("switched".into()),
                    json!({
                        "provider_code": provider_code,
                        "previous_installation_id": current.id,
                        "previous_version": current.plugin_version,
                        "target_installation_id": target.id,
                        "target_version": target.plugin_version,
                        "migrated_instance_count": migrated_instance_count,
                    }),
                )
                .await
            }
            Err(error) => {
                let _ = self
                    .transition_task(
                        &running_task,
                        domain::PluginTaskStatus::Failed,
                        Some(error.to_string()),
                        json!({
                            "provider_code": provider_code,
                            "previous_installation_id": current.id,
                            "target_installation_id": target.id,
                        }),
                    )
                    .await;
                Err(error)
            }
        }
    }
}
