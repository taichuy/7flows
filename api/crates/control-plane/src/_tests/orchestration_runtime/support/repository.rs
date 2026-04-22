use super::fixtures::{write_test_capability_package, write_test_provider_package};
use super::*;

#[derive(Default)]
struct InMemoryOrchestrationRuntimeState {
    compiled_plans_by_draft_id: HashMap<Uuid, domain::CompiledPlanRecord>,
    pub(super) flow_runs_by_id: HashMap<Uuid, domain::FlowRunRecord>,
    node_runs_by_id: HashMap<Uuid, domain::NodeRunRecord>,
    checkpoints_by_id: HashMap<Uuid, domain::CheckpointRecord>,
    callback_tasks_by_id: HashMap<Uuid, domain::CallbackTaskRecord>,
    events_by_flow_run_id: HashMap<Uuid, Vec<domain::RunEventRecord>>,
    installations_by_id: HashMap<Uuid, domain::PluginInstallationRecord>,
    assignments_by_workspace: HashMap<Uuid, Vec<domain::PluginAssignmentRecord>>,
    node_contributions_by_workspace: HashMap<Uuid, Vec<domain::NodeContributionRegistryEntry>>,
    instances_by_id: HashMap<Uuid, domain::ModelProviderInstanceRecord>,
    caches_by_instance_id: HashMap<Uuid, domain::ModelProviderCatalogCacheRecord>,
    secret_json_by_instance_id: HashMap<Uuid, Value>,
}

#[derive(Clone)]
pub(crate) struct InMemoryOrchestrationRuntimeRepository {
    pub(super) flow: InMemoryFlowRepository,
    inner: Arc<Mutex<InMemoryOrchestrationRuntimeState>>,
    default_provider_instance_id: Uuid,
}

