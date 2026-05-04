# DeepSeek Provider 02 - Official Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated official `deepseek` model provider RuntimeExtension in `/home/taichu/git/1flowbase-official-plugins`.

**Architecture:** The plugin is a Rust stdio JSON provider process. It exposes `validate`, `list_models`, `balance`, and streaming `invoke`. It keeps DeepSeek-specific request parameters in provider YAML, normalizes DeepSeek cache usage fields, and does not hard-code current prices.

**Tech Stack:** Rust 2021, reqwest, serde/serde_json, futures-util, tokio, Node.js `node --test`.

---

## Task 1: Scaffold DeepSeek Provider Metadata

**Files:**
- Create: `runtime-extensions/model-providers/deepseek/manifest.yaml`
- Create: `runtime-extensions/model-providers/deepseek/provider/deepseek.yaml`
- Create: `runtime-extensions/model-providers/deepseek/Cargo.toml`
- Create: `runtime-extensions/model-providers/deepseek/src/main.rs`
- Create: `runtime-extensions/model-providers/deepseek/src/lib.rs`
- Create: `runtime-extensions/model-providers/deepseek/models/llm/_position.yaml`
- Create: `runtime-extensions/model-providers/deepseek/models/llm/deepseek-v4-flash.yaml`
- Create: `runtime-extensions/model-providers/deepseek/models/llm/deepseek-v4-pro.yaml`
- Create: `runtime-extensions/model-providers/deepseek/i18n/en_US.json`
- Create: `runtime-extensions/model-providers/deepseek/i18n/zh_Hans.json`
- Create: `runtime-extensions/model-providers/deepseek/_assets/icon.svg`
- Create: `runtime-extensions/model-providers/deepseek/readme/README_en_US.md`
- Create: `scripts/_tests/deepseek-provider-contract.test.mjs`

- [ ] **Step 1: Write failing repository contract test**

Create `scripts/_tests/deepseek-provider-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const providerRoot = path.join(repoRoot, 'runtime-extensions/model-providers/deepseek');

function read(relativePath) {
  return fs.readFileSync(path.join(providerRoot, relativePath), 'utf8');
}

test('deepseek provider declares dedicated identity and defaults', () => {
  const manifest = read('manifest.yaml');
  const provider = read('provider/deepseek.yaml');

  assert.match(manifest, /^plugin_id: deepseek$/m);
  assert.match(manifest, /entry: bin\/deepseek-provider/);
  assert.match(provider, /^provider_code: deepseek$/m);
  assert.match(provider, /^default_base_url: https:\/\/api\.deepseek\.com$/m);
  assert.doesNotMatch(provider, /organization|project|api_version|default_headers/);
});

test('deepseek provider exposes deepseek-specific model parameters only', () => {
  const provider = read('provider/deepseek.yaml');

  for (const field of [
    'thinking_type',
    'reasoning_effort',
    'temperature',
    'top_p',
    'max_tokens',
    'response_format',
    'stop',
    'tool_choice',
    'logprobs',
    'top_logprobs',
    'user_id',
  ]) {
    assert.match(provider, new RegExp(`^  - key: ${field}$`, 'm'));
  }

  assert.doesNotMatch(provider, /^  - key: frequency_penalty$/m);
  assert.doesNotMatch(provider, /^  - key: presence_penalty$/m);
  assert.doesNotMatch(provider, /pricing|price_snapshot|as_of|million_tokens/);
});
```

- [ ] **Step 2: Run metadata test to verify failure**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
node --test scripts/_tests/deepseek-provider-contract.test.mjs
```

Expected: FAIL because `runtime-extensions/model-providers/deepseek` does not exist.

- [ ] **Step 3: Add manifest and Cargo files**

Use `manifest.yaml`:

```yaml
manifest_version: 1
plugin_id: deepseek
version: 0.1.0
vendor: 1flowbase
display_name: DeepSeek
description: DeepSeek model provider runtime extension
icon: icon.svg
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/deepseek-provider
  limits:
    timeout_ms: 30000
    memory_bytes: 268435456
