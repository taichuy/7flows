# 1flowbase LLM 节点插件化参数与动态表单讨论稿

日期：2026-04-19
状态：讨论稿，待用户整体审阅

关联文档：
- [2026-04-18-model-provider-integration-design.md](./2026-04-18-model-provider-integration-design.md)
- [2026-04-16-agentflow-node-detail-design.md](./2026-04-16-agentflow-node-detail-design.md)
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)

## 1. 文档目标

本文档用于收口本轮关于 `LLM` 节点参数、模型供应商插件与宿主 `schema ui` 的讨论，明确：

- `LLM` 参数 schema 的真值应该归谁维护
- 宿主 `schema ui` 是否需要新增类型，以及最小应该新增什么
- 模型供应商对象、`LLM` 参数对象与节点配置对象的真实数据边界
- 参数“是否开启 / 是否传递”的真值应该放在插件还是应用节点
- `response_format` 一期是否进入，以及为什么只做最小版
- 当前讨论已经确认的决策与剩余实现边界

## 2. 最终方向概述

本轮讨论最终收口为：

- 参数 schema 的真值主要由模型供应商插件返回
- 宿主不再内建一套越来越大的 `LLM` 参数白名单
- 宿主只负责：
  - 渲染通用 `schema ui`
  - 保存节点中的模型供应商对象与 `LLM` 参数对象
  - 在运行时把解析后的 provider 配置与节点参数一起发给插件
- 参数“是否开启 / 是否要传”属于应用中的 `LLM` 节点真值，不属于插件真值
- `response_format` 一期只支持 `text | json_object`

一句话总结就是：

`插件决定能配什么，节点决定这次传什么，宿主负责把通用 UI 渲染出来并透传。`

## 3. 职责边界

### 3.1 模型供应商插件负责什么

模型供应商插件负责：

- 返回可用模型列表
- 在模型列表中携带当前模型的 `LLM` 参数表单 schema
- 定义每个参数的：
  - key
  - 标签
  - 类型
  - 控件类型
  - 默认值
  - 范围
  - 可选项
  - 显隐条件
  - 是否必须始终传递
  - 是否默认开启
- 在运行时消费宿主传入的参数对象
- 对最终参数合法性做最终校验

插件不负责：

- 自定义 React 组件
- 直接控制宿主内部 `schema ui` block tree
- 决定某个应用节点这次是否启用某个可选参数

### 3.2 宿主负责什么

宿主负责：

- 提供通用动态表单渲染能力
- 在节点里保存：
  - 模型供应商对象
  - `LLM` 参数对象
  - 最小版 `response_format`
- 切换模型时根据新 schema 清空并重建参数对象
- 根据节点中的 `enabled` 状态筛选最终要传给插件的参数
- 加载并缓存 provider label / protocol / model label 等展示信息
- 提供后台刷新按钮更新缓存

宿主不负责：

- 内建所有 `LLM` 参数语义
- 让插件直接注入任意 UI 组件
- 在第一期解决完整 `json_schema` 结构化输出产品设计

### 3.3 应用节点负责什么

应用中的 `LLM` 节点负责：

- 记录当前选中的 provider instance 和 model
- 记录每个参数的 `enabled + value`
- 决定可选参数这次到底传不传

因此“是否开启某参数”必须归节点，而不是归插件。

原因是：

- 插件表达的是“这个参数能不能配、默认怎么配”
- 节点表达的是“这个应用里的这个节点这次是否启用并传给模型”

## 4. 已确认决策

本轮讨论已确认以下决策：

1. 选中模型时一并返回参数 schema，宿主直接记录并缓存
2. 切换模型后清空旧参数，并按新 schema 重建
3. `response_format` 一期采用最小版，只支持 `text | json_object`
4. 不允许插件自定义控件，只允许通用表单控件
5. `provider_code / protocol / label` 只作为缓存，不作为核心真值
6. 后台应用页需要提供刷新按钮更新 provider / model 展示缓存
7. 参数“是否开启 / 是否传递”放在应用节点中，不放在插件中

## 5. 宿主 `schema ui` 的最小新增类型

这轮不需要把宿主 `schema ui` 扩成一套 `LLM` 协议系统，只需要增加一个最小动态表单入口即可：

```ts
interface SchemaDynamicFormBlock {
  kind: 'dynamic_form';
  form_key: 'provider_config' | 'llm_parameters' | string;
  title?: string;
  empty_text?: string;
}
```

含义是：

- `provider_config`：用于模型供应商实例配置表单
- `llm_parameters`：用于 `LLM` 节点参数表单

宿主内部可以用统一 renderer 渲染这类 block，但插件不直接输出宿主内部 block tree。

## 6. 插件公开表单 Schema

插件需要返回一套公开、稳定、与宿主实现细节解耦的通用表单 schema。

### 6.1 基础 JSON 类型

