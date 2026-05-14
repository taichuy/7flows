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
    doc_key: &'static str,
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

#[derive(Debug, Clone, Copy)]
struct DocTextResolver {
    locale: DocsLocale,
}

impl DocTextResolver {
    fn new(locale: DocsLocale) -> Self {
        Self { locale }
    }

    fn operation_summary(&self, doc_key: &str) -> &'static str {
        match (doc_key, self.locale) {
            ("application_public_api.native.create_run", DocsLocale::ZhHans) => "创建原生公开运行",
            ("application_public_api.native.get_run", DocsLocale::ZhHans) => "获取原生公开运行",
            ("application_public_api.native.cancel_run", DocsLocale::ZhHans) => "取消原生公开运行",
            ("application_public_api.native.resume_run", DocsLocale::ZhHans) => "恢复原生公开运行",
            ("application_public_api.native.upload_file", DocsLocale::ZhHans) => "上传原生公开文件",
            ("application_public_api.openai.chat_completion", DocsLocale::ZhHans) => {
                "创建 OpenAI 兼容聊天补全"
            }
            ("application_public_api.anthropic.message", DocsLocale::ZhHans) => {
                "创建 Anthropic 兼容消息"
            }
            ("application_public_api.native.create_run", DocsLocale::EnUs) => {
                "Create Native public run"
            }
            ("application_public_api.native.get_run", DocsLocale::EnUs) => "Get Native public run",
            ("application_public_api.native.cancel_run", DocsLocale::EnUs) => {
                "Cancel Native public run"
            }
            ("application_public_api.native.resume_run", DocsLocale::EnUs) => {
                "Resume Native public run"
            }
            ("application_public_api.native.upload_file", DocsLocale::EnUs) => {
                "Upload Native public file"
            }
            ("application_public_api.openai.chat_completion", DocsLocale::EnUs) => {
                "Create OpenAI-compatible chat completion"
            }
            ("application_public_api.anthropic.message", DocsLocale::EnUs) => {
                "Create Anthropic-compatible message"
            }
            _ => "Public API operation",
        }
    }

    fn operation_description(&self, doc_key: &str) -> &'static str {
        match (doc_key, self.locale) {
            ("application_public_api.native.create_run", DocsLocale::ZhHans) => {
                "基于当前应用的活跃发布版本创建一次运行。"
            }
            ("application_public_api.native.get_run", DocsLocale::ZhHans) => {
                "读取由当前应用 API 密钥创建的公开运行。"
            }
            ("application_public_api.native.cancel_run", DocsLocale::ZhHans) => {
                "取消由当前应用 API 密钥创建的公开运行。"
            }
            ("application_public_api.native.resume_run", DocsLocale::ZhHans) => {
                "完成原生公开运行中等待回调的任务。"
            }
            ("application_public_api.native.upload_file", DocsLocale::ZhHans) => {
                "上传可供原生公开运行使用的文件。"
            }
            ("application_public_api.openai.chat_completion", DocsLocale::ZhHans) => {
                "将 OpenAI Chat Completions 请求适配为原生公开运行。"
            }
            ("application_public_api.anthropic.message", DocsLocale::ZhHans) => {
                "将 Anthropic Messages 请求适配为原生公开运行。"
            }
            ("application_public_api.native.create_run", DocsLocale::EnUs) => {
                "Creates a run against the active published application version."
            }
            ("application_public_api.native.get_run", DocsLocale::EnUs) => {
                "Reads a public run created by this application API key."
            }
            ("application_public_api.native.cancel_run", DocsLocale::EnUs) => {
                "Cancels a public run created by this application API key."
            }
            ("application_public_api.native.resume_run", DocsLocale::EnUs) => {
                "Completes a waiting callback task for a Native public run."
            }
            ("application_public_api.native.upload_file", DocsLocale::EnUs) => {
                "Uploads a file for use by Native public runs."
            }
            ("application_public_api.openai.chat_completion", DocsLocale::EnUs) => {
                "Adapts an OpenAI Chat Completions request to a Native public run."
            }
            ("application_public_api.anthropic.message", DocsLocale::EnUs) => {
                "Adapts an Anthropic Messages request to a Native public run."
            }
            _ => "Public API operation.",
        }
    }

    fn field_description(&self, key: &str) -> &'static str {
        match (key, self.locale) {
            ("application_public_api.native.create_run.request.query", DocsLocale::ZhHans) => {
                "用户输入，会映射到当前应用发布配置中的 query target。"
            }
            ("application_public_api.native.create_run.request.model", DocsLocale::ZhHans) => {
                "可选模型标识，会通过应用 API 映射传入运行。"
            }
            ("application_public_api.native.create_run.request.inputs", DocsLocale::ZhHans) => {
                "附加输入对象，会通过应用 API 映射写入目标节点。"
            }
            ("application_public_api.native.create_run.request.history", DocsLocale::ZhHans) => {
                "可供发布运行使用的会话历史。"
            }
            (
                "application_public_api.native.create_run.request.attachments",
                DocsLocale::ZhHans,
            ) => "可供发布运行使用的文件或外部资源。",
            (
                "application_public_api.native.create_run.request.attachments.value",
                DocsLocale::ZhHans,
            ) => "当前附件来源对应的值。",
            (
                "application_public_api.native.create_run.request.conversation",
                DocsLocale::ZhHans,
            ) => "外部会话元数据，例如用户或会话 ID。",
            ("application_public_api.native.create_run.request.user_id", DocsLocale::ZhHans) => {
                "显式外部用户 ID。会写入公开运行日志，并优先于 conversation.user。"
            }
            ("application_public_api.native.create_run.request.title", DocsLocale::ZhHans) => {
                "运行标题。未传时默认使用用户输入，并截断到 255 个字符。"
            }
            (
                "application_public_api.native.create_run.request.stream_options",
                DocsLocale::ZhHans,
            ) => "流式返回选项，include_workflow_events=public 会启用公开工作流事件。",
            ("application_public_api.native.create_run.request.execution", DocsLocale::ZhHans) => {
                "发布运行的执行选项。"
            }
            ("application_public_api.native.create_run.request.metadata", DocsLocale::ZhHans) => {
                "调用方元数据，会随公开运行持久化。"
            }
            (
                "application_public_api.anthropic.message.request.metadata",
                DocsLocale::ZhHans,
            ) => "附加元数据。metadata.user_id 会映射为公开运行的外部用户标识。",
            (
                "application_public_api.native.resume_run.request.callback_task_id",
                DocsLocale::ZhHans,
            ) => "required_action 返回的回调任务 ID。",
            (
                "application_public_api.native.upload_file.request.file_table_id",
                DocsLocale::ZhHans,
            ) => "目标文件表 ID。",
            ("application_public_api.native.upload_file.request.file", DocsLocale::ZhHans) => {
                "要上传的文件二进制内容。"
            }
            (
                "application_public_api.openai.chat_completion.request.stream",
                DocsLocale::ZhHans,
            )
            | ("application_public_api.anthropic.message.request.stream", DocsLocale::ZhHans) => {
                "true 会将请求映射为流式响应模式。"
            }
            ("application_public_api.native.create_run.request.query", DocsLocale::EnUs) => {
                "User input mapped to the published application's query target."
            }
            ("application_public_api.native.create_run.request.model", DocsLocale::EnUs) => {
                "Optional model identifier passed through application mapping."
            }
            ("application_public_api.native.create_run.request.inputs", DocsLocale::EnUs) => {
                "Additional input values mapped by the application API mapping."
            }
            ("application_public_api.native.create_run.request.history", DocsLocale::EnUs) => {
                "Conversation history entries available to the published run."
            }
            ("application_public_api.native.create_run.request.attachments", DocsLocale::EnUs) => {
                "Files or external assets available to the published run."
            }
            (
                "application_public_api.native.create_run.request.attachments.value",
                DocsLocale::EnUs,
            ) => "Attachment value for the selected source.",
            ("application_public_api.native.create_run.request.conversation", DocsLocale::EnUs) => {
                "External conversation metadata such as user or conversation id."
            }
            ("application_public_api.native.create_run.request.user_id", DocsLocale::EnUs) => {
                "Explicit external user id persisted on the public run and preferred over conversation.user."
            }
            ("application_public_api.native.create_run.request.title", DocsLocale::EnUs) => {
                "Run title. Defaults to the user query and is truncated to 255 characters."
            }
            (
                "application_public_api.native.create_run.request.stream_options",
                DocsLocale::EnUs,
            ) => {
                "Streaming options. include_workflow_events=public enables public workflow events."
            }
            ("application_public_api.native.create_run.request.execution", DocsLocale::EnUs) => {
                "Execution options for the published run."
            }
            ("application_public_api.native.create_run.request.metadata", DocsLocale::EnUs) => {
                "Caller metadata persisted with the public run."
            }
            (
                "application_public_api.anthropic.message.request.metadata",
                DocsLocale::EnUs,
            ) => "Additional metadata. metadata.user_id maps to the public run external user id.",
            (
                "application_public_api.native.resume_run.request.callback_task_id",
                DocsLocale::EnUs,
            ) => "Callback task id returned in required_action.",
            (
                "application_public_api.native.upload_file.request.file_table_id",
                DocsLocale::EnUs,
            ) => "Target file table id.",
            ("application_public_api.native.upload_file.request.file", DocsLocale::EnUs) => {
                "File binary content."
            }
            ("application_public_api.openai.chat_completion.request.stream", DocsLocale::EnUs)
            | ("application_public_api.anthropic.message.request.stream", DocsLocale::EnUs) => {
                "true maps the request to streaming response mode."
            }
            _ => "Field value.",
        }
    }

    fn response_description(&self, key: &str) -> &'static str {
        match (key, self.locale) {
            ("compatible_response", DocsLocale::ZhHans) => "兼容响应",
            ("native_run", DocsLocale::ZhHans) => "原生运行",
            ("native_run_created", DocsLocale::ZhHans) => "原生运行已创建",
            ("file_uploaded", DocsLocale::ZhHans) => "文件已上传",
            ("invalid_request", DocsLocale::ZhHans) => "请求无效",
            ("invalid_application_api_key", DocsLocale::ZhHans) => "应用 API 密钥无效",
            ("forbidden", DocsLocale::ZhHans) => "无权访问该公开资源",
            ("not_found", DocsLocale::ZhHans) => "公开资源不存在",
            ("application_not_published_or_run_state_not_supported", DocsLocale::ZhHans) => {
                "应用未发布，或运行状态不支持当前操作"
            }
            ("compatible_response", DocsLocale::EnUs) => "Compatible response",
            ("native_run", DocsLocale::EnUs) => "Native run",
            ("native_run_created", DocsLocale::EnUs) => "Native run created",
            ("file_uploaded", DocsLocale::EnUs) => "File uploaded",
            ("invalid_request", DocsLocale::EnUs) => "Invalid request",
            ("invalid_application_api_key", DocsLocale::EnUs) => "Invalid application API key",
            ("forbidden", DocsLocale::EnUs) => "Forbidden public resource",
            ("not_found", DocsLocale::EnUs) => "Public resource not found",
            ("application_not_published_or_run_state_not_supported", DocsLocale::EnUs) => {
                "Application is not published or run state is not supported"
            }
            _ => "Response",
        }
    }

    fn unsupported_notes(&self, category_id: &str) -> &'static str {
        match (category_id, self.locale) {
            (OPENAI_CATEGORY_ID, DocsLocale::ZhHans) => {
                "此 v1 兼容端点支持 tools、tool_choice、function_call 字段进入模型供应商调用，支持 tool 消息历史回传和返回 tool_calls；暂不支持音频输出、图片/文件内容和多模态生成。如需查看 required_action 或恢复运行，请使用原生 API。"
            }
            (ANTHROPIC_CATEGORY_ID, DocsLocale::ZhHans) => {
                "此 v1 兼容端点支持顶层 tools/tool_choice 进入模型供应商调用，支持 tool_use / tool_result 文本块历史回传；暂不支持 computer use、image/document blocks 和等待态恢复。如需查看 required_action 或恢复运行，请使用原生 API。"
            }
            (_, DocsLocale::ZhHans) => {
                "原生 API 支持查看 required_action 并恢复运行。公开路径不会包含 application_id。"
            }
            (OPENAI_CATEGORY_ID, DocsLocale::EnUs) => {
                "This v1 compatible endpoint forwards tools, tool_choice, and function_call fields into the model-provider invocation, forwards tool message history, and can return tool_calls. Unsupported: audio output, image/file content, and multimodal generation. Use the Native API for required_action inspection and resume."
            }
            (ANTHROPIC_CATEGORY_ID, DocsLocale::EnUs) => {
                "This v1 compatible endpoint forwards top-level tools/tool_choice into the model-provider invocation and supports tool_use/tool_result text block history. Unsupported: computer use, image/document blocks, and waiting-state resume. Use the Native API for required_action inspection and resume."
            }
            (_, DocsLocale::EnUs) => {
                "Native API supports required_action inspection and resume. Public paths never include application_id."
            }
        }
    }
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
    let docs = DocTextResolver::new(locale);
    let category_label =
        category_label(operation.category_id, locale).unwrap_or(operation.category_id);
    DocsCatalogOperation {
        id: operation.id.to_string(),
        method: operation.method.to_string(),
        path: operation.path.to_string(),
        summary: Some(docs.operation_summary(operation.doc_key).to_string()),
        description: Some(docs.operation_description(operation.doc_key).to_string()),
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
        path_item
            .as_object_mut()
            .expect("path item object")
            .insert(method, operation_openapi_spec(&operation, locale));
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
                },
                "anthropicApplicationApiKey": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "x-api-key",
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