node_contributions: []
```

Use `Cargo.toml`:

```toml
[package]
name = "deepseek-provider"
version = "0.0.0"
edition = "2021"

[lib]
name = "deepseek_provider"
path = "src/lib.rs"

[dependencies]
anyhow = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream"] }
futures-util = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

- [ ] **Step 4: Add provider YAML**

Create `provider/deepseek.yaml` with:

```yaml
provider_code: deepseek
display_name: DeepSeek
protocol: openai_compatible
help_url: https://api-docs.deepseek.com/zh-cn/api/deepseek-api
default_base_url: https://api.deepseek.com
model_discovery: hybrid
supports_model_fetch_without_credentials: false
```

Add parameter fields in this order:

```yaml
  - key: thinking_type
  - key: reasoning_effort
  - key: temperature
  - key: top_p
  - key: max_tokens
  - key: response_format
  - key: stop
  - key: tool_choice
  - key: logprobs
  - key: top_logprobs
  - key: user_id
```

Add config schema:

```yaml
config_schema:
- key: base_url
  type: string
  required: true
- key: api_key
  type: secret
  required: true
- key: validate_model
  type: boolean
  required: false
  advanced: true
```

- [ ] **Step 5: Add static model metadata without price**

Create `_position.yaml`:

```yaml
items:
  - deepseek-v4-flash
  - deepseek-v4-pro
```

Each model YAML must include:

```yaml
family: llm
capabilities:
  - stream
  - tool_call
  - structured_output
context_window: 1000000
max_output_tokens: 384000
provider_metadata:
  owned_by: deepseek
  reasoning: true
  pricing_source: dynamic
```

- [ ] **Step 6: Add i18n, icon, readme, and minimal Rust entrypoint**

Use `src/main.rs` patterned after `openai_compatible/src/main.rs`, with crate name `deepseek_provider`.

Use `src/lib.rs` with the stdio envelope structs and methods:

```rust
pub async fn handle_request(request: ProviderStdioRequest) -> anyhow::Result<ProviderStdioResponse> {
    match request.method.as_str() {
        "validate" => Ok(ProviderStdioResponse::ok(serde_json::json!({ "ok": true }))),
        "list_models" => Ok(ProviderStdioResponse::ok(serde_json::json!([]))),
        "balance" => Ok(ProviderStdioResponse::ok(serde_json::json!({
            "is_available": false,
            "balance_infos": []
        }))),
        "invoke" => anyhow::bail!("invoke is not implemented in this scaffold"),
        other => Ok(ProviderStdioResponse::error(
            "provider_invalid_response",
            format!("unsupported method: {other}"),
        )),
    }
}
```

- [ ] **Step 7: Run scaffold tests**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
node --test scripts/_tests/deepseek-provider-contract.test.mjs scripts/_tests/list-provider-package-targets.test.mjs
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml
```

Expected: PASS.

- [ ] **Step 8: Commit scaffold**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
git add runtime-extensions/model-providers/deepseek scripts/_tests/deepseek-provider-contract.test.mjs
git commit -m "feat: scaffold deepseek model provider"
git push origin main
```

---

## Task 2: Implement Models And Balance Runtime

**Files:**
- Modify: `runtime-extensions/model-providers/deepseek/src/lib.rs`

- [ ] **Step 1: Write failing tests for config, model, and balance normalization**

Add inside `src/lib.rs` test module:

