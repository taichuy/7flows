# Agent Flow 变量链接器与运行态契约设计

日期：2026-05-07

状态：已按开发期破坏性基线重写，并补入持久化、缓存、流式、插件和 Data Model 审计项；待拆 implementation plan

取代文档：无

关联问题：
- Answer 节点调试变量缓存同时展示 `answer_template` 与 `answer`，且值相同，导致用户误以为存在两个等价输出变量。
- Template Transform、LLM、HTTP、Tool、Data Model 等节点也可能因为运行输入、运行输出和运行指标混合展示而产生同类认知混乱。
- 当前开发期允许重置数据库、重建默认草稿和改写 schema，因此本设计不为既有草稿、selector、snapshot 建立保留路径。

关联代码：
- `web/packages/flow-schema/src/index.ts`
- `web/app/src/features/agent-flow/lib/selector-options.ts`
- `web/app/src/features/agent-flow/lib/start-node-variables.ts`
- `web/app/src/features/agent-flow/lib/node-definitions/nodes/answer.ts`
- `web/app/src/features/agent-flow/lib/node-definitions/nodes/template-transform.ts`
- `web/app/src/features/agent-flow/schema/agent-flow-field-renderers.tsx`
- `web/app/src/features/agent-flow/components/bindings/SelectorField.tsx`
- `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
- `web/app/src/features/agent-flow/lib/node-definitions/types.ts`
- `web/app/src/features/agent-flow/schema/node-schema-registry.ts`
- `web/app/src/features/agent-flow/schema/node-schema-fragments.ts`
- `web/app/src/features/agent-flow/schema/node-schema-adapter.ts`
- `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
- `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- `web/app/src/features/agent-flow/lib/plugin-node-definitions.ts`
- `api/crates/orchestration-runtime/src/execution_engine.rs`
- `api/crates/orchestration-runtime/src/execution_state.rs`
- `api/crates/control-plane/src/orchestration_runtime/live_debug_run/continuation.rs`
- `api/crates/control-plane/src/orchestration_runtime/persistence.rs`
- `api/apps/api-server/src/routes/applications/application_runtime.rs`

参考实现：
- `../dify/web/app/components/workflow/hooks/use-workflow.ts`
- `../dify/web/app/components/workflow/hooks/use-workflow-variables.ts`
- `../dify/web/app/components/workflow/hooks/use-nodes-available-var-list.ts`
- `../dify/web/app/components/workflow/nodes/_base/hooks/use-available-var-list.ts`
- `../dify/web/app/components/workflow/nodes/_base/components/variable/var-reference-picker.tsx`
- `../dify/web/app/components/workflow/nodes/_base/components/variable/utils.ts`
- `tmp/graphon-inspect/graphon/nodes/answer/answer_node.py`

## 1. 文档目标

本文固定 1flowbase Agent Flow 节点链接器、变量链接器、运行态 payload 和调试变量缓存的边界。

核心目标：

1. Variable Picker、Variables tab、Debug Variable Cache 对“变量”的定义完全一致：变量只来自公开输出契约。
2. `bindings`、`input_payload`、`output_payload`、`metrics_payload`、`error_payload`、`debug_payload` 语义互斥。
3. `output_payload` 只能包含可被下游引用的业务输出，不承载 usage、route、attempt、provider metadata、raw response、错误详情或调试索引。
4. Answer 节点只暴露 `answer`；`answer_template` 只作为 resolved input 出现在 Trace Inputs。
5. LLM 节点只把业务结果放进 output；用量、路由、尝试、finish reason 和 provider 证据全部进入 metrics/debug/error。
6. 节点 meta、默认值、卡片、详情面板、运行面板、端口、策略和插件贡献纳入同一个 Node Runtime UI Contract。
7. 新增节点只需声明节点契约，即可接入节点选择器、画布卡片、详情面板、变量链接器、变量池和调试缓存。
8. 本设计按开发期破坏性基线推进；schema、默认文档、durable snapshot 和数据库可以重建。
9. RuntimeEventStream、durable run records、debug snapshot 和 frontend preview cache 各自有明确 owner，不互相伪装成真值。
10. 插件节点贡献按宿主声明式 contract v2 接入，不允许插件直接注入 React panel、基础设施连接或未注册 renderer。
11. Data Model CRUD 节点的输出、权限、作用域、副作用和重跑语义按动作矩阵固定。

本文不是 implementation plan；实现前需要拆单独 plan。

## 2. 当前问题事实

### 2.1 Answer 重复字段不是单点 bug

当前默认文档中 Answer 节点定义为：

```ts
bindings.answer_template = { kind: 'templated_text', value: '{{node-llm.text}}' }
outputs = [{ key: 'answer', title: '对话输出', valueType: 'string' }]
```

运行时 Answer 和 Template Transform 使用同一类执行分支：

```text
resolved input / rendered template -> first output key
```

因此 Answer 的 `input_payload.answer_template` 与 `output_payload.answer` 在内容上天然可能相等。

问题不在于二者值相等，而在于 Debug Variable Cache 把 `input_payload` 和 `output_payload` 合并到同一个 node cache。

### 2.2 同类风险会扩散到其他节点

只要一个节点的输出是对输入的加工、转发或渲染，就可能出现同类困惑：

1. `template_transform`: `bindings.template` 与 `outputs.text` 可能相同。
2. `llm`: `prompt_messages` 是运行输入；`text` 是公开输出；`usage`、`route`、`attempts`、`finish_reason` 是运行指标。
3. `http_request`: `url`、`headers`、`query`、`body` 是运行输入；`status_code`、`body`、`headers` 才是业务输出。
4. `tool` / `plugin_node`: 参数是运行输入；插件声明的 output schema 才是公开输出。
5. `data_model_*`: `query`、`payload`、`record_id` 是运行输入；`records`、`record`、`deleted_id`、`affected_count` 是公开输出。
6. `human_input`: `prompt` 与 form schema 是运行输入；resume payload 中的用户提交值才是公开输出。

因此最终方案不能是“在某个面板不显示 `answer_template`”，而必须重建运行态分层。

### 2.3 当前代码暴露的硬问题

当前代码中存在五类边界破损：

1. 前端 selector option 直接读取 `getNodeVariableOutputs(node)`，没有统一变量链接器 source、scope 和 filter 语义。
2. 前端 debug cache 从 trace items 和 run detail 同时合并 node input 与 node output。
3. 后端 durable debug variable snapshot 把 `flow_run.input_payload` 原样 merge 到 variable cache。
4. LLM runtime 的 `output_payload` 同时包含 `text`、`message`、`tool_calls`、`finish_reason`、`route`、`usage`、`error`、`__attempt_ids` 等不同层级信息。
5. 节点定义层只有轻量 `NodeDefinition + schema UI` 骨架，节点 meta、default config、node card、detail panel、single-run/debug form、ports、retry/error policy、plugin contribution 没有形成统一契约。

这些问题必须按契约重建，不应在 UI 层用过滤规则掩盖。

## 3. Dify 参考结论

Dify 的成熟点不是某个 Answer 节点字段命名，而是把两类链接分开：

1. 节点连线器：负责执行拓扑、分支、handle、节点插入删除。
2. 变量链接器：负责可见变量、变量类型、作用域、特殊变量和变量选择器。

Dify 的变量链接器链路是：

```text
current node
  -> getBeforeNodesInSameBranchIncludeParent / getTreeLeafNodes
  -> getNodeAvailableVars
  -> toNodeAvailableVars
  -> variable picker type / file / constant filtering
