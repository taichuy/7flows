use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use crate::model_metadata::ModelMetadata;

#[derive(Debug, Default, Clone)]
pub struct RuntimeModelRegistry {
    models: Arc<RwLock<HashMap<String, Vec<ModelMetadata>>>>,
}

impl RuntimeModelRegistry {
    pub fn rebuild(&self, models: Vec<ModelMetadata>) {
        let mut guard = self.models.write().expect("runtime registry poisoned");
        let mut grouped = HashMap::<String, Vec<ModelMetadata>>::new();
        for model in models {
            grouped
                .entry(model.model_code.clone())
                .or_default()
                .push(model);
        }
        *guard = grouped;
    }

    pub fn upsert(&self, model: ModelMetadata) {
        let mut guard = self.models.write().expect("runtime registry poisoned");
        let models = guard.entry(model.model_code.clone()).or_default();
        if let Some(existing) = models.iter_mut().find(|existing| {
            existing.scope_kind == model.scope_kind && existing.scope_id == model.scope_id
        }) {
            *existing = model;
        } else {
            models.push(model);
        }
    }

    pub fn remove(
        &self,
        scope_kind: domain::DataModelScopeKind,
        scope_id: uuid::Uuid,
        model_code: &str,
    ) {
        let mut guard = self.models.write().expect("runtime registry poisoned");
        if let Some(models) = guard.get_mut(model_code) {
            models.retain(|model| !(model.scope_kind == scope_kind && model.scope_id == scope_id));
            if models.is_empty() {
                guard.remove(model_code);
            }
        }
    }

    pub fn get(
        &self,
        scope_kind: domain::DataModelScopeKind,
        scope_id: uuid::Uuid,
        model_code: &str,
    ) -> Option<ModelMetadata> {
        self.models
            .read()
            .expect("runtime registry poisoned")
            .get(model_code)
            .and_then(|models| {
                models
                    .iter()
                    .find(|model| model.scope_kind == scope_kind && model.scope_id == scope_id)
                    .cloned()
            })
    }
}