fn operation_openapi_spec(operation: &PublicOperation, locale: DocsLocale) -> Value {
    let docs = DocTextResolver::new(locale);
    let mut spec = json!({
        "operationId": operation.id,
        "summary": docs.operation_summary(operation.doc_key),
        "description": format!("{}\n\n{}", docs.operation_description(operation.doc_key), docs.unsupported_notes(operation.category_id)),
        "tags": [category_label(operation.category_id, locale).unwrap_or(operation.category_id)],
        "responses": operation_responses(operation, &docs),
        "security": operation_security(operation.category_id)
    });
    let spec_object = spec.as_object_mut().expect("operation spec object");
    let parameters = operation_parameters(operation);
    if !parameters.is_empty() {
        spec_object.insert("parameters".to_string(), Value::Array(parameters));
    }
    if let Some(request_body) = operation_request_body(operation, &docs) {
        spec_object.insert("requestBody".to_string(), request_body);
    }
    spec
}

fn operation_parameters(operation: &PublicOperation) -> Vec<Value> {
    let mut parameters = Vec::new();
    if operation.path.contains("{run_id}") {
        parameters.push(json!({
            "name": "run_id",
            "in": "path",
            "required": true,
            "description": "Published run id",
            "schema": {
                "type": "string",
                "format": "uuid"
            }
        }));
    }
    parameters
}