```

可吸收的设计原则：

1. 变量选择器不从运行缓存反推变量。
2. 变量选择器只来自节点定义或节点配置声明的输出契约。
3. 上游可见性由图拓扑和容器/分支作用域决定。
4. env、conversation、sys、rag 等特殊变量作为独立 source 进入变量链接器，不伪装成普通节点输入。
5. 运行 trace 中可以展示 input、output、metrics、debug，但变量池只存 output。
6. node meta 和 panel 是节点契约的一部分，不能散落在 picker、card、schema adapter、field renderer、runtime panel 和 plugin contribution 多处。
7. 节点默认值、配置面板、运行面板、单节点试跑表单、错误处理、重试策略和输出变量应该由同一节点契约派生。

吸收但不复制的部分：

1. 不复制 Dify 的 React 组件、store 结构和节点目录实现细节。
2. 不引入 Dify 的完整特殊变量体系。
3. 不把 Dify 的 `answer` 配置字段命名直接迁入 1flowbase；1flowbase 继续用 `answer_template` 表示 Answer 输入模板。
4. 不把 metadata/error/debug 当成 output 再靠可见性字段筛掉。
5. 1flowbase 采用自己的 Node Runtime UI Contract：用声明式 contract 驱动节点选择器、卡片、Inspector、Detail Panel、运行态面板、变量链接器和插件节点贡献。

## 4. 信息架构诊断

### 4.1 问题清单

| # | 问题类型 | 位置 | 描述 | 严重度 |
|---|---|---|---|---|
| 1 | 分类不互斥 | Debug Variable Cache | 同一节点输入与输出混合展示，用户无法判断哪个可被下游引用。 | 高 |
| 2 | 层级错位 | Variables tab | 运行输入属于 Trace 深度，却出现在变量概览层。 | 高 |
| 3 | 分类不穷尽 | Runtime payload | 公开变量、指标、错误、调试事件缺少互斥容器。 | 高 |
| 4 | 入口语义混乱 | Variable Picker / Debug Cache | 变量选择器基于 outputs，调试缓存基于 input+output，两个入口对“变量”的定义不一致。 | 高 |
| 5 | 状态真值分裂 | Frontend cache / backend variable pool | 前端缓存和后端 variable pool 没有共享同一套公开输出规则。 | 高 |
| 6 | 节点契约分裂 | Node definition / schema UI / panel / runtime | 节点 meta、默认值、卡片、面板、端口、运行态和插件贡献分散定义，新增节点需要多处特判。 | 高 |

### 4.2 修正后的信息深度

| 信息 | 深度 | 容器 | 规则 |
|---|---|---|---|
| 可被下游引用的变量 | L0/L1 | Variable Cache / Variable Picker | 只来自公开输出契约。 |
| 当前节点解析后的输入 | L1 | Trace item detail | 只用于调试，不进入变量缓存。 |
| 节点公开输出 | L1 | Trace Outputs / Variable Cache | 与 variable pool 同源。 |
| token、耗时、route、attempt、finish reason | L1 | Trace Metrics | 指标，不作为普通变量。 |
| provider event、raw response、artifact ref | L2 | Trace Debug | 调试证据，不进入变量选择器。 |
| 错误信息 | L1 | Trace Error | 错误态信息；只有显式错误处理策略能产出异常变量。 |

## 5. 范围

### 5.1 本阶段范围

1. 固定 Agent Flow 节点 `bindings / outputs / runtime trace / variable cache` 的分层 contract。
2. 重建 Debug Variable Cache 的语义：只展示公开输出变量。
3. 重建 durable debug variable snapshot 的语义：只聚合 Start 公开输入变量和节点公开输出变量。
4. 建立前端变量链接器接口，替代散落的 selector option 生成逻辑。
5. 建立 Node Runtime UI Contract，统一 node meta、default config、card、panel、ports、runtime schema、policy 和 plugin contribution。
6. 将 output contract 收敛为 public-only；metadata、debug、error 不再作为 output 类型存在。
7. 明确 Answer、Template Transform、LLM、HTTP、Tool、Plugin、Data Model、Human Input 的输入输出归属。
8. 将 LLM usage、route、attempt、finish reason、provider metadata 从 output payload 移出。
9. 建立 schema 重置和默认文档重种子策略。
10. 建立 snapshot key、snapshot schema version、document hash、run scope 和失效策略。
11. 建立 RuntimeEventStream 与 durable debug event 的流式返回契约。
12. 建立 plugin node contribution v2 到 Node Runtime UI Contract 的映射和校验规则。
13. 建立 Data Model 节点动作级输出、权限、scope 和副作用矩阵。

### 5.2 非目标

1. 不重写画布连线交互。
2. 不实现 Dify 全量变量体系。
3. 不把所有节点字段重命名成 Dify 命名。
4. 不把运行输入从 Trace 中删除。
5. 不让前端变量缓存替代后端 variable pool。
6. 不在本 spec 中实现代码。

## 6. 设计原则

1. 节点连线只表达执行拓扑，变量链接只表达数据依赖。
2. `bindings` 是输入声明，不是输出变量。
3. `input_payload` 是运行时解析结果，只服务 Trace 和调试。
4. `output_payload` 只能保存公开业务输出，且是 variable pool 的唯一节点输出来源。
5. `metrics_payload` 承载 usage、duration、route、attempt、finish reason、preview mode。
6. `error_payload` 承载失败信息；异常变量必须通过显式错误处理策略产出。
7. `debug_payload` / provider events 承载 raw response、artifact ref、provider event 和内部排障证据。
8. Variable Picker、Variables tab、Debug Variable Cache 必须共享同一套公开输出定义。
9. Node Picker、Node Card、Inspector、Detail Panel、Last Run Panel 必须共享同一套节点契约。
10. 开发期以长期契约正确性优先，不为既有草稿或快照牺牲边界。
11. PostgreSQL run records 是 durable truth；RuntimeEventStream 是短期实时通道；debug snapshot 和 frontend preview cache 只做读取加速。
12. 缓存 key、失效规则、snapshot 恢复顺序归 runtime resource owner；cache-store / Redis 只作为 HostExtension provider 实现宿主 contract。
13. `output_payload` 写入前必须经过 public output filter；filter 输入是节点契约，不是 UI 展示偏好。
14. LLM live delta 先进入 RuntimeEventStream，再由最终 payload builder 收敛为 public output、metrics、error 和 debug。
15. 大对象、raw response、provider event、artifact 和内部证据默认以 ref 进入 debug，不直接塞入 node output。
16. 写入型 Data Model 节点必须声明副作用等级，调试运行、重跑和 checkpoint 恢复必须能解释是否会重复写。
17. 插件贡献只能声明宿主支持的能力和 schema；基础设施缓存、队列、锁、事件总线不由 RuntimeExtension 或 CapabilityPlugin 直连。

## 7. 目标概念模型

```text
Flow Node Definition
  config: static configuration
  bindings: input binding declarations
  outputs: public output contract only

