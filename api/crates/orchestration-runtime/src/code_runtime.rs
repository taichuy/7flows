use std::{error::Error, fmt, time::Duration};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use rquickjs::{Context, Runtime};
use serde_json::{json, Map, Value};

use crate::{
    compiled_plan::{CompiledCodeRuntime, CompiledNode},
    payload_builder::{
        is_reserved_payload_key, BuiltNodePayloads, PublicOutputContract, RawNodeExecutionResult,
    },
};

const INVALID_OUTPUT_SENTINEL: &str = "__1flowbase_invalid_output__";

#[derive(Debug, Clone, PartialEq)]
pub struct CodeInvocationOutput {
    pub output_payload: Value,
}

#[async_trait]
pub trait CodeInvoker: Send + Sync {
    async fn invoke_code_node(
        &self,
        runtime: &CompiledCodeRuntime,
        config_payload: Value,
        input_payload: Value,
    ) -> Result<CodeInvocationOutput>;
}

#[derive(Debug, Clone)]
pub struct QuickJsCodeInvoker {
    timeout: Duration,
    memory_limit_bytes: usize,
    stack_size_bytes: usize,
}

impl Default for QuickJsCodeInvoker {
    fn default() -> Self {
        Self {
            timeout: Duration::from_millis(100),
            memory_limit_bytes: 8 * 1024 * 1024,
            stack_size_bytes: 256 * 1024,
        }
    }
}

impl QuickJsCodeInvoker {
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }
}

#[async_trait]
impl CodeInvoker for QuickJsCodeInvoker {
    async fn invoke_code_node(
        &self,
        runtime: &CompiledCodeRuntime,
        _config_payload: Value,
        input_payload: Value,
    ) -> Result<CodeInvocationOutput> {
        let request = QuickJsInvocationRequest {
            language: runtime.language.clone(),
            source: runtime.source.clone(),
            entrypoint: runtime.entrypoint.clone(),
            input_payload,
            timeout: self.timeout,
            memory_limit_bytes: self.memory_limit_bytes,
            stack_size_bytes: self.stack_size_bytes,
        };

        tokio::task::spawn_blocking(move || run_quickjs_code(request))
            .await
            .map_err(|_| CodeRunnerError::runtime_error())?
    }
}

struct QuickJsInvocationRequest {
    language: String,
    source: Option<String>,
    entrypoint: String,
    input_payload: Value,
    timeout: Duration,
    memory_limit_bytes: usize,
    stack_size_bytes: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CodeRunnerErrorKind {
    UnsupportedLanguage,
    SourceMissing,
    EntrypointUnsupported,
    ModuleImportDenied,
    DynamicImportDenied,
    SyntaxError,
    MainMissing,
    InvalidOutput,
    RuntimeError,
    Timeout,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CodeRunnerError {
    kind: CodeRunnerErrorKind,
}

impl CodeRunnerError {
    fn unsupported_language() -> Self {
        Self {
            kind: CodeRunnerErrorKind::UnsupportedLanguage,
        }
    }

    fn source_missing() -> Self {
        Self {
            kind: CodeRunnerErrorKind::SourceMissing,
        }
    }

    fn entrypoint_unsupported() -> Self {
        Self {
            kind: CodeRunnerErrorKind::EntrypointUnsupported,
        }
    }

    fn module_import_denied() -> Self {
        Self {
            kind: CodeRunnerErrorKind::ModuleImportDenied,
        }
    }

    fn dynamic_import_denied() -> Self {
        Self {
            kind: CodeRunnerErrorKind::DynamicImportDenied,
        }
    }

    fn syntax_error() -> Self {
        Self {
            kind: CodeRunnerErrorKind::SyntaxError,
        }
    }

    fn main_missing() -> Self {
        Self {
            kind: CodeRunnerErrorKind::MainMissing,
        }
    }

    fn invalid_output() -> Self {
        Self {
            kind: CodeRunnerErrorKind::InvalidOutput,
        }
    }

    fn runtime_error() -> Self {
        Self {
            kind: CodeRunnerErrorKind::RuntimeError,
        }
    }

    fn timeout() -> Self {
        Self {
            kind: CodeRunnerErrorKind::Timeout,
        }
    }

    fn public_code(&self) -> &'static str {
        match self.kind {
            CodeRunnerErrorKind::UnsupportedLanguage => "unsupported_language",
            CodeRunnerErrorKind::SourceMissing => "source_missing",
            CodeRunnerErrorKind::EntrypointUnsupported => "entrypoint_unsupported",
            CodeRunnerErrorKind::ModuleImportDenied => "module_import_denied",
            CodeRunnerErrorKind::DynamicImportDenied => "module_import_denied",
            CodeRunnerErrorKind::SyntaxError => "syntax_error",
            CodeRunnerErrorKind::MainMissing => "main_missing",
            CodeRunnerErrorKind::InvalidOutput => "invalid_output",
            CodeRunnerErrorKind::RuntimeError => "runtime_error",
            CodeRunnerErrorKind::Timeout => "timeout",
        }
    }

    fn public_message(&self) -> &'static str {
        match self.kind {
            CodeRunnerErrorKind::UnsupportedLanguage => "only JavaScript code runtime is supported",
            CodeRunnerErrorKind::SourceMissing => "code source is required",
            CodeRunnerErrorKind::EntrypointUnsupported => "only main entrypoint is supported",
            CodeRunnerErrorKind::ModuleImportDenied => "import and export syntax is not supported",
            CodeRunnerErrorKind::DynamicImportDenied => "dynamic import is not supported",
            CodeRunnerErrorKind::SyntaxError => "code source is not valid JavaScript",
            CodeRunnerErrorKind::MainMissing => "main function is required",
            CodeRunnerErrorKind::InvalidOutput => "main must return a JSON object",
            CodeRunnerErrorKind::RuntimeError => "code execution failed",
            CodeRunnerErrorKind::Timeout => "code execution timed out",
        }
    }
}