impl InMemoryOrchestrationRuntimeRepository {
    pub(super) fn with_permissions(permissions: Vec<&str>) -> Self {
        let flow = InMemoryFlowRepository::with_permissions(permissions);
        let installation_id = Uuid::now_v7();
        let capability_installation_id = Uuid::now_v7();
        let provider_instance_id = Uuid::now_v7();
        let workspace_id = Uuid::nil();
        let install_path = write_test_provider_package();
        let capability_install_path = write_test_capability_package();
        let now = OffsetDateTime::now_utc();
        let installation = domain::PluginInstallationRecord {
            id: installation_id,
            provider_code: "fixture_provider".to_string(),
            plugin_id: "fixture_provider@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contract_version: "1flowbase.provider/v1".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture Provider".to_string(),
            source_kind: "uploaded".to_string(),
            trust_level: "unverified".to_string(),
            verification_status: domain::PluginVerificationStatus::Valid,
            desired_state: domain::PluginDesiredState::ActiveRequested,
            artifact_status: domain::PluginArtifactStatus::Ready,
            runtime_status: domain::PluginRuntimeStatus::Active,
            availability_status: domain::PluginAvailabilityStatus::Available,
            package_path: None,
            installed_path: install_path,
            checksum: None,
            manifest_fingerprint: None,
            signature_status: None,
            signature_algorithm: None,
            signing_key_id: None,
            last_load_error: None,
            metadata_json: json!({}),
            created_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        };
        let capability_installation = domain::PluginInstallationRecord {
            id: capability_installation_id,
            provider_code: "fixture_capability".to_string(),
            plugin_id: "fixture_capability@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contract_version: "1flowbase.capability/v1".to_string(),
            protocol: "stdio_json".to_string(),
            display_name: "Fixture Capability".to_string(),
            source_kind: "uploaded".to_string(),
            trust_level: "unverified".to_string(),
            verification_status: domain::PluginVerificationStatus::Valid,
            desired_state: domain::PluginDesiredState::ActiveRequested,
            artifact_status: domain::PluginArtifactStatus::Ready,
            runtime_status: domain::PluginRuntimeStatus::Active,
            availability_status: domain::PluginAvailabilityStatus::Available,
            package_path: None,
            installed_path: capability_install_path,
            checksum: None,
            manifest_fingerprint: None,
            signature_status: None,
            signature_algorithm: None,
            signing_key_id: None,
            last_load_error: None,
            metadata_json: json!({}),
            created_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        };
        let assignment = domain::PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id,
            workspace_id,
            provider_code: "fixture_provider".to_string(),
            assigned_by: Uuid::nil(),
            created_at: now,
        };
        let capability_assignment = domain::PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id: capability_installation_id,
            workspace_id,
            provider_code: "fixture_capability".to_string(),
            assigned_by: Uuid::nil(),
            created_at: now,
        };
        let capability_node_contribution = domain::NodeContributionRegistryEntry {
            installation_id: capability_installation_id,
            provider_code: "fixture_capability".to_string(),
            plugin_id: "fixture_capability@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contribution_code: "fixture_action".to_string(),
            node_shell: "action".to_string(),
            category: "automation".to_string(),
            title: "Fixture Action".to_string(),
            description: "Fixture capability node".to_string(),
            icon: "puzzle".to_string(),
            schema_ui: json!({}),
            schema_version: "1flowbase.node-contribution/v1".to_string(),
            output_schema: json!({}),
            required_auth: vec!["provider_instance".to_string()],
            visibility: "public".to_string(),
            experimental: false,
            dependency_installation_kind: "optional".to_string(),
            dependency_plugin_version_range: ">=0.1.0".to_string(),
            dependency_status: domain::NodeContributionDependencyStatus::Ready,
        };
        let instance = domain::ModelProviderInstanceRecord {
            id: provider_instance_id,
            workspace_id,
            installation_id,
            provider_code: "fixture_provider".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture".to_string(),
            status: domain::ModelProviderInstanceStatus::Ready,
            config_json: json!({
                "base_url": "https://api.example.com",
                "validate_model": true,
            }),
            last_validated_at: Some(now),
            last_validation_status: Some(domain::ModelProviderValidationStatus::Succeeded),
            last_validation_message: Some("validated".to_string()),
            created_by: Uuid::nil(),
            updated_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        };
        let cache = domain::ModelProviderCatalogCacheRecord {
            provider_instance_id,
            model_discovery_mode: domain::ModelProviderDiscoveryMode::Hybrid,
            refresh_status: domain::ModelProviderCatalogRefreshStatus::Ready,
            source: domain::ModelProviderCatalogSource::Hybrid,
            models_json: json!([
                {
                    "model_id": "gpt-5.4-mini",
                    "display_name": "GPT-5.4 Mini",
                    "source": "dynamic",
                    "supports_streaming": true,
                    "supports_tool_call": true,
                    "supports_multimodal": false,
                    "context_window": 128000,
                    "max_output_tokens": 4096,
                    "provider_metadata": {}
                }
            ]),
            last_error_message: None,
            refreshed_at: Some(now),
            updated_at: now,
        };

        Self {
            flow,
            inner: Arc::new(Mutex::new(InMemoryOrchestrationRuntimeState {
                installations_by_id: HashMap::from([
                    (installation_id, installation),
                    (capability_installation_id, capability_installation),
                ]),
                assignments_by_workspace: HashMap::from([(
                    workspace_id,
                    vec![assignment, capability_assignment],
                )]),
                node_contributions_by_workspace: HashMap::from([(
                    workspace_id,
                    vec![capability_node_contribution],
                )]),
                instances_by_id: HashMap::from([(provider_instance_id, instance)]),
                caches_by_instance_id: HashMap::from([(provider_instance_id, cache)]),
                secret_json_by_instance_id: HashMap::from([(
                    provider_instance_id,
                    json!({ "api_key": "test-secret" }),
                )]),
                ..InMemoryOrchestrationRuntimeState::default()
            })),
            default_provider_instance_id: provider_instance_id,
        }
    }

    pub(super) async fn seed_application_for_actor(
        &self,
        actor_user_id: Uuid,
        name: &str,
    ) -> Result<domain::ApplicationRecord> {
        self.flow
            .seed_application_for_actor(actor_user_id, name)
            .await
    }

    pub(super) fn default_provider_instance_id(&self) -> Uuid {
        self.default_provider_instance_id
    }

    pub(super) fn force_flow_run_status(&self, flow_run_id: Uuid, status: domain::FlowRunStatus) {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let flow_run = inner
            .flow_runs_by_id
            .get_mut(&flow_run_id)
            .expect("flow run should exist for test");
        flow_run.status = status;
    }
}