Node Runtime UI Contract
  meta: label / summary / icon / category / help / capabilities
  defaults: default config / bindings / outputs
  card: node card blocks
  panel: inspector and detail panel sections
  ports: handles and connection rules
  runtime: input / output / metrics / error / debug display schema
  policies: retry / error handling / timeout / single-run form

Runtime Node Run
  input_payload: resolved inputs, trace only
  output_payload: public outputs, variable pool source
  metrics_payload: usage / duration / route / attempts / finish reason
  error_payload: error information
  debug_payload/provider_events: advanced evidence

Variable Linker
  sources: start inputs / node public outputs / explicit special sources
  visible nodes: graph topology + branch/container scope
  visible variables: public outputs from visible sources
  filters: valueType / source kind
```

## 8. Flow Schema 契约

### 8.1 Schema 基线

本设计引入新的 authoring schema baseline。实现时应同步更新前端 schema package、后端默认文档、编译器输入校验和本地开发数据库种子。

```ts
export const FLOW_SCHEMA_VERSION = '1flowbase.flow/v2';
```

规则：

1. v2 文档不读取 v1 草稿。
2. 本地开发数据库可直接重置。
3. 默认应用草稿按 v2 重新生成。
4. 编译器遇到非 v2 文档直接拒绝编译。
5. API 返回的 draft document 必须是 v2，否则视为数据基线错误。

### 8.2 输出契约

`FlowNodeOutputDocument` 只表达公开业务输出。

```ts
export interface FlowNodeOutputDocument {
  key: string;
  title: string;
  valueType: string;
  description?: string;
}
```

规则：

1. 出现在 `outputs` 中的字段必须可进入 Variable Picker。
2. 出现在 `outputs` 中的字段必须可进入 Variables tab。
3. 出现在 `outputs` 中的字段必须可进入 runtime variable pool。
4. 出现在 `outputs` 中的字段必须可被下游 selector 引用。
5. metadata、debug、error、usage、route、attempt、finish reason、provider raw response 不允许出现在 `outputs`。
6. 需要面向 Trace 展示的非业务信息必须进入 metrics/error/debug 容器。

### 8.3 绑定契约

`FlowBinding` 继续表达当前节点需要的输入。

```ts
bindings: Record<string, FlowBinding>
```

规则：

1. `bindings.*` 永远表示输入声明。
2. binding key 使用输入语义名称，例如 `answer_template`、`prompt_messages`、`query`、`payload`、`record_id`。
3. binding key 不需要与 output key 同名。
4. binding 解析后的值进入 `input_payload`。
5. binding 不能直接进入变量缓存。
6. selector 只能引用变量链接器返回的公开变量。

### 8.4 非输出声明

节点可以声明 metrics/error/debug 的展示 schema，但这些 schema 不参与变量链接器。

```ts
export interface FlowNodeRuntimeSchemaDocument {
  metrics?: Array<{ key: string; title: string; valueType: string }>;
  errors?: Array<{ key: string; title: string; valueType: string }>;
  debug?: Array<{ key: string; title: string; valueType: string }>;
}
```

规则：

1. runtime schema 只服务 Trace、observability、debug console。
2. runtime schema 不生成 selector。
3. runtime schema 不写入 variable pool。
4. runtime schema 不出现在 Variables tab。

## 9. Node Runtime UI Contract

### 9.1 当前状态

1flowbase 已有轻量节点 UI 骨架：

1. `NodeDefinition` 提供 label、summary、helpHref、sections、fields。
2. `node-schema-registry` 将节点定义转换为 card、detail tabs、runtime slots。
3. `NodeDetailPanel` 使用统一 dock panel，包含 `设置` 与 `上次运行`。
4. `NodeInspector` 使用 schema renderer 渲染字段和 view block。
5. `plugin-node-definitions` 能根据 capability plugin contribution 生成 picker option 和 outputs。

这套骨架方向正确，但仍缺少长期契约：

1. node picker、node factory、node card、inspector、detail panel、last run panel 和 runtime trace 没有共享完整节点 contract。
2. default config、default bindings、default outputs 仍主要由 node factory 和具体节点文件拼接。
3. ports/handles、container 能力、single-run/debug form、retry/error policy 还没有进入节点契约。
4. plugin contribution 只接入 picker 和 output schema，没有接入 panel schema、runtime schema 和 policy schema。
5. 节点运行态面板仍按通用 Inputs/Outputs/Metadata 展示，无法表达节点自己的 metrics、error、debug 证据结构。

### 9.2 目标契约

每个节点类型必须能编译出一个 Node Runtime UI Contract。

```ts
export interface AgentFlowNodeRuntimeUiContract {
  schemaVersion: '1flowbase.node-runtime-ui/v1';
  nodeType: FlowNodeType;
  meta: {
    label: string;
    summary: string;
    icon?: string;
    category: string;
    helpHref: string | null;
    capabilities: string[];
  };
  defaults: {
    config: Record<string, unknown>;
    bindings: Record<string, FlowBinding>;
    outputs: FlowNodeOutputDocument[];
  };
  ports: {
    inputs: Array<{ key: string; title: string; required: boolean }>;
    outputs: Array<{ key: string; title: string; branchKey?: string }>;
  };
  card: {
    blocks: SchemaBlock[];
  };
  panel: {
    header: SchemaBlock[];
    tabs: Array<{
      key: string;
      title: string;
      blocks: SchemaBlock[];
    }>;
  };
  runtime: {
    inputs: Array<{ key: string; title: string; valueType: string }>;
    outputs: FlowNodeOutputDocument[];
    metrics: FlowNodeRuntimeSchemaDocument['metrics'];
    errors: FlowNodeRuntimeSchemaDocument['errors'];
    debug: FlowNodeRuntimeSchemaDocument['debug'];
  };
  policies: {
    retry?: Record<string, unknown>;
    errorHandling?: Record<string, unknown>;
    timeout?: Record<string, unknown>;
    singleRunForm?: SchemaBlock[];
  };
}
```

规则：

1. Node Picker 只读取 `meta` 和 `defaults`。
2. Node Factory 只读取 `defaults` 创建节点文档。
3. Canvas Card 只读取 `card` 和 `meta`。
4. Inspector 与 Detail Panel 只读取 `panel`。
5. Variable Linker 只读取 `defaults.outputs` 或节点实例上的 public outputs。
6. Last Run Panel 只读取 `runtime` 描述 inputs、outputs、metrics、errors、debug 的展示结构。
7. 端口和连线 handle 只读取 `ports`，不由画布组件硬编码节点类型。
8. retry、error handling、timeout、single-run/debug form 只读取 `policies`。
9. schema adapter 只负责读写节点实例值，不负责决定某类节点有哪些面板能力。

### 9.3 Builtin 节点接入

内置节点的 contract 来源为 `web/app/src/features/agent-flow/lib/node-definitions/**`。

规则：

1. 每个内置节点有且只有一个 contract builder。
2. contract builder 输出 meta、defaults、ports、card、panel、runtime、policies。
3. 节点类型的默认 outputs 必须来自 contract builder。
4. 节点 detail panel section 必须来自 contract builder。
5. 节点卡片展示和 help link 必须来自 contract builder。
6. 节点试跑需要的输入表单必须来自 contract builder 的 `policies.singleRunForm`。
7. 节点运行态 metrics/error/debug 的展示结构必须来自 contract builder 的 `runtime`。

### 9.4 Plugin 节点接入

Capability Plugin 的 node contribution 需要映射到同一个 Node Runtime UI Contract。

插件贡献最小字段：

```text
contribution identity:
  plugin_id
  plugin_version
  contribution_code
  node_shell
  schema_version

ui/runtime contract:
  title
  description
  category
  input_schema
  output_schema
  panel_schema
  runtime_schema
  policy_schema
```

规则：

1. plugin contribution 不能直接提供 React panel。
2. plugin contribution 只能使用宿主注册的 field/view renderer。
3. plugin `output_schema.outputs` 必须等价于 public outputs。
4. plugin `panel_schema` 只描述配置表单和静态 view block。
5. plugin `runtime_schema` 只描述 Trace 展示结构，不生成变量。
6. plugin `policy_schema` 只描述 retry、error handling、timeout 和 single-run/debug form。
7. dependency status 不为 ready 时，Node Picker 可以展示禁用项，但不能创建不可编译节点。

插件 contribution v2 必须补齐以下硬边界：

```text
schema_version: 1flowbase.node-contribution/v2
panel_schema: host-renderer blocks only
runtime_schema: inputs / outputs / metrics / errors / debug display schema
policy_schema: timeout / retry / error handling / side effect / single-run form
renderer_allowlist: field and view renderer codes
output_schema.outputs: public outputs only
```

校验规则：

1. v2 contribution 不接受 unknown renderer code。
2. v2 contribution 不接受 `metadata`、`usage`、`debug`、`error`、`__*` 作为 public output key。
3. v2 contribution 必须声明 `side_effect`：`none`、`external_read`、`external_write` 或 `durable_write`。
4. v2 contribution 的 `runtime_schema.outputs` 必须与 `output_schema.outputs` 同 key；metrics/error/debug 只能进入对应 schema。
5. v1 contribution 可在开发期直接拒绝编译或通过重种子替换，不写兼容 mapper。
6. RuntimeExtension / CapabilityPlugin 不能声明或消费 `cache-store`、`distributed-lock`、`event-bus`、`task-queue` 等宿主基础设施连接。
7. HostExtension provider 可以实现基础设施 contract，但 cache 数据不能成为 Agent Flow 变量真值。

### 9.5 Panel 信息深度

Node Runtime UI Contract 固定节点详情的信息深度：

| 面板区域 | 深度 | 内容 | 变量关系 |
|---|---|---|---|
| Node Card | L0 | 类型、别名、摘要、关键状态 | 不展示 resolved input。 |
| Inspector Config | L1 | 当前节点配置、bindings、策略 | 可以编辑 selector，但不展示变量缓存。 |
| Output Contract | L1 | 当前节点公开输出 | Variable Linker 来源。 |
| Last Run Inputs | L1 | resolved inputs | Trace only。 |
| Last Run Outputs | L1 | public outputs | 与 variable pool 同源。 |
| Last Run Metrics | L1 | usage、route、attempt、duration | 不进变量池。 |
| Last Run Error | L1 | error payload | 不进变量池。 |
| Last Run Debug | L2 | provider events、raw refs、internal evidence | 不进变量池。 |

规则：

1. Config panel 不读取 runtime cache 生成字段。
2. Last Run panel 不反推 selector options。
3. Output Contract panel 只展示 public outputs。
4. Metrics/Error/Debug 不能通过 panel schema 伪装成 outputs。
5. 单节点试跑表单只解决运行输入收集，不改变节点 contract。

## 10. 变量链接器契约

### 10.1 前端能力边界

将 `listVisibleSelectorOptions(document, nodeId)` 收敛为语义明确的变量链接器。

```ts
export type AgentFlowVariableSourceKind =
  | 'start_input'
  | 'node_output'
  | 'system';

export interface AgentFlowAvailableVariable {
  sourceKind: AgentFlowVariableSourceKind;
  nodeId: string;
  nodeLabel: string;
  key: string;
  title: string;
  valueType: string;
  selector: string[];
  displayLabel: string;
}

export interface AgentFlowVariableScopeOptions {
  sourceKinds?: AgentFlowVariableSourceKind[];
  valueTypes?: string[];
  containerId?: string | null;
  branchId?: string | null;
}

export function listAvailableVariables(
  document: FlowAuthoringDocument,
  nodeId: string,
  options?: AgentFlowVariableScopeOptions
): AgentFlowAvailableVariable[];
```

### 10.2 可见节点规则

1. 普通节点只能看到当前节点的上游节点。
2. Start 派生输出按 Start source 进入变量链接器。
3. `if_else` 只表达控制流；没有显式 output contract 时不暴露变量。
4. 同一 `containerId` 内按图拓扑计算可见性。
5. 容器内部节点可以看到父容器入口之前的上游公开输出。
6. loop/iteration 内部 item 变量必须作为明确 source kind 接入，不写入普通节点 outputs。
7. env/session/global 类变量必须作为 `system` 或专门 source kind 接入，不伪装成 Start input 或 node output。

### 10.3 可见变量规则

1. 只读取 Start 派生公开输入和节点 `outputs`。
2. selector path 基线保持 `[nodeId, key]`。
3. 结构化输出的深层 path 必须来自 output schema，不来自运行样本。
4. 变量链接器按 source kind 和 valueType 过滤。
5. 不提供 metadata/debug/error 的变量开关。
6. 如果 selector 指向不存在的公开变量，文档校验直接失败。

### 10.4 UI 规则

1. 变量选择器文案使用“选择上游输出”，不使用“选择缓存字段”。
2. 变量块展示 `node alias / output title`。
3. Variables tab 展示节点级 output object，不递归平铺对象内部字段。
4. Trace Inputs 展示 resolved inputs。
5. Trace Metrics 展示 usage、duration、route、attempt、finish reason。
6. Trace Debug 展示 provider events、raw response ref、artifact ref。
7. 失效 selector 在表单中显示正式错误状态，不显示“可继续运行”的提示。
8. Debug Variable Cache 按节点输出对象展示，不把对象内部字段递归平铺成独立缓存条目。
9. Variable Picker 需要选择结构化字段时，只能按 output schema 展开字段级 selector，不从运行样本展开。
10. Run Context、Environment、Session、Trace Inputs 都不能放进 Variable Cache 分组；这些内容保留独立只读分组。

## 11. Runtime 契约

### 11.1 NodeExecutionTrace

运行时 trace 固定提供五类 payload：

```text
input_payload
output_payload
metrics_payload
error_payload
debug_payload
```

规则：

1. `input_payload` 保存 resolved inputs。
2. `output_payload` 保存公开业务输出。
3. `metrics_payload` 保存 usage、duration、route、attempt、finish_reason、preview_mode。
4. `error_payload` 保存错误。
5. `debug_payload` 保存 raw response ref、provider event ref、artifact ref、internal evidence。
6. provider stream events 不进入 output payload。

### 11.2 Variable Pool

运行时 variable pool 只写入公开输出。

```text
variable_pool[node_id] = output_payload
```

禁止：

1. 把 `input_payload` 写入 variable pool。
2. 把 `metrics_payload` 写入 variable pool。
3. 把 `error_payload` 写入 variable pool，除非显式错误处理策略产出异常变量。
4. 把 `debug_payload` 写入 variable pool。
5. 把 provider raw event 写入 variable pool。

### 11.3 Debug Snapshot

持久化 debug variable snapshot 只聚合：

1. Start 节点公开输入变量。
2. 每个 node run 的 `output_payload`。

规则：

1. 不读取 `node_run.input_payload` 构造 variable cache。
2. 不读取 `flow_run.input_payload` 构造 variable cache，Start 节点除外。
3. 不读取 `metrics_payload`、`error_payload`、`debug_payload` 构造 variable cache。
4. snapshot 是变量缓存的恢复加速层，不是运行真值来源。
5. Run Context 单独展示本次运行起始输入。

### 11.4 持久化、缓存与 snapshot 真值

运行态存储分成四层：

| 层 | Owner | 用途 | 真值关系 |
|---|---|---|---|
| Flow Run / Node Run | durable storage | 当前状态、payload、错误、指标、审计入口 | durable truth |
| RuntimeEventStream | runtime service | live delta、node lifecycle、首 token 加速 | realtime channel |
| Debug Event / Artifact | observability / object storage | 可恢复调试事件、大对象和 raw ref | durable evidence |
| Debug Variable Snapshot | runtime resource owner | editor 打开时恢复变量缓存 | acceleration cache |

snapshot key 固定包含：

```text
application_id
draft_id
document_hash
flow_schema_version
snapshot_schema_version
latest_completed_or_running_run_id
```

规则：

1. `document_hash` 改变后旧 snapshot 不再参与恢复。
2. `flow_schema_version` 或 `snapshot_schema_version` 改变后旧 snapshot 直接失效。
3. snapshot 合并顺序固定为：Start 公开输入 -> 按 run order 的 node public output。
4. 同一节点多次运行时，默认以最新 node run 的 public output 覆盖旧值；需要历史对比时走 Run Detail，不走 Variable Cache。
5. snapshot 不从多个 draft 或多个 document hash 混合恢复。
6. frontend preview cache 可以先展示 RuntimeEventStream 最新 output，但最终必须被 durable run detail / snapshot 对齐。
7. cache-store / Redis / local ring buffer 只保存加速数据；缓存丢失不能影响 durable run 的可解释性。
8. audit、billing、checkpoint 和 callback 所需事件不能只停留在易失缓存。

### 11.5 Payload Builder 与 public output filter

每个节点运行完成后统一经过 payload builder：

```text
resolved inputs
  -> node executor
  -> raw execution result
  -> public output filter
  -> metrics/error/debug splitter
  -> node_run payload persistence
  -> variable_pool update
```

规则：

1. public output filter 只允许写入节点 contract 中声明的 output key。
2. executor 返回额外字段时，额外字段必须被 splitter 放入 metrics/error/debug 或丢弃并记录校验错误。
3. LLM、Plugin、HTTP、Data Model 都不能绕过统一 payload builder 直接写 variable pool。
4. failure path 默认不写普通 public output；如需可被下游引用的异常变量，必须由显式错误处理策略产出新的 public output。
5. live debug run 与 non-stream debug run 必须使用同一 payload builder。
6. checkpoint 的 `variable_snapshot` 只保存 public-only variable pool。

### 11.6 RuntimeEventStream 与 LLM 流式返回

RuntimeEventStream 是运行事件通道，不是变量缓存，也不是 key/value cache。

LLM 流式事件分层：

| 事件 / 数据 | 去向 | 是否进 variable pool |
|---|---|---|
| `text_delta` | RuntimeEventStream + durable debug event | No |
| `reasoning_delta` | RuntimeEventStream + durable debug event + Trace Debug/Reasoning | No |
| `usage_delta` / `usage_snapshot` | RuntimeEventStream 或 metrics builder | No |
| provider raw event | debug artifact / provider event ref | No |
| final answer text | `output_payload.text` | Yes |
| structured output | `output_payload.structured_output` | Yes，仅在 contract 声明时 |
| finish reason / route / attempts | `metrics_payload` | No |
| provider metadata / tool calls / MCP calls | `debug_payload` 或 artifact ref | No |

规则：

1. SSE 首 token 可以早于 node run durable 更新，但不能早于 run accepted event。
2. text delta 不触发每 token variable cache rebuild。
3. final `output_payload.text` 是最终可复制、可下游引用的业务答案；reasoning 不拼入最终 answer。
4. 如果 provider 在首 token 后失败，已发出的 delta 保留在 Trace/Debug 中，LLM 节点仍按失败处理，不向 variable pool 写普通 output。
5. RuntimeEventStream provider 可以从 local ring buffer 升级到 Redis Streams / NATS / Kafka 等 HostExtension provider；Core 只依赖 `RuntimeEventStream` contract。
6. durable debug event 持久化可以异步，但持久化失败必须可诊断。

### 11.7 debug_payload 与大对象引用

`debug_payload` 承载调试证据索引，不承载可被下游引用的业务结果。

建议字段：

```text
raw_response_ref
provider_events_ref
artifact_refs
context_projection_id
attempt_ids
winner_attempt_id
tool_call_refs
mcp_call_refs
internal_evidence
```

规则：

1. 小型 debug metadata 可以内联；大文本、大 JSON、文件和 raw provider response 只存 ref。
2. `debug_payload` 不进入 Variables tab、Variable Picker、Debug Variable Cache。
3. Trace Debug 读取 `debug_payload` 和 debug artifacts，不读取 variable pool。
4. debug artifact 的生命周期跟随 run retention policy，不跟随 editor preview cache。

## 12. 节点级契约

### 12.1 Start

来源：

1. `config.input_fields`
2. 内置 `query`
3. 内置 `files`

公开变量：

```text
node-start.<custom_input_key>
node-start.query
node-start.files
```

规则：

1. Start 节点 `outputs` 字段保持空数组。
2. Start 公开变量由 `getStartNodeVariableOutputs` 派生。
3. flow run 的外部输入只通过 Start 公开变量进入 variable pool。
4. Start 的 resolved input 可以在 Run Context 展示。

### 12.2 Answer

输入：

```text
bindings.answer_template
```

公开输出：

```text
outputs.answer
```

运行展示：

```text
Trace Inputs: answer_template
Trace Outputs: answer
Variable Cache: node-answer.answer
```

禁止：

1. `VariableCache.node-answer.answer_template`
2. `VariablePicker.node-answer.answer_template`
3. `output_payload.answer_template`

### 12.3 Template Transform

输入：

```text
bindings.template
```

公开输出：

```text
outputs.text
```

规则：

1. `template` 只在 Trace Inputs 中出现。
2. `text` 进入 output payload 和 variable pool。
3. 内容相同不代表字段等价。

### 12.4 LLM

输入：

```text
bindings.prompt_messages
config.model_provider
config.llm_parameters
config.response_format
```

公开输出：

```text
text
structured_output
```

指标：

```text
usage
route
attempts
duration_ms
provider_code
provider_instance_id
model_id
finish_reason
event_count
```

调试证据：

```text
provider_metadata
tool_calls
mcp_calls
raw_response_ref
context_projection_id
attempt_ids
winner_attempt_id
provider_events_ref
```

错误：

```text
error_kind
message
provider_code
provider_instance_id
attempt_index
failed_after_first_token
```

规则：

1. `text` 是默认下游引用对象。
2. `structured_output` 只在 response format 要求结构化输出时出现。
3. `reasoning_content` 不进入普通公开输出；它属于 debug payload。
4. `usage` 不进入 outputs，也不进入 output payload。
5. `route`、`attempts`、`finish_reason` 不进入 outputs，也不进入 output payload。
6. `provider_metadata`、`tool_calls`、`mcp_calls`、`__*` 内部索引不进入 output payload。
7. LLM 失败时不向 variable pool 写普通 output；错误由 `error_payload` 承载。
8. `text` 不包含 reasoning；如果 provider 以 `<think>` 混合返回，payload builder 必须拆分 answer text 与 reasoning debug。
9. `message` 不是默认 public output；如未来开放 message object，必须显式声明为结构化 public output。
10. live stream 中的 `reasoning_delta` 可以展示和持久化，但不能进入 Answer 节点默认输入，除非用户显式选择 debug source，当前阶段不开放。

### 12.5 HTTP Request

输入：

```text
url
method
headers
query
body
auth
```

公开输出：

```text
status_code
body
headers
```

指标：

```text
duration_ms
retry_count
```

规则：

1. request url、headers、query、body 只在 Trace Inputs 中展示。
2. response status、body、headers 进入 output payload。
3. retry、duration 和 network timing 进入 metrics。

### 12.6 Tool / Plugin Node

输入：

```text
declared input schema resolved values
```

公开输出：

```text
declared output schema fields
```

规则：

1. plugin 贡献的 output schema 是唯一公开变量来源。
2. plugin raw invocation metadata 进入 metrics/debug。
3. plugin 错误进入 error payload。
4. plugin 不能把 invocation metadata 伪装成 output fields。

### 12.7 Data Model Nodes

输入：

```text
record_id
payload
query
```

公开输出：

```text
data_model_list: records, total
data_model_get: record
data_model_create: record
data_model_update: record
data_model_delete: deleted_id, affected_count
```

规则：

1. query binding 中的 selector 参与依赖校验。
2. query resolved input 只在 Trace Inputs 展示。
3. records/record/deleted_id/affected_count 是 variable pool 来源。
4. Data Model 节点按节点类型固定 action，不读取 `config.action`。
5. runtime scope 使用 `actor.current_workspace_id` 或 `SYSTEM_SCOPE_ID` 对应的 Data Model grant，不允许回退到旧 `team/app` alias。
6. metadata 不健康、未发布、未授权或 scope grant 不满足时，进入 `error_payload`，不写 public output。

动作矩阵：

| 节点 | 输入 | 输出 | 副作用 | 重跑规则 |
|---|---|---|---|---|
| `data_model_list` | `query` | `records`, `total` | `external_read` | 可重复 |
| `data_model_get` | `record_id` | `record` | `external_read` | 可重复 |
| `data_model_create` | `payload` | `record` | `durable_write` | 需要 idempotency key 或显式重跑确认 |
| `data_model_update` | `record_id`, `payload` | `record` | `durable_write` | 需要 idempotency key 或显式重跑确认 |
| `data_model_delete` | `record_id` | `deleted_id`, `affected_count` | `durable_write` | 需要 idempotency key 或显式重跑确认 |

调试规则：

1. 默认整流调试允许执行 Data Model read。
2. Data Model write 在 debug run 中必须有 `side_effect_policy`：`disabled`、`confirm_each_run` 或 `allow_with_idempotency`。
3. checkpoint 恢复不能隐式重复执行已经成功的 write node。
4. write node 的 audit/outbox 归 Data Model runtime action owner，不由节点 UI 或插件私自补。

### 12.8 Human Input

输入：

```text
prompt
form schema
delivery config
```

公开输出：

```text
submitted values
```

规则：

1. 等待态没有输出，不写 variable pool。
2. resume 后只写用户提交值。
3. prompt 不进入变量缓存。
4. checkpoint snapshot 保存恢复所需 variable pool，不保存 prompt 作为变量。

## 13. 破坏性基线与重置策略

### 13.1 文档基线

1. `FLOW_SCHEMA_VERSION` 提升到 v2。
2. 默认 flow document 重种子。
3. v2 节点定义必须能生成 Node Runtime UI Contract。
4. v2 编译器只接受 public-only outputs。
5. Start 节点 outputs 仍为空，Start 公开变量继续由 config 派生。
6. LLM 默认 outputs 移除 `usage` 和 `reasoning_content`。

### 13.2 数据库基线

1. 本地开发数据库允许 reset。
2. durable debug snapshot 可清空。
3. application draft document 可按 v2 默认文档重建。
4. flow run、node run、checkpoint 的 payload 结构按新契约写入。
5. 没有 selector 修复路径；失效 selector 由校验报错暴露。

### 13.3 Runtime 基线

1. `NodeExecutionTrace` 增加 `debug_payload`。
2. `output_payload` 写入前必须经过 public output filter。
3. LLM execution builder 不再把 metrics/debug/error 放入 output payload。
4. live debug run 和 non-stream debug run 使用同一套 payload builder。
5. checkpoint 的 variable snapshot 只保存 variable pool。
6. RuntimeEventStream 事件与 node run durable payload 使用同一 node/run id 关联。
7. durable debug events 保存 text/reasoning delta 的合并读模型，不作为 variable pool 来源。
8. `flow_run.output_payload` 只保存最终业务输出，不保存整流变量缓存。
9. `debug_payload` 大对象字段只保存 ref。

### 13.4 Frontend 基线

1. node definitions 输出 Node Runtime UI Contract。
2. node picker、node factory、node card、NodeDetailPanel、NodeInspector、NodeLastRunTab 改为消费 contract。
3. `listVisibleSelectorOptions` 改为变量链接器 façade 或直接下线。
4. SelectorField 只消费 `listAvailableVariables`。
5. Variables tab 只展示 Start inputs 和 node public outputs。
6. Trace panels 分别展示 Inputs、Outputs、Metrics、Error、Debug。
7. node preview variable cache 只从 output payload 更新。
8. Debug Variable Cache 使用 object-level 节点条目展示。
9. Run Context / Environment / Session 独立展示，不合并进 Variable Cache。
10. Variable Picker 结构化字段展开只读 output schema。

## 14. 验收证据

### 14.1 单元测试

必须补充或调整测试覆盖：

1. Answer debug variable cache 只包含 `answer`，不包含 `answer_template`。
2. Template Transform debug variable cache 只包含 `text`，不包含 `template`。
3. LLM variable picker 只显示 `text` 和结构化输出字段，不显示 `prompt_messages`、`usage`、`reasoning_content`、`route`、`attempts`。
4. `listAvailableVariables` 只返回上游公开输出。
5. output contract 中出现 `usage`、`route`、`attempts`、`error`、`__attempt_ids` 时文档校验失败。
6. durable debug snapshot 不合并非 Start 的 node input payload。
7. durable debug snapshot 不合并 metrics/error/debug payload。
8. Data Model query selector 依赖仍能被校验。
9. LLM runtime output payload 不包含 `usage`、`route`、`attempts`、`finish_reason`、`provider_metadata`、`__*`。
10. live debug run 与普通 debug run 的 variable pool 写入规则一致。
11. 内置节点 contract 能驱动 node picker、node factory、node card、Inspector、Detail Panel 和 Last Run Panel。
12. plugin contribution 能映射为 Node Runtime UI Contract，且不能提供未注册 renderer 或 React panel。
13. contract 中 metrics/error/debug schema 不会生成 selector option。
14. snapshot key 包含 `draft_id`、`document_hash`、`flow_schema_version` 和 `snapshot_schema_version`，且 schema/hash 改变后不恢复旧 cache。
15. `debug_payload` 不会进入 Variables tab、Variable Picker 或 Debug Variable Cache。
16. streamed `text_delta` 不触发逐 token variable cache rebuild。
17. streamed `reasoning_delta` 能恢复到 Trace Debug/Reasoning，但不进入 `output_payload.text` 和 variable pool。
18. plugin contribution v2 拒绝 unknown renderer、React panel、基础设施连接和非 public output key。
19. Data Model delete 输出 `deleted_id` 与 `affected_count`，前后端输出契约一致。
20. Data Model write 节点在 debug run 中按 `side_effect_policy` 执行，不允许 checkpoint 恢复重复写。

建议命令：

```bash
pnpm --filter @1flowbase/web test -- agent-flow
cargo test -p orchestration-runtime
cargo test -p api-server
```

warning 与 coverage 产物统一落到：

```text
tmp/test-governance/
```

### 14.2 手工验收

使用默认 Start -> LLM -> Answer 流程：

1. 运行整流调试。
2. Trace 中 LLM Inputs 显示 `prompt_messages`。
3. Trace 中 LLM Outputs 显示 `text`。
4. Trace 中 LLM Metrics 显示 usage、route、attempt、finish reason。
5. Trace 中 Answer Inputs 显示 `answer_template`。
6. Trace 中 Answer Outputs 显示 `answer`。
7. Variables tab 只显示 `node-start.query`、`node-llm.text`、`node-answer.answer`。
8. 变量选择器中不能选择 `node-answer.answer_template`、`node-llm.usage`、`node-llm.route`、`node-llm.reasoning_content`。

使用 Start -> Template Transform -> Answer 流程：

1. Template Transform Variables 只显示 `text`。
2. Answer Variables 只显示 `answer`。
3. 两个节点即使内容相同，也以不同节点的公开输出身份展示。

使用 LLM 失败流程：

1. Trace Error 显示 provider error。
2. Variable Cache 不写入 LLM error。
3. 下游节点不能选择 LLM error 字段。
4. 如果产品启用显式错误分支，异常变量必须由错误处理节点产出公开 output。

使用 LLM 流式流程：

1. SSE 先收到 `flow_accepted` 或 heartbeat，再收到 `text_delta` / `reasoning_delta`。
2. `text_delta` 立即显示在回答区。
3. `reasoning_delta` 显示在独立 reasoning / Trace Debug 区，不拼入最终 answer。
4. node finished 后 Variables tab 才出现 `node-llm.text`。
5. 每 token 到达时 Variable Cache 不重建。

使用 Data Model 写入流程：

1. `data_model_create/update/delete` 在 debug run 中展示 side effect policy。
2. policy 为 `disabled` 时节点不执行写入，Trace Error 给出正式错误。
3. policy 为 `allow_with_idempotency` 时重复执行使用同一 idempotency key。
4. delete 后 Variables tab 展示 `deleted_id` 与 `affected_count`。

## 15. 实施预算

建议拆成 7 个实现计划：

1. Schema v2、Node Runtime UI Contract 与变量链接器基础：1 天。
2. Node Picker、Node Factory、Node Card、Inspector、Detail Panel contract 化：1 天。
3. Debug Variable Cache、durable snapshot 与 Variables tab 重建：0.5-1 天。
4. Runtime payload builder 与 LLM output/metrics/debug/error 分离：1 天。
5. RuntimeEventStream、LLM streaming、reasoning/debug event 与 durable read model 对齐：1 天。
6. Plugin contribution v2、renderer allowlist、policy schema 与 manifest 校验：1 天。
7. 核心节点输出契约、Data Model side effect matrix、校验与回归测试：1 天。

最小闭环不是 UI 过滤，而是：

```text
schema v2 node runtime contract + public-only outputs
  -> variable linker
  -> runtime output filter
  -> debug variable cache only public outputs
```

## 16. 停止条件

满足以下条件即可认为本轮设计落地完成：

1. 变量选择器与 Variables tab 对“变量”的定义一致。
2. 任意非 Start 节点的 `input_payload` 不会出现在 Variable Cache。
3. 任意节点的 `metrics_payload`、`error_payload`、`debug_payload` 不会出现在 Variable Cache。
4. Answer 不再出现 `answer_template` 和 `answer` 并列。
5. Template Transform 不再出现 `template` 和 `text` 并列。
6. LLM output payload 不再包含 usage、route、attempt、finish reason、provider metadata、内部索引。
7. 新增内置节点只需声明 Node Runtime UI Contract，即可接入节点选择器、节点工厂、卡片、面板、变量链接器和运行态展示。
8. 新增插件节点贡献只需声明宿主支持的 contract schema，即可接入 picker、panel、runtime 和变量链接器。
9. Trace 仍能查看完整 inputs、outputs、metrics、error 和 debug，调试能力不倒退。
10. snapshot 恢复受 `document_hash`、schema version 和 latest run scope 约束，不跨草稿或旧 schema 混合恢复。
11. RuntimeEventStream 只承担实时事件，不成为变量缓存或持久化真值。
12. reasoning 可流式展示和恢复，但不会进入 public output。
13. plugin contribution 不能绕过宿主 renderer、policy、output filter 和基础设施边界。
14. Data Model 写入节点的副作用、重跑和 checkpoint 恢复语义明确。
