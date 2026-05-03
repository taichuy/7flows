# Data Model 工作流节点查询参数设计

日期：2026-05-03

状态：草稿，待用户审阅

取代文档：无

关联代码：
- `web/app/src/features/agent-flow/lib/node-definitions/nodes/data-model/index.ts`
- `web/app/src/features/agent-flow/schema/agent-flow-field-renderers.tsx`
- `web/app/src/features/agent-flow/schema/node-schema-adapter.ts`
- `web/app/src/features/agent-flow/api/runtime.ts`
- `web/packages/flow-schema/src/index.ts`
- `api/crates/control-plane/src/orchestration_runtime/data_model_runtime.rs`
- `api/crates/orchestration-runtime/src/compiler.rs`
- `api/crates/orchestration-runtime/src/binding_runtime.rs`
- `api/crates/storage-durable/postgres/src/runtime_record_repository.rs`

参考样本：
- `../nocobase/packages/plugins/@nocobase/plugin-workflow/src/client/nodes/query.tsx`
- `../nocobase/packages/plugins/@nocobase/plugin-workflow/src/client/schemas/collection.ts`
- `../nocobase/packages/plugins/@nocobase/plugin-workflow/src/server/instructions/QueryInstruction.ts`

## 1. 文档目标

本文固定 1flowbase Data Model 工作流节点的查询参数设计，使 `action=list` 能在节点面板中配置过滤、排序、分页和关联展开，并允许查询值来自上游节点变量。

本文不是实现计划；实现前需要拆成单独 plan。

## 2. 背景

当前 Data Model 节点前端只暴露：

1. `config.data_model_code`
2. `config.action`
3. `bindings.record_id`
4. `bindings.payload`

因此用户在画布节点上看不到查询参数入口。后端运行时实际已经为 `list` 预留了 `query` 输入：

```text
input_or_config_value(node.config, resolved_inputs, "query")
```

`WorkflowDataModelRuntime::list` 会把该 query 解析为：

```json
{
  "filters": [
    { "field_code": "status", "operator": "eq", "value": "paid" }
  ],
  "sorts": [
    { "field_code": "created_at", "direction": "desc" }
  ],
  "expand_relations": ["customer"],
  "page": 1,
  "page_size": 20
}
```

底层 PostgreSQL runtime repository 已支持：

1. 过滤操作符：`eq`、`ne`、`gt`、`gte`、`lt`、`lte`。
2. 排序方向：`asc`、`desc`。
3. 默认排序：未传 sort 时按 `created_at desc`。
4. 分页：`page` 最小按 `1` 处理，`page_size` 最小按 `1` 处理。
5. 关联展开：`many_to_one` 和 `one_to_many` 已有基础展开逻辑。

主要缺口在前端节点配置、binding 解析、调试预览变量依赖和隐藏字段残留处理。

## 3. NocoBase 参考结论

NocoBase workflow 的 query 节点提供了可借鉴的分层：

1. UI 层把 collection、result type、params 和 empty-result policy 分开。
2. `params` 内包含 `filter`、`sort`、`pagination`、`appends`。
3. filter 值可以引用上游上下文或上游节点结果。
4. 服务端运行时先解析 params，再调用 collection repository。
5. `multiple` 决定查单条还是多条。
6. `failOnEmpty` 可让空结果进入 failed 状态。

1flowbase 不照搬 NocoBase 的 collection repository 和 filter DSL，只吸收它的节点配置结构：

```text
数据源选择
查询参数
结果形态
空结果策略
```

本阶段保持 1flowbase 既有 Data Model Runtime CRUD 作为唯一执行入口。

## 4. 范围

### 4.1 本阶段范围

1. 在 Data Model 节点 `action=list` 下新增查询参数配置。
2. 支持 filter、sort、expand relations、page、page size。
3. filter value 支持常量和上游变量。
4. 调试预览能识别 query binding 中的变量依赖。
5. 执行时把 query binding 解析成现有 `WorkflowDataModelRuntime::list` 支持的 JSON。
6. 切换 action 后只解析当前 action 需要的 binding。
7. 保持后端输出 `{ records, total }` 不变。