fn operation_request_body(operation: &PublicOperation, docs: &DocTextResolver) -> Option<Value> {
    match operation.id {
        "applicationNativeCreateRun" => Some(json_request_body(
            native_create_run_schema(docs),
            json!({
                "query": "Summarize the incident",
                "user_id": "external-user-1",
                "title": "Customer incident summary",
                "response_mode": "blocking",
                "inputs": {"priority": "high"},
                "conversation": {"user": "external-user-1"},
                "attachments": [{"source": "upload_file_id", "value": "00000000-0000-0000-0000-000000000000"}]
            }),
        )),
        "applicationNativeResumeRun" => Some(json_request_body(
            native_resume_run_schema(docs),
            json!({
                "callback_task_id": "00000000-0000-0000-0000-000000000000",
                "response_payload": {},
                "response_mode": "blocking"
            }),
        )),
        "applicationNativeUploadFile" => Some(json!({
            "required": true,
            "content": {
                "multipart/form-data": {
                    "schema": native_file_upload_schema(docs)
                }
            }
        })),
        "applicationOpenAiCreateChatCompletion" => Some(json_request_body(
            openai_chat_completion_schema(docs),
            json!({
                "model": "provider/model",
                "messages": [{"role": "user", "content": "Hello"}],
                "stream": false
            }),
        )),
        "applicationAnthropicCreateMessage" => Some(json_request_body(
            anthropic_message_schema(docs),
            json!({
                "model": "provider/model",
                "max_tokens": 512,
                "messages": [{"role": "user", "content": "Hello"}],
                "metadata": {"user_id": "external-user-1"},
                "stream": false
            }),
        )),
        _ => None,
    }
}