#[async_trait]
impl ApplicationRepository for InMemoryOrchestrationRuntimeRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        ApplicationRepository::load_actor_context_for_user(&self.flow, actor_user_id).await
    }

    async fn list_applications(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationRecord>> {
        ApplicationRepository::list_applications(
            &self.flow,
            workspace_id,
            actor_user_id,
            visibility,
        )
        .await
    }

    async fn create_application(
        &self,
        input: &CreateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        ApplicationRepository::create_application(&self.flow, input).await
    }

    async fn update_application(
        &self,
        input: &UpdateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        ApplicationRepository::update_application(&self.flow, input).await
    }

    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> Result<Option<domain::ApplicationRecord>> {
        ApplicationRepository::get_application(&self.flow, workspace_id, application_id).await
    }

    async fn list_application_tags(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationTagCatalogEntry>> {
        ApplicationRepository::list_application_tags(
            &self.flow,
            workspace_id,
            actor_user_id,
            visibility,
        )
        .await
    }

    async fn create_application_tag(
        &self,
        input: &CreateApplicationTagInput,
    ) -> Result<domain::ApplicationTagCatalogEntry> {
        ApplicationRepository::create_application_tag(&self.flow, input).await
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        ApplicationRepository::append_audit_log(&self.flow, event).await
    }
}

#[async_trait]
impl FlowRepository for InMemoryOrchestrationRuntimeRepository {
    async fn get_or_create_editor_state(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::get_or_create_editor_state(
            &self.flow,
            workspace_id,
            application_id,
            actor_user_id,
        )
        .await
    }

    async fn save_draft(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        document: serde_json::Value,
        change_kind: domain::FlowChangeKind,
        summary: &str,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::save_draft(
            &self.flow,
            workspace_id,
            application_id,
            actor_user_id,
            document,
            change_kind,
            summary,
        )
        .await
    }

    async fn restore_version(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        version_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::restore_version(
            &self.flow,
            workspace_id,
            application_id,
            actor_user_id,
            version_id,
        )
        .await
    }
}

#[async_trait]
impl PluginRepository for InMemoryOrchestrationRuntimeRepository {
    async fn upsert_installation(
        &self,
        _input: &crate::ports::UpsertPluginInstallationInput,
    ) -> Result<domain::PluginInstallationRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_installation(
        &self,
        installation_id: Uuid,
    ) -> Result<Option<domain::PluginInstallationRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner.installations_by_id.get(&installation_id).cloned())
    }

    async fn list_installations(&self) -> Result<Vec<domain::PluginInstallationRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner.installations_by_id.values().cloned().collect())
    }

    async fn delete_installation(&self, installation_id: Uuid) -> Result<()> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        if inner.installations_by_id.remove(&installation_id).is_some() {
            Ok(())
        } else {
            Err(ControlPlaneError::NotFound("plugin_installation").into())
        }
    }

    async fn list_pending_restart_host_extensions(
        &self,
    ) -> Result<Vec<domain::PluginInstallationRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .installations_by_id
            .values()
            .filter(|installation| {
                matches!(
                    installation.desired_state,
                    domain::PluginDesiredState::PendingRestart
                )
            })
            .cloned()
            .collect())
    }

    async fn update_desired_state(
        &self,
        input: &crate::ports::UpdatePluginDesiredStateInput,
    ) -> Result<domain::PluginInstallationRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let installation = inner
            .installations_by_id
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.desired_state = input.desired_state;
        installation.availability_status = input.availability_status;
        Ok(installation.clone())
    }

    async fn update_artifact_snapshot(
        &self,
        input: &crate::ports::UpdatePluginArtifactSnapshotInput,
    ) -> Result<domain::PluginInstallationRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let installation = inner
            .installations_by_id
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.artifact_status = input.artifact_status;
        installation.availability_status = input.availability_status;
        installation.package_path = input.package_path.clone();
        installation.installed_path = input.installed_path.clone();
        installation.checksum = input.checksum.clone();
        installation.manifest_fingerprint = input.manifest_fingerprint.clone();
        Ok(installation.clone())
    }

    async fn update_runtime_snapshot(
        &self,
        input: &crate::ports::UpdatePluginRuntimeSnapshotInput,
    ) -> Result<domain::PluginInstallationRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let installation = inner
            .installations_by_id
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.runtime_status = input.runtime_status;
        installation.availability_status = input.availability_status;
        installation.last_load_error = input.last_load_error.clone();
        Ok(installation.clone())
    }

    async fn create_assignment(
        &self,
        _input: &crate::ports::CreatePluginAssignmentInput,
    ) -> Result<domain::PluginAssignmentRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn list_assignments(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::PluginAssignmentRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .assignments_by_workspace
            .get(&workspace_id)
            .cloned()
            .unwrap_or_default())
    }

    async fn create_task(
        &self,
        _input: &crate::ports::CreatePluginTaskInput,
    ) -> Result<domain::PluginTaskRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn update_task_status(
        &self,
        _input: &crate::ports::UpdatePluginTaskStatusInput,
    ) -> Result<domain::PluginTaskRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_task(&self, _task_id: Uuid) -> Result<Option<domain::PluginTaskRecord>> {
        Ok(None)
    }

    async fn list_tasks(&self) -> Result<Vec<domain::PluginTaskRecord>> {
        Ok(Vec::new())
    }
}

