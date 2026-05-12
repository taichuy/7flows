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
    pub locale: String,
}

#[derive(Debug, Clone)]
struct PublicOperation {
    id: &'static str,
    method: &'static str,
    path: &'static str,
    category_id: &'static str,
    request_example: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DocsLocale {
    EnUs,
    ZhHans,
}

fn docs_locale(context: &ApplicationPublicDocsContext) -> DocsLocale {
    match context.locale.as_str() {
        "zh_Hans" => DocsLocale::ZhHans,
        _ => DocsLocale::EnUs,
    }
}

pub fn build_application_public_docs_catalog(
    context: &ApplicationPublicDocsContext,
) -> DocsCatalog {
    let locale = docs_locale(context);
    let operations = public_operations();
    let categories = [
        (
            NATIVE_CATEGORY_ID,
            category_label(NATIVE_CATEGORY_ID, locale),
        ),
        (
            OPENAI_CATEGORY_ID,
            category_label(OPENAI_CATEGORY_ID, locale),
        ),
        (
            ANTHROPIC_CATEGORY_ID,
            category_label(ANTHROPIC_CATEGORY_ID, locale),
        ),
    ]
    .into_iter()
    .map(|(id, label)| DocsCatalogCategory {
        id: id.to_string(),
        label: label.unwrap_or(id).to_string(),
        operation_count: operations
            .iter()
            .filter(|operation| operation.category_id == id)
            .count(),
    })
    .collect();

    DocsCatalog {
        title: match locale {
            DocsLocale::ZhHans => "应用公开 API".to_string(),
            DocsLocale::EnUs => "Application Public API".to_string(),
        },
        version: "v1".to_string(),
        categories,
    }
}

pub fn build_application_public_docs_category_operations(
    context: &ApplicationPublicDocsContext,
    category_id: &str,
) -> Option<DocsCatalogCategoryOperations> {
    let locale = docs_locale(context);
    let operations = public_operations()
        .into_iter()
        .filter(|operation| operation.category_id == category_id)
        .map(|operation| to_catalog_operation(operation, locale))
        .collect::<Vec<_>>();
    if operations.is_empty() {
        return None;
    }
    let label = category_label(category_id, locale)?;
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

fn category_label(category_id: &str, locale: DocsLocale) -> Option<&'static str> {
    match (category_id, locale) {
        (NATIVE_CATEGORY_ID, DocsLocale::ZhHans) => Some("应用原生 API"),
        (OPENAI_CATEGORY_ID, DocsLocale::ZhHans) => Some("OpenAI 兼容 API"),
        (ANTHROPIC_CATEGORY_ID, DocsLocale::ZhHans) => Some("Anthropic 兼容 API"),
        (NATIVE_CATEGORY_ID, DocsLocale::EnUs) => Some("Application Native API"),
        (OPENAI_CATEGORY_ID, DocsLocale::EnUs) => Some("OpenAI Compatible API"),
        (ANTHROPIC_CATEGORY_ID, DocsLocale::EnUs) => Some("Anthropic Compatible API"),
        _ => None,
    }
}

fn to_catalog_operation(operation: PublicOperation, locale: DocsLocale) -> DocsCatalogOperation {
    let category_label =
        category_label(operation.category_id, locale).unwrap_or(operation.category_id);
    DocsCatalogOperation {
        id: operation.id.to_string(),
        method: operation.method.to_string(),
        path: operation.path.to_string(),
        summary: Some(operation_summary(operation.id, locale).to_string()),
        description: Some(operation_description(operation.id, locale).to_string()),
        tags: vec![category_label.to_string()],
        group: category_label.to_string(),
        deprecated: false,
    }
}

fn openapi_spec(context: &ApplicationPublicDocsContext, operations: Vec<PublicOperation>) -> Value {
    let locale = docs_locale(context);
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
                "summary": operation_summary(operation.id, locale),
                "description": format!("{}\n\n{}", operation_description(operation.id, locale), unsupported_notes(operation.category_id, locale)),
                "tags": [category_label(operation.category_id, locale).unwrap_or(operation.category_id)],
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
                    "200": {"description": response_description("compatible_response", locale)},
                    "201": {"description": response_description("native_run_created", locale)},
                    "400": {"description": response_description("invalid_request", locale)},
                    "401": {"description": response_description("invalid_application_api_key", locale)},
                    "409": {"description": response_description("application_not_published_or_run_state_not_supported", locale)}
                },
                "security": [{"applicationApiKey": []}]
            }),
        );
    }

    json!({
        "openapi": "3.1.0",
        "info": {
            "title": application_title(context),
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
                    "description": security_scheme_description(locale)
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
    let locale = docs_locale(context);
    let publication = context
        .active_publication
        .as_ref()
        .map(|publication| match locale {
            DocsLocale::ZhHans => {
                if publication.api_enabled {
                    format!("当前启用的是发布版本 v{}。", publication.version_sequence)
                } else {
                    format!("当前发布版本 v{} 未启用。", publication.version_sequence)
                }
            }
            DocsLocale::EnUs => {
                format!(
                    "Active publication v{} is {}.",
                    publication.version_sequence,
                    if publication.api_enabled {
                        "enabled"
                    } else {
                        "disabled"
                    }
                )
            }
        })
        .unwrap_or_else(|| match locale {
            DocsLocale::ZhHans => "当前没有活跃的公开 API 发布版本。".to_string(),
            DocsLocale::EnUs => "No active public API publication exists.".to_string(),
        });
    match locale {
        DocsLocale::ZhHans => format!(
            "{} 的应用级公开 API 文档。{}公开路径由应用 API 密钥选择，不通过 application_id 选择。",
            context.application.name, publication
        ),
        DocsLocale::EnUs => format!(
            "Application-scoped public API docs for {}. {} Public paths are selected by application API key, not by application_id.",
            context.application.name, publication
        ),
    }
}

fn application_title(context: &ApplicationPublicDocsContext) -> String {
    match docs_locale(context) {
        DocsLocale::ZhHans => format!("{} 公开 API", context.application.name),
        DocsLocale::EnUs => format!("{} Public API", context.application.name),
    }
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

fn operation_summary(operation_id: &str, locale: DocsLocale) -> &'static str {
    match (operation_id, locale) {
        ("applicationNativeCreateRun", DocsLocale::ZhHans) => "创建原生公开运行",
        ("applicationNativeGetRun", DocsLocale::ZhHans) => "获取原生公开运行",
        ("applicationNativeCancelRun", DocsLocale::ZhHans) => "取消原生公开运行",
        ("applicationNativeResumeRun", DocsLocale::ZhHans) => "恢复原生公开运行",
        ("applicationNativeUploadFile", DocsLocale::ZhHans) => "上传原生公开文件",
        ("applicationOpenAiCreateChatCompletion", DocsLocale::ZhHans) => "创建 OpenAI 兼容聊天补全",
        ("applicationAnthropicCreateMessage", DocsLocale::ZhHans) => "创建 Anthropic 兼容消息",
        ("applicationNativeCreateRun", DocsLocale::EnUs) => "Create Native public run",
        ("applicationNativeGetRun", DocsLocale::EnUs) => "Get Native public run",
        ("applicationNativeCancelRun", DocsLocale::EnUs) => "Cancel Native public run",
        ("applicationNativeResumeRun", DocsLocale::EnUs) => "Resume Native public run",
        ("applicationNativeUploadFile", DocsLocale::EnUs) => "Upload Native public file",
        ("applicationOpenAiCreateChatCompletion", DocsLocale::EnUs) => {
            "Create OpenAI-compatible chat completion"
        }
        ("applicationAnthropicCreateMessage", DocsLocale::EnUs) => {
            "Create Anthropic-compatible message"
        }
        _ => "Public API operation",
    }
}

fn operation_description(operation_id: &str, locale: DocsLocale) -> &'static str {
    match (operation_id, locale) {
        ("applicationNativeCreateRun", DocsLocale::ZhHans) => {
            "基于当前应用的活跃发布版本创建一次运行。"
        }
        ("applicationNativeGetRun", DocsLocale::ZhHans) => {
            "读取由当前应用 API 密钥创建的公开运行。"
        }
        ("applicationNativeCancelRun", DocsLocale::ZhHans) => {
            "取消由当前应用 API 密钥创建的公开运行。"
        }
        ("applicationNativeResumeRun", DocsLocale::ZhHans) => "完成原生公开运行中等待回调的任务。",
        ("applicationNativeUploadFile", DocsLocale::ZhHans) => "上传可供原生公开运行使用的文件。",
        ("applicationOpenAiCreateChatCompletion", DocsLocale::ZhHans) => {
            "将 OpenAI Chat Completions 请求适配为原生公开运行。"
        }
        ("applicationAnthropicCreateMessage", DocsLocale::ZhHans) => {
            "将 Anthropic Messages 请求适配为原生公开运行。"
        }
        ("applicationNativeCreateRun", DocsLocale::EnUs) => {
            "Creates a run against the active published application version."
        }
        ("applicationNativeGetRun", DocsLocale::EnUs) => {
            "Reads a public run created by this application API key."
        }
        ("applicationNativeCancelRun", DocsLocale::EnUs) => {
            "Cancels a public run created by this application API key."
        }
        ("applicationNativeResumeRun", DocsLocale::EnUs) => {
            "Completes a waiting callback task for a Native public run."
        }
        ("applicationNativeUploadFile", DocsLocale::EnUs) => {
            "Uploads a file for use by Native public runs."
        }
        ("applicationOpenAiCreateChatCompletion", DocsLocale::EnUs) => {
            "Adapts an OpenAI Chat Completions request to a Native public run."
        }
        ("applicationAnthropicCreateMessage", DocsLocale::EnUs) => {
            "Adapts an Anthropic Messages request to a Native public run."
        }
        _ => "Public API operation.",
    }
}

fn response_description(key: &str, locale: DocsLocale) -> &'static str {
    match (key, locale) {
        ("compatible_response", DocsLocale::ZhHans) => "兼容响应",
        ("native_run_created", DocsLocale::ZhHans) => "原生运行已创建",
        ("invalid_request", DocsLocale::ZhHans) => "请求无效",
        ("invalid_application_api_key", DocsLocale::ZhHans) => "应用 API 密钥无效",
        ("application_not_published_or_run_state_not_supported", DocsLocale::ZhHans) => {
            "应用未发布，或运行状态不支持当前操作"
        }
        ("compatible_response", DocsLocale::EnUs) => "Compatible response",
        ("native_run_created", DocsLocale::EnUs) => "Native run created",
        ("invalid_request", DocsLocale::EnUs) => "Invalid request",
        ("invalid_application_api_key", DocsLocale::EnUs) => "Invalid application API key",
        ("application_not_published_or_run_state_not_supported", DocsLocale::EnUs) => {
            "Application is not published or run state is not supported"
        }
        _ => "Response",
    }
}

