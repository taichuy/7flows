use anyhow::{anyhow, bail, Result};
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{
        CreateModelProviderInstanceInput, ModelProviderRepository,
        UpdateModelProviderInstanceInput, UpsertModelProviderCatalogCacheInput,
        UpsertModelProviderSecretInput,
    },
};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::model_provider_mapper::{
        PgModelProviderMapper, StoredModelProviderCatalogCacheRow, StoredModelProviderInstanceRow,
        StoredModelProviderSecretRow,
    },
    repositories::PgControlPlaneStore,
};

fn map_instance(row: sqlx::postgres::PgRow) -> Result<domain::ModelProviderInstanceRecord> {
    PgModelProviderMapper::to_instance_record(StoredModelProviderInstanceRow {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        installation_id: row.get("installation_id"),
        provider_code: row.get("provider_code"),
        protocol: row.get("protocol"),
        display_name: row.get("display_name"),
        status: row.get("status"),
        config_json: row.get("config_json"),
        last_validated_at: row.get("last_validated_at"),
        last_validation_status: row.get("last_validation_status"),
        last_validation_message: row.get("last_validation_message"),
        created_by: row.get("created_by"),
        updated_by: row.get("updated_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_catalog_cache(row: sqlx::postgres::PgRow) -> Result<domain::ModelProviderCatalogCacheRecord> {
    PgModelProviderMapper::to_catalog_cache_record(StoredModelProviderCatalogCacheRow {
        provider_instance_id: row.get("provider_instance_id"),
        model_discovery_mode: row.get("model_discovery_mode"),
        refresh_status: row.get("refresh_status"),
        source: row.get("source"),
        models_json: row.get("models_json"),
        last_error_message: row.get("last_error_message"),
        refreshed_at: row.get("refreshed_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_secret(row: sqlx::postgres::PgRow) -> Result<domain::ModelProviderSecretRecord> {
    PgModelProviderMapper::to_secret_record(StoredModelProviderSecretRow {
        provider_instance_id: row.get("provider_instance_id"),
        encrypted_secret_json: row.get("encrypted_secret_json"),
        secret_version: row.get("secret_version"),
        updated_at: row.get("updated_at"),
    })
}

#[async_trait]
impl ModelProviderRepository for PgControlPlaneStore {
    async fn create_instance(
        &self,
        input: &CreateModelProviderInstanceInput,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        let row = sqlx::query(
            r#"
            insert into model_provider_instances (
                id,
                workspace_id,
                installation_id,
                provider_code,
                protocol,
                display_name,
                status,
                config_json,
                last_validation_status,
                last_validation_message,
                created_by,
                updated_by
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
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
        .bind(input.instance_id)
        .bind(input.workspace_id)
        .bind(input.installation_id)
        .bind(&input.provider_code)
        .bind(&input.protocol)
        .bind(&input.display_name)
        .bind(input.status.as_str())
        .bind(&input.config_json)
        .bind(input.last_validation_status.map(|value| value.as_str()))
        .bind(input.last_validation_message.as_deref())
        .bind(input.created_by)
        .fetch_one(self.pool())
        .await?;

        map_instance(row)
    }

    async fn update_instance(
        &self,
        input: &UpdateModelProviderInstanceInput,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        let row = sqlx::query(
            r#"
            update model_provider_instances
            set
                display_name = $3,
                status = $4,
                config_json = $5,
                last_validated_at = $6,
                last_validation_status = $7,
                last_validation_message = $8,
                updated_by = $9,
                updated_at = now()
            where workspace_id = $1
              and id = $2
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
        .bind(input.instance_id)
        .bind(&input.display_name)
        .bind(input.status.as_str())
        .bind(&input.config_json)
        .bind(input.last_validated_at)
        .bind(input.last_validation_status.map(|value| value.as_str()))
        .bind(input.last_validation_message.as_deref())
        .bind(input.updated_by)
        .fetch_optional(self.pool())
        .await?;

        match row {
            Some(row) => map_instance(row),
            None => bail!(ControlPlaneError::NotFound("model_provider_instance")),
        }
    }

    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderInstanceRecord>> {
        let row = sqlx::query(
            r#"
            select
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
            from model_provider_instances
            where workspace_id = $1
              and id = $2
            "#,
        )
        .bind(workspace_id)
        .bind(instance_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(map_instance).transpose()
    }

    async fn list_instances(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelProviderInstanceRecord>> {
        let rows = sqlx::query(
            r#"
            select
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
            from model_provider_instances
            where workspace_id = $1
            order by updated_at desc, id desc
            "#,
        )
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_instance).collect()
    }

    async fn upsert_catalog_cache(
        &self,
        input: &UpsertModelProviderCatalogCacheInput,
    ) -> Result<domain::ModelProviderCatalogCacheRecord> {
        let row = sqlx::query(
            r#"
            insert into provider_instance_model_catalog_cache (
                provider_instance_id,
                model_discovery_mode,
                refresh_status,
                source,
                models_json,
                last_error_message,
                refreshed_at
            ) values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (provider_instance_id) do update
            set
                model_discovery_mode = excluded.model_discovery_mode,
                refresh_status = excluded.refresh_status,
                source = excluded.source,
                models_json = excluded.models_json,
                last_error_message = excluded.last_error_message,
                refreshed_at = excluded.refreshed_at,
                updated_at = now()
            returning
                provider_instance_id,
                model_discovery_mode,
                refresh_status,
                source,
                models_json,
                last_error_message,
                refreshed_at,
                updated_at
            "#,
        )
        .bind(input.provider_instance_id)
        .bind(input.model_discovery_mode.as_str())
        .bind(input.refresh_status.as_str())
        .bind(input.source.as_str())
        .bind(&input.models_json)
        .bind(input.last_error_message.as_deref())
        .bind(input.refreshed_at)
        .fetch_one(self.pool())
        .await?;

        map_catalog_cache(row)
    }

    async fn get_catalog_cache(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderCatalogCacheRecord>> {
        let row = sqlx::query(
            r#"
            select
                provider_instance_id,
                model_discovery_mode,
                refresh_status,
                source,
                models_json,
                last_error_message,
                refreshed_at,
                updated_at
            from provider_instance_model_catalog_cache
            where provider_instance_id = $1
            "#,
        )
        .bind(provider_instance_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(map_catalog_cache).transpose()
    }

    async fn upsert_secret(
        &self,
        input: &UpsertModelProviderSecretInput,
    ) -> Result<domain::ModelProviderSecretRecord> {
        let encrypted_secret_json =
            encrypt_secret_json(&input.plaintext_secret_json, &input.master_key)?;
        let row = sqlx::query(
            r#"
            insert into model_provider_instance_secrets (
                provider_instance_id,
                encrypted_secret_json,
                secret_version
            ) values ($1, $2, $3)
            on conflict (provider_instance_id) do update
            set
                encrypted_secret_json = excluded.encrypted_secret_json,
                secret_version = excluded.secret_version,
                updated_at = now()
            returning provider_instance_id, encrypted_secret_json, secret_version, updated_at
            "#,
        )
        .bind(input.provider_instance_id)
        .bind(&encrypted_secret_json)
        .bind(input.secret_version)
        .fetch_one(self.pool())
        .await?;

        map_secret(row)
    }

    async fn get_secret_json(
        &self,
        provider_instance_id: Uuid,
        master_key: &str,
    ) -> Result<Option<serde_json::Value>> {
        let row = sqlx::query(
            r#"
            select provider_instance_id, encrypted_secret_json, secret_version, updated_at
            from model_provider_instance_secrets
            where provider_instance_id = $1
            "#,
        )
        .bind(provider_instance_id)
        .fetch_optional(self.pool())
        .await?;

        row.map(|row| -> Result<Value> {
            let record = map_secret(row)?;
            decrypt_secret_json(&record.encrypted_secret_json, master_key)
        })
        .transpose()
    }
}

fn encrypt_secret_json(secret_json: &Value, master_key: &str) -> Result<Value> {
    if master_key.is_empty() {
        bail!(ControlPlaneError::InvalidInput("provider_secret_master_key"));
    }

    let plaintext = serde_json::to_vec(secret_json)?;
    Ok(json!({
        "algorithm": "xor_v1",
        "ciphertext": xor_hex(&plaintext, master_key.as_bytes()),
    }))
}

fn decrypt_secret_json(encrypted_secret_json: &Value, master_key: &str) -> Result<Value> {
    if master_key.is_empty() {
        bail!(ControlPlaneError::InvalidInput("provider_secret_master_key"));
    }

    let algorithm = encrypted_secret_json
        .get("algorithm")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing secret encryption algorithm"))?;
    if algorithm != "xor_v1" {
        bail!(anyhow!("unsupported secret encryption algorithm: {algorithm}"));
    }
    let ciphertext = encrypted_secret_json
        .get("ciphertext")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing secret ciphertext"))?;
    let plaintext = xor_hex_decode(ciphertext, master_key.as_bytes())?;
    Ok(serde_json::from_slice(&plaintext)?)
}

fn xor_hex(bytes: &[u8], key: &[u8]) -> String {
    bytes.iter()
        .enumerate()
        .map(|(index, byte)| format!("{:02x}", byte ^ key[index % key.len()]))
        .collect::<String>()
}

fn xor_hex_decode(ciphertext: &str, key: &[u8]) -> Result<Vec<u8>> {
    if ciphertext.len() % 2 != 0 {
        bail!(anyhow!("invalid ciphertext length"));
    }

    let mut encrypted = Vec::with_capacity(ciphertext.len() / 2);
    let mut chars = ciphertext.as_bytes().chunks_exact(2);
    for chunk in &mut chars {
        let pair = std::str::from_utf8(chunk)?;
        encrypted.push(u8::from_str_radix(pair, 16)?);
    }

    Ok(encrypted
        .into_iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()])
        .collect())
}