```rust
#[test]
fn normalize_provider_config_defaults_base_url() {
    let config = normalize_provider_config(&serde_json::json!({ "api_key": "secret" })).unwrap();
    assert_eq!(config.base_url, "https://api.deepseek.com");
    assert_eq!(config.api_key, "secret");
}

#[test]
fn normalize_model_entry_merges_deepseek_static_metadata() {
    let model = normalize_model_entry(&serde_json::json!({
        "id": "deepseek-v4-pro",
        "object": "model",
        "owned_by": "deepseek"
    })).unwrap();

    assert_eq!(model.model_id, "deepseek-v4-pro");
    assert_eq!(model.context_window, Some(1_000_000));
    assert_eq!(model.max_output_tokens, Some(384_000));
    assert_eq!(model.provider_metadata["owned_by"], "deepseek");
    assert_eq!(model.provider_metadata["pricing_source"], "dynamic");
}

#[test]
fn normalize_balance_payload_preserves_deepseek_balances() {
    let result = normalize_balance_payload(&serde_json::json!({
        "is_available": true,
        "balance_infos": [{
            "currency": "CNY",
            "total_balance": "110.00",
            "granted_balance": "10.00",
            "topped_up_balance": "100.00"
        }]
    })).unwrap();

    assert!(result.is_available);
    assert_eq!(result.balance_infos[0].currency, "CNY");
    assert_eq!(result.balance_infos[0].total_balance, "110.00");
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml normalize_
```

Expected: FAIL because normalization helpers are missing.

- [ ] **Step 3: Implement config, models, balance**

Implement:

```rust
const PROVIDER_CODE: &str = "deepseek";
const DEFAULT_BASE_URL: &str = "https://api.deepseek.com";

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderConfig {
    base_url: String,
    api_key: String,
    validate_model: bool,
}
```

Rules:

- missing `base_url` uses `DEFAULT_BASE_URL`;
- `api_key` is required;
- `validate_model` defaults to true;
- `/models` normalizes `id`, `owned_by`, 1M context, 384K output, dynamic pricing source;
- `/user/balance` returns `is_available` and `balance_infos`.

- [ ] **Step 4: Add runtime HTTP methods**

Implement:

```rust
"validate" => validate_provider_config(&request.input).await
"list_models" => list_models(&request.input).await
"balance" => get_balance(&request.input).await
```

HTTP paths:

- `GET /models`
- `GET /user/balance`

Headers:

- `Accept: application/json`
- `Authorization: Bearer <api_key>`

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml
git add runtime-extensions/model-providers/deepseek
git commit -m "feat: implement deepseek models and balance"
git push origin main
```

Expected: tests pass and commit is pushed.

---

## Task 3: Implement Chat Streaming Runtime

**Files:**
- Modify: `runtime-extensions/model-providers/deepseek/src/lib.rs`
- Modify: `runtime-extensions/model-providers/deepseek/src/main.rs`

- [ ] **Step 1: Write failing chat body and usage tests**

Add tests:

```rust
#[test]
fn build_chat_completion_body_maps_deepseek_parameters() {
    let input = ProviderInvocationInput {
        model: "deepseek-v4-pro".to_string(),
        provider_config: serde_json::json!({ "api_key": "secret" }),
        messages: vec![ProviderMessage {
            role: "user".to_string(),
            content: serde_json::json!("Hi"),
            tool_call_id: None,
        }],
        tools: vec![serde_json::json!({
            "type": "function",
            "function": { "name": "lookup", "parameters": { "type": "object" } }
        })],
        model_parameters: BTreeMap::from([
            ("thinking_type".to_string(), serde_json::json!("enabled")),
            ("reasoning_effort".to_string(), serde_json::json!("max")),
            ("response_format".to_string(), serde_json::json!("json_object")),
            ("tool_choice".to_string(), serde_json::json!("auto")),
            ("user_id".to_string(), serde_json::json!("user-1")),
        ]),
        ..ProviderInvocationInput::default()
    };

    let body = build_chat_completion_body(&input).unwrap();

    assert_eq!(body["model"], "deepseek-v4-pro");
    assert_eq!(body["thinking"], serde_json::json!({ "type": "enabled" }));
    assert_eq!(body["reasoning_effort"], "max");
    assert_eq!(body["response_format"], serde_json::json!({ "type": "json_object" }));
    assert_eq!(body["tool_choice"], "auto");
    assert_eq!(body["user_id"], "user-1");
    assert_eq!(body["stream"], true);
    assert_eq!(body["stream_options"], serde_json::json!({ "include_usage": true }));
}

