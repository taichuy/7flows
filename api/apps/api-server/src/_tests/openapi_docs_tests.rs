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

#[test]
fn registry_groups_catalog_by_api_prefix_and_singletons_for_non_api_paths() {
    let canonical = json!({
        "openapi": "3.1.0",
        "info": { "title": "T", "version": "1" },
        "paths": {
            "/api/console/me": {
                "patch": { "operationId": "patch_me", "summary": "Patch me" }
            },
            "/api/console/members": {
                "get": { "operationId": "list_members", "summary": "List members" }
            },
            "/api/runtime/jobs": {
                "get": { "operationId": "list_runtime_jobs", "summary": "List runtime jobs" }
            },
            "/health": {
                "get": { "operationId": "health", "summary": "Health check" }
            }
        }
    });

    let registry = build_api_docs_registry(canonical).expect("catalog should build");
    let catalog = registry.catalog();

    assert_eq!(catalog.categories.len(), 3);
    assert_eq!(catalog.categories[0].id, "console");
    assert_eq!(catalog.categories[0].operation_count, 2);
    assert_eq!(catalog.categories[1].id, "runtime");
    assert_eq!(catalog.categories[1].operation_count, 1);
    assert_eq!(catalog.categories[2].operation_count, 1);

    let singleton_category = registry.category_operations("single:health").unwrap();
    assert_eq!(singleton_category.operations.len(), 1);
    assert_eq!(singleton_category.operations[0].id, "health");
}