#[async_trait]
impl NodeContributionRepository for InMemoryOrchestrationRuntimeRepository {
    async fn replace_installation_node_contributions(
        &self,
        _input: &crate::ports::ReplaceInstallationNodeContributionsInput,
    ) -> Result<()> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn list_node_contributions(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::NodeContributionRegistryEntry>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .node_contributions_by_workspace
            .get(&workspace_id)
            .cloned()
            .unwrap_or_default())
    }
}

#[async_trait]
impl ModelProviderRepository for InMemoryOrchestrationRuntimeRepository {
    async fn create_instance(
        &self,
        _input: &crate::ports::CreateModelProviderInstanceInput,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn update_instance(
        &self,
        _input: &crate::ports::UpdateModelProviderInstanceInput,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderInstanceRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .instances_by_id
            .get(&instance_id)
            .filter(|record| record.workspace_id == workspace_id)
            .cloned())
    }

    async fn list_instances(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelProviderInstanceRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .instances_by_id
            .values()
            .filter(|record| record.workspace_id == workspace_id)
            .cloned()
            .collect())
    }

    async fn list_instances_by_provider_code(
        &self,
        provider_code: &str,
    ) -> Result<Vec<domain::ModelProviderInstanceRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .instances_by_id
            .values()
            .filter(|record| record.provider_code == provider_code)
            .cloned()
            .collect())
    }

    async fn reassign_instances_to_installation(
        &self,
        _input: &crate::ports::ReassignModelProviderInstancesInput,
    ) -> Result<Vec<domain::ModelProviderInstanceRecord>> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn upsert_catalog_cache(
        &self,
        _input: &crate::ports::UpsertModelProviderCatalogCacheInput,
    ) -> Result<domain::ModelProviderCatalogCacheRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_catalog_cache(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderCatalogCacheRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .caches_by_instance_id
            .get(&provider_instance_id)
            .cloned())
    }

    async fn upsert_secret(
        &self,
        _input: &crate::ports::UpsertModelProviderSecretInput,
    ) -> Result<domain::ModelProviderSecretRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_secret_json(
        &self,
        provider_instance_id: Uuid,
        _master_key: &str,
    ) -> Result<Option<Value>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .secret_json_by_instance_id
            .get(&provider_instance_id)
            .cloned())
    }

    async fn get_secret_record(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderSecretRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .secret_json_by_instance_id
            .get(&provider_instance_id)
            .map(|secret| domain::ModelProviderSecretRecord {
                provider_instance_id,
                encrypted_secret_json: secret.clone(),
                secret_version: 1,
                updated_at: OffsetDateTime::now_utc(),
            }))
    }

    async fn delete_instance(&self, _workspace_id: Uuid, _instance_id: Uuid) -> Result<()> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn count_instance_references(
        &self,
        _workspace_id: Uuid,
        _instance_id: Uuid,
    ) -> Result<u64> {
        Ok(0)
    }
}

#[derive(Clone, Default)]
pub(crate) struct InMemoryProviderRuntime;

#[async_trait]
impl ProviderRuntimePort for InMemoryProviderRuntime {
    async fn ensure_loaded(&self, _installation: &domain::PluginInstallationRecord) -> Result<()> {
        Ok(())
    }