#[test]
fn normalize_usage_maps_deepseek_cache_segments() {
    let usage = normalize_usage(&serde_json::json!({
        "prompt_tokens": 100,
        "prompt_cache_hit_tokens": 40,
        "prompt_cache_miss_tokens": 60,
        "completion_tokens": 12,
        "total_tokens": 112,
        "completion_tokens_details": { "reasoning_tokens": 5 }
    }));

    assert_eq!(usage.input_tokens, Some(100));
    assert_eq!(usage.input_cache_hit_tokens, Some(40));
    assert_eq!(usage.input_cache_miss_tokens, Some(60));
    assert_eq!(usage.output_tokens, Some(12));
    assert_eq!(usage.reasoning_tokens, Some(5));
    assert_eq!(usage.total_tokens, Some(112));
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml build_chat_completion_body normalize_usage
```

Expected: FAIL because chat helpers are missing.

- [ ] **Step 3: Implement chat body builder**

Rules:

- always send `stream: true`;
- always send `stream_options: { "include_usage": true }`;
- `thinking_type` sends `thinking: { "type": value }`;
- `response_format` sends `response_format: { "type": value }`;
- host `tools` array wins over raw model parameter `tools`;
- do not send `frequency_penalty` or `presence_penalty`.

Core inserts:

```rust
body.insert("stream".to_string(), Value::Bool(true));
body.insert("stream_options".to_string(), json!({ "include_usage": true }));
body.insert("thinking".to_string(), json!({ "type": thinking_type }));
body.insert("response_format".to_string(), json!({ "type": response_format }));
```

- [ ] **Step 4: Add streaming parser test**

Add a local TCP test patterned after `openai_compatible` that streams:

```text
data: {"id":"chatcmpl_test","model":"deepseek-v4-pro","choices":[{"delta":{"reasoning_content":"think"},"finish_reason":null}]}

data: {"id":"chatcmpl_test","model":"deepseek-v4-pro","choices":[{"delta":{"content":"ok"},"finish_reason":null}]}

data: {"id":"chatcmpl_test","model":"deepseek-v4-pro","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"prompt_cache_hit_tokens":40,"prompt_cache_miss_tokens":60,"completion_tokens":12,"total_tokens":112}}

data: [DONE]
```

Assert emitted events contain:

```rust
ProviderStreamEvent::ReasoningDelta { delta: "think".to_string() }
ProviderStreamEvent::TextDelta { delta: "ok".to_string() }
ProviderStreamEvent::UsageSnapshot { usage: expected_usage }
ProviderStreamEvent::Finish { reason: ProviderFinishReason::Stop }
```

- [ ] **Step 5: Implement streaming invocation**

Implement:

- `invoke_chat_completion_with_event_sink`;
- `read_streaming_chat_completion`;
- SSE line parsing;
- text delta extraction;
- reasoning delta extraction from `reasoning_content`;
- tool call delta merge and commit;
- finish reason normalization, including unknown for `insufficient_system_resource`;
- final result NDJSON line in `src/main.rs`.

- [ ] **Step 6: Run chat tests and commit**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml chat
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml usage
git add runtime-extensions/model-providers/deepseek
git commit -m "feat: implement deepseek chat streaming"
git push origin main
```

Expected: tests pass and commit is pushed.

## Plan Completion

- [ ] All Task 1 checkboxes are complete.
- [ ] All Task 2 checkboxes are complete.
- [ ] All Task 3 checkboxes are complete.
- [ ] Update the index plan checkbox for `02 - Official DeepSeek Provider`.