### 4.2 非目标

1. 不改 `/api/runtime/models/{model_code}/records` 的 HTTP query 协议。
2. 不新增 SQL 查询节点。
3. 不新增聚合、分组、distinct 或 join 查询。
4. 不引入 `contains`、`like`、`in` 等底层尚未稳定支持的操作符。
5. 不把 Data Model `list` 合并成 NocoBase 风格的 `query one/query many` 双模式。
6. 不在第一阶段实现复杂嵌套 filter group。

## 5. 设计原则

1. 查询参数是 Data Model list action 的输入，不是全局工作流查询语言。
2. UI 只暴露后端真实支持的能力，避免保存不可运行的查询。
3. 变量引用必须进入编译依赖和调试预览缺失变量计算。
4. 隐藏字段不能继续影响当前 action 的运行。
5. 后端 runtime 继续收敛在 `WorkflowDataModelRuntime`，不让前端协议绕过 runtime ACL。

## 6. 方案对比

### 6.1 方案 A：把完整 query JSON 放进 `config.query`

做法：前端提供一个 JSON 编辑器，保存到 `config.query`。

优点：

1. 改动少。
2. 直接适配后端现有 `input_or_config_value`。

缺点：

1. 不适合普通节点配置体验。
2. 无法稳定抽取变量依赖。
3. 调试预览无法提示缺失变量。
4. 字段类型、操作符、relation 展开无法在 UI 层约束。

结论：不采用。

### 6.2 方案 B：用 `named_bindings` 传入整个 query

做法：让用户从上游节点选择一个完整 JSON 对象作为 `bindings.query`。

优点：

1. 复用现有 binding 类型。
2. 适合高级用户动态构造 query。

缺点：

1. 不能解决“节点没有查询参数配置”的主要问题。
2. 缺少字段级 UI。
3. 难以做类型约束和错误前置。

结论：作为后续高级模式保留，不作为第一阶段主方案。

### 6.3 方案 C：新增专用 `data_model_query` binding

做法：为 Data Model list action 新增结构化 query binding，UI 负责编辑，runtime 负责解析为现有 query JSON。

优点：

1. 能提供字段级配置体验。
2. 能抽取 selector 依赖。
3. 能让调试预览知道缺失变量。
4. 能按 action 控制 active bindings。
5. 能复用现有后端 query 能力。

缺点：

1. 需要扩展 `FlowBinding`、compiler、binding runtime 和前端 renderer。

结论：采用。

## 7. 目标数据结构

### 7.1 FlowBinding

新增 binding kind：

```ts
type FlowBinding =
  | ExistingBinding
  | {
      kind: 'data_model_query';
      value: DataModelQueryBindingValue;
    };
```

### 7.2 DataModelQueryBindingValue

```ts
interface DataModelQueryBindingValue {
  filters: DataModelQueryFilter[];
  sorts: DataModelQuerySort[];
  expand_relations: string[];
  page: DataModelQueryValue;
  page_size: DataModelQueryValue;
}

interface DataModelQueryFilter {
  field_code: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  value: DataModelQueryValue;
}

interface DataModelQuerySort {
  field_code: string;
  direction: 'asc' | 'desc';
}

type DataModelQueryValue =
  | { kind: 'constant'; value: unknown }
  | { kind: 'selector'; selector: string[] };
```

### 7.3 运行时解析结果

`data_model_query` binding 解析后进入 `resolved_inputs.query`：

```json
{
  "filters": [
    { "field_code": "status", "operator": "eq", "value": "paid" },
    { "field_code": "customer_id", "operator": "eq", "value": "resolved-customer-id" }
  ],
  "sorts": [
    { "field_code": "created_at", "direction": "desc" }
  ],
  "expand_relations": ["customer"],
  "page": 1,
  "page_size": 20
}
```

## 8. 前端设计

### 8.1 节点定义

Data Model 节点新增字段：

