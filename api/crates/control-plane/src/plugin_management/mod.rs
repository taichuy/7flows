mod catalog;
mod family;
mod filesystem;
mod install;

use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use access_control::ensure_permission;
use anyhow::{Context, Result};
use plugin_framework::{
    compute_manifest_fingerprint, intake_package_bytes, parse_plugin_manifest,
    provider_package::ProviderPackage, PackageIntakePolicy, PackageIntakeResult, PluginManifestV1,
};
use serde_json::json;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    host_extension::{
        ensure_root_actor, ensure_uploaded_host_extensions_enabled, is_host_extension_installation,
        is_host_extension_manifest, is_model_provider_installation, plugin_code_from_plugin_id,
    },
    i18n::{
        merge_i18n_catalog, plugin_namespace, trim_json_bundles, trim_provider_bundles,
        I18nCatalog, RequestedLocales,
    },
    plugin_lifecycle::{derive_availability_status, reconcile_installation_snapshot},
    ports::{
        AuthRepository, CreatePluginAssignmentInput, CreatePluginTaskInput,
        ModelProviderRepository, NodeContributionRegistryInput, NodeContributionRepository,
        OfficialPluginArtifact, OfficialPluginSourceEntry, OfficialPluginSourcePort,
        PluginRepository, ProviderRuntimePort, ReassignModelProviderInstancesInput,
        ReplaceInstallationNodeContributionsInput, UpdatePluginDesiredStateInput,
        UpdatePluginRuntimeSnapshotInput, UpdatePluginTaskStatusInput,
        UpsertModelProviderCatalogCacheInput, UpsertPluginInstallationInput,
    },
    state_transition::ensure_plugin_task_transition,
};

pub use catalog::*;
pub use family::*;
pub use install::*;

pub struct PluginManagementService<R, H> {
    repository: R,
    runtime: H,
    official_source: Arc<dyn OfficialPluginSourcePort>,
    install_root: PathBuf,
    allow_uploaded_host_extensions: bool,
}

impl<R, H> PluginManagementService<R, H>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository + NodeContributionRepository,
    H: ProviderRuntimePort,
{
    pub fn new(
        repository: R,
        runtime: H,
        official_source: Arc<dyn OfficialPluginSourcePort>,
        install_root: impl Into<PathBuf>,
    ) -> Self {
        Self {
            repository,
            runtime,
            official_source,
            install_root: install_root.into(),
            allow_uploaded_host_extensions: true,
        }
    }

    pub fn with_allow_uploaded_host_extensions(mut self, allow: bool) -> Self {
        self.allow_uploaded_host_extensions = allow;
        self
    }
}