impl fmt::Display for CodeRunnerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{}: {}",
            self.public_code(),
            self.public_message()
        )
    }
}

impl Error for CodeRunnerError {}

fn run_quickjs_code(request: QuickJsInvocationRequest) -> Result<CodeInvocationOutput> {
    if !request.language.eq_ignore_ascii_case("javascript") {
        return Err(CodeRunnerError::unsupported_language().into());
    }
    if request.entrypoint != "main" {
        return Err(CodeRunnerError::entrypoint_unsupported().into());
    }
    let source = request
        .source
        .as_deref()
        .filter(|source| !source.trim().is_empty())
        .ok_or_else(CodeRunnerError::source_missing)?;
    reject_module_syntax(source)?;

    let deadline = std::time::Instant::now() + request.timeout;
    let runtime = Runtime::new().map_err(|_| CodeRunnerError::runtime_error())?;
    runtime.set_memory_limit(request.memory_limit_bytes);
    runtime.set_max_stack_size(request.stack_size_bytes);
    runtime.set_interrupt_handler(Some(Box::new(move || {
        std::time::Instant::now() >= deadline
    })));

    let context = Context::full(&runtime).map_err(|_| CodeRunnerError::runtime_error())?;
    context.with(|ctx| {
        ctx.eval::<(), _>(source).map_err(|_| {
            code_error_for_elapsed(request.timeout, deadline, CodeRunnerError::syntax_error())
        })?;
        let main_type = ctx.eval::<String, _>("typeof main").map_err(|_| {
            code_error_for_elapsed(request.timeout, deadline, CodeRunnerError::runtime_error())
        })?;
        if main_type != "function" {
            return Err(CodeRunnerError::main_missing().into());
        }

        let input_literal = serde_json::to_string(&request.input_payload)
            .map_err(|_| CodeRunnerError::runtime_error())?;
        let invocation_script = build_invocation_script(&input_literal);
        let output_json = ctx.eval::<String, _>(invocation_script).map_err(|_| {
            code_error_for_elapsed(request.timeout, deadline, CodeRunnerError::runtime_error())
        })?;
        if output_json == INVALID_OUTPUT_SENTINEL {
            return Err(CodeRunnerError::invalid_output().into());
        }
        let output_payload = serde_json::from_str::<Value>(&output_json)
            .map_err(|_| CodeRunnerError::invalid_output())?;
        if !matches!(output_payload, Value::Object(_)) {
            return Err(CodeRunnerError::invalid_output().into());
        }

        Ok(CodeInvocationOutput { output_payload })
    })
}

fn code_error_for_elapsed(
    timeout: Duration,
    deadline: std::time::Instant,
    fallback: CodeRunnerError,
) -> CodeRunnerError {
    if !timeout.is_zero() && std::time::Instant::now() >= deadline {
        CodeRunnerError::timeout()
    } else {
        fallback
    }
}

fn build_invocation_script(input_literal: &str) -> String {
    format!(
        r#"
const __oneflowbase_inputs = {input_literal};
const __oneflowbase_output = main(__oneflowbase_inputs);
if (
  __oneflowbase_output === null ||
  Array.isArray(__oneflowbase_output) ||
  typeof __oneflowbase_output !== "object" ||
  Object.prototype.toString.call(__oneflowbase_output) !== "[object Object]"
) {{
  "{INVALID_OUTPUT_SENTINEL}";
}} else {{
  JSON.stringify(__oneflowbase_output);
}}
"#
    )
}

fn reject_module_syntax(source: &str) -> Result<()> {
    let bytes = source.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\'' | b'"' => {
                index = skip_quoted_literal(bytes, index, bytes[index]);
                continue;
            }
            b'`' => {
                index = skip_quoted_literal(bytes, index, b'`');
                continue;
            }
            b'/' if bytes.get(index + 1) == Some(&b'/') => {
                index = skip_line_comment(bytes, index + 2);
                continue;
            }
            b'/' if bytes.get(index + 1) == Some(&b'*') => {
                index = skip_block_comment(bytes, index + 2);
                continue;
            }
            _ => {}
        }
        if keyword_at(bytes, index, b"import") {
            let next = skip_ascii_whitespace(bytes, index + b"import".len());
            if next < bytes.len() && bytes[next] == b'(' {
                return Err(CodeRunnerError::dynamic_import_denied().into());
            }
            return Err(CodeRunnerError::module_import_denied().into());
        }
        if keyword_at(bytes, index, b"export") {
            return Err(CodeRunnerError::module_import_denied().into());
        }
        index += 1;
    }

    Ok(())
}

