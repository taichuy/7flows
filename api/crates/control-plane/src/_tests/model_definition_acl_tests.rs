use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use control_plane::{
    model_definition::ModelDefinitionService,
    ports::{
        AddModelFieldInput, CreateModelDefinitionInput, ModelDefinitionRepository,
        UpdateModelDefinitionInput, UpdateModelFieldInput,
    },
};
use domain::{
    ActorContext, AuditLogRecord, DataModelScopeKind, ModelDefinitionRecord, ModelFieldRecord,
};
use uuid::Uuid;

#[derive(Clone)]
struct AclTestRepository {
    actors: Arc<Mutex<HashMap<Uuid, ActorContext>>>,
    models: Arc<Mutex<HashMap<Uuid, ModelDefinitionRecord>>>,
}

impl AclTestRepository {
    fn new(actor: ActorContext, model: ModelDefinitionRecord) -> Self {
        Self {
            actors: Arc::new(Mutex::new(HashMap::from([(actor.user_id, actor)]))),
            models: Arc::new(Mutex::new(HashMap::from([(model.id, model)]))),
        }
    }
}

#[async_trait]
impl ModelDefinitionRepository for AclTestRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        self.actors
            .lock()
            .expect("actor lock poisoned")
            .get(&actor_user_id)
            .cloned()
            .ok_or_else(|| anyhow!("missing actor"))
    }

    async fn list_model_definitions(
        &self,
        _workspace_id: Uuid,
    ) -> Result<Vec<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .values()
            .cloned()
            .collect())
    }

    async fn get_model_definition(
        &self,
        _workspace_id: Uuid,
        model_id: Uuid,
    ) -> Result<Option<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .get(&model_id)
            .cloned())
    }

    async fn create_model_definition(
        &self,
        _input: &CreateModelDefinitionInput,
    ) -> Result<ModelDefinitionRecord> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn update_model_definition(
        &self,
        _input: &UpdateModelDefinitionInput,
    ) -> Result<ModelDefinitionRecord> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn add_model_field(&self, _input: &AddModelFieldInput) -> Result<ModelFieldRecord> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn update_model_field(&self, _input: &UpdateModelFieldInput) -> Result<ModelFieldRecord> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn delete_model_definition(&self, _actor_user_id: Uuid, _model_id: Uuid) -> Result<()> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn delete_model_field(
        &self,
        _actor_user_id: Uuid,
        _model_id: Uuid,
        _field_id: Uuid,
    ) -> Result<()> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        _model_id: Uuid,
    ) -> Result<ModelDefinitionRecord> {
        unimplemented!("not needed for ACL detail tests")
    }

    async fn append_audit_log(&self, _event: &AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

fn sample_model(model_id: Uuid) -> ModelDefinitionRecord {
    ModelDefinitionRecord {
        id: model_id,
        scope_kind: DataModelScopeKind::Team,
        scope_id: Uuid::now_v7(),
        code: "orders".to_string(),
        title: "Orders".to_string(),
        physical_table_name: "rtm_team_orders".to_string(),
        acl_namespace: "state_model.orders".to_string(),
        audit_namespace: "audit.state_model.orders".to_string(),
        fields: vec![],
        availability_status: domain::MetadataAvailabilityStatus::Available,
    }
}

#[tokio::test]
async fn get_model_requires_state_model_visibility() {
    let actor_user_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let service = ModelDefinitionService::new(AclTestRepository::new(
        ActorContext::scoped(
            actor_user_id,
            Uuid::now_v7(),
            "viewer",
            Vec::<String>::new(),
        ),
        sample_model(model_id),
    ));

    let error = service
        .get_model(actor_user_id, model_id)
        .await
        .unwrap_err();

    assert!(error
        .to_string()
        .contains("permission denied: permission_denied"));
}

#[tokio::test]
async fn state_model_own_is_treated_as_scope_shared_read() {
    let actor_user_id = Uuid::now_v7();
    let model_id = Uuid::now_v7();
    let service = ModelDefinitionService::new(AclTestRepository::new(
        ActorContext::scoped(
            actor_user_id,
            Uuid::now_v7(),
            "viewer",
            ["state_model.view.own".to_string()],
        ),
        sample_model(model_id),
    ));

    let model = service.get_model(actor_user_id, model_id).await.unwrap();

    assert_eq!(model.id, model_id);
    assert_eq!(model.code, "orders");
}