fn security_scheme_description(locale: DocsLocale) -> &'static str {
    match locale {
        DocsLocale::ZhHans => "使用在当前应用 API 页签中创建的应用 API 密钥。",
        DocsLocale::EnUs => "Use an application API key created from this application API tab.",
    }
}

fn unsupported_notes(category_id: &str, locale: DocsLocale) -> &'static str {
    match (category_id, locale) {
        (OPENAI_CATEGORY_ID, DocsLocale::ZhHans) => {
            "此 v1 兼容端点暂不支持：tools、tool_choice、function_call、音频输出、图片/文件内容和多模态生成。如需查看 required_action 或恢复运行，请使用原生 API。"
        }
        (ANTHROPIC_CATEGORY_ID, DocsLocale::ZhHans) => {
            "此 v1 兼容端点暂不支持：tools、tool_choice、tool_result blocks、computer use、image/document blocks 和等待态恢复。如需查看 required_action 或恢复运行，请使用原生 API。"
        }
        (_, DocsLocale::ZhHans) => {
            "原生 API 支持查看 required_action 并恢复运行。公开路径不会包含 application_id。"
        }
        (OPENAI_CATEGORY_ID, DocsLocale::EnUs) => {
            "Unsupported in this v1 compatible endpoint: tools, tool_choice, function_call, audio output, image/file content, and multimodal generation. Use the Native API for required_action inspection and resume."
        }
        (ANTHROPIC_CATEGORY_ID, DocsLocale::EnUs) => {
            "Unsupported in this v1 compatible endpoint: tools, tool_choice, tool_result blocks, computer use, image/document blocks, and waiting-state resume. Use the Native API for required_action inspection and resume."
        }
        (_, DocsLocale::EnUs) => {
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
            category_id: NATIVE_CATEGORY_ID,
            request_example: json!({"query": "Summarize the incident", "response_mode": "blocking"}),
        },
        PublicOperation {
            id: "applicationNativeGetRun",
            method: "GET",
            path: "/api/1flowbase/runs/{run_id}",
            category_id: NATIVE_CATEGORY_ID,
            request_example: json!({}),
        },
        PublicOperation {
            id: "applicationNativeCancelRun",
            method: "POST",
            path: "/api/1flowbase/runs/{run_id}/cancel",
            category_id: NATIVE_CATEGORY_ID,
            request_example: json!({}),
        },
        PublicOperation {
            id: "applicationNativeResumeRun",
            method: "POST",
            path: "/api/1flowbase/runs/{run_id}/resume",
            category_id: NATIVE_CATEGORY_ID,
            request_example: json!({"callback_task_id": "00000000-0000-0000-0000-000000000000", "response_payload": {}}),
        },
        PublicOperation {
            id: "applicationNativeUploadFile",
            method: "POST",
            path: "/api/1flowbase/files",
            category_id: NATIVE_CATEGORY_ID,
            request_example: json!({}),
        },
        PublicOperation {
            id: "applicationOpenAiCreateChatCompletion",
            method: "POST",
            path: "/v1/chat/completions",
            category_id: OPENAI_CATEGORY_ID,
            request_example: json!({"model": "provider/model", "messages": [{"role": "user", "content": "Hello"}]}),
        },
        PublicOperation {
            id: "applicationAnthropicCreateMessage",
            method: "POST",
            path: "/v1/messages",
            category_id: ANTHROPIC_CATEGORY_ID,
            request_example: json!({"model": "provider/model", "max_tokens": 512, "messages": [{"role": "user", "content": "Hello"}]}),
        },
    ]
}