```ts
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
```

### 6.2 字段类型与控件类型

```ts
type PluginFormFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'json'
  | 'string_list'
  | 'secret';

type PluginFormControl =
  | 'input'
  | 'textarea'
  | 'password'
  | 'number'
  | 'slider'
  | 'switch'
  | 'select'
  | 'json_editor'
  | 'tags';
```

约束：

- 插件只能使用上述控件类型
- 宿主不允许插件注入自定义控件

### 6.3 选项、条件与字段 Schema

```ts
interface PluginFormOption {
  label: string;
  value: string | number | boolean;
  description?: string;
  disabled?: boolean;
}

interface PluginFormCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'truthy' | 'falsy';
  value?: string | number | boolean | null;
  values?: Array<string | number | boolean | null>;
}

interface PluginFormFieldSchema {
  key: string;
  label: string;
  type: PluginFormFieldType;
  control?: PluginFormControl;
  group?: string;
  order?: number;
  advanced?: boolean;
  required?: boolean;
  send_mode?: 'always' | 'optional';
  enabled_by_default?: boolean;
  description?: string;
  placeholder?: string;
  default_value?: JsonValue;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  options?: PluginFormOption[];
  visible_when?: PluginFormCondition[];
  disabled_when?: PluginFormCondition[];
}

interface PluginFormSchema {
  schema_version: '1.0.0';
  title?: string;
  description?: string;
  fields: PluginFormFieldSchema[];
}
```

### 6.4 字段语义说明

`PluginFormFieldSchema` 中各字段的建议语义如下：

- `key`
  - 字段唯一标识，例如 `temperature`
- `label`
  - 用户可见标题
- `type`
  - 数据类型真值
- `control`
  - 推荐控件
- `group`
  - 分组，例如 `sampling`、`advanced`
- `order`
  - 同组内排序
- `advanced`
  - 是否默认放到高级设置区
- `required`
  - 是否必填
- `send_mode`
  - `always` 表示只要有该字段就必须传
  - `optional` 表示是否传由节点决定
- `enabled_by_default`
  - 仅对 `optional` 参数有意义，用于决定模型切换后默认开关状态
- `default_value`
  - 模型切换后重建参数对象时的默认值
- `visible_when`
  - 字段显示条件
- `disabled_when`
  - 字段禁用条件

## 7. 模型对象与节点缓存对象

### 7.1 模型选项对象

宿主在模型选择阶段拿到的模型对象建议为：

```ts
interface ProviderModelOption {
  model_id: string;
  display_name: string;
  source: 'static' | 'dynamic';
  supports_streaming: boolean;
  supports_tool_call: boolean;
  supports_multimodal: boolean;
  context_window?: number | null;
  max_output_tokens?: number | null;
  parameter_form?: PluginFormSchema | null;
  provider_metadata?: Record<string, JsonValue>;
}
```

这里的关键点是：

- `parameter_form` 跟模型一起返回
- 宿主在用户选中模型时直接记录缓存

### 7.2 节点中的模型供应商对象

节点内部不保存 provider 凭据本体，只保存引用与展示缓存：

```ts
interface LlmNodeModelProvider {
  provider_instance_id: string;
  model_id: string;
  provider_code?: string;
  protocol?: string;
  provider_label?: string;
  model_label?: string;
  schema_fetched_at?: string;
}
```

其中真值字段是：

- `provider_instance_id`
- `model_id`

其余字段只作为 UI 缓存。

## 8. `LLM` 参数对象

### 8.1 参数项结构

```ts
interface LlmParameterItem {
  enabled: boolean;
  value: JsonValue;
}
```

### 8.2 节点参数对象

```ts
interface LlmNodeParameters {
  schema_version: '1.0.0';
  items: Record<string, LlmParameterItem>;
}
```

示例：

```json
{
  "schema_version": "1.0.0",
  "items": {
    "temperature": {
      "enabled": true,
      "value": 0.7
    },
    "top_p": {
      "enabled": false,
      "value": 1
    },
    "max_tokens": {
      "enabled": true,
      "value": 1024
    }
  }
}
```

### 8.3 为什么 `enabled` 应该放在节点中

`enabled` 放在节点中而不是插件中，原因是：

- 插件 schema 只负责描述这个参数“能否配置”
- 节点负责决定这个参数“这次是否发送”
- 同一个模型在两个不同应用节点中，可能参数开启状态不同

因此：

- 插件可以通过 `send_mode` 声明参数是否可选
- 插件可以通过 `enabled_by_default` 声明默认开启建议
- 但最终 `enabled` 的真值必须由节点保存

## 9. `response_format` 一期最小版

### 9.1 一期结构

```ts
interface LlmNodeResponseFormat {
  mode: 'text' | 'json_object';
}
```

### 9.2 为什么一期不直接做 `json_schema`