fn operation_responses(operation: &PublicOperation, docs: &DocTextResolver) -> Value {
    match operation.id {
        "applicationNativeCreateRun" => native_responses(docs, "201"),
        "applicationNativeGetRun" | "applicationNativeCancelRun" | "applicationNativeResumeRun" => {
            native_responses(docs, "200")
        }
        "applicationNativeUploadFile" => native_upload_responses(docs),
        "applicationOpenAiCreateChatCompletion" => openai_responses(docs),
        "applicationAnthropicCreateMessage" => anthropic_responses(docs),
        _ => json!({}),
    }
}

fn native_responses(docs: &DocTextResolver, success_status: &'static str) -> Value {
    let mut responses = serde_json::Map::new();
    responses.insert(
        success_status.to_string(),
        json_response(
            docs.response_description(if success_status == "201" {
                "native_run_created"
            } else {
                "native_run"
            }),
            api_success_schema(native_run_response_schema()),
        ),
    );
    responses.insert(
        "400".to_string(),
        json_response(
            docs.response_description("invalid_request"),
            native_error_body_schema(),
        ),
    );
    responses.insert(
        "401".to_string(),
        json_response(
            docs.response_description("invalid_application_api_key"),
            native_error_body_schema(),
        ),
    );
    responses.insert(
        "403".to_string(),
        json_response(
            docs.response_description("forbidden"),
            native_error_body_schema(),
        ),
    );
    responses.insert(
        "404".to_string(),
        json_response(
            docs.response_description("not_found"),
            native_error_body_schema(),
        ),
    );
    responses.insert(
        "409".to_string(),
        json_response(
            docs.response_description("application_not_published_or_run_state_not_supported"),
            native_error_body_schema(),
        ),
    );
    Value::Object(responses)
}

