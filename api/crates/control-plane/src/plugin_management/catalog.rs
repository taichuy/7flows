use super::install::{load_actor_context_for_user, load_provider_package};
use super::*;

#[derive(Debug, Clone)]
pub struct PluginCatalogEntry {
    pub installation: domain::PluginInstallationRecord,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub assigned_to_current_workspace: bool,
}

#[derive(Debug, Clone)]
pub struct PluginCatalogView {
    pub entries: Vec<PluginCatalogEntry>,
    pub i18n_catalog: I18nCatalog,
}

#[derive(Debug, Clone, Default)]
pub struct PluginCatalogFilter {
    pub plugin_type: Option<String>,
}

impl PluginCatalogFilter {
    fn matches(&self, plugin_type: &str) -> bool {
        self.plugin_type
            .as_deref()
            .is_none_or(|value| value == plugin_type)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfficialPluginInstallStatus {
    NotInstalled,
    Installed,
    Assigned,
}

impl OfficialPluginInstallStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotInstalled => "not_installed",
            Self::Installed => "installed",
            Self::Assigned => "assigned",
        }
    }
}

#[derive(Debug, Clone)]
pub struct OfficialPluginCatalogEntry {
    pub plugin_id: String,
    pub plugin_type: String,
    pub provider_code: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
    pub protocol: String,
    pub latest_version: String,
    pub selected_artifact: OfficialPluginArtifact,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
    pub install_status: OfficialPluginInstallStatus,
}

#[derive(Debug, Clone)]
pub struct OfficialPluginCatalogView {
    pub source_kind: String,
    pub source_label: String,
    pub registry_url: String,
    pub i18n_catalog: I18nCatalog,
    pub entries: Vec<OfficialPluginCatalogEntry>,
}

#[derive(Debug, Clone)]
pub struct PluginInstalledVersionView {
    pub installation_id: Uuid,
    pub plugin_version: String,
    pub source_kind: String,
    pub trust_level: String,
    pub desired_state: String,
    pub availability_status: String,
    pub created_at: OffsetDateTime,
    pub is_current: bool,
}

