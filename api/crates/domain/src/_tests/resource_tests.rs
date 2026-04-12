use domain::runtime_model_resource_code;
use uuid::Uuid;

#[test]
fn runtime_model_resource_code_uses_nil_alias_for_nil_uuid() {
    assert_eq!(
        runtime_model_resource_code(Uuid::nil()),
        "models.runtime.nil"
    );
}