```ts
{
  key: 'bindings.query',
  label: '查询参数',
  editor: 'data_model_query',
  visibleWhen: {
    operator: 'equals',
    path: 'config.action',
    value: 'list'
  }
}
```

### 8.2 Renderer

新增 `DataModelQueryField`，注册到 `agentFlowFieldRenderers`。

组件输入：

1. `adapter.getValue('bindings.query')`
2. `adapter.getValue('config.data_model_fields')`
3. `adapter.getDerived('selectorOptions')`

组件行为：

1. 过滤列表支持新增、删除、排序。
2. 每个过滤条件包含字段、操作符、值来源和值。
3. 值来源支持 `constant` 和 `selector`。
4. 排序列表支持新增、删除、排序。
5. 关联展开从 relation 字段中选择。
6. 分页默认 `page=1`、`page_size=20`。

### 8.3 字段选择规则

`config.data_model_fields` 当前包含：

```ts
{
  code: string;
  title: string;
  valueType: string;
  required: boolean;
}
```

第一阶段字段规则：

1. filter 字段允许 `string`、`enum`、`text`、`datetime`、`number`、`boolean`、`json`、`many_to_one`。
2. sort 字段允许 `string`、`enum`、`text`、`datetime`、`number`、`boolean`。
3. expand 字段允许 `many_to_one`、`one_to_many`。
4. `many_to_many` 暂不开放直接过滤或展开，除非底层 runtime 明确补齐。

### 8.4 操作符规则

第一阶段只暴露底层已支持操作符：

```text
eq
ne
gt
gte
lt
lte
```

字段类型默认操作符：

1. `string`、`enum`、`text`、`boolean`、`json`、`many_to_one`：`eq`、`ne`
2. `number`、`datetime`：`eq`、`ne`、`gt`、`gte`、`lt`、`lte`

### 8.5 空状态

如果未选择 Data Model，`查询参数` 字段不渲染可编辑条件，只显示不可编辑空状态，提示用户先选择 Data Model。该提示属于正式表单状态，不是调试文案。

## 9. 编译与 Binding Runtime

### 9.1 Compiler

`api/crates/orchestration-runtime/src/compiler.rs` 的 `extract_selector_paths` 新增 `data_model_query` 分支：

1. 遍历 filters 中 `value.kind == "selector"` 的 selector。
2. 读取 `page.kind == "selector"` 的 selector。
3. 读取 `page_size.kind == "selector"` 的 selector。
4. 忽略 constant、sorts 和 expand_relations。

### 9.2 Binding Runtime

`api/crates/orchestration-runtime/src/binding_runtime.rs` 新增 `data_model_query` 解析：

1. 验证 binding value 是 object。
2. 解析 filters array。
3. 对每个 filter：
   - `field_code` 必须是非空字符串。
   - `operator` 必须是支持的操作符。
   - `value.kind=constant` 时取 `value.value`。
   - `value.kind=selector` 时从 variable pool 取 selector 值。
4. 解析 sorts array。
5. 解析 expand_relations string array。
6. 解析 page/page_size。
7. 输出标准 query object。

### 9.3 Active Binding 策略

现有编译会无差别编译 node.bindings。Data Model 节点必须增加 action-aware active binding 策略，避免隐藏字段残留影响运行。

规则：

```text
list   -> query
get    -> record_id
create -> payload
update -> record_id, payload
delete -> record_id
```

实现位置推荐：

1. 编译期：`compile_node` 对 `node_type == "data_model"` 时按 `config.action` 过滤 bindings。
2. 调试预览：`buildNodeDebugPreviewPlan` 和 `buildNodeDebugPreviewInput` 使用同一 action binding 规则。
3. 前端保存：切换 action 时不强制删除旧 binding，避免用户切回 list 后丢配置。

## 10. 后端 Data Model Runtime

`WorkflowDataModelRuntime::list` 当前可继续作为执行入口。

第一阶段只需要补充输入校验：

1. `page` 小于 `1` 时按 `1`。
2. `page_size` 小于 `1` 时按 `1`。
3. `page_size` 大于 `100` 时按 `100`。
4. 过滤字段不存在时报节点错误。
5. 排序字段不存在时报节点错误。
6. unsupported operator 报节点错误。

