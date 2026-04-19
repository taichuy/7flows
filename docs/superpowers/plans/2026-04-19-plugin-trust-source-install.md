# Plugin Trust Source Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the unified trust chain for official registry, mirror registry, and uploaded plugin installs, then expose separate source/trust semantics in `/settings/model-providers` without touching the sibling official-plugin repository.

**Architecture:** Build a byte-first package intake pipeline in `plugin-framework` that safely unpacks archives, re-reads package metadata, computes artifact/payload digests, and verifies official release signatures against configured public keys. Keep write-path ownership inside `plugin_management`: official/mirror download and browser upload only provide provenance plus bytes, while the service normalizes `source_kind + trust_level + signature_status`, persists them, and reuses the existing install/enable/assign/version-switch lifecycle. The settings page stays the only first-party consumer surface, splitting “从源安装” and “上传插件” while rendering source and trust as separate labels.

**Tech Stack:** Rust (`plugin-framework`, `control-plane`, `storage-pg`, `api-server`), PostgreSQL migrations with `sqlx`, TypeScript React (`TanStack Query`, `Ant Design`), multipart `FormData`, Vitest, targeted `cargo test` and `pnpm exec vitest`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-19-plugin-trust-source-install-design.md`, `.memory/project-memory/2026-04-19-plugin-trust-source-install-design-approved.md`

**Execution Note:** Do not modify `1flowbase-official-plugins/*` in this repository. Mirror/source metadata is host-side only. The legacy `POST /api/console/plugins/install` path remains an internal compatibility/manual intake and must normalize persisted rows to `source_kind=uploaded`; it does not get a new settings-page entry.

**Out Of Scope:** Official plugin repo release workflow changes, mirror hosting/deployment, a generic plugin-management page, deleting old plugin versions, changing the existing `install -> enable -> assign` lifecycle order

---

## File Structure

**Create**
- `api/crates/plugin-framework/src/package_intake.rs`
- `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- `api/crates/storage-pg/migrations/20260419183000_add_plugin_install_trust_fields.sql`
- `web/app/src/features/settings/components/model-providers/PluginUploadInstallModal.tsx`
- `docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md`

**Modify**
- `api/crates/plugin-framework/src/lib.rs`
- `api/crates/plugin-framework/src/_tests/mod.rs`
- `api/crates/domain/src/model_provider.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/plugin_management.rs`
- `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- `api/crates/storage-pg/src/mappers/plugin_mapper.rs`
- `api/crates/storage-pg/src/plugin_repository.rs`
- `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`
- `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- `api/apps/api-server/src/config.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/official_plugin_registry.rs`
- `api/apps/api-server/src/routes/plugins.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/_tests/config_tests.rs`
- `api/apps/api-server/src/_tests/plugin_routes.rs`
- `web/packages/api-client/src/transport.ts`
- `web/packages/api-client/src/_tests/transport.test.ts`
- `web/packages/api-client/src/console-plugins.ts`
- `web/app/src/features/settings/api/plugins.ts`
- `web/app/src/features/settings/pages/SettingsPage.tsx`
- `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`
- `web/app/src/features/settings/components/model-providers/PluginVersionManagementModal.tsx`
- `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`

**Notes**
- Keep `source_kind`, `trust_level`, and `signature_status` as three separate persisted fields. Do not overload `verification_status`.
- Add SQL check constraints for the new string enums instead of introducing a cross-crate Rust enum dependency between `domain` and `plugin-framework`.
- Update this plan file after every completed task so the user can track execution in `docs/superpowers/plans`.

### Task 1: Build The Shared Package Intake Pipeline

**Files:**
- Create: `api/crates/plugin-framework/src/package_intake.rs`
- Create: `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- Modify: `api/crates/plugin-framework/src/lib.rs`
- Modify: `api/crates/plugin-framework/src/_tests/mod.rs`

- [x] **Step 1: Write failing intake tests for verified official, rejected mirror unsigned, and uploaded unsigned flows**

Add tests like these to `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`:

```rust
#[tokio::test]
async fn package_intake_verifies_signed_official_archive_and_derives_verified_official() {
    let fixture = create_signed_package_fixture(SignedFixtureInput {
        plugin_code: "openai_compatible",
        version: "0.2.0",
        include_signature: true,
        tamper_signature: false,
    });

    let result = intake_package_bytes(
        &fixture.package_bytes,
        &PackageIntakePolicy {
            source_kind: "official_registry".to_string(),
            trust_mode: "signature_required".to_string(),
            expected_artifact_sha256: Some(fixture.artifact_sha256.clone()),
            trusted_public_keys: vec![fixture.public_key.clone()],
            original_filename: Some("openai_compatible-0.2.0.1flowbasepkg".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(result.source_kind, "official_registry");
    assert_eq!(result.trust_level, "verified_official");
    assert_eq!(result.signature_status, "verified");
    assert_eq!(result.signature_algorithm.as_deref(), Some("ed25519"));
    assert_eq!(result.signing_key_id.as_deref(), Some("official-key-2026-04"));
}

#[tokio::test]
async fn package_intake_rejects_unsigned_signature_required_mirror_archive() {
    let fixture = create_signed_package_fixture(SignedFixtureInput {
        plugin_code: "openai_compatible",
        version: "0.2.0",
        include_signature: false,
        tamper_signature: false,
    });

    let error = intake_package_bytes(
        &fixture.package_bytes,
        &PackageIntakePolicy {
            source_kind: "mirror_registry".to_string(),
            trust_mode: "signature_required".to_string(),
            expected_artifact_sha256: Some(fixture.artifact_sha256.clone()),
            trusted_public_keys: vec![fixture.public_key.clone()],
            original_filename: Some("openai_compatible-0.2.0.1flowbasepkg".into()),
        },
    )
    .await
    .expect_err("unsigned mirror packages must be rejected");

    assert!(error.to_string().contains("requires a valid official signature"));
}

#[tokio::test]
async fn package_intake_marks_uploaded_unsigned_archive_as_unverified() {
    let fixture = create_signed_package_fixture(SignedFixtureInput {
        plugin_code: "fixture_provider",
        version: "0.1.0",
        include_signature: false,
        tamper_signature: false,
    });

    let result = intake_package_bytes(
        &fixture.package_bytes,
        &PackageIntakePolicy {
            source_kind: "uploaded".to_string(),
            trust_mode: "allow_unsigned".to_string(),
            expected_artifact_sha256: None,
            trusted_public_keys: vec![fixture.public_key.clone()],
            original_filename: Some("fixture_provider-0.1.0.zip".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(result.source_kind, "uploaded");
    assert_eq!(result.trust_level, "unverified");
    assert_eq!(result.signature_status, "unsigned");
}
```

- [x] **Step 2: Run the `plugin-framework` tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework package_intake -- --nocapture
```

Expected: FAIL because `package_intake.rs`, `PackageIntakePolicy`, and `intake_package_bytes` do not exist yet.

- [x] **Step 3: Implement the new intake contract and safe-unpack verification flow**

Create `api/crates/plugin-framework/src/package_intake.rs` with the core API shape:

```rust
use std::path::PathBuf;

use crate::{error::PluginFrameworkError, provider_package::ProviderPackage};

#[derive(Debug, Clone)]
pub struct TrustedPublicKey {
    pub key_id: String,
    pub algorithm: String,
    pub public_key_pem: String,
}

#[derive(Debug, Clone)]
pub struct PackageIntakePolicy {
    pub source_kind: String,
    pub trust_mode: String,
    pub expected_artifact_sha256: Option<String>,
    pub trusted_public_keys: Vec<TrustedPublicKey>,
    pub original_filename: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PackageIntakeResult {
    pub extracted_root: PathBuf,
    pub package: ProviderPackage,
    pub source_kind: String,
    pub trust_level: String,
    pub signature_status: String,
    pub checksum: Option<String>,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
}

pub async fn intake_package_bytes(
    package_bytes: &[u8],
    policy: &PackageIntakePolicy,
) -> Result<PackageIntakeResult, PluginFrameworkError> {
    let extracted_root = safe_unpack_to_temp_dir(package_bytes, policy.original_filename.as_deref())?;
    let package = ProviderPackage::load_from_dir(&extracted_root)?;
    let signature = verify_official_release_signature(&extracted_root, package_bytes, policy)?;
    reject_signature_required_failure(policy, &signature)?;
    Ok(PackageIntakeResult {
        extracted_root,
        package,
        source_kind: policy.source_kind.clone(),
        trust_level: derive_trust_level(policy, &signature),
        signature_status: signature.status,
        checksum: signature.artifact_sha256,
        signature_algorithm: signature.signature_algorithm,
        signing_key_id: signature.signing_key_id,
    })
}
```

Implementation requirements inside this module:

```rust
fn reject_signature_required_failure(
    policy: &PackageIntakePolicy,
    signature: &SignatureVerificationResult,
) -> Result<(), PluginFrameworkError> {
    let signature_failed = matches!(
        signature.status.as_str(),
        "unsigned"
            | "invalid"
            | "unknown_key"
            | "missing_manifest"
            | "malformed_signature"
    );
    let registry_source = matches!(
        policy.source_kind.as_str(),
        "official_registry" | "mirror_registry"
    );
    if registry_source && policy.trust_mode == "signature_required" && signature_failed {
        return Err(PluginFrameworkError::invalid_provider_package(
            "official or mirror package requires a valid official signature",
        ));
    }
    Ok(())
}

fn derive_trust_level(
    policy: &PackageIntakePolicy,
    signature: &SignatureVerificationResult,
) -> String {
    match signature.status.as_str() {
        "verified" => "verified_official".to_string(),
        _ if policy.source_kind == "uploaded" => "unverified".to_string(),
        _ => "checksum_only".to_string(),
    }
}
```

- [x] **Step 4: Export the new module and rerun the targeted tests**

Update `api/crates/plugin-framework/src/lib.rs` and `api/crates/plugin-framework/src/_tests/mod.rs`:

```rust
pub mod package_intake;
pub use package_intake::*;

#[cfg(test)]
pub mod _tests;
```

```rust
mod assignment_tests;
mod package_intake_tests;
mod provider_contract_tests;
mod provider_package_tests;
```

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework package_intake -- --nocapture
```

Expected: PASS with the three new intake tests green.

- [x] **Step 5: Commit the package-intake foundation**

```bash
git add \
  api/crates/plugin-framework/src/package_intake.rs \
  api/crates/plugin-framework/src/_tests/package_intake_tests.rs \
  api/crates/plugin-framework/src/lib.rs \
  api/crates/plugin-framework/src/_tests/mod.rs \
  docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
git commit -m "feat: add plugin package trust intake"
```

### Task 2: Persist Trust Metadata And Normalize Legacy Install Rows

**Files:**
- Create: `api/crates/storage-pg/migrations/20260419183000_add_plugin_install_trust_fields.sql`
- Modify: `api/crates/domain/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/storage-pg/src/mappers/plugin_mapper.rs`
- Modify: `api/crates/storage-pg/src/plugin_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/migration_smoke.rs`

- [x] **Step 1: Write failing storage tests for trust persistence and schema columns**

Extend `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs` and `api/crates/storage-pg/src/_tests/migration_smoke.rs` with cases like:

```rust
#[tokio::test]
async fn plugin_repository_persists_trust_level_and_signature_metadata() {
    let (store, _workspace, actor) = seed_store().await;
    let installation = PluginRepository::upsert_installation(
        &store,
        &UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: "openai_compatible".into(),
            plugin_id: "1flowbase.openai_compatible@0.2.0".into(),
            plugin_version: "0.2.0".into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "OpenAI Compatible".into(),
            source_kind: "mirror_registry".into(),
            trust_level: "verified_official".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled: true,
            install_path: "/tmp/plugin-installed/openai_compatible/0.2.0".into(),
            checksum: Some("sha256:abc123".into()),
            signature_status: Some("verified".into()),
            signature_algorithm: Some("ed25519".into()),
            signing_key_id: Some("official-key-2026-04".into()),
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    assert_eq!(installation.trust_level, "verified_official");
    assert_eq!(installation.signature_status.as_deref(), Some("verified"));
    assert_eq!(installation.signature_algorithm.as_deref(), Some("ed25519"));
    assert_eq!(installation.signing_key_id.as_deref(), Some("official-key-2026-04"));
}
```

```rust
#[tokio::test]
async fn migration_smoke_creates_plugin_trust_columns_and_constraints() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let schema: String = sqlx::query_scalar("select current_schema()")
        .fetch_one(&pool)
        .await
        .unwrap();
    let columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_schema = $1
          and table_name = 'plugin_installations'
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(columns.contains(&"trust_level".to_string()));
    assert!(columns.contains(&"signature_algorithm".to_string()));
    assert!(columns.contains(&"signing_key_id".to_string()));
}
```

- [x] **Step 2: Run the targeted storage tests to confirm the contract is still missing**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_repository_persists_trust_level_and_signature_metadata -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg migration_smoke_creates_plugin_trust_columns_and_constraints -- --exact
```

Expected: FAIL because `trust_level`, `signature_algorithm`, and `signing_key_id` are not in the schema or the Rust structs yet.

- [x] **Step 3: Add the migration that introduces the new fields and normalizes legacy source values**

Create `api/crates/storage-pg/migrations/20260419183000_add_plugin_install_trust_fields.sql`:

```sql
update plugin_installations
set source_kind = 'uploaded'
where source_kind = 'downloaded_or_uploaded';

alter table plugin_installations
    add column trust_level text not null default 'checksum_only',
    add column signature_algorithm text,
    add column signing_key_id text;

update plugin_installations
set trust_level = case
    when signature_status = 'verified' then 'verified_official'
    when source_kind in ('official_registry', 'mirror_registry', 'uploaded') then 'checksum_only'
    else 'unverified'
end;

alter table plugin_installations
    add constraint plugin_installations_source_kind_check
        check (source_kind in ('official_registry', 'mirror_registry', 'uploaded'));

alter table plugin_installations
    add constraint plugin_installations_trust_level_check
        check (trust_level in ('verified_official', 'checksum_only', 'unverified'));
```

- [x] **Step 4: Extend the domain and repository contracts with the new persisted fields**

Update `api/crates/domain/src/model_provider.rs` and `api/crates/control-plane/src/ports.rs`:

```rust
pub struct PluginInstallationRecord {
    pub id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub trust_level: String,
    pub verification_status: PluginVerificationStatus,
    pub enabled: bool,
    pub install_path: String,
    pub checksum: Option<String>,
    pub signature_status: Option<String>,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
    pub metadata_json: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}
```

```rust
pub struct UpsertPluginInstallationInput {
    pub installation_id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub trust_level: String,
    pub verification_status: domain::PluginVerificationStatus,
    pub enabled: bool,
    pub install_path: String,
    pub checksum: Option<String>,
    pub signature_status: Option<String>,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
    pub metadata_json: serde_json::Value,
    pub actor_user_id: Uuid,
}
```

Then thread the new fields through `plugin_mapper.rs` and `plugin_repository.rs` `insert/select/update` SQL.

- [x] **Step 5: Rerun the storage tests and migration smoke**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_repository_persists_trust_level_and_signature_metadata -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p storage-pg migration_smoke_creates_plugin_trust_columns_and_constraints -- --exact
```

Expected: PASS, and repository reads/writes now preserve `trust_level + signature_*`.

- [x] **Step 6: Commit the persistence layer changes**

```bash
git add \
  api/crates/storage-pg/migrations/20260419183000_add_plugin_install_trust_fields.sql \
  api/crates/domain/src/model_provider.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/storage-pg/src/mappers/plugin_mapper.rs \
  api/crates/storage-pg/src/plugin_repository.rs \
  api/crates/storage-pg/src/_tests/plugin_repository_tests.rs \
  api/crates/storage-pg/src/_tests/migration_smoke.rs \
  docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
git commit -m "feat: persist plugin trust metadata"
```

### Task 3: Resolve Official Or Mirror Source And Enforce `signature_required`

**Files:**
- Modify: `api/apps/api-server/src/config.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/official_plugin_registry.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Modify: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Modify: `api/crates/control-plane/Cargo.toml`
- Modify: `api/apps/api-server/src/routes/plugins.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Modify: `api/apps/api-server/tests/health_routes.rs`

- [x] **Step 1: Write failing config/service/route tests for mirror resolution and unsigned official rejection**

Add tests like these:

```rust
#[test]
fn api_config_prefers_mirror_registry_when_present() {
    let config = ApiConfig::from_env_map(&[
        ("API_DATABASE_URL", "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase"),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("API_OFFICIAL_PLUGIN_DEFAULT_REGISTRY_URL", "https://official.example.com/official-registry.json"),
        ("API_OFFICIAL_PLUGIN_MIRROR_REGISTRY_URL", "https://mirror.example.com/official-registry.json"),
        ("API_OFFICIAL_PLUGIN_TRUSTED_PUBLIC_KEYS_JSON", r#"[{"key_id":"official-key-2026-04","algorithm":"ed25519","public_key_pem":"-----BEGIN PUBLIC KEY-----..."}]"#),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1flowbase"),
    ])
    .unwrap();

    let resolved = config.resolve_official_plugin_source();
    assert_eq!(resolved.source_kind, "mirror_registry");
    assert_eq!(resolved.registry_url, "https://mirror.example.com/official-registry.json");
}
```

```rust
#[tokio::test]
async fn plugin_management_service_rejects_unsigned_signature_required_official_package() {
    let service = build_service_with_official_source(MemoryOfficialPluginSource::unsigned_required());
    let error = service
        .install_official_plugin(InstallOfficialPluginCommand {
            actor_user_id: service_actor_id(&service),
            plugin_id: "1flowbase.openai_compatible".into(),
        })
        .await
        .expect_err("unsigned official package must fail");

    assert!(error.to_string().contains("requires a valid official signature"));
}
```

```rust
#[tokio::test]
async fn plugin_routes_list_official_catalog_with_source_metadata() {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/plugins/official-catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let payload: Value = serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["data"]["source_kind"], "mirror_registry");
    assert_eq!(payload["data"]["source_label"], "镜像源");
    assert_eq!(payload["data"]["entries"][0]["plugin_id"], "1flowbase.openai_compatible");
}
```

- [x] **Step 2: Run the targeted config, service, and route tests**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p api-server api_config_prefers_mirror_registry_when_present -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_rejects_unsigned_signature_required_official_package -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_list_official_catalog_with_source_metadata -- --exact
```

Expected: FAIL because config only knows `API_OFFICIAL_PLUGIN_REGISTRY_URL`, the official source port only returns an array, and unsigned official packages still install.

Observed on 2026-04-19:
- `api_config_prefers_mirror_registry_when_present` failed because `ApiConfig::resolve_official_plugin_source` did not exist yet.
- `plugin_management_service_rejects_unsigned_signature_required_official_package` failed because the in-memory official source test double still used the old contract and had no `unsigned_required()` variant.
- `plugin_routes_list_official_catalog_with_source_metadata` was blocked by the same config/official-source compile gap.

- [x] **Step 3: Expand the official-source contract and registry adapter with resolved-source metadata**

Update `api/crates/control-plane/src/ports.rs` and `api/apps/api-server/src/official_plugin_registry.rs` to use this shape:

```rust
pub struct OfficialPluginCatalogSource {
    pub source_kind: String,
    pub source_label: String,
    pub registry_url: String,
}

pub struct OfficialPluginSourceEntry {
    pub plugin_id: String,
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub latest_version: String,
    pub release_tag: String,
    pub download_url: String,
    pub checksum: String,
    pub trust_mode: String,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
}

pub struct OfficialPluginCatalogSnapshot {
    pub source: OfficialPluginCatalogSource,
    pub entries: Vec<OfficialPluginSourceEntry>,
}

pub struct DownloadedOfficialPluginPackage {
    pub file_name: String,
    pub package_bytes: Vec<u8>,
}
```

```rust
impl OfficialPluginSourcePort for ApiOfficialPluginRegistry {
    async fn list_official_catalog(&self) -> Result<OfficialPluginCatalogSnapshot> {
        let document = self.fetch_registry().await?;
        Ok(OfficialPluginCatalogSnapshot {
            source: OfficialPluginCatalogSource {
                source_kind: self.source_kind.clone(),
                source_label: self.source_label.clone(),
                registry_url: self.registry_url.clone(),
            },
            entries: document.plugins.into_iter().map(OfficialPluginSourceEntry::from).collect(),
        })
    }

    async fn download_plugin(&self, entry: &OfficialPluginSourceEntry) -> Result<DownloadedOfficialPluginPackage> {
        Ok(DownloadedOfficialPluginPackage {
            file_name: format!("{}-{}.1flowbasepkg", entry.provider_code, entry.latest_version),
            package_bytes: self.download_bytes(&entry.download_url).await?,
        })
    }
}
```

- [x] **Step 4: Thread the resolved source into config and enforce `signature_required` in the service**

Update `api/apps/api-server/src/config.rs`, `api/apps/api-server/src/lib.rs`, `api/crates/control-plane/src/plugin_management.rs`, and `api/apps/api-server/src/routes/plugins.rs`:

```rust
pub struct ApiConfig {
    pub official_plugin_default_registry_url: String,
    pub official_plugin_mirror_registry_url: Option<String>,
    pub official_plugin_trusted_public_keys_json: String,
    // keep the existing repository fallback for default URL construction
}

impl ApiConfig {
    pub fn resolve_official_plugin_source(&self) -> ResolvedOfficialPluginSourceConfig {
        if let Some(mirror_url) = self
            .official_plugin_mirror_registry_url
            .clone()
            .filter(|value| !value.trim().is_empty())
        {
            return ResolvedOfficialPluginSourceConfig {
                source_kind: "mirror_registry".into(),
                source_label: "镜像源".into(),
                registry_url: mirror_url,
            };
        }

        ResolvedOfficialPluginSourceConfig {
            source_kind: "official_registry".into(),
            source_label: "官方源".into(),
            registry_url: self.official_plugin_default_registry_url.clone(),
        }
    }
}
```

```rust
let downloaded = self.official_source.download_plugin(&entry).await?;
let intake = plugin_framework::intake_package_bytes(
    &downloaded.package_bytes,
    &PackageIntakePolicy {
        source_kind: snapshot.source.source_kind.clone(),
        trust_mode: entry.trust_mode.clone(),
        expected_artifact_sha256: Some(entry.checksum.clone()),
        trusted_public_keys: self.official_source.trusted_public_keys(),
        original_filename: Some(downloaded.file_name.clone()),
    },
)
.await?;
```

Return the new catalog response payload from `GET /api/console/plugins/official-catalog`:

```rust
pub struct OfficialPluginCatalogResponse {
    pub source_kind: String,
    pub source_label: String,
    pub registry_url: String,
    pub entries: Vec<OfficialPluginCatalogEntryResponse>,
}
```

- [x] **Step 5: Rerun the official-source tests and OpenAPI checks**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p api-server _tests::config_tests::api_config_prefers_mirror_registry_when_present -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p control-plane _tests::plugin_management_service_tests::plugin_management_service_rejects_unsigned_signature_required_official_package -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server _tests::plugin_routes::plugin_routes_list_official_catalog_with_source_metadata -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server _tests::openapi_alignment:: -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p control-plane _tests::plugin_management_service_tests::plugin_management_service_lists_official_catalog_and_installs_latest_release_asset -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server _tests::plugin_routes::plugin_routes_list_official_catalog_and_install_official_package -- --exact
rtk git diff --check
```

Expected: PASS, and the route/OpenAPI contract now exposes source metadata plus stricter failure semantics.

Actual on 2026-04-19:
- All six targeted/regression tests passed.
- During the success-path rerun, one test assertion expected `signature_status=unverified`; actual intake semantics returned `signature_status=unsigned` for `trust_mode=allow_unsigned`, so the assertion was corrected and rerun to green.
- `rtk git diff --check` passed.

- [ ] **Step 6: Commit the official/mirror source work**

```bash
git add \
  api/apps/api-server/src/config.rs \
  api/apps/api-server/src/lib.rs \
  api/apps/api-server/src/official_plugin_registry.rs \
  api/apps/api-server/src/routes/plugins.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/_tests/config_tests.rs \
  api/apps/api-server/src/_tests/plugin_routes.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/control-plane/src/plugin_management.rs \
  api/crates/control-plane/src/_tests/plugin_management_service_tests.rs \
  docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
git commit -m "feat: add trusted official and mirror plugin source"
```

### Task 4: Add Browser Upload Install And Keep Legacy Manual Install Compatible

**Files:**
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Modify: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Modify: `api/apps/api-server/src/routes/plugins.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/plugin_routes.rs`

- [ ] **Step 1: Write failing service and route tests for multipart upload installs**

Add tests like these:

```rust
#[tokio::test]
async fn plugin_management_service_installs_uploaded_signed_package_as_verified_official() {
    let fixture = create_signed_package_fixture("openai_compatible", "0.2.0", true);
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
    assert_eq!(result.installation.signature_status.as_deref(), Some("verified"));
}
```

```rust
#[tokio::test]
async fn plugin_routes_install_upload_accepts_multipart_package() {
    let boundary = "----1flowbase-test-boundary";
    let fixture = create_signed_upload_fixture("fixture_provider", "0.1.0", false);
    let body = build_upload_body(boundary, "fixture_provider-0.1.0.1flowbasepkg", &fixture.package_bytes);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install-upload")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}
```

- [ ] **Step 2: Run the targeted upload tests to capture the missing endpoint and command**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_installs_uploaded_signed_package_as_verified_official -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_install_upload_accepts_multipart_package -- --exact
```

Expected: FAIL because there is no `InstallUploadedPluginCommand`, no multipart route, and no upload endpoint in the router/OpenAPI spec.

- [ ] **Step 3: Add the new upload command and route while preserving the hidden legacy manual path**

Update `api/crates/control-plane/src/plugin_management.rs`:

```rust
pub struct InstallUploadedPluginCommand {
    pub actor_user_id: Uuid,
    pub file_name: String,
    pub package_bytes: Vec<u8>,
}

pub async fn install_uploaded_plugin(
    &self,
    command: InstallUploadedPluginCommand,
) -> Result<InstallPluginResult> {
    let intake = plugin_framework::intake_package_bytes(
        &command.package_bytes,
        &PackageIntakePolicy {
            source_kind: "uploaded".into(),
            trust_mode: "allow_unsigned".into(),
            expected_artifact_sha256: None,
            trusted_public_keys: self.official_source.trusted_public_keys(),
            original_filename: Some(command.file_name.clone()),
        },
    )
    .await?;
    self.install_intake_result(command.actor_user_id, intake, json!({
        "install_kind": "upload",
        "file_name": command.file_name,
    }))
    .await
}
```

Update `api/apps/api-server/src/routes/plugins.rs`:

```rust
use axum::extract::Multipart;

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/plugins/install-upload", post(install_uploaded_plugin))
        .route("/plugins/install", post(install_plugin))
        .route("/plugins/install-official", post(install_official_plugin))
}

pub async fn install_uploaded_plugin(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ApiSuccess<InstallPluginResponse>>), ApiError> {
    let actor_user_id = require_session_user_id(&headers)?;
    let (file_name, package_bytes) = read_upload_file(&mut multipart).await?;
    let result = service(&state)
        .install_uploaded_plugin(InstallUploadedPluginCommand {
            actor_user_id,
            file_name,
            package_bytes,
        })
        .await?;
    Ok((StatusCode::CREATED, Json(ApiSuccess::new(to_install_response(result)))))
}
```

Keep `install_plugin(InstallPluginCommand { package_root })` alive, but when persisting its installation row, force:

```rust
source_kind: "uploaded".into(),
trust_level: "checksum_only".into(),
signature_status: Some("unsigned".into()),
```

That preserves the compatibility/debug path without inventing a fourth source kind.

- [ ] **Step 4: Rerun the upload tests and confirm the legacy path still works**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_installs_uploaded_signed_package_as_verified_official -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_install_upload_accepts_multipart_package -- --exact
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes_install_enable_assign_and_query_tasks -- --exact
```

Expected: PASS, including the old `/plugins/install` compatibility flow.

- [ ] **Step 5: Commit the upload backend**

```bash
git add \
  api/crates/control-plane/src/plugin_management.rs \
  api/crates/control-plane/src/_tests/plugin_management_service_tests.rs \
  api/apps/api-server/src/routes/plugins.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/_tests/plugin_routes.rs \
  docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
git commit -m "feat: add uploaded plugin install flow"
```

### Task 5: Update The Settings Page To Show Source Metadata, Trust Labels, And Upload Install

**Files:**
- Create: `web/app/src/features/settings/components/model-providers/PluginUploadInstallModal.tsx`
- Modify: `web/packages/api-client/src/transport.ts`
- Modify: `web/packages/api-client/src/_tests/transport.test.ts`
- Modify: `web/packages/api-client/src/console-plugins.ts`
- Modify: `web/app/src/features/settings/api/plugins.ts`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/PluginVersionManagementModal.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [ ] **Step 1: Write failing frontend tests for official-source header, upload modal, and source/trust labels**

Extend `web/packages/api-client/src/_tests/transport.test.ts` and `web/app/src/features/settings/_tests/model-providers-page.test.tsx` with cases like:

```tsx
pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
  source_kind: 'mirror_registry',
  source_label: '镜像源',
  registry_url: 'https://mirror.example.com/official-registry.json',
  entries: [
    {
      plugin_id: '1flowbase.openai_compatible',
      provider_code: 'openai_compatible',
      display_name: 'OpenAI Compatible',
      protocol: 'openai_compatible',
      latest_version: '0.2.0',
      help_url: 'https://platform.openai.com/docs/api-reference',
      model_discovery_mode: 'hybrid',
      install_status: 'assigned'
    }
  ]
});

pluginsApi.uploadSettingsPluginPackage.mockResolvedValue({
  installation: {
    id: 'installation-upload-1',
    provider_code: 'openai_compatible',
    plugin_id: '1flowbase.openai_compatible@0.2.0',
    plugin_version: '0.2.0',
    contract_version: '1flowbase.provider/v1',
    protocol: 'openai_compatible',
    display_name: 'OpenAI Compatible',
    source_kind: 'uploaded',
    trust_level: 'verified_official',
    verification_status: 'valid',
    enabled: true,
    install_path: '/tmp/openai-compatible-uploaded',
    checksum: 'sha256:abc123',
    signature_status: 'verified',
    signature_algorithm: 'ed25519',
    signing_key_id: 'official-key-2026-04',
    metadata_json: {},
    created_at: '2026-04-19T14:00:00Z',
    updated_at: '2026-04-19T14:00:00Z'
  },
  task: { id: 'task-upload-1', provider_code: 'openai_compatible', status: 'success', detail_json: {}, created_at: '', updated_at: '', installation_id: 'installation-upload-1', workspace_id: 'workspace-1', task_kind: 'install', status_message: null, finished_at: '' }
});
```

```tsx
renderApp('/settings/model-providers');
expect(await screen.findByText('当前来源：镜像源')).toBeInTheDocument();
expect(screen.getByText('优先从镜像源拉取官方插件')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '上传插件' })).toBeInTheDocument();
expect(await screen.findByText('官方签发')).toBeInTheDocument();
expect(await screen.findByText('手工上传')).toBeInTheDocument();
```

```ts
test('apiFetch supports FormData bodies without forcing JSON content-type', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: { ok: true }, meta: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
  const formData = new FormData();
  formData.set('file', new Blob(['hello']), 'hello.1flowbasepkg');
  await apiFetch({
    path: '/api/console/plugins/install-upload',
    method: 'POST',
    rawBody: formData,
    contentType: null,
    baseUrl: 'http://127.0.0.1:7800'
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:7800/api/console/plugins/install-upload',
    expect.objectContaining({ body: formData })
  );
});
```

- [ ] **Step 2: Run the targeted frontend tests for the RED baseline**

Run:

```bash
rtk pnpm --dir web exec vitest run packages/api-client/src/_tests/transport.test.ts app/src/features/settings/_tests/model-providers-page.test.tsx
```

Expected: FAIL because the API client cannot send `FormData`, the official-catalog query still returns an array, and the settings page has no upload entry or trust labels.

- [ ] **Step 3: Update the client DTOs and transport helpers for the new backend contract**

Update `web/packages/api-client/src/transport.ts` and `web/packages/api-client/src/console-plugins.ts`:

```ts
export interface ApiRequestOptions {
  path: string;
  method?: string;
  body?: unknown;
  rawBody?: BodyInit;
  contentType?: string | null;
  csrfToken?: string | null;
  baseUrl?: string;
  expectJson?: boolean;
  unwrapSuccess?: boolean;
}

if (body !== undefined && rawBody !== undefined) {
  throw new Error('apiFetch does not support body and rawBody at the same time');
}
if (body !== undefined) {
  headers['content-type'] = 'application/json';
}
if (contentType !== undefined && contentType !== null) {
  headers['content-type'] = contentType;
}
```

```ts
export interface ConsolePluginInstallation {
  id: string;
  provider_code: string;
  plugin_id: string;
  plugin_version: string;
  contract_version: string;
  protocol: string;
  display_name: string;
  source_kind: string;
  trust_level: string;
  verification_status: string;
  enabled: boolean;
  install_path: string;
  checksum: string | null;
  signature_status: string | null;
  signature_algorithm: string | null;
  signing_key_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConsoleOfficialPluginCatalogResponse {
  source_kind: string;
  source_label: string;
  registry_url: string;
  entries: ConsoleOfficialPluginCatalogEntry[];
}

export function uploadConsolePluginPackage(
  file: File,
  csrfToken: string,
  baseUrl?: string
) {
  const formData = new FormData();
  formData.set('file', file);
  return apiFetch<InstallConsolePluginResult>({
    path: '/api/console/plugins/install-upload',
    method: 'POST',
    rawBody: formData,
    contentType: null,
    csrfToken,
    baseUrl
  });
}
```

- [ ] **Step 4: Wire the settings page with a dedicated upload modal and separate source/trust tags**

Create `web/app/src/features/settings/components/model-providers/PluginUploadInstallModal.tsx`:

```tsx
import { Alert, Button, Modal, Upload, Typography } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';

export function PluginUploadInstallModal({
  open,
  submitting,
  resultSummary,
  errorMessage,
  fileList,
  onClose,
  onChange,
  onSubmit
}: {
  open: boolean;
  submitting: boolean;
  resultSummary: { displayName: string; version: string; trustLabel: string } | null;
  errorMessage: string | null;
  fileList: UploadFile[];
  onClose: () => void;
  onChange: (nextFiles: UploadFile[]) => void;
  onSubmit: () => void;
}) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} destroyOnHidden title="上传插件">
      <div className="model-provider-panel__upload-modal">
        <Typography.Paragraph type="secondary">
          支持 `.1flowbasepkg`，兼容 `.tar.gz` / `.zip`。上传后仍由宿主后端统一验签和安装。
        </Typography.Paragraph>
        <Upload.Dragger
          beforeUpload={() => false}
          maxCount={1}
          fileList={fileList}
          onChange={({ fileList: nextFiles }) => onChange(nextFiles)}
        >
          选择插件包后上传并安装
        </Upload.Dragger>
        {resultSummary ? (
          <Alert type="success" showIcon message={`${resultSummary.displayName} ${resultSummary.version}`} description={`来源：手工上传；信任级别：${resultSummary.trustLabel}`} />
        ) : null}
        {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}
        <Button type="primary" block loading={submitting} onClick={onSubmit}>
          上传并安装
        </Button>
      </div>
    </Modal>
  );
}
```

Update `web/app/src/features/settings/pages/SettingsPage.tsx`, `OfficialPluginInstallPanel.tsx`, and `PluginVersionManagementModal.tsx` to:

```tsx
const officialCatalog = officialCatalogQuery.data?.entries ?? [];
const officialSourceMeta = officialCatalogQuery.data
  ? {
      sourceKind: officialCatalogQuery.data.source_kind,
      sourceLabel: officialCatalogQuery.data.source_label,
      registryUrl: officialCatalogQuery.data.registry_url
    }
  : null;
```

```tsx
function renderTrustTag(trustLevel: string) {
  switch (trustLevel) {
    case 'verified_official':
      return <Tag color="green">官方签发</Tag>;
    case 'checksum_only':
      return <Tag color="gold">仅 checksum</Tag>;
    default:
      return <Tag>未验签</Tag>;
  }
}
```

Also update `web/app/src/style-boundary/scenario-manifest.json` so `page.settings` includes:

```json
"web/app/src/features/settings/components/model-providers/PluginUploadInstallModal.tsx"
```

- [ ] **Step 5: Rerun the targeted frontend tests**

Run:

```bash
rtk pnpm --dir web exec vitest run packages/api-client/src/_tests/transport.test.ts app/src/features/settings/_tests/model-providers-page.test.tsx
```

Expected: PASS, and the page now surfaces source/trust separately while keeping the existing settings-page layout.

- [ ] **Step 6: Commit the settings-page changes**

```bash
git add \
  web/packages/api-client/src/transport.ts \
  web/packages/api-client/src/_tests/transport.test.ts \
  web/packages/api-client/src/console-plugins.ts \
  web/app/src/features/settings/api/plugins.ts \
  web/app/src/features/settings/pages/SettingsPage.tsx \
  web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx \
  web/app/src/features/settings/components/model-providers/PluginVersionManagementModal.tsx \
  web/app/src/features/settings/components/model-providers/PluginUploadInstallModal.tsx \
  web/app/src/features/settings/components/model-providers/model-provider-panel.css \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx \
  web/app/src/style-boundary/scenario-manifest.json \
  docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
git commit -m "feat: expose plugin source trust and upload install"
```

### Task 6: Run Full Verification And Close The Loop

**Files:**
- Modify: `docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md`

- [ ] **Step 1: Run the backend verification suite from the repo root**

```bash
rtk node scripts/node/verify-backend.js
```

Expected: PASS for the repo-standard backend verification chain.

- [ ] **Step 2: Run the required frontend lint, tests, and production build**

```bash
rtk pnpm --dir web lint
rtk pnpm --dir web test
rtk pnpm --dir web/app build
```

Expected: PASS, satisfying `web/AGENTS.md` minimum frontend verification rules.

- [ ] **Step 3: Run style-boundary verification for the settings page**

```bash
rtk node scripts/node/check-style-boundary.js page page.settings
```

Expected: PASS for `page.settings`, proving the new upload/source/trust UI did not bleed across shell boundaries.

- [ ] **Step 4: Run a final text-level diff check**

```bash
rtk git diff --check
```

Expected: PASS with no whitespace or conflict-marker issues.

- [ ] **Step 5: Commit the verification close-out**

```bash
git add docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
git commit -m "chore: verify plugin trust source install rollout"
```
