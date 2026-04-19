# AgentFlow LLM Plugin Parameter Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `AgentFlow` 的 `LLM` 节点正式切到“插件返回模型参数 schema、宿主渲染通用动态表单、节点保存 `model_provider / llm_parameters / response_format`、运行时透传给模型供应商插件”的第一版可执行闭环，并明确 `json_schema` 一期可用但不改变节点只输出 `text` 的边界。

**Architecture:** 这轮按“后端 contract 先收口、shared schema-ui 再扩展、最后重构 `LLM` 节点编辑器”的顺序推进。后端先把 `ProviderModelDescriptor.parameter_form` 和 `ProviderInvocationInput.model_parameters` 打通，并保持 `response_format.json_schema` 只作为节点级独立对象透传；前端再新增 `dynamic_form` block、把 `LLM` 节点配置改为对象化结构，并把旧的硬编码参数编辑从 `LlmModelField` 中拆开。

**Tech Stack:** Rust workspace (`plugin-framework`, `plugin-runner`, `control-plane`, `orchestration-runtime`, `api-server`), `serde_json`, `axum`, React 19, TypeScript, Vitest, TanStack Query, Ant Design 5, existing `@1flowbase/api-client`, existing `@1flowbase/flow-schema`, shared `schema-ui`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-19-llm-plugin-parameter-schema-discussion.md`

**Execution Note:** 现有后台“刷新模型”按钮已经存在，本计划不新增第二套刷新入口；只要求刷新后的模型缓存把 `parameter_form` 一并带回前端 options，并驱动 `LLM` 节点重新消费最新 schema。

**Out Of Scope:** 自动从 `json_schema` 反推节点输出契约、结构化输出独立变量、插件自定义 React 控件、官方插件仓库里的 schema 补齐工作、多节点类型共享参数面板抽象

---

## File Structure

### Backend contract and API surface

- Modify: `api/crates/plugin-framework/src/provider_contract.rs`
  - 新增插件公开表单 schema 类型与 `ProviderModelDescriptor.parameter_form`、`ProviderInvocationInput.model_parameters`。
- Modify: `api/apps/plugin-runner/src/provider_host.rs`
  - 补齐动态模型返回值的 `parameter_form` 归一化。
- Modify: `api/crates/control-plane/src/model_provider.rs`
  - 保证 `list_models / list_options / refresh_models` 始终携带 `parameter_form`。
- Modify: `api/apps/api-server/src/routes/model_providers.rs`
  - 把新的模型 descriptor 字段暴露到 console routes / OpenAPI。
- Modify: `web/packages/api-client/src/console-model-providers.ts`
  - 对齐前端消费类型。
- Modify: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- Modify: `api/apps/api-server/src/_tests/model_provider_routes.rs`

### Runtime invocation path

- Modify: `api/crates/orchestration-runtime/src/execution_engine.rs`
  - 用节点中的 `llm_parameters.items` 组装 `model_parameters`，透传 `response_format`，继续只生成 `text` 输出。
- Modify: `api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs`
- Modify: `api/crates/orchestration-runtime/src/_tests/preview_executor_tests.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
  - 更新测试 runtime / 假实现以适配新 contract。

### Shared schema-ui runtime

- Create: `web/app/src/shared/schema-ui/contracts/plugin-form-schema.ts`
  - 前端统一复用的插件公开表单 schema 类型。
- Modify: `web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts`
  - 新增 `SchemaDynamicFormBlock`。
- Modify: `web/app/src/shared/schema-ui/registry/create-renderer-registry.ts`
  - registry 增加 `dynamicForms` 渲染器注册。
- Modify: `web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx`
  - 支持 `dynamic_form` block。
- Modify: `web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx`

### AgentFlow LLM editor and node config

- Create: `web/app/src/features/agent-flow/lib/llm-node-config.ts`
  - 统一封装 `LLM` 节点新配置结构的 getter / builder / reset 逻辑。
- Create: `web/app/src/features/agent-flow/components/detail/fields/LlmProviderSelectorField.tsx`
  - 只负责模型供应商实例和模型选择。
- Create: `web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx`
  - 根据 `parameter_form` 渲染 `enabled + value` 参数面板。
- Create: `web/app/src/features/agent-flow/components/detail/fields/LlmResponseFormatField.tsx`
  - 管理 `text | json_object | json_schema` 和 `json_schema` 文本编辑。
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
  - 从“大而全”组件收口为容器或直接删去旧参数逻辑。