fn native_upload_responses(docs: &DocTextResolver) -> Value {
    json!({
        "201": json_response(
            docs.response_description("file_uploaded"),
            api_success_schema(uploaded_file_response_schema())
        ),
        "400": json_response(docs.response_description("invalid_request"), native_error_body_schema()),
        "401": json_response(docs.response_description("invalid_application_api_key"), native_error_body_schema())
    })
}

fn openai_responses(docs: &DocTextResolver) -> Value {
    json!({
        "200": json_response(
            docs.response_description("compatible_response"),
            openai_chat_completion_response_schema()
        ),
        "400": json_response(docs.response_description("invalid_request"), openai_error_body_schema()),
        "401": json_response(docs.response_description("invalid_application_api_key"), openai_error_body_schema()),
        "403": json_response(docs.response_description("forbidden"), openai_error_body_schema()),
        "409": json_response(
            docs.response_description("application_not_published_or_run_state_not_supported"),
            openai_error_body_schema()
        )
    })
}

fn anthropic_responses(docs: &DocTextResolver) -> Value {
    json!({
        "200": json_response(
            docs.response_description("compatible_response"),
            anthropic_message_response_schema()
        ),
        "400": json_response(docs.response_description("invalid_request"), anthropic_error_body_schema()),
        "401": json_response(docs.response_description("invalid_application_api_key"), anthropic_error_body_schema()),
        "403": json_response(docs.response_description("forbidden"), anthropic_error_body_schema()),
        "409": json_response(
            docs.response_description("application_not_published_or_run_state_not_supported"),
            anthropic_error_body_schema()
        )
    })
}

fn json_response(description: &'static str, schema: Value) -> Value {
    json!({
        "description": description,
        "content": {
            "application/json": {
                "schema": schema
            }
        }
    })
}

fn json_request_body(schema: Value, example: Value) -> Value {
    json!({
        "required": true,
        "content": {
            "application/json": {
                "schema": schema,
                "example": example
            }
        }
    })
}

fn api_success_schema(data_schema: Value) -> Value {
    json!({
        "type": "object",
        "required": ["data"],
        "properties": {
            "data": data_schema,
            "meta": {
                "oneOf": [
                    {"type": "object", "additionalProperties": true},
                    {"type": "null"}
                ]
            }
        }
    })
}

fn native_run_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "application_id", "api_key_id", "publication_version_id", "status", "node_input_payload", "metadata", "created_at"],
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "application_id": {"type": "string", "format": "uuid"},
            "api_key_id": {"type": "string", "format": "uuid"},
            "publication_version_id": {"type": "string", "format": "uuid"},
            "status": {"type": "string"},
            "node_input_payload": {"type": "object", "additionalProperties": true},
            "metadata": {"type": "object", "additionalProperties": true},
            "answer": {"oneOf": [{"type": "string"}, {"type": "null"}]},
            "required_action": {"oneOf": [{"type": "object", "additionalProperties": true}, {"type": "null"}]},
            "tool_calls": {"oneOf": [{"type": "array", "items": tool_call_schema()}, {"type": "null"}]},
            "usage": {"oneOf": [{"type": "object", "additionalProperties": true}, {"type": "null"}]},
            "error": {"oneOf": [{"type": "object", "additionalProperties": true}, {"type": "null"}]},
            "created_at": {"type": "string", "format": "date-time"}
        }
    })
}

fn native_error_body_schema() -> Value {
    json!({
        "type": "object",
        "required": ["code", "message"],
        "properties": {
            "code": {"type": "string"},
            "message": {"type": "string"}
        }
    })
}

