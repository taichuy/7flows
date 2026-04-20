use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::{
    NodeContributionRepository, ReplaceInstallationNodeContributionsInput,
};
use domain::NodeContributionDependencyStatus;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::node_contribution_mapper::{
        PgNodeContributionMapper, StoredNodeContributionRegistryRow,
    },
    repositories::PgControlPlaneStore,
};

fn map_registry_row(
    row: sqlx::postgres::PgRow,
    dependency_status: NodeContributionDependencyStatus,
) -> Result<domain::NodeContributionRegistryEntry> {
    PgNodeContributionMapper::to_registry_entry(StoredNodeContributionRegistryRow {
        installation_id: row.get("installation_id"),
        provider_code: row.get("provider_code"),
        plugin_id: row.get("plugin_id"),
        plugin_version: row.get("plugin_version"),
        contribution_code: row.get("contribution_code"),
        node_shell: row.get("node_shell"),
        category: row.get("category"),
        title: row.get("title"),
        description: row.get("description"),
        icon: row.get("icon"),
        schema_ui: row.get("schema_ui"),
        schema_version: row.get("schema_version"),
        output_schema: row.get("output_schema"),
        required_auth: row.get("required_auth"),
        visibility: row.get("visibility"),
        experimental: row.get("experimental"),
        dependency_installation_kind: row.get("dependency_installation_kind"),
        dependency_plugin_version_range: row.get("dependency_plugin_version_range"),
        dependency_status: dependency_status.as_str().to_string(),
    })
}

#[async_trait]
impl NodeContributionRepository for PgControlPlaneStore {
    async fn replace_installation_node_contributions(
        &self,
        input: &ReplaceInstallationNodeContributionsInput,
    ) -> Result<()> {
        let mut tx = self.pool().begin().await?;
        sqlx::query(
            r#"
            delete from node_contribution_registry
            where installation_id = $1
            "#,
        )
        .bind(input.installation_id)
        .execute(&mut *tx)
        .await?;

        for entry in &input.entries {
            sqlx::query(
                r#"
                insert into node_contribution_registry (
                    id,
                    installation_id,
                    provider_code,
                    plugin_id,
                    plugin_version,
                    contribution_code,
                    node_shell,
                    category,
                    title,
                    description,
                    icon,
                    schema_ui,
                    schema_version,
                    output_schema,
                    required_auth,
                    visibility,
                    experimental,
                    dependency_installation_kind,
                    dependency_plugin_version_range
                ) values (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                    $18, $19
                )
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(input.installation_id)
            .bind(&input.provider_code)
            .bind(&input.plugin_id)
            .bind(&input.plugin_version)
            .bind(&entry.contribution_code)
            .bind(&entry.node_shell)
            .bind(&entry.category)
            .bind(&entry.title)
            .bind(&entry.description)
            .bind(&entry.icon)
            .bind(&entry.schema_ui)
            .bind(&entry.schema_version)
            .bind(&entry.output_schema)
            .bind(serde_json::to_value(&entry.required_auth)?)
            .bind(&entry.visibility)
            .bind(entry.experimental)
            .bind(&entry.dependency_installation_kind)
            .bind(&entry.dependency_plugin_version_range)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn list_node_contributions(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::NodeContributionRegistryEntry>> {
        let rows = sqlx::query(
            r#"
            select
                reg.installation_id,
                reg.provider_code,
                reg.plugin_id,
                reg.plugin_version,
                reg.contribution_code,
                reg.node_shell,
                reg.category,
                reg.title,
                reg.description,
                reg.icon,
                reg.schema_ui,
                reg.schema_version,
                reg.output_schema,
                reg.required_auth,
                reg.visibility,
                reg.experimental,
                reg.dependency_installation_kind,
                reg.dependency_plugin_version_range,
                assigned.id as assigned_installation_id,
                assigned.plugin_version as assigned_plugin_version,
                assigned.enabled as assigned_enabled
            from node_contribution_registry reg
            left join plugin_assignments pa
                on pa.workspace_id = $1
               and pa.provider_code = reg.provider_code
            left join plugin_installations assigned
                on assigned.id = pa.installation_id
            order by reg.category asc, reg.title asc, reg.contribution_code asc
            "#,
        )
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        rows.into_iter()
            .map(|row| {
                let assigned_installation_id: Option<Uuid> = row.get("assigned_installation_id");
                let assigned_enabled: Option<bool> = row.get("assigned_enabled");
                let assigned_plugin_version: Option<String> = row.get("assigned_plugin_version");
                let dependency_status = if assigned_installation_id.is_none() {
                    NodeContributionDependencyStatus::MissingPlugin
                } else if assigned_enabled == Some(false) {
                    NodeContributionDependencyStatus::DisabledPlugin
                } else if !version_matches_range(
                    assigned_plugin_version.as_deref().unwrap_or_default(),
                    row.get("dependency_plugin_version_range"),
                ) {
                    NodeContributionDependencyStatus::VersionMismatch
                } else {
                    NodeContributionDependencyStatus::Ready
                };
                map_registry_row(row, dependency_status)
            })
            .collect()
    }
}

fn version_matches_range(version: &str, range: &str) -> bool {
    let trimmed = range.trim();
    if trimmed.is_empty() {
        return true;
    }

    trimmed
        .split(',')
        .map(str::trim)
        .filter(|constraint| !constraint.is_empty())
        .all(|constraint| {
            let (operator, expected) = if let Some(value) = constraint.strip_prefix(">=") {
                (">=", value)
            } else if let Some(value) = constraint.strip_prefix("<=") {
                ("<=", value)
            } else if let Some(value) = constraint.strip_prefix('>') {
                (">", value)
            } else if let Some(value) = constraint.strip_prefix('<') {
                ("<", value)
            } else if let Some(value) = constraint.strip_prefix('=') {
                ("=", value)
            } else {
                ("=", constraint)
            };
            let ordering = compare_plugin_versions(version, expected.trim());
            match operator {
                ">=" => ordering.is_ge(),
                "<=" => ordering.is_le(),
                ">" => ordering.is_gt(),
                "<" => ordering.is_lt(),
                "=" => ordering.is_eq(),
                _ => false,
            }
        })
}

fn compare_plugin_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let mut left_parts = left.split('.');
    let mut right_parts = right.split('.');

    loop {
        match (left_parts.next(), right_parts.next()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (Some(left_part), Some(right_part)) => {
                let ordering = match (left_part.parse::<u64>(), right_part.parse::<u64>()) {
                    (Ok(left_number), Ok(right_number)) => left_number.cmp(&right_number),
                    _ => left_part.cmp(right_part),
                };

                if ordering != std::cmp::Ordering::Equal {
                    return ordering;
                }
            }
            (Some(left_part), None) => match left_part.parse::<u64>() {
                Ok(0) => continue,
                Ok(_) | Err(_) => return std::cmp::Ordering::Greater,
            },
            (None, Some(right_part)) => match right_part.parse::<u64>() {
                Ok(0) => continue,
                Ok(_) | Err(_) => return std::cmp::Ordering::Less,
            },
        }
    }
}