#[derive(Debug, Clone)]
pub struct PluginFamilyView {
    pub provider_code: String,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
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

#[derive(Debug, Clone)]
pub struct PluginFamilyCatalogView {
    pub entries: Vec<PluginFamilyView>,
    pub i18n_catalog: I18nCatalog,
}

fn compare_plugin_versions(left: &str, right: &str) -> Ordering {
    let mut left_parts = left.split('.');
    let mut right_parts = right.split('.');

    loop {
        match (left_parts.next(), right_parts.next()) {
            (None, None) => return Ordering::Equal,
            (Some(left_part), Some(right_part)) => {
                let ordering = match (left_part.parse::<u64>(), right_part.parse::<u64>()) {
                    (Ok(left_number), Ok(right_number)) => left_number.cmp(&right_number),
                    _ => left_part.cmp(right_part),
                };

                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(left_part), None) => match left_part.parse::<u64>() {
                Ok(0) => continue,
                Ok(_) | Err(_) => return Ordering::Greater,
            },
            (None, Some(right_part)) => match right_part.parse::<u64>() {
                Ok(0) => continue,
                Ok(_) | Err(_) => return Ordering::Less,
            },
        }
    }
}

fn pick_latest_official_entry(
    current: OfficialPluginSourceEntry,
    candidate: OfficialPluginSourceEntry,
) -> OfficialPluginSourceEntry {
    match compare_plugin_versions(&candidate.latest_version, &current.latest_version) {
        Ordering::Greater => candidate,
        Ordering::Less => current,
        Ordering::Equal => {
            if candidate.plugin_id < current.plugin_id {
                candidate
            } else {
                current
            }
        }
    }
}

pub(super) fn normalize_official_entries(
    entries: Vec<OfficialPluginSourceEntry>,
) -> Vec<OfficialPluginSourceEntry> {
    let mut grouped = HashMap::<String, OfficialPluginSourceEntry>::new();

    for entry in entries {
        let provider_code = entry.provider_code.clone();
        match grouped.remove(&provider_code) {
            Some(existing) => {
                grouped.insert(provider_code, pick_latest_official_entry(existing, entry));
            }
            None => {
                grouped.insert(provider_code, entry);
            }
        }
    }

    let mut normalized = grouped.into_values().collect::<Vec<_>>();
    normalized.sort_by(|left, right| {
        left.provider_code
            .cmp(&right.provider_code)
            .then_with(|| left.plugin_id.cmp(&right.plugin_id))
    });
    normalized
}

fn provider_help_url(
    installation: &domain::PluginInstallationRecord,
    package: Option<&ProviderPackage>,
) -> Option<String> {
    package
        .and_then(|package| package.provider.help_url.clone())
        .or_else(|| metadata_string(&installation.metadata_json, "help_url"))
}

fn provider_default_base_url(
    installation: &domain::PluginInstallationRecord,
    package: Option<&ProviderPackage>,
) -> Option<String> {
    package
        .and_then(|package| package.provider.default_base_url.clone())
        .or_else(|| metadata_string(&installation.metadata_json, "default_base_url"))
}

fn provider_model_discovery_mode(
    installation: &domain::PluginInstallationRecord,
    package: Option<&ProviderPackage>,
) -> String {
    package
        .map(|package| format!("{:?}", package.provider.model_discovery_mode).to_ascii_lowercase())
        .or_else(|| metadata_string(&installation.metadata_json, "model_discovery_mode"))
        .unwrap_or_else(|| "unknown".to_string())
}

fn metadata_string(metadata: &serde_json::Value, key: &str) -> Option<String> {
    metadata.get(key)?.as_str().map(str::to_string)
}

impl<R, H> PluginManagementService<R, H>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository + NodeContributionRepository,
    H: ProviderRuntimePort,
{
    pub async fn list_catalog(
        &self,
        actor_user_id: Uuid,
        filter: PluginCatalogFilter,
        locales: RequestedLocales,
    ) -> Result<PluginCatalogView> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let assigned_installation_ids = self
            .repository
            .list_assignments(actor.current_workspace_id)
            .await?
            .into_iter()
            .map(|assignment| assignment.installation_id)
            .collect::<HashSet<_>>();
        let installations = self.repository.list_installations().await?;
        let mut catalog = Vec::with_capacity(installations.len());
        let mut i18n_catalog = BTreeMap::new();
        for installation in installations {
            let installation =
                reconcile_installation_snapshot(&self.repository, installation.id).await?;
            if !filter.matches("model_provider") {
                continue;
            }
            if !is_model_provider_installation(&installation) {
                continue;
            }
            let namespace = plugin_namespace(&installation.provider_code);
            let package = load_provider_package(&installation.installed_path).ok();
            if let Some(package) = package.as_ref() {
                merge_i18n_catalog(
                    &mut i18n_catalog,
                    trim_provider_bundles(&namespace, &package.i18n, &locales),
                );
            }
            catalog.push(PluginCatalogEntry {
                plugin_type: "model_provider".to_string(),
                namespace,
                label_key: "plugin.label".to_string(),
                description_key: Some("plugin.description".to_string()),
                provider_label_key: "provider.label".to_string(),
                help_url: provider_help_url(&installation, package.as_ref()),
                default_base_url: provider_default_base_url(&installation, package.as_ref()),
                model_discovery_mode: provider_model_discovery_mode(
                    &installation,
                    package.as_ref(),
                ),
                assigned_to_current_workspace: assigned_installation_ids.contains(&installation.id),
                installation,
            });
        }

        Ok(PluginCatalogView {
            entries: catalog,
            i18n_catalog,
        })
    }

    pub async fn list_official_catalog(
        &self,
        actor_user_id: Uuid,
        filter: PluginCatalogFilter,
        locales: RequestedLocales,
    ) -> Result<OfficialPluginCatalogView> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let assigned_installation_ids = self
            .repository
            .list_assignments(actor.current_workspace_id)
            .await?
            .into_iter()
            .map(|assignment| assignment.installation_id)
            .collect::<HashSet<_>>();
        let installations = self.repository.list_installations().await?;
        let official_snapshot = self.official_source.list_official_catalog().await?;
        let normalized_entries = normalize_official_entries(official_snapshot.entries);
        let mut i18n_catalog = BTreeMap::new();

        let entries = normalized_entries
            .into_iter()
            .filter(|entry| filter.matches(&entry.plugin_type))
            .map(|entry| {
                let matching_installations = installations
                    .iter()
                    .filter(|installation| installation.provider_code == entry.provider_code)
                    .collect::<Vec<_>>();
                let install_status = if matching_installations
                    .iter()
                    .any(|installation| assigned_installation_ids.contains(&installation.id))
                {
                    OfficialPluginInstallStatus::Assigned
                } else if !matching_installations.is_empty() {
                    OfficialPluginInstallStatus::Installed
                } else {
                    OfficialPluginInstallStatus::NotInstalled
                };
                merge_i18n_catalog(
                    &mut i18n_catalog,
                    trim_json_bundles(&entry.namespace, &entry.i18n_summary.bundles, &locales),
                );

                OfficialPluginCatalogEntry {
                    plugin_id: entry.plugin_id,
                    plugin_type: entry.plugin_type,
                    provider_code: entry.provider_code,
                    namespace: entry.namespace,
                    label_key: "plugin.label".to_string(),
                    description_key: Some("plugin.description".to_string()),
                    provider_label_key: "provider.label".to_string(),
                    protocol: entry.protocol,
                    latest_version: entry.latest_version,
                    selected_artifact: entry.selected_artifact,
                    help_url: entry.help_url,
                    model_discovery_mode: entry.model_discovery_mode,
                    install_status,
                }
            })
            .collect();