因为 `json_schema` 并不是“多一个字段”这么简单，它会立即牵涉：

- JSON Schema 编辑体验
- 输出契约与结构化输出之间的一致性
- provider 间 `json_schema` 协议差异
- strict 模式与运行时错误治理

当前运行时已经把 `response_format` 作为独立字段透传，而不是普通参数的一部分，因此它更适合作为单独对象逐期扩展，而不是在一期就做重设计。

### 9.3 二期预留结构

```ts
interface LlmNodeResponseFormat {
  mode: 'text' | 'json_object' | 'json_schema';
  schema_name?: string;
  schema?: JsonValue;
  strict?: boolean;
}
```

## 10. `LLM` 节点配置对象

最终建议收敛为：

```ts
interface LlmNodeConfig {
  model_provider: LlmNodeModelProvider;
  llm_parameters: LlmNodeParameters;
  response_format?: LlmNodeResponseFormat;
}
```

这意味着后续应从当前零散的：

- `config.provider_instance_id`
- `config.model`
- `config.temperature`
- `config.top_p_enabled`
- `config.max_tokens`

逐步迁移到：

- `config.model_provider`
- `config.llm_parameters`
- `config.response_format`

## 11. 运行时透传对象

宿主在运行时不直接把节点对象原样扔给插件，而是组装成明确的调用请求：

```ts
interface ProviderInvocationRequest {
  provider: {
    provider_instance_id: string;
    provider_code: string;
    protocol: string;
    model_id: string;
  };
  provider_config: Record<string, JsonValue>;
  llm_parameters: Record<string, JsonValue>;
  response_format?: LlmNodeResponseFormat | null;
  messages: Array<{ role: string; content: string }>;
  tools?: JsonValue[];
  trace_context?: Record<string, string>;
}
```

其中：

- `provider_config`
  - 宿主从 provider instance 中解出的凭据与实例配置
- `llm_parameters`
  - 从节点中筛选后的最终参数对象
- `response_format`
  - 节点级单独对象

### 11.1 参数筛选规则

最终向插件发送参数时采用以下规则：

- `send_mode = 'always'`
  - 该参数应直接发送
- `send_mode = 'optional'`
  - 仅当节点中的 `enabled = true` 时发送

这意味着：

- 插件负责定义参数是否可选
- 节点负责决定可选参数这次是否发送

## 12. 模型切换与刷新规则

### 12.1 切换模型

用户切换 `LLM` 节点模型后：

- 清空旧的 `llm_parameters.items`
- 读取新模型附带的 `parameter_form`
- 按字段的：
  - `default_value`
  - `send_mode`
  - `enabled_by_default`
  重建参数对象

### 12.2 后台刷新缓存

后台应用页需要提供刷新入口，用于更新：

- provider label
- protocol
- model label
- 模型附带的 `parameter_form`

刷新更新缓存后，节点的核心真值仍以：

- `provider_instance_id`
- `model_id`

为准。

## 13. 当前不做的事

本轮明确不做：

- 插件自定义 React 控件
- 宿主内建完整 canonical `LLM` 参数白名单
- `response_format.json_schema` 的完整设计与 UI
- 输出契约自动从 `json_schema` 反推
- provider 私有复杂 schema 编辑器

## 14. 讨论结论

本轮讨论的结论可以归纳为四句话：

- 插件返回参数 schema，宿主不内建越来越多的 `LLM` 参数语义
- 宿主只增加最小动态表单能力，负责通用渲染和对象透传
- 参数是否开启属于应用节点真值，不属于插件真值
- `response_format` 一期只做 `text | json_object`，避免过早进入完整结构化输出设计

## 15. 附录：Dify `json_schema / structured_output` 对照参考

本节只做对照，不改变前文主结论。

结论先行：

- `Dify` 的实现证明了“是否开启结构化输出”放在节点侧是合理的
- `Dify` 的实现也证明了 `json_schema` 一旦落地，就不再只是一个普通参数，而会影响输出变量与节点输出结构
- `Dify` 的 plugin / model 声明层虽然有 `response_format / json_schema` 参数模板，但真正的结构化输出产品能力仍主要落在 `LLM` 节点侧，而不是单纯靠通用参数表单驱动

### 15.1 Dify 的节点侧做法

`Dify` 的 `LLM` 节点类型中直接包含：

- `structured_output_enabled`
- `structured_output`

这说明它把“是否开启结构化输出”和“结构化 schema 本体”都放在节点里，而不是放在 provider plugin 参数里。

参考：

- `../dify/web/app/components/workflow/nodes/llm/types.ts`

关键点：

- `structured_output_enabled?: boolean`
- `structured_output?: StructuredOutput`
- `StructuredOutput` 内部持有 `schema: SchemaRoot`

### 15.2 Dify 的启用与编辑交互