fn uploaded_file_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["storage_id", "record"],
        "properties": {
            "storage_id": {"type": "string"},
            "record": {"type": "object", "additionalProperties": true}
        }
    })
}

fn tool_call_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "type": {"type": "string"},
            "name": {"type": "string"},
            "arguments": {
                "oneOf": [
                    {"type": "object", "additionalProperties": true},
                    {"type": "array"},
                    {"type": "string"},
                    {"type": "number"},
                    {"type": "boolean"},
                    {"type": "null"}
                ]
            }
        },
        "additionalProperties": true
    })
}

fn openai_tool_call_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "type", "function"],
        "properties": {
            "id": {"type": "string"},
            "type": {"type": "string", "enum": ["function"]},
            "function": {
                "type": "object",
                "required": ["name", "arguments"],
                "properties": {
                    "name": {"type": "string"},
                    "arguments": {"type": "string"}
                }
            }
        }
    })
}

fn openai_tool_schema() -> Value {
    json!({
        "type": "object",
        "required": ["type", "function"],
        "properties": {
            "type": {"type": "string", "enum": ["function"]},
            "function": {
                "type": "object",
                "required": ["name"],
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "parameters": {"type": "object", "additionalProperties": true}
                }
            }
        },
        "additionalProperties": true
    })
}

fn anthropic_tool_schema() -> Value {
    json!({
        "type": "object",
        "required": ["name"],
        "properties": {
            "name": {"type": "string"},
            "description": {"type": "string"},
            "input_schema": {"type": "object", "additionalProperties": true}
        },
        "additionalProperties": true
    })
}

fn openai_chat_completion_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "object", "created", "model", "choices", "usage"],
        "properties": {
            "id": {"type": "string"},
            "object": {"type": "string", "enum": ["chat.completion"]},
            "created": {"type": "integer"},
            "model": {"type": "string"},
            "choices": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["index", "message", "finish_reason"],
                    "properties": {
                        "index": {"type": "integer"},
                        "message": {
                            "type": "object",
                            "required": ["role", "content"],
                            "properties": {
                                "role": {"type": "string", "enum": ["assistant"]},
                                "content": {"oneOf": [{"type": "string"}, {"type": "null"}]},
                                "tool_calls": {
                                    "type": "array",
                                    "items": openai_tool_call_schema()
                                }
                            }
                        },
                        "finish_reason": {"type": "string", "enum": ["stop", "tool_calls"]}
                    }
                }
            },
            "usage": {
                "type": "object",
                "properties": {
                    "prompt_tokens": {"type": "integer"},
                    "completion_tokens": {"type": "integer"},
                    "total_tokens": {"type": "integer"}
                }
            }
        }
    })
}

fn openai_error_body_schema() -> Value {
    json!({
        "type": "object",
        "required": ["error"],
        "properties": {
            "error": {
                "type": "object",
                "required": ["message", "type", "code"],
                "properties": {
                    "message": {"type": "string"},
                    "type": {"type": "string"},
                    "param": {"oneOf": [{"type": "string"}, {"type": "null"}]},
                    "code": {"type": "string"}
                }
            }
        }
    })
}

fn anthropic_message_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["id", "type", "role", "model", "content", "stop_reason", "usage"],
        "properties": {
            "id": {"type": "string"},
            "type": {"type": "string", "enum": ["message"]},
            "role": {"type": "string", "enum": ["assistant"]},
            "model": {"type": "string"},
            "content": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["type"],
                    "properties": {
                        "type": {"type": "string", "enum": ["text", "tool_use"]},
                        "text": {"type": "string"},
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "input": {"type": "object", "additionalProperties": true}
                    }
                }
            },
            "stop_reason": {"type": "string", "enum": ["end_turn", "tool_use"]},
            "usage": {
                "type": "object",
                "properties": {
                    "input_tokens": {"type": "integer"},
                    "output_tokens": {"type": "integer"}
                }
            }
        }
    })
}

fn anthropic_error_body_schema() -> Value {
    json!({
        "type": "object",
        "required": ["type", "error"],
        "properties": {
            "type": {"type": "string", "enum": ["error"]},
            "error": {
                "type": "object",
                "required": ["type", "message"],
                "properties": {
                    "type": {"type": "string"},
                    "message": {"type": "string"}
                }
            }
        }
    })
}

