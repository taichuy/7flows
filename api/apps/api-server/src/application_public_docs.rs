use control_plane::application_public_api::publications::ApplicationPublicationVersionRecord;
use domain::ApplicationRecord;
use serde_json::{json, Value};

use crate::openapi_docs::{
    DocsCatalog, DocsCatalogCategory, DocsCatalogCategoryOperations, DocsCatalogOperation,
};

const NATIVE_CATEGORY_ID: &str = "application-native-api";
const OPENAI_CATEGORY_ID: &str = "openai-compatible-api";
const ANTHROPIC_CATEGORY_ID: &str = "anthropic-compatible-api";

#[derive(Debug, Clone)]
pub struct ApplicationPublicDocsContext {
    pub application: ApplicationRecord,
    pub active_publication: Option<ApplicationPublicationVersionRecord>,
}

#[derive(Debug, Clone)]
struct PublicOperation {
    id: &'static str,
    method: &'static str,
    path: &'static str,
    summary: &'static str,
    description: &'static str,
    category_id: &'static str,
    category_label: &'static str,
    request_example: Value,
}

pub fn build_application_public_docs_catalog(
    _context: &ApplicationPublicDocsContext,
) -> DocsCatalog {
    let operations = public_operations();
    let categories = [
        (NATIVE_CATEGORY_ID, "Application Native API"),
        (OPENAI_CATEGORY_ID, "OpenAI Compatible API"),
        (ANTHROPIC_CATEGORY_ID, "Anthropic Compatible API"),
    ]
    .into_iter()
    .map(|(id, label)| DocsCatalogCategory {
        id: id.to_string(),
        label: label.to_string(),
        operation_count: operations
            .iter()
            .filter(|operation| operation.category_id == id)
            .count(),
    })
    .collect();

    DocsCatalog {
        title: "Application Public API".to_string(),
        version: "v1".to_string(),
        categories,
    }
}

pub fn build_application_public_docs_category_operations(
    _context: &ApplicationPublicDocsContext,
    category_id: &str,
) -> Option<DocsCatalogCategoryOperations> {
    let operations = public_operations()
        .into_iter()
        .filter(|operation| operation.category_id == category_id)
        .map(to_catalog_operation)
        .collect::<Vec<_>>();
    if operations.is_empty() {
        return None;
    }
    let label = category_label(category_id)?;
    Some(DocsCatalogCategoryOperations {
        id: category_id.to_string(),
        label: label.to_string(),
        operations,
    })
}

pub fn build_application_public_docs_category_spec(
    context: &ApplicationPublicDocsContext,
    category_id: &str,
) -> Option<Value> {
    let operations = public_operations()
        .into_iter()
        .filter(|operation| operation.category_id == category_id)
        .collect::<Vec<_>>();
    if operations.is_empty() {
        return None;
    }
    Some(openapi_spec(context, operations))
}

pub fn build_application_public_docs_operation_spec(
    context: &ApplicationPublicDocsContext,
    operation_id: &str,
) -> Option<Value> {
    public_operations()
        .into_iter()
        .find(|operation| operation.id == operation_id)
        .map(|operation| openapi_spec(context, vec![operation]))
}

fn category_label(category_id: &str) -> Option<&'static str> {
    match category_id {
        NATIVE_CATEGORY_ID => Some("Application Native API"),
        OPENAI_CATEGORY_ID => Some("OpenAI Compatible API"),
        ANTHROPIC_CATEGORY_ID => Some("Anthropic Compatible API"),
        _ => None,
    }
}

fn to_catalog_operation(operation: PublicOperation) -> DocsCatalogOperation {
    DocsCatalogOperation {
        id: operation.id.to_string(),
        method: operation.method.to_string(),
        path: operation.path.to_string(),
        summary: Some(operation.summary.to_string()),
        description: Some(operation.description.to_string()),
        tags: vec![operation.category_label.to_string()],
        group: operation.category_label.to_string(),
        deprecated: false,
    }
}

fn openapi_spec(context: &ApplicationPublicDocsContext, operations: Vec<PublicOperation>) -> Value {
    let mut paths = serde_json::Map::new();
    for operation in operations {
        let method = operation.method.to_ascii_lowercase();
        let path_item = paths
            .entry(operation.path.to_string())
            .or_insert_with(|| json!({}));
        path_item.as_object_mut().expect("path item object").insert(
            method,
            json!({
                "operationId": operation.id,
                "summary": operation.summary,
                "description": format!("{}\n\n{}", operation.description, unsupported_notes(operation.category_id)),
                "tags": [operation.category_label],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {"type": "object"},
                            "example": operation.request_example,
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Compatible response"},
                    "201": {"description": "Native run created"},
                    "400": {"description": "Invalid request"},
                    "401": {"description": "Invalid application API key"},
                    "409": {"description": "Application is not published or run state is not supported"}
                },
                "security": [{"applicationApiKey": []}]
            }),
        );
    }

    json!({
        "openapi": "3.1.0",
        "info": {
            "title": format!("{} Public API", context.application.name),
            "version": publication_version(context),
            "description": application_description(context),
        },
        "servers": [{"url": "/"}],
        "paths": paths,
        "components": {
            "securitySchemes": {
                "applicationApiKey": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "Application API Key",
                    "description": "Use an application API key created from this application API tab."
                }
            }
        },
        "x-1flowbase-application": {
            "id": context.application.id,
            "name": context.application.name,
            "api_enabled": context
                .active_publication
                .as_ref()
                .map(|publication| publication.api_enabled)
                .unwrap_or(false),
            "active_publication_version": context
                .active_publication
                .as_ref()
                .map(|publication| publication.version_sequence),
            "mapping": context
                .active_publication
                .as_ref()
                .map(mapping_summary)
                .unwrap_or_else(|| json!({"status": "not_published"}))
        }
    })
}