`Dify` 的 `LLM` 节点配置逻辑中：

- 切换 structured output 开关时，写入 `draft.structured_output_enabled`
- 编辑 structured output 时，写入 `draft.structured_output`

这说明：

- 插件能力只负责声明“模型是否支持”
- 真正的启用状态和内容编辑都属于节点侧真值

参考：

- `../dify/web/app/components/workflow/nodes/llm/use-config.ts`

### 15.3 Dify 的 UI 不是“通用参数表单”，而是专门结构化输出面板

`Dify` 在 `LLM` 节点面板里没有把 `json_schema` 简化成普通字符串输入框，而是：

- 给一个 `Structured` 开关
- 开启后显示专门的 `StructureOutput` 区块
- 区块内部再打开 `JsonSchemaConfigModal` 编辑 schema

这说明：

- `json_schema` 是一类更重的能力
- 它比普通 `temperature / top_p` 更接近“节点能力配置”，而不是“普通参数字段”

参考：

- `../dify/web/app/components/workflow/nodes/llm/panel.tsx`
- `../dify/web/app/components/workflow/nodes/llm/components/structure-output.tsx`

### 15.4 Dify 会把 structured output 暴露成节点输出变量

当 `structured_output_enabled = true` 且 schema 有内容时，`Dify` 会把 `structured_output` 加入节点输出变量树。

这一步很关键，因为它意味着：

- `json_schema` 不只是影响调用参数
- 它还会影响后续节点可引用的输出结构

这也是为什么本稿建议 `response_format.json_schema` 不要在第一期当成普通表单字段草率落地。

参考：

- `../dify/web/app/components/workflow/nodes/_base/components/variable/utils.ts`

### 15.5 Dify 的插件 / 模型声明层也有 `response_format / json_schema`

在 `dify-plugin-daemon` 中，模型参数模板里确实存在：

- `response_format`
- `json_schema`

并且插件脚手架模板里 `llm.yaml` 也会带 `response_format`。

这说明：

- 插件 / model declaration 层表达这两个参数是合理的
- 但这不意味着宿主就只靠“通用参数 schema”就足够完成结构化输出产品能力

参考：

- `../dify-plugin-daemon/pkg/entities/plugin_entities/model_declaration.go`
- `../dify-plugin-daemon/cmd/commandline/plugin/templates/python/llm.yaml`

### 15.6 Dify 的运行时也把 structured output 当成单独调用形态

`dify-plugin-daemon` 里针对结构化输出有单独的调用请求：

- `InvokeLLMWithStructuredOutputRequest`
- 额外持有 `StructuredOutputSchema`

这说明在运行时视角里，structured output 也是一个特殊能力，而不是普通参数数组里的某一项。

参考：

- `../dify-plugin-daemon/internal/core/dify_invocation/types.go`

### 15.7 对 1flowbase 的可借鉴结论

从 `Dify` 可以借鉴出三条最有价值的规则：

1. `json_schema / structured_output` 的“是否开启”应由节点保存  
   这和本稿当前方向一致。

2. `json_schema / structured_output` 不能被简单看成普通数值参数  
   它会影响节点输出契约与变量树。

3. 插件层可以声明 `response_format / json_schema`，但宿主是否把它做成完整产品能力，仍要单独设计  
   这和本稿“`response_format` 一期只做 `text | json_object`，`json_schema` 二期再开”的判断一致。

### 15.8 与本稿当前方案的对应关系

| 主题 | Dify 做法 | 本稿当前建议 |
| --- | --- | --- |
| 参数 schema 来源 | plugin / model declaration 可声明参数模板 | provider/model 返回 `PluginFormSchema` |
| 是否开启 | 节点保存 `structured_output_enabled` | 节点保存 `enabled` |
| 结构化 schema 本体 | 节点保存 `structured_output.schema` | 一期不做完整 `json_schema`，二期可单独对象化 |
| 输出变量联动 | 启用后把 `structured_output` 加入输出变量 | 当前预留为二期能力 |
| 自定义控件 | 节点自带专门 UI | 当前不开放插件自定义控件 |
| `response_format` | 参数模板存在，但结构化输出不只靠模板驱动 | 一期只支持 `text | json_object` |

### 15.9 本稿不直接照抄 Dify 的原因

虽然 `Dify` 有可借鉴实现，但本稿不直接照抄，原因有三点：

- `1flowbase` 当前在推进 plugin-first 的 provider 接入边界，需要比 `Dify` 更明确地区分“插件声明参数”和“节点真值”
- `1flowbase` 当前的 `schema ui` 正在建设中，第一期更适合先补最小动态表单能力，而不是直接引入完整 JSON Schema 编辑器
- `Dify` 当前 `structured_output` 更像是宿主内建的 `LLM` 节点专有能力，而本稿当前主目标是先把 provider 参数 schema 与节点参数对象边界收干净