fn native_create_run_schema(docs: &DocTextResolver) -> Value {
    json!({
        "type": "object",
        "required": ["query"],
        "properties": {
            "query": {
                "type": "string",
                "description": docs.field_description("application_public_api.native.create_run.request.query")
            },
            "model": {
                "type": "string",
                "description": docs.field_description("application_public_api.native.create_run.request.model")
            },
            "inputs": {
                "type": "object",
                "additionalProperties": true,
                "description": docs.field_description("application_public_api.native.create_run.request.inputs")
            },
            "history": {
                "type": "array",
                "items": {"type": "object", "additionalProperties": true},
                "description": docs.field_description("application_public_api.native.create_run.request.history")
            },
            "attachments": {
                "type": "array",
                "items": native_attachment_schema(docs),
                "description": docs.field_description("application_public_api.native.create_run.request.attachments")
            },
            "conversation": {
                "type": "object",
                "additionalProperties": true,
                "description": docs.field_description("application_public_api.native.create_run.request.conversation")
            },
            "user_id": {
                "type": "string",
                "description": docs.field_description("application_public_api.native.create_run.request.user_id")
            },
            "title": {
                "type": "string",
                "maxLength": 255,
                "description": docs.field_description("application_public_api.native.create_run.request.title")
            },
            "response_mode": {
                "type": "string",
                "enum": ["blocking", "streaming"],
                "default": "blocking"
            },
            "stream_options": {
                "type": "object",
                "additionalProperties": true,
                "description": docs.field_description("application_public_api.native.create_run.request.stream_options")
            },
            "execution": {
                "type": "object",
                "additionalProperties": true,
                "description": docs.field_description("application_public_api.native.create_run.request.execution")
            },
            "metadata": {
                "type": "object",
                "additionalProperties": true,
                "description": docs.field_description("application_public_api.native.create_run.request.metadata")
            }
        }
    })
}

fn native_attachment_schema(docs: &DocTextResolver) -> Value {
    json!({
        "type": "object",
        "properties": {
            "source": {
                "type": "string",
                "enum": ["upload_file_id", "url", "base64"]
            },
            "value": {
                "type": "string",
                "description": docs.field_description("application_public_api.native.create_run.request.attachments.value")
            },
            "name": {"type": "string"},
            "mime_type": {"type": "string"},
            "metadata": {"type": "object", "additionalProperties": true}
        }
    })
}

fn native_resume_run_schema(docs: &DocTextResolver) -> Value {
    json!({
        "type": "object",
        "required": ["callback_task_id"],
        "properties": {
            "callback_task_id": {
                "type": "string",
                "format": "uuid",
                "description": docs.field_description("application_public_api.native.resume_run.request.callback_task_id")
            },
            "response_payload": {
                "type": "object",
                "additionalProperties": true,
                "default": {}
            },
            "response_mode": {
                "type": "string",
                "enum": ["blocking", "streaming"],
                "default": "blocking"
            }
        }
    })
}

fn native_file_upload_schema(docs: &DocTextResolver) -> Value {
    json!({
        "type": "object",
        "required": ["file_table_id", "file"],
        "properties": {
            "file_table_id": {
                "type": "string",
                "format": "uuid",
                "description": docs.field_description("application_public_api.native.upload_file.request.file_table_id")
            },
            "file": {
                "type": "string",
                "format": "binary",
                "description": docs.field_description("application_public_api.native.upload_file.request.file")
            }
        }
    })
}

fn openai_chat_completion_schema(docs: &DocTextResolver) -> Value {
    json!({
        "type": "object",
        "required": ["model", "messages"],
        "properties": {
            "model": {"type": "string"},
            "messages": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["role", "content"],
                    "properties": {
                        "role": {"type": "string", "enum": ["system", "user", "assistant", "tool"]},
                        "content": {
                            "oneOf": [
                                {"type": "string"},
                                {"type": "null"},
                                {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "type": {"type": "string", "enum": ["text"]},
                                            "text": {"type": "string"}
                                        }
                                    }
                                }
                            ]
                        },
                        "name": {"type": "string"},
                        "tool_call_id": {"type": "string"},
                        "tool_calls": {
                            "type": "array",
                            "items": openai_tool_call_schema()
                        }
                    }
                }
            },
            "stream": {
                "type": "boolean",
                "description": docs.field_description("application_public_api.openai.chat_completion.request.stream")
            },
            "user": {"type": "string"},
            "tools": {
                "type": "array",
                "items": openai_tool_schema()
            },
            "tool_choice": {
                "oneOf": [
                    {"type": "string", "enum": ["none", "auto", "required"]},
                    {"type": "object", "additionalProperties": true}
                ]
            },
            "function_call": {
                "oneOf": [
                    {"type": "string", "enum": ["none", "auto"]},
                    {"type": "object", "additionalProperties": true}
                ]
            },
            "metadata": {"type": "object", "additionalProperties": true}
        }
    })
}

