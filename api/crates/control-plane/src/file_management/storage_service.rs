use anyhow::Result;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{CreateFileStorageInput, FileManagementRepository},
};

pub struct CreateFileStorageCommand {
    pub actor_user_id: Uuid,
    pub code: String,
    pub title: String,
    pub driver_type: String,
    pub enabled: bool,
    pub is_default: bool,
    pub config_json: serde_json::Value,
    pub rule_json: serde_json::Value,
}

pub struct FileStorageService<R> {
    repository: R,
}

impl<R> FileStorageService<R>
where
    R: FileManagementRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create_storage(
        &self,
        command: CreateFileStorageCommand,
    ) -> Result<domain::FileStorageRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        if !actor.is_root {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        self.repository
            .create_file_storage(&CreateFileStorageInput {
                storage_id: Uuid::now_v7(),
                actor_user_id: command.actor_user_id,
                code: command.code,
                title: command.title,
                driver_type: command.driver_type,
                enabled: command.enabled,
                is_default: command.is_default,
                config_json: command.config_json,
                rule_json: command.rule_json,
            })
            .await
    }
}