    async fn validate_provider(
        &self,
        _installation: &domain::PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Value> {
        Ok(json!({ "ok": true }))
    }

    async fn list_models(
        &self,
        _installation: &domain::PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Vec<plugin_framework::provider_contract::ProviderModelDescriptor>> {
        Ok(vec![])
    }

    async fn invoke_stream(
        &self,
        _installation: &domain::PluginInstallationRecord,
        input: ProviderInvocationInput,
    ) -> Result<crate::ports::ProviderRuntimeInvocationOutput> {
        let prompt = input
            .messages
            .first()
            .map(|message| message.content.clone())
            .unwrap_or_default();
        Ok(crate::ports::ProviderRuntimeInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: format!("echo:{}:{}", input.model, prompt),
                },
                ProviderStreamEvent::UsageSnapshot {
                    usage: plugin_framework::provider_contract::ProviderUsage {
                        input_tokens: Some(5),
                        output_tokens: Some(7),
                        total_tokens: Some(12),
                        ..plugin_framework::provider_contract::ProviderUsage::default()
                    },
                },
                ProviderStreamEvent::Finish {
                    reason: plugin_framework::provider_contract::ProviderFinishReason::Stop,
                },
            ],
            result: plugin_framework::provider_contract::ProviderInvocationResult {
                final_content: Some(format!("echo:{}:{}", input.model, prompt)),
                usage: plugin_framework::provider_contract::ProviderUsage {
                    input_tokens: Some(5),
                    output_tokens: Some(7),
                    total_tokens: Some(12),
                    ..plugin_framework::provider_contract::ProviderUsage::default()
                },
                finish_reason: Some(
                    plugin_framework::provider_contract::ProviderFinishReason::Stop,
                ),
                ..plugin_framework::provider_contract::ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityPluginRuntimePort for InMemoryProviderRuntime {
    async fn validate_config(&self, input: ValidateCapabilityConfigInput) -> Result<Value> {
        Ok(json!({
            "installation_id": input.installation.id,
            "plugin_id": input.installation.plugin_id,
            "contribution_code": input.contribution_code,
            "config_payload": input.config_payload,
        }))
    }

    async fn resolve_dynamic_options(&self, input: ResolveCapabilityOptionsInput) -> Result<Value> {
        Ok(json!({
            "installation_id": input.installation.id,
            "plugin_id": input.installation.plugin_id,
            "contribution_code": input.contribution_code,
            "config_payload": input.config_payload,
        }))
    }

    async fn resolve_output_schema(
        &self,
        input: ResolveCapabilityOutputSchemaInput,
    ) -> Result<Value> {
        Ok(json!({
            "installation_id": input.installation.id,
            "plugin_id": input.installation.plugin_id,
            "contribution_code": input.contribution_code,
            "config_payload": input.config_payload,
        }))
    }

    async fn execute_node(
        &self,
        input: ExecuteCapabilityNodeInput,
    ) -> Result<CapabilityExecutionOutput> {
        let answer = input
            .input_payload
            .get("query")
            .cloned()
            .unwrap_or(Value::Null);
        Ok(CapabilityExecutionOutput {
            output_payload: json!({
                "answer": answer,
                "plugin_id": input.installation.plugin_id,
                "installation_id": input.installation.id,
                "contribution_code": input.contribution_code,
            }),
        })
    }
}

#[async_trait]
impl OrchestrationRuntimeRepository for InMemoryOrchestrationRuntimeRepository {
    async fn upsert_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> Result<domain::CompiledPlanRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let now = OffsetDateTime::now_utc();
        let record = inner
            .compiled_plans_by_draft_id
            .entry(input.flow_draft_id)
            .and_modify(|record| {
                record.flow_id = input.flow_id;
                record.schema_version = input.schema_version.clone();
                record.document_updated_at = input.document_updated_at;
                record.plan = input.plan.clone();
                record.created_by = input.actor_user_id;
                record.updated_at = now;
            })
            .or_insert_with(|| domain::CompiledPlanRecord {
                id: Uuid::now_v7(),
                flow_id: input.flow_id,
                draft_id: input.flow_draft_id,
                schema_version: input.schema_version.clone(),
                document_updated_at: input.document_updated_at,
                plan: input.plan.clone(),
                created_by: input.actor_user_id,
                created_at: now,
                updated_at: now,
            })
            .clone();

        Ok(record)
    }

    async fn get_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> Result<Option<domain::CompiledPlanRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .compiled_plans_by_draft_id
            .values()
            .find(|record| record.id == compiled_plan_id)
            .cloned())
    }

    async fn create_flow_run(&self, input: &CreateFlowRunInput) -> Result<domain::FlowRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::FlowRunRecord {
            id: Uuid::now_v7(),
            application_id: input.application_id,
            flow_id: input.flow_id,
            draft_id: input.flow_draft_id,
            compiled_plan_id: input.compiled_plan_id,
            run_mode: input.run_mode,
            target_node_id: input.target_node_id.clone(),
            status: input.status,
            input_payload: input.input_payload.clone(),
            output_payload: json!({}),
            error_payload: None,
            created_by: input.actor_user_id,
            started_at: input.started_at,
            finished_at: None,
            created_at: input.started_at,
        };
        inner.flow_runs_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn get_flow_run(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::FlowRunRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .flow_runs_by_id
            .get(&flow_run_id)
            .filter(|record| record.application_id == application_id)
            .cloned())
    }

