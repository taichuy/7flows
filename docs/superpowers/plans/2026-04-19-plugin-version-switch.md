# Plugin Version Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the global plugin version pointer contract, then wire `/settings/model-providers` as the first consumer surface for latest upgrade and local-version rollback.

**Architecture:** Keep version decision and write-path ownership inside `plugin_management`: `plugin_assignments` becomes the single `workspace + provider_code -> installation_id` pointer, plugin family read/write APIs live under `/api/console/plugins/families/*`, and switch actions call explicit model-provider migration primitives to move every instance to the target installation and invalidate cached model catalogs. The settings page stops rendering installation rows directly and instead merges `plugin families + official catalog + provider instances` into a provider-family view with a dedicated version management modal.

**Tech Stack:** Rust (`control-plane`, `storage-pg`, `api-server`), PostgreSQL migrations with `sqlx`, TypeScript React (`TanStack Query`, `Ant Design`), Vitest, targeted `cargo test` and `pnpm test`

---

## File Structure

**Create**
- `api/crates/storage-pg/migrations/20260419143000_add_plugin_version_pointer.sql`
- `web/app/src/features/settings/components/model-providers/PluginVersionManagementModal.tsx`
- `docs/superpowers/plans/2026-04-19-plugin-version-switch.md`

**Modify**
- `api/crates/domain/src/model_provider.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/plugin_management.rs`
- `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- `api/crates/storage-pg/src/mappers/plugin_mapper.rs`
- `api/crates/storage-pg/src/plugin_repository.rs`
- `api/crates/storage-pg/src/model_provider_repository.rs`
- `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`
- `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
- `api/apps/api-server/src/routes/plugins.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/_tests/plugin_routes.rs`
- `web/packages/api-client/src/console-plugins.ts`
- `web/app/src/features/settings/api/plugins.ts`
- `web/app/src/features/settings/pages/SettingsPage.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx`
- `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`
- `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

**Notes**
- Do not add the generic plugin management page in this round.
- Do not add official historical-version download in this round.
- Do not touch `1flowbase-official-plugins/*` in this repo; this plan only changes the host app.
- During execution, update this plan file after every completed task so the user can track progress in `docs/superpowers/plans`.

### Task 1: Convert Assignment Storage Into A Provider Pointer

**Files:**
- Create: `api/crates/storage-pg/migrations/20260419143000_add_plugin_version_pointer.sql`
- Modify: `api/crates/domain/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/storage-pg/src/mappers/plugin_mapper.rs`
- Modify: `api/crates/storage-pg/src/plugin_repository.rs`
- Test: `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`

- [x] **Step 1: Write the failing repository test for one pointer per `workspace + provider_code`**

Add this test to `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`:

```rust
#[tokio::test]
async fn plugin_repository_repoints_assignment_by_workspace_and_provider_code() {
    let (store, workspace, actor) = seed_store().await;
    let installation_v1 = PluginRepository::upsert_installation(
        &store,
        &UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: "fixture_provider".into(),
            plugin_id: "fixture_provider@0.1.0".into(),
            plugin_version: "0.1.0".into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "official_registry".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled: true,
            install_path: "/tmp/plugin-installed/fixture_provider/0.1.0".into(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();
    let installation_v2 = PluginRepository::upsert_installation(
        &store,
        &UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: "fixture_provider".into(),
            plugin_id: "fixture_provider@0.2.0".into(),
            plugin_version: "0.2.0".into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "official_registry".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled: true,
            install_path: "/tmp/plugin-installed/fixture_provider/0.2.0".into(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    PluginRepository::create_assignment(
        &store,
        &CreatePluginAssignmentInput {
            installation_id: installation_v1.id,
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();
    PluginRepository::create_assignment(
        &store,
        &CreatePluginAssignmentInput {
            installation_id: installation_v2.id,
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    let assignments = PluginRepository::list_assignments(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(assignments.len(), 1);
    assert_eq!(assignments[0].provider_code, "fixture_provider");
    assert_eq!(assignments[0].installation_id, installation_v2.id);
}
```

- [x] **Step 2: Run the repository test to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_repository_repoints_assignment_by_workspace_and_provider_code -- --exact
```

Expected: FAIL because `CreatePluginAssignmentInput` and `PluginAssignmentRecord` do not carry `provider_code`, and the current unique key still allows multiple assigned versions for one provider in one workspace.

Execution note (`2026-04-19`): the first RED run used the plan command verbatim and surfaced the expected compile-time contract failures; when re-running with `--exact`, the actual green-path verification needed the full unit-test name `_tests::plugin_repository_tests::plugin_repository_repoints_assignment_by_workspace_and_provider_code`.

- [x] **Step 3: Add the migration that backfills `provider_code` and tightens uniqueness**

Create `api/crates/storage-pg/migrations/20260419143000_add_plugin_version_pointer.sql` with:

```sql
alter table plugin_assignments
    add column provider_code text;

update plugin_assignments pa
set provider_code = pi.provider_code
from plugin_installations pi
where pi.id = pa.installation_id;

with ranked as (
    select
        pa.id,
        row_number() over (
            partition by pa.workspace_id, pa.provider_code
            order by pa.created_at desc, pa.id desc
        ) as rn
    from plugin_assignments pa
)
delete from plugin_assignments pa
using ranked
where ranked.id = pa.id
  and ranked.rn > 1;

alter table plugin_assignments
    alter column provider_code set not null;

alter table plugin_assignments
    drop constraint plugin_assignments_installation_id_workspace_id_key;

alter table plugin_assignments
    add constraint plugin_assignments_workspace_provider_code_key
        unique (workspace_id, provider_code);

drop index if exists plugin_assignments_workspace_idx;
create index plugin_assignments_workspace_provider_idx
    on plugin_assignments (workspace_id, provider_code, created_at desc, id desc);

alter table plugin_tasks
    drop constraint plugin_tasks_task_kind_check;

alter table plugin_tasks
    add constraint plugin_tasks_task_kind_check check (
        task_kind in (
            'install',
            'upgrade',
            'uninstall',
            'enable',
            'disable',
            'assign',
            'unassign',
            'switch_version'
        )
    );
```

- [x] **Step 4: Update the domain and repository contracts to match the new pointer semantics**

Apply these changes:

```rust
pub enum PluginTaskKind {
    Install,
    Upgrade,
    Uninstall,
    Enable,
    Disable,
    Assign,
    Unassign,
    SwitchVersion,
}

pub struct PluginAssignmentRecord {
    pub id: Uuid,
    pub installation_id: Uuid,
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub assigned_by: Uuid,
    pub created_at: OffsetDateTime,
}

pub struct CreatePluginAssignmentInput {
    pub installation_id: Uuid,
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub actor_user_id: Uuid,
}
```

And update the SQL in `api/crates/storage-pg/src/plugin_repository.rs` to:

```rust
let row = sqlx::query(
    r#"
    insert into plugin_assignments (
        id,
        installation_id,
        workspace_id,
        provider_code,
        assigned_by
    ) values ($1, $2, $3, $4, $5)
    on conflict (workspace_id, provider_code) do update
    set
        installation_id = excluded.installation_id,
        assigned_by = excluded.assigned_by
    returning id, installation_id, workspace_id, provider_code, assigned_by, created_at
    "#,
)
.bind(Uuid::now_v7())
.bind(input.installation_id)
.bind(input.workspace_id)
.bind(&input.provider_code)
.bind(input.actor_user_id);
```

- [x] **Step 5: Re-run the storage tests**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_repository_ -- --nocapture
```

Expected: PASS for both the existing persistence test and the new repointing test.

- [x] **Step 6: Commit the pointer-storage change set**

Run:

```bash
git add api/crates/domain/src/model_provider.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/storage-pg/migrations/20260419143000_add_plugin_version_pointer.sql \
  api/crates/storage-pg/src/mappers/plugin_mapper.rs \
  api/crates/storage-pg/src/plugin_repository.rs \
  api/crates/storage-pg/src/_tests/plugin_repository_tests.rs \
  docs/superpowers/plans/2026-04-19-plugin-version-switch.md
git commit -m "feat: add plugin version pointer storage"
```

Expected: one focused commit that only changes pointer storage and task-kind vocabulary.

### Task 2: Add Plugin Family Read Models And Version-Switch Commands

**Files:**
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Test: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`

- [ ] **Step 1: Write the failing control-plane tests for family listing and switch semantics**

Add tests like these to `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`:

```rust
async fn seed_test_installation(
    repository: &MemoryPluginManagementRepository,
    install_root: &Path,
    provider_code: &str,
    plugin_version: &str,
    enabled: bool,
) -> Uuid {
    let package_root = install_root.join(format!("{provider_code}-{plugin_version}"));
    create_provider_fixture(&package_root);
    std::fs::write(
        package_root.join("manifest.yaml"),
        format!(
            "plugin_code: {provider_code}\ndisplay_name: Fixture Provider\nversion: {plugin_version}\ncontract_version: 1flowbase.provider/v1\nsupported_model_types:\n  - llm\nrunner:\n  language: nodejs\n  entrypoint: provider/fixture_provider.js\n"
        ),
    )
    .unwrap();

    repository
        .upsert_installation(&UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: provider_code.into(),
            plugin_id: format!("{provider_code}@{plugin_version}"),
            plugin_version: plugin_version.into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "official_registry".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled,
            install_path: package_root.display().to_string(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap()
        .id
}

#[tokio::test]
async fn plugin_management_service_lists_provider_families_with_current_and_latest_versions() {
    #[derive(Clone)]
    struct OutdatedOfficialSource;

    #[async_trait]
    impl OfficialPluginSourcePort for OutdatedOfficialSource {
        async fn list_official_catalog(&self) -> Result<Vec<OfficialPluginSourceEntry>> {
            Ok(vec![OfficialPluginSourceEntry {
                plugin_id: "1flowbase.openai_compatible".into(),
                provider_code: "openai_compatible".into(),
                display_name: "OpenAI Compatible".into(),
                protocol: "openai_compatible".into(),
                latest_version: "0.2.0".into(),
                release_tag: "openai_compatible-v0.2.0".into(),
                download_url: "https://example.com/openai-compatible.1flowbasepkg".into(),
                checksum: "sha256:abc123".into(),
                signature_status: "unsigned".into(),
                help_url: Some("https://example.com/help".into()),
                model_discovery_mode: "hybrid".into(),
            }])
        }

        async fn download_plugin(
            &self,
            _entry: &OfficialPluginSourceEntry,
        ) -> Result<DownloadedOfficialPluginPackage> {
            unreachable!("download is not used in this read-only test");
        }
    }

    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(workspace_id, &[
        "plugin_config.view.all",
        "plugin_config.configure.all",
    ]));
    let install_root = std::env::temp_dir().join(format!("plugin-family-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(OutdatedOfficialSource),
        &install_root,
    );

    let installation_v1 =
        seed_test_installation(&repository, &install_root, "openai_compatible", "0.1.0", true)
            .await;
    let _installation_v2 =
        seed_test_installation(&repository, &install_root, "openai_compatible", "0.2.0", true)
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

    let families = service.list_families(repository.actor.user_id).await.unwrap();
    assert_eq!(families.len(), 1);
    assert_eq!(families[0].provider_code, "openai_compatible");
    assert_eq!(families[0].current_version, "0.1.0");
    assert_eq!(families[0].latest_version.as_deref(), Some("0.2.0"));
    assert!(families[0].has_update);
}

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
        Arc::new(MemoryOfficialPluginSource),
        &install_root,
    );

    let current_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.1.0", true)
            .await;
    let target_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.2.0", true)
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
    assert_eq!(task.status, PluginTaskStatus::Success);
}
```

- [ ] **Step 2: Run the control-plane tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_ -- --nocapture
```

Expected: FAIL because `PluginManagementService` does not expose `list_families`, `upgrade_latest`, or `switch_version`.

- [ ] **Step 3: Implement plugin family read models and the new switch commands**

Add these read models and commands in `api/crates/control-plane/src/plugin_management.rs`:

```rust
#[derive(Debug, Clone)]
pub struct PluginInstalledVersionView {
    pub installation_id: Uuid,
    pub plugin_version: String,
    pub source_kind: String,
    pub created_at: OffsetDateTime,
    pub is_current: bool,
}

#[derive(Debug, Clone)]
pub struct PluginFamilyView {
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub current_installation_id: Uuid,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub installed_versions: Vec<PluginInstalledVersionView>,
}

pub struct UpgradeLatestPluginFamilyCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
}

pub struct SwitchPluginVersionCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
    pub target_installation_id: Uuid,
}
```

Drive both write APIs through a shared helper:

```rust
async fn switch_family_installation(
    &self,
    actor: &domain::ActorContext,
    provider_code: &str,
    current: &domain::PluginInstallationRecord,
    target: &domain::PluginInstallationRecord,
    actor_user_id: Uuid,
) -> Result<domain::PluginTaskRecord> {
    if !target.enabled {
        self.enable_plugin(EnablePluginCommand {
            actor_user_id,
            installation_id: target.id,
        })
        .await?;
    }

    let task_id = Uuid::now_v7();
    self.repository
        .create_task(&CreatePluginTaskInput {
            task_id,
            installation_id: Some(target.id),
            workspace_id: Some(actor.current_workspace_id),
            provider_code: provider_code.to_string(),
            task_kind: domain::PluginTaskKind::SwitchVersion,
            status: domain::PluginTaskStatus::Pending,
            status_message: Some("pending".into()),
            detail_json: json!({}),
            actor_user_id: Some(actor_user_id),
        })
        .await?;
    self.repository
        .update_task_status(&UpdatePluginTaskStatusInput {
            task_id,
            status: domain::PluginTaskStatus::Running,
            status_message: Some("running".into()),
            detail_json: json!({
                "provider_code": provider_code,
                "previous_installation_id": current.id,
                "previous_version": current.plugin_version,
                "target_installation_id": target.id,
                "target_version": target.plugin_version,
            }),
        })
        .await?;
    self.repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: target.id,
            workspace_id: actor.current_workspace_id,
            provider_code: provider_code.to_string(),
            actor_user_id,
        })
        .await?;
    self.repository
        .update_task_status(&UpdatePluginTaskStatusInput {
            task_id,
            status: domain::PluginTaskStatus::Success,
            status_message: Some("switched".into()),
            detail_json: json!({
                "provider_code": provider_code,
                "previous_installation_id": current.id,
                "previous_version": current.plugin_version,
                "target_installation_id": target.id,
                "target_version": target.plugin_version,
                "migrated_instance_count": 0,
            }),
        })
        .await
}
```

Use `official_source.list_official_catalog()` to set `latest_version` and `has_update`, and skip download when the target `latest` installation already exists locally.

- [ ] **Step 4: Re-run the control-plane tests**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_ -- --nocapture
```

Expected: PASS for family listing, local switch, and latest-upgrade tests that do not require instance migration yet.

- [ ] **Step 5: Commit the plugin family control-plane changes**

Run:

```bash
git add api/crates/control-plane/src/plugin_management.rs \
  api/crates/control-plane/src/_tests/plugin_management_service_tests.rs \
  docs/superpowers/plans/2026-04-19-plugin-version-switch.md
git commit -m "feat: add plugin family version commands"
```

Expected: one commit that introduces plugin families and the `switch_version` action surface.

### Task 3: Migrate Provider Instances And Invalidate Catalog Caches After Switch

**Files:**
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Modify: `api/crates/storage-pg/src/model_provider_repository.rs`
- Test: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Test: `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`

- [ ] **Step 1: Write the failing tests for batch instance migration and cache reset**

Add a storage-level test in `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`:

```rust
#[tokio::test]
async fn model_provider_repository_reassigns_all_instances_for_a_provider() {
    let (store, workspace, actor, installation_v1) = seed_store().await;
    let installation_v2 = control_plane::ports::PluginRepository::upsert_installation(
        &store,
        &UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: "fixture_provider".into(),
            plugin_id: "fixture_provider@0.2.0".into(),
            plugin_version: "0.2.0".into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "official_registry".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled: true,
            install_path: "/tmp/plugin-installed/fixture_provider/0.2.0".into(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap()
    .id;
    let instance = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id: installation_v1,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider Prod".into(),
            status: ModelProviderInstanceStatus::Draft,
            config_json: json!({ "base_url": "https://api.example.com" }),
            last_validation_status: None,
            last_validation_message: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let moved = ModelProviderRepository::reassign_instances_to_installation(
        &store,
        &ReassignModelProviderInstancesInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            target_installation_id: installation_v2,
            target_protocol: "openai_compatible".into(),
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();

    assert_eq!(moved.len(), 1);
    assert_eq!(moved[0].id, instance.id);
    assert_eq!(moved[0].installation_id, installation_v2);
}
```

Extend `MemoryPluginManagementRepository` in `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs` with helper readers:

```rust
async fn assignment_installation_id(&self, provider_code: &str) -> Uuid {
    self.assignments
        .read()
        .await
        .iter()
        .find(|assignment| assignment.provider_code == provider_code)
        .map(|assignment| assignment.installation_id)
        .unwrap()
}

async fn cache_refresh_statuses(&self) -> Vec<String> {
    self.caches
        .read()
        .await
        .values()
        .map(|cache| cache.refresh_status.as_str().to_string())
        .collect()
}
```

Then add a service-level test that seeds two instances and ready caches, calls `switch_version`, and asserts:

```rust
assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
assert_eq!(task.detail_json["migrated_instance_count"], 2);
assert_eq!(
    repository.assignment_installation_id("fixture_provider").await,
    target_installation
);
assert_eq!(repository.cache_refresh_statuses().await, vec!["idle", "idle"]);
```

- [ ] **Step 2: Run the migration-focused tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg model_provider_repository_reassigns_all_instances_for_a_provider -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_switches_ -- --nocapture
```

Expected: FAIL because there is no explicit batch reassignment primitive and `switch_version` does not touch provider instances or caches.

- [ ] **Step 3: Add explicit instance-reassignment primitives and wire them into `switch_version`**

Define the new input in `api/crates/control-plane/src/ports.rs`:

```rust
#[derive(Debug, Clone)]
pub struct ReassignModelProviderInstancesInput {
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub target_installation_id: Uuid,
    pub target_protocol: String,
    pub updated_by: Uuid,
}

#[async_trait]
pub trait ModelProviderRepository: Send + Sync {
    async fn reassign_instances_to_installation(
        &self,
        input: &ReassignModelProviderInstancesInput,
    ) -> anyhow::Result<Vec<domain::ModelProviderInstanceRecord>>;
}
```

Also extend `MemoryPluginManagementRepository` in `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs` with `instances` and `caches` stores, then implement `ModelProviderRepository` for it with the minimal methods used by `switch_version`. Update the `PluginManagementService` generic bound to:

```rust
impl<R, H> PluginManagementService<R, H>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository,
    H: ProviderRuntimePort,
{
    // ...
}
```

Implement the SQL in `api/crates/storage-pg/src/model_provider_repository.rs`:

```rust
let rows = sqlx::query(
    r#"
    update model_provider_instances
    set
        installation_id = $3,
        protocol = $4,
        updated_by = $5,
        updated_at = now()
    where workspace_id = $1
      and provider_code = $2
    returning
        id,
        workspace_id,
        installation_id,
        provider_code,
        protocol,
        display_name,
        status,
        config_json,
        last_validated_at,
        last_validation_status,
        last_validation_message,
        created_by,
        updated_by,
        created_at,
        updated_at
    "#,
)
.bind(input.workspace_id)
.bind(&input.provider_code)
.bind(input.target_installation_id)
.bind(&input.target_protocol)
.bind(input.updated_by)
.fetch_all(self.pool())
.await?;
```

Then finish `switch_family_installation` in `api/crates/control-plane/src/plugin_management.rs` by:

```rust
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
            model_discovery_mode: map_model_discovery_mode(package.provider.model_discovery_mode),
            refresh_status: domain::ModelProviderCatalogRefreshStatus::Idle,
            source: map_catalog_source(package.provider.model_discovery_mode),
            models_json: json!([]),
            last_error_message: None,
            refreshed_at: None,
        })
        .await?;
}

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
```

- [ ] **Step 4: Re-run the migration-focused tests**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg model_provider_repository_ -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_ -- --nocapture
```

Expected: PASS with task detail containing `previous_installation_id`, `previous_version`, `target_installation_id`, `target_version`, and `migrated_instance_count`.

- [ ] **Step 5: Commit the migration-and-cache-invalidating switch flow**

Run:

```bash
git add api/crates/control-plane/src/ports.rs \
  api/crates/control-plane/src/plugin_management.rs \
  api/crates/control-plane/src/_tests/plugin_management_service_tests.rs \
  api/crates/storage-pg/src/model_provider_repository.rs \
  api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs \
  docs/superpowers/plans/2026-04-19-plugin-version-switch.md
git commit -m "feat: migrate provider instances on plugin switch"
```

Expected: one commit that makes version switching behaviorally complete on the backend.

### Task 4: Expose Plugin Family APIs Through The API Server And Client

**Files:**
- Modify: `api/apps/api-server/src/routes/plugins.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Test: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Modify: `web/packages/api-client/src/console-plugins.ts`
- Modify: `web/app/src/features/settings/api/plugins.ts`

- [ ] **Step 1: Write the failing route tests for the new family endpoints**

Add a route test to `api/apps/api-server/src/_tests/plugin_routes.rs` that exercises:

```rust
let list_response = app
    .clone()
    .oneshot(
        Request::builder()
            .uri("/api/console/plugins/families")
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap(),
    )
    .await
    .unwrap();
assert_eq!(list_response.status(), StatusCode::OK);

let switch_response = app
    .clone()
    .oneshot(
        Request::builder()
            .method("POST")
            .uri("/api/console/plugins/families/fixture_provider/switch-version")
            .header("cookie", &cookie)
            .header("x-csrf-token", &csrf)
            .header("content-type", "application/json")
            .body(Body::from(json!({ "installation_id": target_installation_id }).to_string()))
            .unwrap(),
    )
    .await
    .unwrap();
assert_eq!(switch_response.status(), StatusCode::OK);
```

- [ ] **Step 2: Run the API route tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_ -- --nocapture
```

Expected: FAIL because `/api/console/plugins/families*` routes and schemas do not exist yet.

- [ ] **Step 3: Add route DTOs, OpenAPI registration, and client bindings**

In `api/apps/api-server/src/routes/plugins.rs`, add:

```rust
#[derive(Debug, Deserialize, ToSchema)]
pub struct SwitchPluginVersionBody {
    pub installation_id: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginInstalledVersionResponse {
    pub installation_id: String,
    pub plugin_version: String,
    pub source_kind: String,
    pub created_at: String,
    pub is_current: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginFamilyResponse {
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub current_installation_id: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub installed_versions: Vec<PluginInstalledVersionResponse>,
}
```

Register routes:

```rust
.route("/plugins/families", get(list_families))
.route(
    "/plugins/families/:provider_code/upgrade-latest",
    post(upgrade_latest),
)
.route(
    "/plugins/families/:provider_code/switch-version",
    post(switch_version),
)
```

In `web/packages/api-client/src/console-plugins.ts`, add:

```ts
export interface ConsolePluginInstalledVersion {
  installation_id: string;
  plugin_version: string;
  source_kind: string;
  created_at: string;
  is_current: boolean;
}

export interface ConsolePluginFamilyEntry {
  provider_code: string;
  display_name: string;
  protocol: string;
  help_url: string | null;
  default_base_url: string | null;
  model_discovery_mode: string;
  current_installation_id: string;
  current_version: string;
  latest_version: string | null;
  has_update: boolean;
  installed_versions: ConsolePluginInstalledVersion[];
}

export function listConsolePluginFamilies(baseUrl?: string) {
  return apiFetch<ConsolePluginFamilyEntry[]>({
    path: '/api/console/plugins/families',
    baseUrl
  });
}

export function upgradeConsolePluginFamilyLatest(
  providerCode: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsolePluginTask>({
    path: `/api/console/plugins/families/${providerCode}/upgrade-latest`,
    method: 'POST',
    csrfToken,
    baseUrl
  });
}

export function switchConsolePluginFamilyVersion(
  providerCode: string,
  input: { installation_id: string },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsolePluginTask>({
    path: `/api/console/plugins/families/${providerCode}/switch-version`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}
```

And re-export them via `web/app/src/features/settings/api/plugins.ts` as settings-scoped wrappers.

- [ ] **Step 4: Re-run the API route tests**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_ -- --nocapture
```

Expected: PASS for listing families, switching versions, upgrading latest, and the existing plugin install routes.

- [ ] **Step 5: Commit the API and client contract changes**

Run:

```bash
git add api/apps/api-server/src/routes/plugins.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/_tests/plugin_routes.rs \
  web/packages/api-client/src/console-plugins.ts \
  web/app/src/features/settings/api/plugins.ts \
  docs/superpowers/plans/2026-04-19-plugin-version-switch.md
git commit -m "feat: expose plugin family version APIs"
```

Expected: one commit that makes the new backend contract consumable from the web app.

### Task 5: Refactor `/settings/model-providers` To Use Provider Families And Version Management

**Files:**
- Create: `web/app/src/features/settings/components/model-providers/PluginVersionManagementModal.tsx`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Test: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [ ] **Step 1: Write the failing Vitest coverage for provider-family rows and version actions**

Extend `web/app/src/features/settings/_tests/model-providers-page.test.tsx` with mocks and assertions like:

```ts
const pluginsApi = vi.hoisted(() => ({
  settingsOfficialPluginsQueryKey: ['settings', 'plugins', 'official-catalog'],
  settingsPluginFamiliesQueryKey: ['settings', 'plugins', 'families'],
  fetchSettingsOfficialPluginCatalog: vi.fn(),
  fetchSettingsPluginFamilies: vi.fn(),
  installSettingsOfficialPlugin: vi.fn(),
  upgradeSettingsPluginFamilyLatest: vi.fn(),
  switchSettingsPluginFamilyVersion: vi.fn(),
  fetchSettingsPluginTask: vi.fn()
}));

expect(await screen.findByText('当前使用 0.1.0，最新版本 0.2.0')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: '版本管理' }));
expect(await screen.findByText('升级到最新版本')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: '回退到该版本' }));
await waitFor(() => {
  expect(pluginsApi.switchSettingsPluginFamilyVersion).toHaveBeenCalledWith(
    'openai_compatible',
    'installation-1',
    'csrf-123'
  );
});
```

- [ ] **Step 2: Run the targeted settings-page test to capture the RED baseline**

Run:

```bash
rtk pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected: FAIL because the settings page still renders assigned installations, has no family query, and has no version management modal.

- [ ] **Step 3: Add settings plugin-family queries and page-level mutation state**

In `web/app/src/features/settings/api/plugins.ts`, add:

```ts
export type SettingsPluginFamilyEntry = ConsolePluginFamilyEntry;

export const settingsPluginFamiliesQueryKey = [
  'settings',
  'plugins',
  'families'
] as const;

export function fetchSettingsPluginFamilies() {
  return listConsolePluginFamilies();
}

export function upgradeSettingsPluginFamilyLatest(
  providerCode: string,
  csrfToken: string
) {
  return upgradeConsolePluginFamilyLatest(providerCode, csrfToken);
}

export function switchSettingsPluginFamilyVersion(
  providerCode: string,
  installationId: string,
  csrfToken: string
) {
  return switchConsolePluginFamilyVersion(
    providerCode,
    { installation_id: installationId },
    csrfToken
  );
}
```

In `SettingsPage.tsx`, replace the old catalog query with:

```ts
const familiesQuery = useQuery({
  queryKey: settingsPluginFamiliesQueryKey,
  queryFn: fetchSettingsPluginFamilies
});

const families = familiesQuery.data ?? [];
const instancesByProviderCode = useMemo(() => {
  const grouped: Record<string, SettingsModelProviderInstance[]> = {};
  for (const instance of instances) {
    grouped[instance.provider_code] ??= [];
    grouped[instance.provider_code]!.push(instance);
  }
  return grouped;
}, [instances]);
```

- [ ] **Step 4: Update the provider table, version modal, official install panel, and switch notice**

Implement these UI rules:

```ts
<ModelProviderCatalogPanel
  entries={families}
  instanceCounts={instanceCountsByProviderCode}
  onManageVersion={(entry) => setVersionModalProviderCode(entry.provider_code)}
  onViewInstances={(entry) => {
    setInstanceModalState({
      providerCode: entry.provider_code,
      selectedInstanceId: pickPreferredInstanceId(
        instancesByProviderCode[entry.provider_code] ?? []
      )
    });
  }}
  onCreate={(entry) => {
    setDrawerState({
      mode: 'create',
      installationId: entry.current_installation_id
    });
  }}
/>;

<OfficialPluginInstallPanel
  entries={officialCatalogEntries}
  familiesByProviderCode={familiesByProviderCode}
  onInstallLatest={(entry) => officialInstallMutation.mutate(entry.plugin_id)}
  onUpgradeLatest={(providerCode) => upgradeLatestMutation.mutate(providerCode)}
/>;

<PluginVersionManagementModal
  entry={activeFamily}
  switching={switchVersionMutation.isPending || upgradeLatestMutation.isPending}
  onUpgradeLatest={() => upgradeLatestMutation.mutate(activeFamily.provider_code)}
  onSwitchVersion={(installationId) =>
    switchVersionMutation.mutate({
      providerCode: activeFamily.provider_code,
      installationId
    })
  }
/>;
```

The modal content must:
- show `latest` first with a `推荐` tag
- show all local installed versions under a separate section
- disable the current version action
- display the warning that all instances will move together and should be refreshed/validated afterward

Also update `ModelProviderInstancesModal.tsx` to render a top `Alert` when `recentVersionSwitchNotice?.providerCode === catalogEntry?.provider_code`.

- [ ] **Step 5: Re-run the targeted settings-page test**

Run:

```bash
rtk pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected: PASS for provider-family rendering, version management, official latest-button states, and the one-time instance warning after a switch.

- [ ] **Step 6: Commit the settings-page refactor**

Run:

```bash
git add web/app/src/features/settings/pages/SettingsPage.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx \
  web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx \
  web/app/src/features/settings/components/model-providers/PluginVersionManagementModal.tsx \
  web/app/src/features/settings/components/model-providers/model-provider-panel.css \
  web/app/src/features/settings/api/plugins.ts \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx \
  docs/superpowers/plans/2026-04-19-plugin-version-switch.md
git commit -m "feat: add plugin version management to settings"
```

Expected: one commit that turns the settings page into the first provider-family consumer surface.

### Task 6: Run Final Targeted Verification And Record The Result

**Files:**
- Modify: `docs/superpowers/plans/2026-04-19-plugin-version-switch.md`

- [ ] **Step 1: Run the backend verification slice**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_repository_ -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg model_provider_repository_ -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_ -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_ -- --nocapture
```

Expected: PASS for storage, service, and route slices that cover pointer storage, version switching, and provider-instance migration.

- [ ] **Step 2: Run the frontend verification slice**

Run:

```bash
rtk pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected: PASS for the model-provider settings page without running the full frontend suite.

- [ ] **Step 3: Update this plan file, then commit the final verification checkpoint**

Update the checkboxes you completed in this file and append a short “Verification” note under the last task with the exact commands that passed.

Then run:

```bash
git add docs/superpowers/plans/2026-04-19-plugin-version-switch.md
git commit -m "docs: record plugin version switch verification"
```

Expected: a final documentation-only commit that leaves an auditable execution trail in the plan file.