`page_size=100` 是工作流节点的默认保护上限；HTTP runtime list 接口是否使用相同上限不属于本文范围。

## 11. 输出

Data Model list action 输出保持不变：

```json
{
  "records": [],
  "total": 0
}
```

节点输出契约保持：

```ts
[
  { key: 'records', title: '记录列表', valueType: 'array' },
  { key: 'total', title: '记录总数', valueType: 'number' }
]
```

## 12. 错误处理

运行期错误进入节点错误，不吞掉：

1. `data_model list query must be object`
2. `data_model list filters must be array`
3. `data_model list filter field_code is required`
4. `data_model list filter operator is unsupported`
5. `selector source not found`
6. `selector path not found`
7. `undeclared field code`
8. `undeclared sort field`

前端只做能前置的配置约束；后端仍是最终校验边界。

## 13. 测试与验收证据

### 13.1 前端测试

新增或调整测试：

1. Data Model 节点 schema 包含 `bindings.query`，且只在 `action=list` 可见。
2. 切换 action 后输出契约仍正确。
3. `DataModelQueryField` 能基于 `config.data_model_fields` 渲染 filter/sort/expand。
4. filter value 选择 selector 后，document 写入 `data_model_query` binding。
5. debug preview plan 能从 query binding 抽取缺失变量。

建议测试入口：

```text
pnpm --dir web/app test -- agent-flow
```

实际执行计划中应使用仓库标准 frontend test wrapper，不用裸 `vitest` 绕过资源限制。

### 13.2 后端测试

新增或调整测试：

1. compiler 能从 `data_model_query` 抽取 selector。
2. binding runtime 能解析 constant query。
3. binding runtime 能解析 selector query。
4. Data Model list 节点按 filter/sort/page/page_size 返回 records 和 total。
5. 非 list action 不解析残留 query binding。
6. invalid operator 返回节点错误。
7. page_size 超过 100 时被限制。

建议测试入口：

```text
cargo test -p orchestration-runtime
cargo test -p control-plane orchestration_runtime_data_model
```

### 13.3 验收标准

1. 用户能在 Data Model list 节点中配置查询参数。
2. 过滤常量值能返回匹配记录。
3. 过滤变量值能引用上游节点输出。
4. 排序和分页生效。
5. relation expand 对已支持关系生效。
6. 切换到 create/update/delete/get 后，隐藏 query 不影响运行和调试预览。
7. 所有新增 warning 和 coverage 产物落到 `tmp/test-governance/`。

## 14. 分阶段建议

### P0：查询参数主链路

1. 新增 `data_model_query` binding 类型。
2. 新增前端 `data_model_query` editor。
3. 编译和运行时解析 filters、sorts、page、page_size。
4. 支持 constant 和 selector value。
5. 补 active binding 策略。

### P1：关联展开和预览完善

1. 支持 `expand_relations` UI。
2. 调试预览缺失变量覆盖 query binding。
3. 增加 page/page_size 上限和错误提示测试。

### P2：体验增强

1. 支持 `fail_on_empty`。
2. 支持 advanced mode：从上游节点传入完整 query object。
3. 在输出契约中基于模型字段提供更丰富的变量提示。

## 15. 风险与停止条件

### 15.1 风险

1. 如果 active binding 策略缺失，隐藏 query binding 会影响非 list action。
2. 如果 query selector 没进入 compiler，调试预览会漏掉变量依赖。
3. 如果前端暴露后端不支持的操作符，会出现保存成功但运行失败。
4. 如果 page_size 不设上限，工作流节点可能一次拉取过多记录。

### 15.2 停止条件

出现以下情况应暂停实现并重新确认设计：

1. 需要嵌套 filter group 或 `or` 查询。
2. 需要跨模型 join 查询。
3. 需要 SQL 自定义查询。
4. 需要把 list 改成 query one/query many 双模式。
5. 需要变更 HTTP Runtime CRUD 查询协议。