    async fn create_node_run(&self, input: &CreateNodeRunInput) -> Result<domain::NodeRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::NodeRunRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_id: input.node_id.clone(),
            node_type: input.node_type.clone(),
            node_alias: input.node_alias.clone(),
            status: input.status,
            input_payload: input.input_payload.clone(),
            output_payload: json!({}),
            error_payload: None,
            metrics_payload: json!({}),
            started_at: input.started_at,
            finished_at: None,
        };
        inner.node_runs_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn update_node_run(&self, input: &UpdateNodeRunInput) -> Result<domain::NodeRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.node_runs_by_id.get_mut(&input.node_run_id) else {
            return Err(ControlPlaneError::NotFound("node_run").into());
        };
        record.status = input.status;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.metrics_payload = input.metrics_payload.clone();
        record.finished_at = input.finished_at;
        Ok(record.clone())
    }

    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> Result<domain::NodeRunRecord> {
        self.update_node_run(&UpdateNodeRunInput {
            node_run_id: input.node_run_id,
            status: input.status,
            output_payload: input.output_payload.clone(),
            error_payload: input.error_payload.clone(),
            metrics_payload: input.metrics_payload.clone(),
            finished_at: Some(input.finished_at),
        })
        .await
    }

    async fn update_flow_run(&self, input: &UpdateFlowRunInput) -> Result<domain::FlowRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.flow_runs_by_id.get_mut(&input.flow_run_id) else {
            return Err(ControlPlaneError::NotFound("flow_run").into());
        };
        record.status = input.status;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.finished_at = input.finished_at;
        Ok(record.clone())
    }

    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> Result<domain::FlowRunRecord> {
        self.update_flow_run(&UpdateFlowRunInput {
            flow_run_id: input.flow_run_id,
            status: input.status,
            output_payload: input.output_payload.clone(),
            error_payload: input.error_payload.clone(),
            finished_at: Some(input.finished_at),
        })
        .await
    }

    async fn get_checkpoint(
        &self,
        flow_run_id: Uuid,
        checkpoint_id: Uuid,
    ) -> Result<Option<domain::CheckpointRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .checkpoints_by_id
            .get(&checkpoint_id)
            .filter(|record| record.flow_run_id == flow_run_id)
            .cloned())
    }

    async fn create_checkpoint(
        &self,
        input: &CreateCheckpointInput,
    ) -> Result<domain::CheckpointRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::CheckpointRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            status: input.status.clone(),
            reason: input.reason.clone(),
            locator_payload: input.locator_payload.clone(),
            variable_snapshot: input.variable_snapshot.clone(),
            external_ref_payload: input.external_ref_payload.clone(),
            created_at: OffsetDateTime::now_utc(),
        };
        inner.checkpoints_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn create_callback_task(
        &self,
        input: &CreateCallbackTaskInput,
    ) -> Result<domain::CallbackTaskRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::CallbackTaskRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            callback_kind: input.callback_kind.clone(),
            status: domain::CallbackTaskStatus::Pending,
            request_payload: input.request_payload.clone(),
            response_payload: None,
            external_ref_payload: input.external_ref_payload.clone(),
            created_at: OffsetDateTime::now_utc(),
            completed_at: None,
        };
        inner.callback_tasks_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn complete_callback_task(
        &self,
        input: &CompleteCallbackTaskInput,
    ) -> Result<domain::CallbackTaskRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.callback_tasks_by_id.get_mut(&input.callback_task_id) else {
            return Err(ControlPlaneError::NotFound("callback_task").into());
        };
        record.status = domain::CallbackTaskStatus::Completed;
        record.response_payload = Some(input.response_payload.clone());
        record.completed_at = Some(input.completed_at);
        Ok(record.clone())
    }

    async fn append_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> Result<domain::RunEventRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let events = inner
            .events_by_flow_run_id
            .entry(input.flow_run_id)
            .or_default();
        let event = domain::RunEventRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            sequence: (events.len() + 1) as i64,
            event_type: input.event_type.clone(),
            payload: input.payload.clone(),
            created_at: OffsetDateTime::now_utc(),
        };
        events.push(event.clone());
        Ok(event)
    }

    async fn list_application_runs(
        &self,
        application_id: Uuid,
    ) -> Result<Vec<domain::ApplicationRunSummary>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let mut runs = inner
            .flow_runs_by_id
            .values()
            .filter(|record| record.application_id == application_id)
            .map(|record| domain::ApplicationRunSummary {
                id: record.id,
                run_mode: record.run_mode,
                status: record.status,
                target_node_id: record.target_node_id.clone(),
                started_at: record.started_at,
                finished_at: record.finished_at,
            })
            .collect::<Vec<_>>();
        runs.sort_by(|left, right| {
            right
                .started_at
                .cmp(&left.started_at)
                .then_with(|| right.id.cmp(&left.id))
        });
        Ok(runs)
    }

    async fn get_application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::ApplicationRunDetail>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(flow_run) = inner.flow_runs_by_id.get(&flow_run_id).cloned() else {
            return Ok(None);
        };
        if flow_run.application_id != application_id {
            return Ok(None);
        }

        let mut node_runs = inner
            .node_runs_by_id
            .values()
            .filter(|record| record.flow_run_id == flow_run.id)
            .cloned()
            .collect::<Vec<_>>();
        node_runs.sort_by(|left, right| {
            left.started_at
                .cmp(&right.started_at)
                .then_with(|| left.id.cmp(&right.id))
        });

        Ok(Some(domain::ApplicationRunDetail {
            flow_run,
            node_runs,
            checkpoints: {
                let mut checkpoints = inner
                    .checkpoints_by_id
                    .values()
                    .filter(|record| record.flow_run_id == flow_run_id)
                    .cloned()
                    .collect::<Vec<_>>();
                checkpoints.sort_by(|left, right| {
                    left.created_at
                        .cmp(&right.created_at)
                        .then_with(|| left.id.cmp(&right.id))
                });
                checkpoints
            },
            callback_tasks: {
                let mut callback_tasks = inner
                    .callback_tasks_by_id
                    .values()
                    .filter(|record| record.flow_run_id == flow_run_id)
                    .cloned()
                    .collect::<Vec<_>>();
                callback_tasks.sort_by(|left, right| {
                    left.created_at
                        .cmp(&right.created_at)
                        .then_with(|| left.id.cmp(&right.id))
                });
                callback_tasks
            },
            events: inner
                .events_by_flow_run_id
                .get(&flow_run_id)
                .cloned()
                .unwrap_or_default(),
        }))
    }

    async fn get_latest_node_run(
        &self,
        application_id: Uuid,
        node_id: &str,
    ) -> Result<Option<domain::NodeLastRun>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let mut candidates = inner
            .node_runs_by_id
            .values()
            .filter_map(|node_run| {
                inner
                    .flow_runs_by_id
                    .get(&node_run.flow_run_id)
                    .filter(|flow_run| {
                        flow_run.application_id == application_id && node_run.node_id == node_id
                    })
                    .map(|flow_run| (flow_run.clone(), node_run.clone()))
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|left, right| {
            right
                .1
                .started_at
                .cmp(&left.1.started_at)
                .then_with(|| right.1.id.cmp(&left.1.id))
        });
        let Some((flow_run, node_run)) = candidates.into_iter().next() else {
            return Ok(None);
        };

        let events = inner
            .events_by_flow_run_id
            .get(&flow_run.id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|event| event.node_run_id.is_none() || event.node_run_id == Some(node_run.id))
            .collect();

        Ok(Some(domain::NodeLastRun {
            flow_run,
            node_run,
            checkpoints: Vec::new(),
            events,
        }))
    }
}
