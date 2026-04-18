use anyhow::{anyhow, Result};
use domain::{
    ModelProviderCatalogCacheRecord, ModelProviderCatalogRefreshStatus,
    ModelProviderCatalogSource, ModelProviderDiscoveryMode, ModelProviderInstanceRecord,
    ModelProviderInstanceStatus, ModelProviderSecretRecord, ModelProviderValidationStatus,
};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredModelProviderInstanceRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: Uuid,
    pub provider_code: String,
    pub protocol: String,
    pub display_name: String,
    pub status: String,
    pub config_json: serde_json::Value,
    pub last_validated_at: Option<OffsetDateTime>,
    pub last_validation_status: Option<String>,
    pub last_validation_message: Option<String>,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct StoredModelProviderCatalogCacheRow {
    pub provider_instance_id: Uuid,
    pub model_discovery_mode: String,
    pub refresh_status: String,
    pub source: String,
    pub models_json: serde_json::Value,
    pub last_error_message: Option<String>,
    pub refreshed_at: Option<OffsetDateTime>,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct StoredModelProviderSecretRow {
    pub provider_instance_id: Uuid,
    pub encrypted_secret_json: serde_json::Value,
    pub secret_version: i32,
    pub updated_at: OffsetDateTime,
}

pub struct PgModelProviderMapper;

impl PgModelProviderMapper {
    pub fn to_instance_record(row: StoredModelProviderInstanceRow) -> Result<ModelProviderInstanceRecord> {
        Ok(ModelProviderInstanceRecord {
            id: row.id,
            workspace_id: row.workspace_id,
            installation_id: row.installation_id,
            provider_code: row.provider_code,
            protocol: row.protocol,
            display_name: row.display_name,
            status: parse_instance_status(&row.status)?,
            config_json: row.config_json,
            last_validated_at: row.last_validated_at,
            last_validation_status: row
                .last_validation_status
                .as_deref()
                .map(parse_validation_status)
                .transpose()?,
            last_validation_message: row.last_validation_message,
            created_by: row.created_by,
            updated_by: row.updated_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    pub fn to_catalog_cache_record(
        row: StoredModelProviderCatalogCacheRow,
    ) -> Result<ModelProviderCatalogCacheRecord> {
        Ok(ModelProviderCatalogCacheRecord {
            provider_instance_id: row.provider_instance_id,
            model_discovery_mode: parse_discovery_mode(&row.model_discovery_mode)?,
            refresh_status: parse_refresh_status(&row.refresh_status)?,
            source: parse_catalog_source(&row.source)?,
            models_json: row.models_json,
            last_error_message: row.last_error_message,
            refreshed_at: row.refreshed_at,
            updated_at: row.updated_at,
        })
    }

    pub fn to_secret_record(row: StoredModelProviderSecretRow) -> Result<ModelProviderSecretRecord> {
        Ok(ModelProviderSecretRecord {
            provider_instance_id: row.provider_instance_id,
            encrypted_secret_json: row.encrypted_secret_json,
            secret_version: row.secret_version,
            updated_at: row.updated_at,
        })
    }
}

pub fn parse_instance_status(value: &str) -> Result<ModelProviderInstanceStatus> {
    match value {
        "draft" => Ok(ModelProviderInstanceStatus::Draft),
        "ready" => Ok(ModelProviderInstanceStatus::Ready),
        "invalid" => Ok(ModelProviderInstanceStatus::Invalid),
        "disabled" => Ok(ModelProviderInstanceStatus::Disabled),
        _ => Err(anyhow!("unknown model provider instance status: {value}")),
    }
}

pub fn parse_validation_status(value: &str) -> Result<ModelProviderValidationStatus> {
    match value {
        "succeeded" => Ok(ModelProviderValidationStatus::Succeeded),
        "failed" => Ok(ModelProviderValidationStatus::Failed),
        _ => Err(anyhow!("unknown model provider validation status: {value}")),
    }
}

pub fn parse_discovery_mode(value: &str) -> Result<ModelProviderDiscoveryMode> {
    match value {
        "static" => Ok(ModelProviderDiscoveryMode::Static),
        "dynamic" => Ok(ModelProviderDiscoveryMode::Dynamic),
        "hybrid" => Ok(ModelProviderDiscoveryMode::Hybrid),
        _ => Err(anyhow!("unknown model provider discovery mode: {value}")),
    }
}

pub fn parse_refresh_status(value: &str) -> Result<ModelProviderCatalogRefreshStatus> {
    match value {
        "idle" => Ok(ModelProviderCatalogRefreshStatus::Idle),
        "refreshing" => Ok(ModelProviderCatalogRefreshStatus::Refreshing),
        "ready" => Ok(ModelProviderCatalogRefreshStatus::Ready),
        "failed" => Ok(ModelProviderCatalogRefreshStatus::Failed),
        _ => Err(anyhow!("unknown model provider refresh status: {value}")),
    }
}

pub fn parse_catalog_source(value: &str) -> Result<ModelProviderCatalogSource> {
    match value {
        "static" => Ok(ModelProviderCatalogSource::Static),
        "dynamic" => Ok(ModelProviderCatalogSource::Dynamic),
        "hybrid" => Ok(ModelProviderCatalogSource::Hybrid),
        _ => Err(anyhow!("unknown model provider catalog source: {value}")),
    }
}
