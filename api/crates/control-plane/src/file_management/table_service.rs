use anyhow::Result;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{FileManagementRepository, UpdateFileStorageBindingInput},
};

pub struct BindFileTableStorageCommand {
    pub actor_user_id: Uuid,
    pub file_table_id: Uuid,
    pub bound_storage_id: Uuid,
}

pub struct FileTableService<R> {
    repository: R,
}

impl<R> FileTableService<R>
where
    R: FileManagementRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn bind_storage(
        &self,
        command: BindFileTableStorageCommand,
    ) -> Result<domain::FileTableRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        if !actor.is_root {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        self.repository
            .update_file_table_binding(&UpdateFileStorageBindingInput {
                actor_user_id: command.actor_user_id,
                file_table_id: command.file_table_id,
                bound_storage_id: command.bound_storage_id,
            })
            .await
    }
}