        Ok(OfficialPluginCatalogView {
            source_kind: official_snapshot.source.source_kind,
            source_label: official_snapshot.source.source_label,
            registry_url: official_snapshot.source.registry_url,
            i18n_catalog,
            entries,
        })
    }

    pub async fn list_families(
        &self,
        actor_user_id: Uuid,
        filter: PluginCatalogFilter,
        locales: RequestedLocales,
    ) -> Result<PluginFamilyCatalogView> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let assignments = self
            .repository
            .list_assignments(actor.current_workspace_id)
            .await?;
        let installations = self.repository.list_installations().await?;
        let mut installation_map = HashMap::new();
        let mut installations_by_provider =
            HashMap::<String, Vec<domain::PluginInstallationRecord>>::new();
        for installation in installations {
            let installation =
                reconcile_installation_snapshot(&self.repository, installation.id).await?;
            installation_map.insert(installation.id, installation.clone());
            installations_by_provider
                .entry(installation.provider_code.clone())
                .or_default()
                .push(installation);
        }
        for versions in installations_by_provider.values_mut() {
            versions.sort_by(|left, right| {
                right
                    .created_at
                    .cmp(&left.created_at)
                    .then_with(|| right.id.cmp(&left.id))
            });
        }
        let official_by_provider = self.official_source.list_official_catalog().await?.entries;
        let official_by_provider = normalize_official_entries(official_by_provider)
            .into_iter()
            .map(|entry| (entry.provider_code.clone(), entry))
            .collect::<HashMap<_, _>>();

        let mut families = Vec::with_capacity(assignments.len());
        let mut i18n_catalog = BTreeMap::new();
        for assignment in assignments {
            if !filter.matches("model_provider") {
                continue;
            }
            let current = installation_map
                .get(&assignment.installation_id)
                .cloned()
                .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
            if !is_model_provider_installation(&current) {
                continue;
            }
            let namespace = plugin_namespace(&current.provider_code);
            let package = load_provider_package(&current.installed_path).ok();
            if let Some(package) = package.as_ref() {
                merge_i18n_catalog(
                    &mut i18n_catalog,
                    trim_provider_bundles(&namespace, &package.i18n, &locales),
                );
            }
            let latest_version = official_by_provider
                .get(&assignment.provider_code)
                .map(|entry| entry.latest_version.clone());
            let installed_versions = installations_by_provider
                .get(&assignment.provider_code)
                .into_iter()
                .flatten()
                .map(|installation| PluginInstalledVersionView {
                    installation_id: installation.id,
                    plugin_version: installation.plugin_version.clone(),
                    source_kind: installation.source_kind.clone(),
                    trust_level: installation.trust_level.clone(),
                    desired_state: installation.desired_state.as_str().to_string(),
                    availability_status: installation.availability_status.as_str().to_string(),
                    created_at: installation.created_at,
                    is_current: installation.id == current.id,
                })
                .collect();

            families.push(PluginFamilyView {
                provider_code: current.provider_code.clone(),
                plugin_type: "model_provider".to_string(),
                namespace,
                label_key: "plugin.label".to_string(),
                description_key: Some("plugin.description".to_string()),
                provider_label_key: "provider.label".to_string(),
                protocol: current.protocol.clone(),
                help_url: provider_help_url(&current, package.as_ref()),
                default_base_url: provider_default_base_url(&current, package.as_ref()),
                model_discovery_mode: provider_model_discovery_mode(&current, package.as_ref()),
                current_installation_id: current.id,
                current_version: current.plugin_version.clone(),
                latest_version: latest_version.clone(),
                has_update: latest_version
                    .as_deref()
                    .is_some_and(|version| version != current.plugin_version),
                installed_versions,
            });
        }
        families.sort_by(|left, right| left.provider_code.cmp(&right.provider_code));

        Ok(PluginFamilyCatalogView {
            entries: families,
            i18n_catalog,
        })
    }
}
