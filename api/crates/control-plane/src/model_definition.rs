use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use access_control::ensure_permission;
use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{CreateModelDefinitionInput, ModelDefinitionRepository},
};

pub struct CreateModelDefinitionCommand {
    pub actor_user_id: Uuid,
    pub code: String,
    pub name: String,
}

pub struct PublishModelCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
}

pub struct PublishedModel {
    pub model: domain::ModelDefinitionRecord,
    pub resource: runtime_core::resource_descriptor::ResourceDescriptor,
}

pub struct ModelDefinitionService<R> {
    repository: R,
}

impl<R> ModelDefinitionService<R>
where
    R: ModelDefinitionRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_models(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_permission(&actor, "state_model.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository.list_model_definitions().await
    }

    pub async fn create_model(
        &self,
        command: CreateModelDefinitionCommand,
    ) -> Result<domain::ModelDefinitionRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "state_model.create.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let model = self
            .repository
            .create_model_definition(&CreateModelDefinitionInput {
                actor_user_id: command.actor_user_id,
                code: command.code,
                name: command.name,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "state_model",
                Some(model.id),
                "state_model.created",
                serde_json::json!({ "code": model.code }),
            ))
            .await?;

        Ok(model)
    }

    pub async fn publish_model(&self, command: PublishModelCommand) -> Result<PublishedModel> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "state_model.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let model = self
            .repository
            .publish_model_definition(command.actor_user_id, command.model_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.published",
                serde_json::json!({}),
            ))
            .await?;

        Ok(PublishedModel {
            model,
            resource: runtime_core::resource_descriptor::ResourceDescriptor::runtime_model(
                command.model_id,
            ),
        })
    }
}

#[derive(Default, Clone)]
pub struct InMemoryModelDefinitionRepository {
    models: Arc<Mutex<HashMap<Uuid, domain::ModelDefinitionRecord>>>,
}

impl InMemoryModelDefinitionRepository {
    fn upsert_placeholder(&self, model_id: Uuid) -> domain::ModelDefinitionRecord {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let entry = models
            .entry(model_id)
            .or_insert_with(|| domain::ModelDefinitionRecord {
                id: model_id,
                code: if model_id.is_nil() {
                    "nil".to_string()
                } else {
                    format!("model-{model_id}")
                },
                name: "Runtime Model".to_string(),
                status: domain::ModelDefinitionStatus::Draft,
                published_version: None,
            });
        entry.clone()
    }
}

#[async_trait]
impl ModelDefinitionRepository for InMemoryModelDefinitionRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        Ok(domain::ActorContext::root(
            actor_user_id,
            Uuid::nil(),
            "root",
        ))
    }

    async fn list_model_definitions(&self) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let models = self.models.lock().expect("in-memory model lock poisoned");
        Ok(models.values().cloned().collect())
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let model = domain::ModelDefinitionRecord {
            id: Uuid::now_v7(),
            code: input.code.clone(),
            name: input.name.clone(),
            status: domain::ModelDefinitionStatus::Draft,
            published_version: None,
        };
        self.models
            .lock()
            .expect("in-memory model lock poisoned")
            .insert(model.id, model.clone());
        Ok(model)
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<domain::ModelDefinitionRecord> {
        let existing = self.upsert_placeholder(model_id);
        let published = domain::ModelDefinitionRecord {
            status: domain::ModelDefinitionStatus::Published,
            published_version: Some(existing.published_version.unwrap_or(0) + 1),
            ..existing
        };
        self.models
            .lock()
            .expect("in-memory model lock poisoned")
            .insert(model_id, published.clone());
        Ok(published)
    }

    async fn append_audit_log(&self, _event: &domain::AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

impl ModelDefinitionService<InMemoryModelDefinitionRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryModelDefinitionRepository::default())
    }
}
