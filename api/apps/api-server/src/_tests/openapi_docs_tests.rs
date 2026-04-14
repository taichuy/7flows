use serde_json::json;

use api_server::openapi_docs::build_api_docs_registry;

#[test]
fn registry_requires_operation_id_for_every_operation() {
    let canonical = json!({
        "openapi": "3.1.0",
        "info": { "title": "T", "version": "1" },
        "paths": { "/demo": { "get": { "summary": "missing op id" } } }
    });

    let error = build_api_docs_registry(canonical).expect_err("missing operationId must fail");
    assert!(error.to_string().contains("operationId"));
}

#[test]
fn registry_rejects_duplicate_operation_ids() {
    let canonical = json!({
        "openapi": "3.1.0",
        "info": { "title": "T", "version": "1" },
        "paths": {
            "/demo/a": { "get": { "operationId": "dup" } },
            "/demo/b": { "post": { "operationId": "dup" } }
        }
    });

    let error = build_api_docs_registry(canonical).expect_err("duplicate operationId must fail");
    assert!(error.to_string().contains("duplicate"));
}

#[test]
fn operation_spec_builder_keeps_refs_closed() {
    let registry = api_server::openapi_docs::build_default_api_docs_registry().unwrap();
    let spec = registry.operation_spec("patch_me").unwrap();

    assert_eq!(spec["paths"].as_object().unwrap().len(), 1);
    assert!(spec["paths"]["/api/console/me"]["patch"].is_object());
    assert!(spec["components"].is_object());
}
