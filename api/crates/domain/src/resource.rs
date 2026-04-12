use uuid::Uuid;

pub fn runtime_model_resource_code(model_id: Uuid) -> String {
    if model_id.is_nil() {
        "models.runtime.nil".to_string()
    } else {
        format!("models.runtime.{model_id}")
    }
}