- Modify: `web/packages/flow-schema/src/index.ts`
  - 默认 `LLM` 节点改用新对象结构。
- Modify: `web/app/src/features/agent-flow/lib/node-definitions/nodes/llm.ts`
- Modify: `web/app/src/features/agent-flow/schema/node-schema-fragments.ts`
- Modify: `web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts`
- Modify: `web/app/src/features/agent-flow/api/model-provider-options.ts`
- Modify: `web/app/src/features/agent-flow/lib/model-options.ts`
- Modify: `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/validate-document.test.ts`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-node-card.test.tsx`

### Settings and fixture regression

- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
  - 更新 console model provider fixtures，锁住“刷新模型后带回 `parameter_form`”。

## Task 1: Extend Provider Model Descriptor And Console Options Contract

**Files:**
- Modify: `api/crates/plugin-framework/src/provider_contract.rs`
- Modify: `api/apps/plugin-runner/src/provider_host.rs`
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Modify: `api/apps/api-server/src/routes/model_providers.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `web/packages/api-client/src/console-model-providers.ts`
- Test: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- Test: `api/apps/api-server/src/_tests/model_provider_routes.rs`

- [ ] **Step 1: Write the failing backend tests for `parameter_form` round-trip**

```rust
assert_eq!(
    options.instances[0].models[0]
        .parameter_form
        .as_ref()
        .expect("parameter form should exist")
        .fields[0]
        .key,
    "temperature"
);

assert_eq!(
    response.instances[0].models[0]
        .parameter_form
        .as_ref()
        .unwrap()
        .schema_version,
    "1.0.0"
);
```

- [ ] **Step 2: Run the targeted tests and verify they fail on missing fields**

Run: `rtk cargo test -p control-plane model_provider_service_tests`
Expected: FAIL with compile or assertion errors mentioning `parameter_form` / missing struct field.

Run: `rtk cargo test -p api-server model_provider_routes`
Expected: FAIL because route response / OpenAPI type does not expose `parameter_form`.

