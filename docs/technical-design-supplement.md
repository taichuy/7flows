# 7Flows 技术设计补充文档

> 本文档是 [7Flows 产品设计方案](./product-design.md) 的技术细化补充，覆盖 6 个关键设计领域。
> 所有 IR 类型与 `product-design.md` 中定义的 `Node`、`Edge`、`RuntimeContext`、`AuthorizedContextRefs`、`PublishedEndpoint` 保持兼容。

---

## 目录

- [14. 插件兼容性代理（Plugin Compatibility Proxy）](#14-插件兼容性代理plugin-compatibility-proxy)
- [15. 插件 UI 协议（Plugin UI Rendering Protocol）](#15-插件-ui-协议plugin-ui-rendering-protocol)
- [16. 安全与交互模型（Security & Interaction Model）](#16-安全与交互模型security--interaction-model)
- [17. 节点间变量传递（Inter-Node Variable Passing）](#17-节点间变量传递inter-node-variable-passing)
- [18. 节点调试模式（Node Debug Mode）](#18-节点调试模式node-debug-mode)
- [19. 值缓存（Value Caching）](#19-值缓存value-caching)

---

## 14. 插件兼容性代理（Plugin Compatibility Proxy）

### 14.1 设计目标

7Flows 不重新发明插件生态，而是通过**兼容性代理层**复用 Dify 已有的插件市场与工具包。代理层负责：

1. **Manifest 转译**：读取 Dify 插件 `manifest.yaml`，将 `plugins.tools[].identity / parameters` 映射为 7Flows IR `ToolDefinition`
2. **调用代理**：请求序列化（7Flows IR → Dify Plugin Request）、鉴权注入、超时控制、响应反序列化
3. **生命周期管理**：插件进程启停、健康检查、版本热更新
4. **隔离策略**：每个插件运行在独立容器/进程中，崩溃不影响宿主

### 14.2 转译协议

Dify 插件的 Manifest 与 7Flows 内部工具定义的映射关系：

```ts
/** Dify 插件 Manifest 中的工具声明（简化） */
type DifyPluginManifest = {
  version: string
  type: 'plugin'
  plugins: {
    tools: string[]        // 指向 tools/<name>.yaml
  }
}

/** Dify 单个工具的 YAML 描述 */
type DifyToolDefinition = {
  identity: {
    name: string
    author: string
    label: Record<string, string>   // i18n
    description: Record<string, string>
    icon: string
  }
  parameters: DifyToolParameter[]
}

type DifyToolParameter = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret-input' | 'file'
  required: boolean
  label: Record<string, string>
  human_description: Record<string, string>
  form: 'llm' | 'form'            // llm = Agent 可填，form = 用户配置
  options?: Array<{ value: string; label: Record<string, string> }>
  default?: unknown
}

/** 7Flows 内部工具定义（与 Node.config 中 tool 类型节点配合） */
type SevenFlowsToolDefinition = {
  id: string                       // `plugin:<author>/<name>`
  name: string
  description: string
  inputSchema: JsonSchema           // 复用 product-design.md 中的 JsonSchema
  outputSchema?: JsonSchema
  source: 'builtin' | 'plugin' | 'mcp'
  pluginMeta?: {
    origin: 'dify'
    manifestVersion: string
    author: string
    icon: string
  }
}
```

**转译规则**：

| Dify 字段 | 7Flows 字段 | 转换逻辑 |
|-----------|-------------|----------|
| `identity.name` | `id` | 拼接为 `plugin:{author}/{name}` |
| `identity.label.en_US` | `name` | 取英文标签，缺省用 `identity.name` |
| `identity.description.en_US` | `description` | 取英文描述 |
| `parameters[]` | `inputSchema.properties` | 逐字段映射类型 |
| `parameters[].type = 'string'` | `{ type: 'string' }` | 直接映射 |
| `parameters[].type = 'select'` | `{ type: 'string', enum: [...] }` | options → enum |
| `parameters[].type = 'secret-input'` | `{ type: 'string', format: 'password' }` | 标记为凭证字段 |
| `parameters[].type = 'file'` | `{ type: 'string', format: 'uri' }` | 文件引用 URI |
| `parameters[].required` | `inputSchema.required[]` | 聚合 required 数组 |

### 14.3 调用代理 PluginCallProxy

```ts
type PluginCallRequest = {
  toolId: string
  inputs: Record<string, unknown>
  credentials: Record<string, string>   // 运行时解密注入
  timeout: number                       // 毫秒
  traceId: string                       // 关联 RuntimeContext.traceId
}

type PluginCallResponse = {
  status: 'success' | 'error'
  output: Record<string, unknown>
  logs?: string[]
  durationMs: number
}
```

**调用流程**：

```
7Flows Node Executor
  → PluginCallProxy.invoke(request)
    → 序列化为 Dify Plugin HTTP 请求格式
    → 注入鉴权 Header（从凭证管理解密获取）
    → 发送到插件进程/容器 HTTP 端口
    → 超时控制（AbortController / asyncio.timeout）
    → 反序列化响应为 PluginCallResponse
  → 写入 Node Run 产出
```

### 14.4 生命周期管理

| 事件 | 行为 |
|------|------|
| 插件安装 | 拉取包 → 解析 manifest → 转译注册 → 启动容器 |
| 插件调用 | 健康检查 → 调用 → 记录指标 |
| 插件更新 | 拉取新版本 → 重新转译 → 滚动替换容器 |
| 插件卸载 | 停止容器 → 清理注册 → 清理凭证 |
| 健康检查失败 | 重启容器（最多 3 次） → 标记不可用 → 通知 |

### 14.5 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify 插件 HTTP 客户端基类 | `dify/api/core/plugin/impl/base.py` → `BasePluginClient` (line 57) |
| Dify 插件工具调用 | `dify/api/core/plugin/impl/tool.py` → `PluginToolManager.invoke()` (line 85) |
| Dify 插件安装注册 | `dify/api/core/plugin/impl/plugin.py` → `PluginInstaller` (line 24) |
| Dify 插件适配器（Tool 接口封装） | `dify/api/core/tools/plugin_tool/tool.py` → `PluginTool._invoke()` (line 26) |
| Dify 插件 Provider 控制器 | `dify/api/core/tools/plugin_tool/provider.py` → `PluginToolProviderController` (line 11) |
| Dify 工具管理中枢 | `dify/api/core/tools/tool_manager.py` → `ToolManager` |
| Dify 工具执行引擎 | `dify/api/core/tools/tool_engine.py` → `ToolEngine.agent_invoke()` (line 48) |

---

## 15. 插件 UI 协议（Plugin UI Rendering Protocol）

### 15.1 设计目标

Dify 插件 UI 是**纯声明式 YAML/JSON**，不包含前端代码。7Flows 采用分层 UI 协议，将插件参数描述转换为可渲染的表单：

- **L0 原始层**：存储 Dify 原始参数描述（`DifyToolParameter[]`）
- **L1 标准层**：转换为 7Flows `FormSchema`
- **L2 渲染层**：React 组件动态渲染

### 15.2 FormSchema 类型定义

```ts
type FormSchema = {
  fields: FormField[]
  layout?: 'vertical' | 'horizontal' | 'grid'
  columns?: number       // layout = 'grid' 时生效
}

type FormField = {
  name: string
  label: string
  description?: string
  type: FormFieldType
  required: boolean
  default?: unknown
  placeholder?: string
  options?: FormFieldOption[]       // type = 'select' | 'radio' 时
  validation?: FormFieldValidation
  dependsOn?: FormFieldDependency  // 条件显示
  group?: string                   // 分组折叠
  hidden?: boolean                 // 前端隐藏（内部参数）
  sensitive?: boolean              // 凭证字段，输入时遮蔽
}

type FormFieldType =
  | 'text'           // 单行文本
  | 'textarea'       // 多行文本
  | 'number'         // 数字输入
  | 'boolean'        // 开关
  | 'select'         // 下拉单选
  | 'multiselect'    // 下拉多选
  | 'radio'          // 单选按钮组
  | 'password'       // 密码/凭证
  | 'file'           // 文件上传
  | 'json'           // JSON 编辑器
  | 'code'           // 代码编辑器
  | 'model-selector' // 模型选择器（特殊组件）
  | 'variable-ref'   // 变量引用选择器

type FormFieldOption = {
  value: string | number
  label: string
  description?: string
  disabled?: boolean
}

type FormFieldValidation = {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string         // 正则
  patternMessage?: string  // 校验失败提示
  custom?: string          // 表达式，如 `value > inputs.minValue`
}

type FormFieldDependency = {
  field: string             // 依赖的字段名
  condition: 'equals' | 'not_equals' | 'in' | 'not_in' | 'truthy' | 'falsy'
  value?: unknown           // condition 需要对比的值
}
```

### 15.3 控件映射表

Dify 参数类型到 7Flows `FormFieldType` 的映射：

| Dify `type` | 7Flows `FormFieldType` | 说明 |
|-------------|----------------------|------|
| `string` | `text` | 普通文本 |
| `number` | `number` | 数字输入 |
| `boolean` | `boolean` | 开关 |
| `select` | `select` | 下拉选择 |
| `secret-input` | `password` | 凭证字段，`sensitive: true` |
| `file` | `file` | 文件上传 |
| `model-selector` | `model-selector` | 模型选择器 |
| `string` (multiline) | `textarea` | 检测到 `\n` 或 `form: 'llm'` 时升级 |

### 15.4 xyflow 自定义节点内嵌表单

在 xyflow 中将表单嵌入自定义节点时，需要注意以下关键约束：

**防止拖拽冲突**：交互元素必须添加 CSS class 阻止事件冒泡

```tsx
// xyflow 要求在 input/select/textarea 等交互元素上加 nodrag/nowheel
<div className="nodrag nowheel">
  <input type="text" value={value} onChange={onChange} />
</div>
```

**nodeTypes 必须用稳定引用**：避免在渲染函数内定义 `nodeTypes`，否则触发无限重渲染

```tsx
// 正确：模块级常量
const nodeTypes = { pluginNode: PluginNode, agentNode: AgentNode }

// 错误：组件内定义（每次渲染创建新对象）
function App() {
  const nodeTypes = { pluginNode: PluginNode } // 触发无限重渲染
}
```

**插件节点工厂模式**：插件只提供表单组件，框架包装标准节点壳

```tsx
type PluginNodeConfig = {
  pluginId: string
  formSchema: FormSchema
  icon: string
  color: string
}

function createPluginNode(config: PluginNodeConfig): React.ComponentType<NodeProps> {
  const PluginNode = ({ data, id }: NodeProps) => {
    return (
      <BaseNodeShell icon={config.icon} color={config.color} title={data.label}>
        <Handle type="target" position={Position.Left} />
        <div className="nodrag nowheel">
          <DynamicForm schema={config.formSchema} values={data.config} nodeId={id} />
        </div>
        <Handle type="source" position={Position.Right} />
      </BaseNodeShell>
    )
  }
  PluginNode.displayName = `PluginNode(${config.pluginId})`
  return PluginNode
}
```

### 15.5 安全约束

- 插件 UI 描述**不允许**包含可执行代码（JavaScript、HTML script 标签等）
- FormSchema 中的 `validation.custom` 仅支持安全表达式子集（见章节 17.5）
- 所有字符串字段在渲染前经过 HTML 转义

### 15.6 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify 工具节点配置面板 | `dify/web/app/components/workflow/nodes/tool/panel.tsx` → `Panel` (line 19) |
| Dify Schema 驱动表单渲染 | `dify/web/app/components/workflow/nodes/tool/components/tool-form/index.tsx` → `ToolForm` (line 24) |
| Dify 表单项渲染器 | `dify/web/app/components/workflow/nodes/tool/components/tool-form/item.tsx` → `ToolFormItem` (line 33) |
| Dify 通用输入渲染核心 | `dify/web/app/components/workflow/nodes/_base/components/form-input-item.tsx` → `FormInputItem` (line 50) |
| Dify 表单类型枚举 | `dify/web/app/components/header/account-setting/model-provider-page/declarations.ts` → `FormTypeEnum` |
| Dify 工具类型定义 | `dify/web/app/components/tools/types.ts` |
| n8n 节点类型描述 | `n8n/packages/workflow/src/interfaces.ts` → `INodeTypeDescription` (line 2396) |
| n8n 节点属性定义（表单） | `n8n/packages/workflow/src/interfaces.ts` → `INodeProperties` |
| xyflow NodeProps 接口 | `xyflow/packages/system/src/types/nodes.ts` (line 114-125) |
| xyflow 自定义节点渲染 | `xyflow/packages/react/src/components/NodeWrapper/index.tsx` (line 229-247) |
| xyflow NodeTypes 类型 | `xyflow/packages/react/src/types/general.ts` (line 64-74) |
| xyflow 节点类型解析逻辑 | `xyflow/packages/react/src/components/NodeWrapper/index.tsx` (line 55-62) |
| xyflow Handle 组件 | `xyflow/packages/react/src/components/Handle/index.tsx` (line 285) |

---

## 16. 安全与交互模型（Security & Interaction Model）

### 16.1 插件沙盒安全

每个插件运行在独立的隔离环境中，确保插件崩溃或恶意行为不影响宿主平台：

| 维度 | 策略 |
|------|------|
| 进程隔离 | 每个插件运行在独立容器（Docker）或独立进程中 |
| 网络隔离 | 默认禁止出站，通过白名单放行插件声明的域名 |
| 文件系统 | 只读挂载插件代码，`/tmp` 可写但容量受限（默认 100MB） |
| 资源限额 | CPU: 1 core, Memory: 512MB, 执行超时: 30s（可配） |
| 凭证注入 | 通过环境变量或 Secret Mount 注入，不明文传递 |

```ts
type SandboxPolicy = {
  maxCpuCores: number        // 默认 1
  maxMemoryMB: number        // 默认 512
  timeoutMs: number          // 默认 30000
  networkWhitelist: string[] // 允许访问的域名/IP
  writablePaths: string[]    // 可写路径，默认仅 ['/tmp']
  maxDiskMB: number          // /tmp 容量上限
}
```

### 16.2 凭证管理安全

#### 16.2.1 现有方案对比

| 平台 | 加密算法 | 密钥管理 | 存储位置 |
|------|----------|----------|----------|
| Dify | RSA + AES-EAX 混合加密 | RSA 密钥对配置于环境变量 | PostgreSQL `encrypted_credentials` 字段 |
| n8n | AES-256-CBC | 实例级加密密钥存储在 `~/.n8n/config` | PostgreSQL / SQLite `data` 字段 |

#### 16.2.2 7Flows 凭证方案

采用 **AES-256-GCM** 加密存储，兼顾安全性与性能：

```ts
type CredentialRecord = {
  id: string
  name: string
  type: string                    // 如 'openai_api_key', 'github_token'
  encryptedData: string           // AES-256-GCM 加密后的 base64 字符串
  iv: string                      // 初始化向量
  authTag: string                 // GCM 认证标签
  workspaceId: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

type CredentialRef = `credential://${string}`  // 如 credential://abc123
```

**凭证生命周期**：

```
用户输入明文凭证
  → AES-256-GCM 加密 → 存储到 PostgreSQL
  → 节点执行时读取 → 解密 → 注入 RuntimeContext
  → 执行结束 → 从内存清除解密值
```

**凭证引用**：节点配置中使用 `credential://{id}` 占位符引用凭证，前端不可见原始值。运行时由 Credential Manager 解密替换。

**凭证缓存**：已解密凭证可缓存于 Redis，TTL 可配（默认 86400s），减少频繁解密开销。

### 16.3 节点间交互安全

基于 `product-design.md` 中定义的 `AuthorizedContextRefs`，运行时强制校验节点间数据访问：

```ts
// 复用 product-design.md 中的 AuthorizedContextRefs
// type AuthorizedContextRefs = {
//   currentNodeId: string
//   readableNodeIds: string[]
//   readableArtifacts: Array<{
//     nodeId: string
//     artifactType: 'text' | 'json' | 'file' | 'tool_result' | 'message'
//   }>
// }

/** 运行时上下文访问校验 */
type ContextAccessCheck = {
  requestingNodeId: string
  targetNodeId: string
  artifactType: string
  allowed: boolean
  reason?: string              // 拒绝时的原因
}
```

**安全规则**：

1. 数据传递仅通过平台内部通道（Edge 的 `mapping` 字段），不允许节点直接互通
2. `AuthorizedContextRefs` 在每次节点执行前由 Runtime Scheduler 生成并注入
3. 敏感字段（标记为 `sensitive: true` 的输出）在传递给下游时自动脱敏，除非下游节点显式声明需要原始值

### 16.4 发布接口安全

通过 `PublishedEndpoint`（`product-design.md` 中定义）发布的接口，需额外保护：

| 维度 | 策略 |
|------|------|
| API Key 存储 | SHA-256 哈希存储，不可逆 |
| IP 白名单 | 可选配置，仅允许指定 IP/CIDR 访问 |
| 频率限制 | 每 API Key 独立计数，默认 60 RPM，可配 |
| 请求体大小 | 默认上限 10MB |
| 审计日志 | 每次调用记录：时间、来源 IP、API Key（脱敏）、状态码、耗时 |

```ts
type ApiKeyRecord = {
  id: string
  name: string
  keyHash: string              // SHA-256(raw_key)
  keyPrefix: string            // 前 8 位，用于识别
  workspaceId: string
  endpointId: string
  rateLimitRpm: number         // 默认 60
  ipWhitelist?: string[]       // CIDR 格式
  expiresAt?: string
  createdAt: string
  lastUsedAt?: string
}
```

### 16.5 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify RSA+AES 混合加密 | `dify/api/libs/rsa.py` → `encrypt()` (line 30), `decrypt()` (line 87) |
| Dify 凭证加密辅助 | `dify/api/core/helper/encrypter.py` → `encrypt_token()` (line 18) |
| Dify Provider 加密层 | `dify/api/core/helper/provider_encryption.py` → `ProviderConfigEncrypter` (line 28) |
| Dify 凭证 Redis 缓存 | `dify/api/core/helper/provider_cache.py` → `ProviderCredentialsCache` (line 9), TTL 86400s |
| Dify 凭证数据模型 | `dify/api/models/tools.py` → `BuiltinToolProvider.encrypted_credentials` (line 95) |
| Dify 沙盒代码执行 | `dify/api/core/helper/code_executor/code_executor.py` → `CodeExecutor` (line 50) |
| n8n AES-256-CBC 加密 | `n8n/packages/core/src/encryption/cipher.ts` → `Cipher.encrypt()` / `decrypt()` |
| n8n 实例加密密钥 | `n8n/packages/core/src/instance-settings/instance-settings.ts` → `encryptionKey` (line 140) |
| n8n 凭证模型 | `n8n/packages/@n8n/db/src/entities/credentials-entity.ts` → `CredentialsEntity` |
| n8n 凭证解密注入 | `n8n/packages/cli/src/credentials-helper.ts` → `getDecrypted()` (line 340) |
| n8n 凭证认证注入 | `n8n/packages/cli/src/credentials-helper.ts` → `authenticate()` (line 99) |

---

## 17. 节点间变量传递（Inter-Node Variable Passing）

### 17.1 变量作用域分层

7Flows 变量分为四个作用域层级，优先级从高到低：

| 层级 | 名称 | 生命周期 | 来源 | 示例 |
|------|------|----------|------|------|
| L0 | Node Outputs | 当前 Run | 上游节点执行产出 | `nodes.agent_plan.output.text` |
| L1 | Loop Iterators | 当前循环迭代 | Loop 节点注入 | `loop.currentItem`, `loop.index` |
| L2 | Trigger Inputs | 当前 Run | 触发请求参数 | `trigger.input.query` |
| L3 | Workflow Variables | 工作流生命周期 | 工作流级全局变量 | `workflow.vars.apiBaseUrl` |

**同名冲突解决**：低层级覆盖高层级（L0 > L1 > L2 > L3）。

#### 平台对比

- **Dify** 采用 `VariablePool` 二级字典：`node_id → variable_name → Variable`，所有变量平铺在一个池中
- **n8n** 采用 `WorkflowDataProxy` JavaScript Proxy 链：`$(nodeName).item.json.field`，通过 Proxy 动态解析

### 17.2 变量引用语法

7Flows 采用 Mustache 风格模板语法：

```
{{nodes.<nodeId>.output.<fieldPath>}}
{{trigger.input.<fieldName>}}
{{workflow.vars.<varName>}}
{{loop.currentItem}}
{{loop.index}}
```

#### 平台语法对比

| 平台 | 语法 | 示例 |
|------|------|------|
| 7Flows | `{{nodes.nodeId.output.field}}` | `{{nodes.agent_plan.output.text}}` |
| Dify | `{{#nodeId.variableName#}}` | `{{#1732874812345.text#}}` |
| n8n | `={{ $('nodeName').item.json.field }}` | `={{ $('AI Agent').item.json.output }}` |

### 17.3 静态映射 vs 表达式引用 vs MCP 动态查询

三种变量传递方式适用于不同场景：

| 方式 | 定义位置 | 解析时机 | 适用场景 | 示例 |
|------|----------|----------|----------|------|
| 静态映射 | Edge `mapping[]` | 节点启动前 | 确定性字段传递 | `sourceField: 'output.text' → targetField: 'prompt'` |
| 表达式引用 | Node `config` 字段值 | 节点启动前 | 需要拼接/变换 | `"请分析：{{nodes.fetcher.output.content}}"` |
| MCP 动态查询 | Node 运行时代码 | 节点执行中 | 运行时按需获取 | MCP `context.read()` 调用 |

### 17.4 Edge FieldMapping 完整定义

扩展 `product-design.md` 中 `Edge.mapping` 的 `FieldMapping` 类型：

```ts
type FieldMapping = {
  sourceField: string           // 源节点输出路径，如 'output.items[0].name'
  targetField: string           // 目标节点输入路径，如 'config.query'
  transform?: FieldTransform    // 可选的值变换
  template?: string             // 模板字符串，如 '分析结果：{{value}}'
  fallback?: unknown            // 源字段不存在时的默认值
}

type FieldTransform =
  | { type: 'identity' }                          // 原样传递
  | { type: 'toString' }                          // 转字符串
  | { type: 'toNumber' }                          // 转数字
  | { type: 'toBoolean' }                         // 转布尔
  | { type: 'jsonParse' }                         // JSON.parse
  | { type: 'jsonStringify' }                     // JSON.stringify
  | { type: 'template'; template: string }        // 模板渲染
  | { type: 'expression'; expr: string }          // 安全表达式
  | { type: 'jmesPath'; query: string }           // JMESPath 查询
```

### 17.5 表达式引擎

7Flows 表达式引擎仅支持安全子集，禁止任意代码执行：

**允许的操作**：

| 类别 | 示例 |
|------|------|
| 路径访问 | `nodes.agent.output.text`, `trigger.input.query` |
| 条件表达式 | `value > 0 ? 'positive' : 'negative'` |
| 模板拼接 | `'Hello, ' + nodes.user.output.name` |
| 基本运算 | `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `>`, `<`, `&&`, `\|\|` |
| 内置函数 | `len()`, `trim()`, `lower()`, `upper()`, `split()`, `join()`, `parseInt()`, `parseFloat()`, `JSON.stringify()`, `JSON.parse()` |
| 数组操作 | `items.length`, `items[0]`, `items.map(...)` (受限) |

**禁止的操作**：

- `eval()`, `Function()`, `new Function()`
- `import`, `require`
- 原型链访问：`__proto__`, `constructor`, `prototype`
- 全局对象访问：`window`, `global`, `process`, `globalThis`
- 异步操作：`async`, `await`, `Promise`

### 17.6 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify VariablePool 核心 | `dify/api/dify_graph/runtime/variable_pool.py` → `VariablePool` (line 30) |
| Dify 变量引用正则 | 同上 line 27: `VARIABLE_PATTERN = r"\{\{#...\#\}\}"` |
| Dify 变量添加 | 同上 `add()` (line 88), `get()` (line 139) |
| Dify 模板渲染 | 同上 `convert_template()` (line 235) |
| Dify 系统/环境/会话变量 | 同上 `SYSTEM_VARIABLE_NODE_ID="sys"`, `ENVIRONMENT_VARIABLE_NODE_ID="env"` |
| Dify 变量映射提取 | `dify/api/core/workflow/workflow_entry.py` line 243: `extract_variable_selector_to_variable_mapping()` |
| Dify 用户输入映射 | 同上 `mapping_user_inputs_to_variable_pool()` (line 440) |
| n8n WorkflowDataProxy | `n8n/packages/workflow/src/workflow-data-proxy.ts` → `WorkflowDataProxy.getDataProxy()` (line 759) |
| n8n `$(nodeName)` API | 同上 line 1114, 支持 `.item()`, `.first()`, `.last()`, `.all()` |
| n8n 表达式引擎 | `n8n/packages/workflow/src/expression.ts` → `Expression` |
| n8n 工作流表达式 | `n8n/packages/workflow/src/workflow-expression.ts` → `WorkflowExpression` |
| n8n Pin Data 回退 | `n8n/packages/workflow/src/workflow-data-proxy.ts` → `getNodeExecutionOrPinnedData()` (line 368) |
| xyflow Edge 类型定义 | `xyflow/packages/react/src/types/edges.ts` (line 54-80) |
| xyflow EdgeProps | 同上 (line 151-164), `data` 直传 |
| xyflow EdgeLabelRenderer | `xyflow/packages/react/src/components/EdgeLabelRenderer/index.tsx` |
| xyflow 自定义 Edge | `xyflow/packages/react/src/components/Edges/BaseEdge.tsx` |

---

## 18. 节点调试模式（Node Debug Mode）

### 18.1 调试模式分层

| 层级 | 名称 | 说明 | 默认状态 |
|------|------|------|----------|
| L0 | 运行日志 | 每个节点的输入/输出/耗时/错误信息 | 默认开启 |
| L1 | 单节点调试 | Mock 输入，单独执行某节点，保存结果供下游引用 | 按需触发 |
| L2 | 断点调试 | 在指定节点设置断点，暂停执行，检查上下文 | 按需触发 |
| L3 | 回放调试 | 加载历史 Run 数据，重放执行过程 | 按需触发 |

### 18.2 单节点调试协议

允许用户对单个节点提供 Mock 输入并独立执行，无需运行整个工作流：

```ts
type NodeDebugRequest = {
  workflowId: string
  nodeId: string
  mockInputs: Record<string, unknown>   // 用户提供的 Mock 输入
  useUpstreamCache: boolean              // 是否使用上游节点的缓存输出
  credentials?: Record<string, string>  // 可选的凭证覆盖
}

type NodeDebugResult = {
  nodeId: string
  status: 'succeeded' | 'failed'
  output: Record<string, unknown>
  logs: NodeDebugLog[]
  durationMs: number
  error?: {
    code: string
    message: string
    stack?: string
  }
  intermediates?: Record<string, unknown>  // 中间变量快照
}

type NodeDebugLog = {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  data?: unknown
}
```

**执行流程**（参考 Dify `DraftWorkflowNodeRunApi`）：

```
用户触发单节点调试
  → 前端发送 NodeDebugRequest
  → 后端加载工作流草稿
  → 构建 VariablePool：Mock 输入 + 上游缓存输出
  → 执行单个节点
  → 保存结果到 NodeRunSnapshot（供下游节点引用）
  → 返回 NodeDebugResult
```

### 18.3 断点调试协议

```ts
type BreakpointConfig = {
  nodeId: string
  type: 'before' | 'after'              // 节点执行前/后暂停
  condition?: string                     // 条件断点表达式，空 = 始终暂停
  enabled: boolean
}

type BreakpointHitEvent = {
  type: 'breakpoint.hit'
  workflowRunId: string
  nodeId: string
  nodeRunId: string
  breakpointType: 'before' | 'after'
  context: {
    inputs: Record<string, unknown>      // 当前节点输入
    outputs?: Record<string, unknown>    // type = 'after' 时有值
    variables: Record<string, unknown>   // 当前变量快照
  }
  timestamp: string
}

type BreakpointAction =
  | { action: 'continue' }                              // 继续执行
  | { action: 'step' }                                   // 执行下一个节点后暂停
  | { action: 'abort' }                                  // 中止执行
  | { action: 'modify'; variables: Record<string, unknown> }  // 修改变量后继续
```

**WebSocket 推送**：断点命中时通过 WebSocket 推送 `BreakpointHitEvent`，前端展示上下文并等待用户操作。

### 18.4 前端调试面板交互

#### 节点执行状态视觉反馈

通过 xyflow `updateNodeData()` 实时更新节点状态，节点边框颜色反映执行状态：

| 状态 | 边框颜色 | 说明 |
|------|----------|------|
| `pending` | 灰色 `#9CA3AF` | 等待执行 |
| `running` | 蓝色 `#3B82F6` | 正在执行 |
| `succeeded` | 绿色 `#10B981` | 执行成功 |
| `failed` | 红色 `#EF4444` | 执行失败 |
| `breakpoint_hit` | 黄色 `#F59E0B` | 断点命中，等待操作 |
| `skipped` | 浅灰色 `#D1D5DB` | 跳过（条件不满足/缓存命中） |

```ts
// 通过 xyflow updateNodeData 实时更新
type NodeDebugData = {
  debugStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'breakpoint_hit' | 'skipped'
  lastRunDurationMs?: number
  lastRunError?: string
  hasBreakpoint?: boolean
}
```

#### 调试面板 Tab 结构

| Tab | 内容 |
|-----|------|
| Input | 节点实际接收到的输入值（解析后的变量引用） |
| Output | 节点执行产出 |
| Logs | 节点运行日志（按时间排序） |
| Intermediates | 中间变量快照（LLM 节点的 prompt / tool calls 等） |
| Metrics | 执行耗时、Token 用量、API 调用次数等 |

### 18.5 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify 单节点运行 API | `dify/api/controllers/console/app/workflow.py` → `DraftWorkflowNodeRunApi` (line 749) |
| Dify 单节点运行服务 | `dify/api/services/workflow_service.py` → `run_draft_workflow_node()` (line 675) |
| Dify 单步执行入口 | `dify/api/core/workflow/workflow_entry.py` → `single_step_run()` (line 192) |
| Dify 变量加载器（调试用） | `dify/api/dify_graph/variable_loader.py` → `VariableLoader` (line 10), `load_into_variable_pool()` (line 56) |
| Dify 调试变量缓存 | `dify/api/services/workflow_draft_variable_service.py` → `DraftVarLoader` (line 70) |
| Dify 节点上次运行查询 | `dify/api/controllers/console/app/workflow.py` → `DraftWorkflowNodeLastRunApi` (line 1077) |
| Dify 前端调试面板 | `dify/web/app/components/workflow/run/` |
| n8n 部分执行引擎 | `n8n/packages/core/src/execution-engine/workflow-execute.ts` → `runPartialWorkflow2()` (line 197) |
| n8n Pin Data 跳过执行 | 同上 → `processRunExecutionData()` (line 1641-1646) |
| n8n 手动执行服务 | `n8n/packages/cli/src/manual-execution.service.ts` → `ManualExecutionService` |
| n8n 调试回放 | `n8n/packages/frontend/editor-ui/src/features/execution/executions/composables/useExecutionDebugging.ts` |
| xyflow useReactFlow | `xyflow/packages/react/src/hooks/useReactFlow.ts` |
| xyflow updateNodeData | `xyflow/packages/react/src/types/instance.ts` (line 255-264) |
| xyflow useNodesData | `xyflow/packages/react/src/hooks/useNodesData.ts` |
| xyflow Zustand Store | `xyflow/packages/react/src/store/index.ts` |

---

## 19. 值缓存（Value Caching）

### 19.1 缓存分层策略

| 层级 | 名称 | 存储 | TTL | 用途 |
|------|------|------|-----|------|
| L0 | 节点产出缓存 | Redis | Run 生命周期 | 同一 Run 内节点间数据传递，Run 结束自动清理 |
| L1 | 调试回放缓存 | PostgreSQL + S3 | 可配置（默认 7 天） | 历史 Run 回放、审计溯源、单节点调试引用 |
| L2 | 节点结果缓存 | Redis | 用户配置 | 相同输入跳过执行，降低 API 调用开销 |
| L3 | 发布层响应缓存 | Redis / CDN | 用户配置 | 高频接口响应缓存，减少工作流重复执行 |

### 19.2 节点结果缓存（L2）协议

```ts
type NodeCachePolicy = {
  enabled: boolean
  strategy: 'exact_match' | 'semantic_hash'
  ttl: number                       // 秒，0 = 永不过期
  maxEntries: number                // 最大缓存条目数，LRU 淘汰
  cacheKeyFields?: string[]         // 参与缓存 Key 计算的输入字段，空 = 全部
  invalidateOn?: CacheInvalidateRule[]
}

type CacheInvalidateRule =
  | { type: 'workflow_version_change' }
  | { type: 'credential_change'; credentialId: string }
  | { type: 'manual' }
  | { type: 'ttl_expire' }

type NodeCacheEntry = {
  cacheKey: string                  // SHA256(workflowId + nodeId + version + JSON(inputs))
  nodeId: string
  workflowId: string
  workflowVersion: string
  inputs: Record<string, unknown>   // 用于缓存命中时对比
  output: Record<string, unknown>
  createdAt: string
  expiresAt?: string
  hitCount: number
}
```

**缓存 Key 计算**：

```
cacheKey = SHA256(
  workflowId
  + nodeId
  + workflowVersion
  + stableStringify(selectedInputs)   // 按 cacheKeyFields 过滤后的输入
)
```

其中 `stableStringify` 确保对象键排序一致，避免因 JSON 序列化顺序差异导致缓存未命中。

### 19.3 调试回放缓存（L1）

#### 平台方案对比

**Dify 方案**：`WorkflowDraftVariable` 表持久化每次调试的节点输出，下游节点调试时可直接引用上游节点的历史产出。

**n8n 方案**：`pinData` 存储在工作流文档内部（`IPinData = Record<string, INodeExecutionData[]>`），执行引擎检测到 pinData 时直接跳过节点执行，使用 pinned 数据作为输出。

**7Flows 方案**：结合两者优势：

```ts
type NodeRunSnapshot = {
  id: string
  workflowId: string
  workflowVersion: string
  nodeId: string
  runId: string
  nodeRunId: string
  inputs: Record<string, unknown>
  output: Record<string, unknown>
  logs: NodeDebugLog[]             // 复用章节 18 的类型
  intermediates?: Record<string, unknown>
  durationMs: number
  status: 'succeeded' | 'failed'
  createdAt: string
  expiresAt?: string               // 默认 7 天后过期
  pinned: boolean                  // 用户手动 pin 的不过期
}
```

**Pin Data 行为**：

| 操作 | 行为 |
|------|------|
| 用户 Pin 某节点输出 | 设置 `pinned: true`，该快照不自动过期 |
| 下游节点调试 | 自动加载上游 pinned 快照作为输入 |
| 工作流完整运行 | pinned 节点跳过执行，直接使用 pinned 输出 |
| 用户 Unpin | 设置 `pinned: false`，恢复正常过期 |

### 19.4 发布层缓存（L3）

通过 `PublishedEndpoint` 发布的接口可启用响应缓存：

```ts
type EndpointCacheConfig = {
  enabled: boolean
  ttl: number                       // 秒
  maxEntries: number
  varyBy?: string[]                 // 参与缓存 Key 的请求字段
  excludeStreaming: boolean         // 流式响应不缓存，默认 true
}
```

**缓存 Key**：`SHA256(endpointId + stableStringify(varyByFields))`

**缓存命中时**：返回响应 Header 中添加 `X-7Flows-Cache: HIT`，未命中则为 `X-7Flows-Cache: MISS`。

**约束**：流式响应（`streaming: true`）默认不缓存，因为流式传输与缓存语义冲突。

### 19.5 缓存失效策略

| 触发条件 | 影响的缓存层级 | 行为 |
|----------|--------------|------|
| 工作流版本变更（发布新版本） | L2, L3 | 自动失效该工作流所有 L2 节点缓存和 L3 响应缓存 |
| 凭证变更（更新/轮换） | L2 | 失效引用该凭证的节点的 L2 缓存 |
| TTL 到期 | L0, L1, L2, L3 | 自然过期清除 |
| 用户手动清除 | L2, L3 | 提供 API / UI 手动失效指定缓存 |
| Run 结束 | L0 | 自动清理该 Run 的临时数据 |

```ts
type CacheInvalidateEvent = {
  type: 'workflow_version_change' | 'credential_change' | 'manual_purge' | 'ttl_expire'
  workflowId: string
  affectedLayers: ('L0' | 'L1' | 'L2' | 'L3')[]
  affectedNodeIds?: string[]        // 空 = 全部节点
  credentialId?: string             // type = 'credential_change' 时
  timestamp: string
}
```

### 19.6 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify 调试变量持久化 | `dify/api/models/workflow.py` → `WorkflowDraftVariable` (line 1274) |
| Dify 调试变量文件 | 同上 → `WorkflowDraftVariableFile` (line 1664) |
| Dify 节点执行记录 | `dify/api/models/workflow.py` → `WorkflowNodeExecutionModel` (line 740) |
| Dify 大数据卸载 | 同上 → `WorkflowNodeExecutionOffload` (line 994) |
| Dify 执行记录仓储 | `dify/api/dify_graph/repositories/workflow_node_execution_repository.py` → `WorkflowNodeExecutionRepository` (line 16) |
| Dify 调试变量保存 | `dify/api/dify_graph/repositories/draft_variable_repository.py` → `DraftVariableSaver` (line 12) |
| Dify 凭证缓存 | `dify/api/core/helper/provider_cache.py` → Redis TTL 86400s |
| Dify RSA 密钥缓存 | `dify/api/libs/rsa.py` (line 52-54) → Redis TTL 120s |
| Dify 工作流运行记录 | `dify/api/models/workflow.py` → `WorkflowRun` (line ~580) |
| n8n Pin Data 存储 | `n8n/packages/workflow/src/workflow.ts` → `Workflow.pinData` (line 86), `setPinData()` (line 150), `getPinDataOfNode()` (line 331) |
| n8n Pin Data 跳过执行 | `n8n/packages/core/src/execution-engine/workflow-execute.ts` (line 1641-1646) |
| n8n 前端 Pin Data Store | `n8n/packages/frontend/editor-ui/src/app/stores/workflowDocument/useWorkflowDocumentPinData.ts` |
| n8n Pin Data UI 组件 | `n8n/packages/frontend/editor-ui/src/features/ndv/runData/components/RunDataPinButton.vue` |
| n8n Pin Data 逻辑 | `n8n/packages/frontend/editor-ui/src/app/composables/usePinnedData.ts` |