fn anthropic_message_schema(docs: &DocTextResolver) -> Value {
    json!({
        "type": "object",
        "required": ["model", "messages"],
        "properties": {
            "model": {"type": "string"},
            "max_tokens": {"type": "integer", "minimum": 1},
            "system": {"type": "string"},
            "messages": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["role", "content"],
                    "properties": {
                        "role": {"type": "string", "enum": ["user", "assistant"]},
                        "content": {
                            "oneOf": [
                                {"type": "string"},
                                {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "type": {"type": "string", "enum": ["text", "tool_use", "tool_result"]},
                                            "text": {"type": "string"},
                                            "id": {"type": "string"},
                                            "name": {"type": "string"},
                                            "input": {"type": "object", "additionalProperties": true},
                                            "tool_use_id": {"type": "string"},
                                            "is_error": {"type": "boolean"},
                                            "content": {
                                                "oneOf": [
                                                    {"type": "string"},
                                                    {
                                                        "type": "array",
                                                        "items": {"type": "object", "additionalProperties": true}
                                                    },
                                                    {"type": "object", "additionalProperties": true}
                                                ]
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            "stream": {
                "type": "boolean",
                "description": docs.field_description("application_public_api.anthropic.message.request.stream")
            },
            "tools": {
                "type": "array",
                "items": anthropic_tool_schema()
            },
            "tool_choice": {"type": "object", "additionalProperties": true},
            "metadata": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string"},
                    "trace_id": {"type": "string"}
                },
                "additionalProperties": true,
                "description": docs.field_description("application_public_api.anthropic.message.request.metadata")
            }
        }
    })
}

fn operation_security(category_id: &str) -> Value {
    if category_id == ANTHROPIC_CATEGORY_ID {
        return json!([
            {"applicationApiKey": []},
            {"anthropicApplicationApiKey": []}
        ]);
    }

    json!([{"applicationApiKey": []}])
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

fn security_scheme_description(locale: DocsLocale) -> &'static str {
    match locale {
        DocsLocale::ZhHans => "使用在当前应用 API 页签中创建的应用 API 密钥。",
        DocsLocale::EnUs => "Use an application API key created from this application API tab.",
    }
}

fn public_operations() -> Vec<PublicOperation> {
    vec![
        PublicOperation {
            id: "applicationNativeCreateRun",
            method: "POST",
            path: "/api/1flowbase/runs",
            category_id: NATIVE_CATEGORY_ID,
            doc_key: "application_public_api.native.create_run",
        },
        PublicOperation {
            id: "applicationNativeGetRun",
            method: "GET",
            path: "/api/1flowbase/runs/{run_id}",
            category_id: NATIVE_CATEGORY_ID,
            doc_key: "application_public_api.native.get_run",
        },
        PublicOperation {
            id: "applicationNativeCancelRun",
            method: "POST",
            path: "/api/1flowbase/runs/{run_id}/cancel",
            category_id: NATIVE_CATEGORY_ID,
            doc_key: "application_public_api.native.cancel_run",
        },
        PublicOperation {
            id: "applicationNativeResumeRun",
            method: "POST",
            path: "/api/1flowbase/runs/{run_id}/resume",
            category_id: NATIVE_CATEGORY_ID,
            doc_key: "application_public_api.native.resume_run",
        },
        PublicOperation {
            id: "applicationNativeUploadFile",
            method: "POST",
            path: "/api/1flowbase/files",
            category_id: NATIVE_CATEGORY_ID,
            doc_key: "application_public_api.native.upload_file",
        },
        PublicOperation {
            id: "applicationOpenAiCreateChatCompletion",
            method: "POST",
            path: "/v1/chat/completions",
            category_id: OPENAI_CATEGORY_ID,
            doc_key: "application_public_api.openai.chat_completion",
        },
        PublicOperation {
            id: "applicationAnthropicCreateMessage",
            method: "POST",
            path: "/v1/messages",
            category_id: ANTHROPIC_CATEGORY_ID,
            doc_key: "application_public_api.anthropic.message",
        },
    ]
}