- [ ] **Step 3: Add plugin form schema types and expose them through model descriptors**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginFormSchema {
    pub schema_version: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub fields: Vec<PluginFormFieldSchema>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderModelDescriptor {
    pub model_id: String,
    pub display_name: String,
    pub source: ProviderModelSource,
    pub supports_streaming: bool,
    pub supports_tool_call: bool,
    pub supports_multimodal: bool,
    pub context_window: Option<u64>,
    pub max_output_tokens: Option<u64>,
    #[serde(default)]
    pub parameter_form: Option<PluginFormSchema>,
    #[serde(default)]
    pub provider_metadata: Value,
}
```

```ts
export interface ConsolePluginFormSchema {
  schema_version: '1.0.0';
  title?: string;
  description?: string;
  fields: ConsolePluginFormFieldSchema[];
}

export interface ConsoleProviderModelDescriptor {
  model_id: string;
  display_name: string;
  source: string;
  supports_streaming: boolean;
  supports_tool_call: boolean;
  supports_multimodal: boolean;
  context_window: number | null;
  max_output_tokens: number | null;
  parameter_form: ConsolePluginFormSchema | null;
  provider_metadata: Record<string, unknown>;
}
```

- [ ] **Step 4: Re-run the backend tests and verify contract exposure is stable**

Run: `rtk cargo test -p control-plane model_provider_service_tests`
Expected: PASS

Run: `rtk cargo test -p api-server model_provider_routes`
Expected: PASS

- [ ] **Step 5: Commit the backend contract slice**

```bash
rtk git add api/crates/plugin-framework/src/provider_contract.rs \
  api/apps/plugin-runner/src/provider_host.rs \
  api/crates/control-plane/src/model_provider.rs \
  api/apps/api-server/src/routes/model_providers.rs \
  api/apps/api-server/src/openapi.rs \
  api/crates/control-plane/src/_tests/model_provider_service_tests.rs \
  api/apps/api-server/src/_tests/model_provider_routes.rs \
  web/packages/api-client/src/console-model-providers.ts
rtk git commit -m "feat: expose llm parameter form descriptors"
```

## Task 2: Add `model_parameters` To Runtime Invocation While Keeping Text Output Stable

**Files:**
- Modify: `api/crates/plugin-framework/src/provider_contract.rs`
- Modify: `api/crates/orchestration-runtime/src/execution_engine.rs`
- Modify: `api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs`
- Modify: `api/crates/orchestration-runtime/src/_tests/preview_executor_tests.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`

- [ ] **Step 1: Write failing runtime tests for enabled parameter filtering and text-only output**

```rust
assert_eq!(
    captured_input.model_parameters.get("temperature"),
    Some(&json!(0.7))
);
assert!(!captured_input.model_parameters.contains_key("top_p"));
assert_eq!(
    captured_input.response_format,
    Some(json!({ "mode": "json_schema", "schema": { "type": "object" } }))
);
assert_eq!(output_payload, json!({ "text": "{\"ok\":true}" }));
```

- [ ] **Step 2: Run runtime tests to verify the current invocation builder fails**

Run: `rtk cargo test -p orchestration-runtime execution_engine_tests`
Expected: FAIL because `ProviderInvocationInput` still uses fixed fields like `temperature` / `top_p` and does not emit `model_parameters`.

- [ ] **Step 3: Replace fixed numeric passthrough with node-driven `model_parameters`**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProviderInvocationInput {
    pub provider_instance_id: String,
    pub provider_code: String,
    pub protocol: String,
    pub model: String,
    #[serde(default)]
    pub provider_config: Value,
    #[serde(default)]
    pub messages: Vec<ProviderMessage>,
    pub system: Option<String>,
    #[serde(default)]
    pub tools: Vec<Value>,
    #[serde(default)]
    pub mcp_bindings: Vec<Value>,
    pub response_format: Option<Value>,
    #[serde(default)]
    pub model_parameters: BTreeMap<String, Value>,
    #[serde(default)]
    pub trace_context: BTreeMap<String, String>,
    #[serde(default)]
    pub run_context: BTreeMap<String, Value>,
}
```

```rust
fn build_model_parameters(node: &CompiledNode) -> BTreeMap<String, Value> {
    node.config
        .get("llm_parameters")
        .and_then(Value::as_object)
        .and_then(|value| value.get("items"))
        .and_then(Value::as_object)
        .map(|items| {
            items.iter()
                .filter_map(|(key, item)| {
                    let enabled = item.get("enabled").and_then(Value::as_bool).unwrap_or(false);
                    let value = item.get("value").cloned().unwrap_or(Value::Null);
                    enabled.then_some((key.clone(), value))
                })
                .collect()
        })
        .unwrap_or_default()
}
```

- [ ] **Step 4: Re-run runtime tests and confirm `json_schema` still produces only `text`**

Run: `rtk cargo test -p orchestration-runtime execution_engine_tests`
Expected: PASS

Run: `rtk cargo test -p orchestration-runtime preview_executor_tests`
Expected: PASS

- [ ] **Step 5: Commit the runtime contract slice**

```bash
rtk git add api/crates/plugin-framework/src/provider_contract.rs \
  api/crates/orchestration-runtime/src/execution_engine.rs \
  api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs \
  api/crates/orchestration-runtime/src/_tests/preview_executor_tests.rs \
  api/crates/control-plane/src/orchestration_runtime.rs
rtk git commit -m "feat: pass llm parameter objects to provider runtime"
```

## Task 3: Add `dynamic_form` Support To Shared Schema UI

**Files:**
- Create: `web/app/src/shared/schema-ui/contracts/plugin-form-schema.ts`
- Modify: `web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts`
- Modify: `web/app/src/shared/schema-ui/registry/create-renderer-registry.ts`
- Modify: `web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx`
- Modify: `web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx`

- [ ] **Step 1: Write the failing schema runtime test for `dynamic_form` blocks**

```tsx
dynamicForms: {
  llm_parameters: ({ block }) => <div>{block.form_key}</div>
}
```

```tsx
blocks={[
  { kind: 'dynamic_form', form_key: 'llm_parameters', title: 'LLM 参数' }
]}
```

Expected assertion:

```tsx
expect(screen.getByText('llm_parameters')).toBeInTheDocument();
```

- [ ] **Step 2: Run the shared schema-ui test and confirm it fails**

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/shared/schema-ui/_tests/schema-runtime.test.tsx`
Expected: FAIL because `SchemaBlock` and registry do not recognize `dynamic_form`.

- [ ] **Step 3: Add a dedicated block type and registry entry for dynamic forms**

```ts
export interface SchemaDynamicFormBlock extends SchemaBlockBase {
  kind: 'dynamic_form';
  form_key: 'provider_config' | 'llm_parameters' | string;
  title?: string;
  empty_text?: string;
}

export type SchemaBlock =
  | SchemaFieldBlock
  | SchemaViewBlock
  | SchemaSectionBlock
  | SchemaStackBlock
  | SchemaDynamicFormBlock;
```

```ts
export interface SchemaDynamicFormRendererProps {
  adapter: SchemaAdapter;
  block: SchemaDynamicFormBlock;
}

export interface RendererRegistryInput {
  fields: Record<string, SchemaFieldRenderer>;
  views: Record<string, SchemaViewRenderer>;
  dynamicForms: Record<string, SchemaDynamicFormRenderer>;
  shells: Record<string, SchemaShellRenderer>;
}
```

- [ ] **Step 4: Re-run the schema runtime test and confirm nested dynamic forms render**

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/shared/schema-ui/_tests/schema-runtime.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the shared schema-ui slice**

```bash
rtk git add web/app/src/shared/schema-ui/contracts/plugin-form-schema.ts \
  web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts \
  web/app/src/shared/schema-ui/registry/create-renderer-registry.ts \
  web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx \
  web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx
rtk git commit -m "feat: add dynamic plugin form blocks to schema ui"
```

## Task 4: Refactor The LLM Node To Use `model_provider / llm_parameters / response_format`

**Files:**
- Create: `web/app/src/features/agent-flow/lib/llm-node-config.ts`
- Create: `web/app/src/features/agent-flow/components/detail/fields/LlmProviderSelectorField.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/fields/LlmResponseFormatField.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
- Modify: `web/packages/flow-schema/src/index.ts`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions/nodes/llm.ts`
- Modify: `web/app/src/features/agent-flow/schema/node-schema-fragments.ts`
- Modify: `web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts`
- Modify: `web/app/src/features/agent-flow/api/model-provider-options.ts`
- Modify: `web/app/src/features/agent-flow/lib/model-options.ts`
- Modify: `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx`
- Test: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- Test: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Test: `web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx`
- Test: `web/app/src/features/agent-flow/_tests/agent-flow-node-card.test.tsx`

- [ ] **Step 1: Write the failing editor tests for model selection, parameter reset, and response format**

```tsx
expect(latestNode.config).toMatchObject({
  model_provider: {
    provider_instance_id: 'provider-openai-prod',
    model_id: 'gpt-4o-mini'
  },
  llm_parameters: {
    schema_version: '1.0.0',
    items: {
      temperature: { enabled: true, value: 0.7 },
      max_tokens: { enabled: false, value: 1024 }
    }
  },
  response_format: { mode: 'text' }
});
```

```tsx
fireEvent.click(screen.getByRole('radio', { name: 'JSON Schema' }));
expect(latestNode.config.response_format).toEqual({
  mode: 'json_schema',
  schema: '{\n  "type": "object"\n}'
});
```

- [ ] **Step 2: Run the focused front-end tests and verify they fail on the old config shape**

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
Expected: FAIL because the node still writes `config.provider_instance_id`, `config.model`, `config.temperature`, `config.max_tokens`.

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-schema-registry.test.tsx src/features/agent-flow/_tests/agent-flow-node-card.test.tsx`
Expected: FAIL because the schema and card renderers still read the old config keys.

- [ ] **Step 3: Split the giant field component and migrate the node definition to the new object model**

```ts
config: {
  model_provider: {
    provider_instance_id: '',
    model_id: ''
  },
  llm_parameters: {
    schema_version: '1.0.0',
    items: {}
  },
  response_format: {
    mode: 'text'
  }
}
```

```ts
{
  key: 'config.model_provider',
  label: '模型',
  editor: 'llm_provider_selector',
  required: true
},
{
  key: 'config.response_format',
  label: '返回格式',
  editor: 'llm_response_format'
}
```

```ts
if (nodeType === 'llm') {
  return [
    createSectionBlock('Inputs', inputFields),
    { kind: 'dynamic_form', form_key: 'llm_parameters', title: 'LLM 参数' },
    createSectionBlock('Advanced', advancedFields)
  ];
}
```

- [ ] **Step 4: Re-run the editor tests and confirm model switching clears and rebuilds parameter items**

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
Expected: PASS

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-schema-registry.test.tsx src/features/agent-flow/_tests/agent-flow-node-card.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the `LLM` node editor refactor**

```bash
rtk git add web/packages/flow-schema/src/index.ts \
  web/app/src/features/agent-flow/lib/llm-node-config.ts \
  web/app/src/features/agent-flow/components/detail/fields/LlmProviderSelectorField.tsx \
  web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx \
  web/app/src/features/agent-flow/components/detail/fields/LlmResponseFormatField.tsx \
  web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx \
  web/app/src/features/agent-flow/lib/node-definitions/nodes/llm.ts \
  web/app/src/features/agent-flow/schema/node-schema-fragments.ts \
  web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts \
  web/app/src/features/agent-flow/api/model-provider-options.ts \
  web/app/src/features/agent-flow/lib/model-options.ts \
  web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx \
  web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx \
  web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-node-card.test.tsx
rtk git commit -m "feat: move llm nodes to plugin-driven parameter forms"
```

## Task 5: Lock Validation, Settings Fixtures, And Final Regression

**Files:**
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/_tests/validate-document.test.ts`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`

- [ ] **Step 1: Write failing validation and settings fixture tests**

```ts
expect(
  issues.some(
    (issue) =>
      issue.nodeId === 'node-llm' &&
      issue.fieldKey === 'config.model_provider' &&
      issue.title === 'LLM 模型供应商实例不可用'
  )
).toBe(true);
```

```ts
expect(options.instances[0].models[0].parameter_form?.fields[0].key).toBe('temperature');
```

- [ ] **Step 2: Run the focused validation and settings tests**

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/features/agent-flow/_tests/validate-document.test.ts src/features/settings/_tests/model-providers-page.test.tsx src/features/settings/_tests/settings-page.test.tsx`
Expected: FAIL because the validator and fixtures still assume `provider_instance_id / model` live at the top level of `config`.

- [ ] **Step 3: Update validation helpers and fixture payloads to the new object shape**

```ts
const providerInstanceId =
  getLlmProviderSelection(node.config).provider_instance_id.trim();
const modelId = getLlmProviderSelection(node.config).model_id.trim();

if (!providerInstanceId) {
  pushFieldIssue(
    issues,
    node,
    'config.model_provider',
    'LLM 缺少模型供应商实例',
    '请先选择模型供应商实例。'
  );
}
```

```ts
models: [
  {
    model_id: 'gpt-4o-mini',
    display_name: 'GPT-4o Mini',
    source: 'catalog',
    supports_streaming: true,
    supports_tool_call: true,
    supports_multimodal: false,
    context_window: 128000,
    max_output_tokens: 16384,
    parameter_form: {
      schema_version: '1.0.0',
      fields: [{ key: 'temperature', label: 'Temperature', type: 'number' }]
    },
    provider_metadata: {}
  }
]
```

- [ ] **Step 4: Run the regression sweep**

Run: `rtk pnpm --dir web --filter @1flowbase/web test -- src/features/agent-flow/_tests/validate-document.test.ts src/features/agent-flow/_tests/llm-model-provider-field.test.tsx src/shared/schema-ui/_tests/schema-runtime.test.tsx src/features/settings/_tests/model-providers-page.test.tsx`
Expected: PASS

Run: `rtk cargo test -p control-plane model_provider_service_tests`
Expected: PASS

Run: `rtk cargo test -p orchestration-runtime execution_engine_tests`
Expected: PASS

Run: `rtk node scripts/node/verify-backend.js`
Expected: PASS

Run: `rtk pnpm --dir web lint`
Expected: PASS

Run: `rtk pnpm --dir web --filter @1flowbase/web build`
Expected: PASS

- [ ] **Step 5: Commit the validation and regression slice**

```bash
rtk git add web/app/src/features/agent-flow/lib/validate-document.ts \
  web/app/src/features/agent-flow/_tests/validate-document.test.ts \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx \
  web/app/src/features/settings/_tests/settings-page.test.tsx
rtk git commit -m "test: lock llm plugin parameter schema regressions"
```

## Self-Review

- Spec coverage:
  - 插件返回模型级 `parameter_form`：Task 1
  - 运行时透传 `llm_parameters` 与 `response_format`：Task 2
  - `schema ui` 新增 `dynamic_form`：Task 3
  - 节点配置迁移为 `model_provider / llm_parameters / response_format`：Task 4
  - `json_schema` 不反推输出契约、节点仍只输出 `text`：Task 2 + Task 4
  - 切换模型后清空并重建参数：Task 4
  - 后台刷新模型缓存继续生效并带回新 schema：Task 1 + Task 5
- Placeholder scan:
  - 无 `TODO / TBD / implement later / similar to` 等占位描述。
- Type consistency:
  - 统一使用 `parameter_form`、`model_parameters`、`model_provider`、`llm_parameters`、`response_format`。

Plan complete and saved to `docs/superpowers/plans/2026-04-19-llm-plugin-parameter-schema-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