fn keyword_at(source: &[u8], index: usize, keyword: &[u8]) -> bool {
    source
        .get(index..index + keyword.len())
        .is_some_and(|candidate| candidate == keyword)
        && index
            .checked_sub(1)
            .and_then(|previous| source.get(previous))
            .is_none_or(|byte| !is_js_identifier_byte(*byte))
        && source
            .get(index + keyword.len())
            .is_none_or(|byte| !is_js_identifier_byte(*byte))
}

fn skip_ascii_whitespace(source: &[u8], mut index: usize) -> usize {
    while source
        .get(index)
        .is_some_and(|byte| byte.is_ascii_whitespace())
    {
        index += 1;
    }
    index
}

fn skip_quoted_literal(source: &[u8], mut index: usize, quote: u8) -> usize {
    index += 1;
    while index < source.len() {
        if source[index] == b'\\' {
            index = index.saturating_add(2);
            continue;
        }
        if source[index] == quote {
            return index + 1;
        }
        index += 1;
    }
    source.len()
}

fn skip_line_comment(source: &[u8], mut index: usize) -> usize {
    while index < source.len() && source[index] != b'\n' {
        index += 1;
    }
    index
}

fn skip_block_comment(source: &[u8], mut index: usize) -> usize {
    while index + 1 < source.len() {
        if source[index] == b'*' && source[index + 1] == b'/' {
            return index + 2;
        }
        index += 1;
    }
    source.len()
}

fn is_js_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

#[derive(Debug, Clone, PartialEq)]
pub struct CodeNodeExecution {
    pub output_payload: Value,
    pub error_payload: Option<Value>,
    pub metrics_payload: Value,
    pub debug_payload: Value,
}

pub async fn execute_code_node<I>(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
    invoker: &I,
) -> Result<CodeNodeExecution>
where
    I: CodeInvoker + ?Sized,
{
    let runtime = node.code_runtime.as_ref().ok_or_else(|| {
        anyhow!(
            "compiled code node is missing runtime metadata: {}",
            node.node_id
        )
    })?;
    let config_payload = node.config.clone();
    let input_payload = Value::Object(resolved_inputs.clone());

    match invoker
        .invoke_code_node(runtime, config_payload, input_payload)
        .await
    {
        Ok(output) => {
            let raw = RawNodeExecutionResult {
                executor_output: object_from_value(output.output_payload)?,
                metrics_facts: code_runtime_metrics(runtime, false)?,
                error_facts: Map::new(),
                debug_facts: Map::new(),
                provider_events: Vec::new(),
            };
            let built = build_code_node_payloads(node, raw)?;

            Ok(CodeNodeExecution {
                output_payload: built.output_payload,
                error_payload: None,
                metrics_payload: built.metrics_payload,
                debug_payload: built.debug_payload,
            })
        }
        Err(error) => {
            let raw = RawNodeExecutionResult {
                executor_output: Map::new(),
                metrics_facts: code_runtime_metrics(runtime, true)?,
                error_facts: object_from_value(json!({
                    "error_kind": "code_runtime_error",
                    "message": "code execution failed",
                    "runtime_message": error.to_string(),
                }))?,
                debug_facts: Map::new(),
                provider_events: Vec::new(),
            };
            let built = build_code_node_payloads(node, raw)?;

            Ok(CodeNodeExecution {
                output_payload: built.output_payload,
                error_payload: Some(built.error_payload),
                metrics_payload: built.metrics_payload,
                debug_payload: built.debug_payload,
            })
        }
    }
}

fn code_runtime_metrics(runtime: &CompiledCodeRuntime, error: bool) -> Result<Map<String, Value>> {
    object_from_value(json!({
        "language": runtime.language,
        "entrypoint": runtime.entrypoint,
        "imports": runtime.imports,
        "dependency_count": runtime.dependencies.len(),
        "error": error,
    }))
}

fn build_code_node_payloads(
    node: &CompiledNode,
    raw: RawNodeExecutionResult,
) -> Result<BuiltNodePayloads> {
    for key in raw.executor_output.keys() {
        if is_reserved_payload_key(key) {
            return Err(anyhow!(
                "reserved code output key `{key}` cannot be returned by code node executor"
            ));
        }
    }

    PublicOutputContract::from_compiled_outputs(&node.outputs)?.build_node_payloads(raw)
}

fn object_from_value(value: Value) -> Result<Map<String, Value>> {
    value
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("payload bucket facts must be an object"))
}
