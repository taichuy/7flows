use domain::runtime_model_resource_code;

#[test]
fn model_definition_repository_uses_model_code_for_runtime_resource_code() {
    assert_eq!(
        runtime_model_resource_code("orders"),
        "models.runtime.orders"
    );
}