fn application_description(context: &ApplicationPublicDocsContext) -> String {
    let publication = context
        .active_publication
        .as_ref()
        .map(|publication| {
            format!(
                "Active publication v{} is {}.",
                publication.version_sequence,
                if publication.api_enabled {
                    "enabled"
                } else {
                    "disabled"
                }
            )
        })
        .unwrap_or_else(|| "No active public API publication exists.".to_string());
    format!(
        "Application-scoped public API docs for {}. {} Public paths are selected by application API key, not by application_id.",
        context.application.name, publication
    )
}

fn publication_version(context: &ApplicationPublicDocsContext) -> String {
    context
        .active_publication
        .as_ref()
        .map(|publication| format!("publication-v{}", publication.version_sequence))
        .unwrap_or_else(|| "unpublished".to_string())
}

fn mapping_summary(publication: &ApplicationPublicationVersionRecord) -> Value {
    json!({
        "query_target": publication.mapping_snapshot.input.query_target,
        "model_target": publication.mapping_snapshot.input.model_target,
        "inputs_target": publication.mapping_snapshot.input.inputs_target,
        "history_target": publication.mapping_snapshot.input.history_target,
        "attachments_target": publication.mapping_snapshot.input.attachments_target,
        "answer_selector": publication.mapping_snapshot.output.answer_selector,
        "usage_selector": publication.mapping_snapshot.output.usage_selector,
        "files_selector": publication.mapping_snapshot.output.files_selector,
        "error_selector": publication.mapping_snapshot.output.error_selector,
    })
}

fn unsupported_notes(category_id: &str) -> &'static str {
    match category_id {
        OPENAI_CATEGORY_ID => {
            "Unsupported in this v1 compatible endpoint: tools, tool_choice, function_call, audio output, image/file content, and multimodal generation. Use the Native API for required_action inspection and resume."
        }
        ANTHROPIC_CATEGORY_ID => {
            "Unsupported in this v1 compatible endpoint: tools, tool_choice, tool_result blocks, computer use, image/document blocks, and waiting-state resume. Use the Native API for required_action inspection and resume."
        }
        _ => {
            "Native API supports required_action inspection and resume. Public paths never include application_id."
        }
    }
}

fn public_operations() -> Vec<PublicOperation> {
    vec![
        PublicOperation {
            id: "applicationNativeCreateRun",
            method: "POST",
            path: "/api/1flowbase/runs",
            summary: "Create Native public run",
            description: "Creates a run against the active published application version.",
            category_id: NATIVE_CATEGORY_ID,
            category_label: "Application Native API",
            request_example: json!({"query": "Summarize the incident", "response_mode": "blocking"}),
        },
        PublicOperation {
            id: "applicationNativeGetRun",
            method: "GET",
            path: "/api/1flowbase/runs/{run_id}",
            summary: "Get Native public run",
            description: "Reads a public run created by this application API key.",
            category_id: NATIVE_CATEGORY_ID,
            category_label: "Application Native API",
            request_example: json!({}),
        },
        PublicOperation {
            id: "applicationNativeCancelRun",
            method: "POST",
            path: "/api/1flowbase/runs/{run_id}/cancel",
            summary: "Cancel Native public run",
            description: "Cancels a public run created by this application API key.",
            category_id: NATIVE_CATEGORY_ID,
            category_label: "Application Native API",
            request_example: json!({}),
        },
        PublicOperation {
            id: "applicationNativeResumeRun",
            method: "POST",
            path: "/api/1flowbase/runs/{run_id}/resume",
            summary: "Resume Native public run",
            description: "Completes a waiting callback task for a Native public run.",
            category_id: NATIVE_CATEGORY_ID,
            category_label: "Application Native API",
            request_example: json!({"callback_task_id": "00000000-0000-0000-0000-000000000000", "response_payload": {}}),
        },
        PublicOperation {
            id: "applicationNativeUploadFile",
            method: "POST",
            path: "/api/1flowbase/files",
            summary: "Upload Native public file",
            description: "Uploads a file for use by Native public runs.",
            category_id: NATIVE_CATEGORY_ID,
            category_label: "Application Native API",
            request_example: json!({}),
        },
        PublicOperation {
            id: "applicationOpenAiCreateChatCompletion",
            method: "POST",
            path: "/v1/chat/completions",
            summary: "Create OpenAI-compatible chat completion",
            description: "Adapts an OpenAI Chat Completions request to a Native public run.",
            category_id: OPENAI_CATEGORY_ID,
            category_label: "OpenAI Compatible API",
            request_example: json!({"model": "provider/model", "messages": [{"role": "user", "content": "Hello"}]}),
        },
        PublicOperation {
            id: "applicationAnthropicCreateMessage",
            method: "POST",
            path: "/v1/messages",
            summary: "Create Anthropic-compatible message",
            description: "Adapts an Anthropic Messages request to a Native public run.",
            category_id: ANTHROPIC_CATEGORY_ID,
            category_label: "Anthropic Compatible API",
            request_example: json!({"model": "provider/model", "max_tokens": 512, "messages": [{"role": "user", "content": "Hello"}]}),
        },
    ]
}
