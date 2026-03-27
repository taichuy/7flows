# 7Flows 技术设计补充文档

> 本文档是 [7Flows 产品设计方案](./product-design.md) 的技术细化补充，覆盖当前关键设计补充主题。
> 所有 IR 类型与 `product-design.md` 中定义的 `Node`、`Edge`、`RuntimeContext`、`EvidencePack`、`ArtifactReference`、`AuthorizedContextRefs`、`PublishedEndpoint` 保持兼容。
> 文档分层约定：本文只保留持续有效的技术基线；开源项目定位与当前对外口径见 `docs/open-source-positioning.md`；当前实现索引放在 `docs/dev/`；当前开发者自己的按日期过程留痕如需保留，请放在 `docs/.private/history/`；废弃文档统一归档到 `docs/expired/`。

---

## 目录

- [14. 插件兼容性代理（Plugin Compatibility Proxy）](#14-插件兼容性代理plugin-compatibility-proxy)
- [15. 插件 UI 协议（Plugin UI Rendering Protocol）](#15-插件-ui-协议plugin-ui-rendering-protocol)
- [16. 安全与交互模型（Security & Interaction Model）](#16-安全与交互模型security--interaction-model)
- [17. 节点间变量传递（Inter-Node Variable Passing）](#17-节点间变量传递inter-node-variable-passing)
- [18. 节点调试模式（Node Debug Mode）](#18-节点调试模式node-debug-mode)
- [19. 值缓存（Value Caching）](#19-值缓存value-caching)
- [20. Durable Runtime 与 Phase State Machine](#20-durable-runtime-与-phase-state-machine)
- [21. Composite Agent Node Pipeline](#21-composite-agent-node-pipeline)
- [22. 上下文分层与 Artifact/Evidence](#22-上下文分层与-artifactevidence)
- [23. Tool Gateway 与执行追踪](#23-tool-gateway-与执行追踪)
- [24. Skill Catalog 与 Retrieval Protocol](#24-skill-catalog-与-retrieval-protocol)
- [25. 开源 / 商业边界的技术落点](#25-开源--商业边界的技术落点)

---

## 14. 插件兼容性代理（Plugin Compatibility Proxy）

### 14.1 设计目标

7Flows 的目标不是把 Dify 兼容逻辑硬编码进核心后端，而是建立一个**原生插件生态 + 可开关兼容层代理**的架构。

这组设计同时遵循以下架构理念：

1. **内部事实优先**
   - 插件兼容只能把外部描述转译进 7Flows 内部对象模型，不能让外部生态反向定义内部 DSL
2. **兼容层是边缘能力，不是平台中轴**
   - 核心运行时、事件流、鉴权与发布链路不应为某一个外部生态长出专属分支
3. **原生生态先于生态复刻**
   - 兼容层用于冷启动复用，不代表 7Flows 要长期以“复刻某平台结构”为目标
4. **能力接入先分层，再复用**
   - 先区分 node/provider/compat adapter 三类职责，再谈安装、发现、调用与 UI 映射
5. **部署与生命周期可观测**
   - 每个兼容层都应可启停、可限域、可健康检查、可独立排障

当前建议分为两层：

1. **7Flows Native Plugin Layer**
   - 挂在 `api/` 原生后端
   - 管理平台自己的节点插件、供应商插件、未来的原生生态
2. **Compatibility Adapter Layer**
   - 以插件形式或独立服务形式挂接
   - 每个兼容层对应一个外部生态，例如 Dify
   - 可按部署或工作空间启用/停用，不应成为核心后端的硬编码分支

首版重点仍然是 Dify，但架构上应直接为多兼容层预留：

- `compat:dify`
- `compat:n8n`（未来预留，不在当前交付范围）
- 其他外部生态

对于单个兼容层，代理层负责：

1. **生态转译**：读取外部插件描述并映射到 7Flows 内部 `ToolDefinition` / `ProviderDefinition`
2. **调用代理**：请求序列化、鉴权注入、超时控制、响应反序列化
3. **生命周期管理**：插件安装、卸载、升级、健康检查
4. **隔离策略**：每个插件或每类兼容服务运行在独立容器/进程中，崩溃不影响宿主

### 14.2 插件分类与服务边界

建议平台内统一存在三类插件：

```ts
type PluginKind =
  | 'node'
  | 'provider'
  | 'compat_adapter'
```

- `node`
  - 直接为工作流提供节点能力
- `provider`
  - 提供模型、向量、外部服务等供应商能力
- `compat_adapter`
  - 提供“外部插件生态到 7Flows”的桥接能力

推荐服务边界：

- `api/`
  - 保存原生插件注册中心与统一调用协议
  - 决定某个插件来自哪个生态
  - 统一向运行时暴露节点能力与供应商能力
- `dify adapter service`
  - 单独负责 Dify 插件安装、运行、调试和健康检查
  - 7Flows 通过 compat adapter 协议调用该服务

这样 Dify 兼容层可以独立启停、独立部署、独立观察，也更利于未来新增其他生态兼容层。

### 14.3 Dify 兼容层转译协议

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
  id: string                       // `compat:dify:plugin:<author>/<name>`
  name: string
  description: string
  inputSchema: JsonSchema           // 复用 product-design.md 中的 JsonSchema
  outputSchema?: JsonSchema
  source: 'builtin' | 'plugin' | 'mcp'
  pluginMeta?: {
    origin: 'dify'
    ecosystem: 'compat:dify'
    manifestVersion: string
    author: string
    icon: string
  }
}
```

**转译规则**：

| Dify 字段 | 7Flows 字段 | 转换逻辑 |
|-----------|-------------|----------|
| `identity.name` | `id` | 拼接为 `compat:dify:plugin:{author}/{name}` |
| `identity.label.en_US` | `name` | 取英文标签，缺省用 `identity.name` |
| `identity.description.en_US` | `description` | 取英文描述 |
| `parameters[]` | `inputSchema.properties` | 逐字段映射类型 |
| `parameters[].type = 'string'` | `{ type: 'string' }` | 直接映射 |
| `parameters[].type = 'select'` | `{ type: 'string', enum: [...] }` | options → enum |
| `parameters[].type = 'secret-input'` | `{ type: 'string', format: 'password' }` | 标记为凭证字段 |
| `parameters[].type = 'file'` | `{ type: 'string', format: 'uri' }` | 文件引用 URI |
| `parameters[].required` | `inputSchema.required[]` | 聚合 required 数组 |

### 14.4 调用代理 PluginCallProxy

```ts
type PluginCallRequest = {
  toolId: string
  ecosystem: string                     // 如 'native' | 'compat:dify'
  adapterId?: string                    // 如 'dify-default'
  inputs: Record<string, unknown>
  credentials: Record<string, string>   // 运行时解密注入
  timeout: number                       // 毫秒
  traceId: string                       // 关联 RuntimeContext.traceId
  execution?: {
    class: 'subprocess' | 'sandbox' | 'microvm'
    source: 'default' | 'runtime_policy' | 'tool_policy' | 'tool_call'
    profile?: string
    timeoutMs?: number
    networkPolicy?: 'inherit' | 'restricted' | 'isolated'
    filesystemPolicy?: 'inherit' | 'readonly_tmp' | 'ephemeral'
  }
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
    → 根据 ecosystem 选择 native runtime 或 compat adapter
    → 若 ecosystem = compat:dify：
      → 先按 adapter 声明的 `supportedExecutionClasses` 计算 effective execution
      → 若请求 execution class 未声明支持，则显式降级到 adapter 当前声明的默认类
      → 序列化为 Dify Plugin HTTP 请求格式
      → 注入鉴权 Header（从凭证管理解密获取）
      → 发送到 Dify Adapter Service
      → 超时控制（AbortController / asyncio.timeout）
      → 反序列化响应为 PluginCallResponse
  → 写入 Node Run 产出
```

### 14.5 兼容层开关与生命周期管理

建议兼容层开关粒度：

- 部署级
  - 某个适配服务是否启用
- 工作空间级
  - 某个 workspace 是否可用某个生态
- 插件级
  - 某个具体插件是否安装/启用

建议最小控制对象：

```ts
type CompatibilityAdapterRegistration = {
  id: string
  ecosystem: 'compat:dify' | 'compat:n8n'
  enabled: boolean
  endpoint: string
  healthStatus: 'healthy' | 'degraded' | 'offline'
  supportedExecutionClasses: ('subprocess' | 'sandbox' | 'microvm')[]
  scopes: {
    workspaceIds?: string[]
    pluginKinds: ('node' | 'provider')[]
  }
}
```

- `supportedExecutionClasses` 是 compat adapter 对“自己声明支持哪些 execution class”的显式契约，但不能被误写成“当前代码已经真实兑现”。
- 7Flows host 侧不会再把任意 `microvm / sandbox` 请求原样被动透传给一个只声明 `subprocess` 的 adapter；未声明支持时会在 `ToolGateway -> PluginCallProxy` 这条主链上先显式阻断或降级，并把 requested/effective/fallback / blocked 继续写进 trace / artifact。
- **当前共享事实**：compat adapter 与 native tool path 在 sandbox backend 明确声明 `supports_tool_execution` 且 capability / profile / dependency 约束匹配时，都已经可以通过 sandbox-backed tool runner 进入真实强隔离执行；只有在 backend 不支持 tool runner、能力不兼容或不可用时，`sandbox / microvm` 请求才继续 `fail-closed`，而不会静默退回 host / adapter 边界。
- compat adapter registration 与 sandbox backend registration 可以复用相似的注册 / health / capability 形态，但它们不是同一种运行时对象：compat adapter 解决生态桥接，sandbox backend 解决隔离执行。

### 14.6 Dify 兼容层生命周期管理

| 事件 | 行为 |
|------|------|
| 兼容层启用 | 注册 adapter → 健康检查 → 暴露可发现插件列表 |
| 插件安装 | Dify Adapter Service 拉取包 → 解析 manifest → 转译注册 → 启动容器 |
| 插件调用 | 7Flows 健康检查 adapter → 调用 → 记录指标 |
| 插件更新 | Adapter 拉取新版本 → 重新转译 → 滚动替换容器 |
| 插件卸载 | Adapter 停止容器 → 清理注册 → 清理凭证 |
| 兼容层停用 | adapter 标记 disabled → 从发现列表移除 → 拒绝新调用 |
| 健康检查失败 | 重启 adapter / 容器（最多 3 次） → 标记不可用 → 通知 |

### 14.7 与 Dify 官方插件类型的边界

根据本地 Dify 文档 `E:\code\taichuCode\dify-docs\zh\develop-plugin\dev-guides-and-walkthroughs\cheatsheet.mdx`，Dify 当前插件类型包含：

- 工具插件
- 模型插件
- 智能体策略插件
- 扩展插件
- 数据源插件
- 触发器插件

7Flows 首版不要求一次性完整覆盖所有类型，而是建议：

- 优先兼容工具插件
- 评估模型插件与供应商插件的映射边界
- 将触发器/数据源/扩展类能力视为后续分类，不在首版假装已完整支持

### 14.8 仓库与部署建议

为便于未来多生态共存，建议从文档和工程组织上就区分：

- `api/`
  - 7Flows 原生插件接口、注册中心、统一调用协议
- `services/compat-dify/`（未来建议目录）
  - Dify 兼容层服务
- `services/compat-n8n/`（未来建议目录）
  - n8n 兼容层服务
- 插件管理视图
  - 按 `native / compat:dify / compat:n8n` 分类展示

### 14.9 参考代码

| 参考项 | 路径 |
|--------|------|
| Dify 插件 HTTP 客户端基类 | `dify/api/core/plugin/impl/base.py` → `BasePluginClient` (line 57) |
| Dify 插件工具调用 | `dify/api/core/plugin/impl/tool.py` → `PluginToolManager.invoke()` (line 85) |
| Dify 插件安装注册 | `dify/api/core/plugin/impl/plugin.py` → `PluginInstaller` (line 24) |
| Dify 插件适配器（Tool 接口封装） | `dify/api/core/tools/plugin_tool/tool.py` → `PluginTool._invoke()` (line 26) |
| Dify 插件 Provider 控制器 | `dify/api/core/tools/plugin_tool/provider.py` → `PluginToolProviderController` (line 11) |
| Dify 工具管理中枢 | `dify/api/core/tools/tool_manager.py` → `ToolManager` |
| Dify 工具执行引擎 | `dify/api/core/tools/tool_engine.py` → `ToolEngine.agent_invoke()` (line 48) |
| Dify 插件类型速查 | `E:\code\taichuCode\dify-docs\zh\develop-plugin\dev-guides-and-walkthroughs\cheatsheet.mdx` |

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

### 16.1 分级执行与插件沙盒安全

7Flows 不采用“所有节点默认重隔离”的执行模式，而是采用“统一工作流执行器 + 分级节点执行层 + 少量高风险节点强隔离”的架构。

执行分层建议如下：

1. 工作流执行器
   - 统一负责 DAG 调度、上下文状态、节点输入输出传递、重试、超时、checkpoint、waiting / resume 和事件落库。
2. 普通节点运行层
   - 直接在 worker 内执行内建节点、官方节点和可信节点。
3. 沙箱执行层
   - 只给代码节点、用户自定义节点、插件脚本和高风险工具节点使用。
4. 强隔离执行层
   - 面向极少数高权限、高破坏面或高合规要求节点，首版先预留 `microvm` 路径。

关键边界：

- 工作流执行器必须保持唯一主控；sandbox job、插件 runtime、microvm runner 只提供执行，不拥有第二套流程状态机。
- `NodeType` 与 `ExecutionClass` 必须分离建模；同样是 `tool` 节点，可因来源和风险不同进入不同执行类。
- `execution class` 管执行隔离，`sensitivity_level` 管资源访问审批；两者不能混为同一条策略。

```ts
type ExecutionClass = 'inline' | 'subprocess' | 'sandbox' | 'microvm'

type NodeExecutionPolicy = {
  class: ExecutionClass
  profile?: string
  timeoutMs?: number
  networkPolicy?: 'inherit' | 'restricted' | 'isolated'
  filesystemPolicy?: 'inherit' | 'readonly_tmp' | 'ephemeral'
}
```

推荐默认映射：

| Execution Class | 默认适用对象 | 说明 |
|------|------|------|
| `inline` | Trigger / Output / Condition / Router / MCP / 可信工具 | 直接在 worker 中运行，适合绝大多数轻量节点 |
| `subprocess` | 需要轻量隔离的本地节点或工具 | 与主 worker 分进程，但不进入完整沙盒 |
| `sandbox` | Code / 用户自定义节点 / 插件脚本 / 浏览器与文件写入工具 | 进入独立容器或沙盒服务执行 |
| `microvm` | 极少数高权限或高合规节点 | 更强隔离，首版先预留 |

插件与工具不应一律独立容器。只有当能力本身涉及脚本执行、浏览器操作、文件写入、宿主访问面扩大或来源不可信时，才默认进入 `sandbox` 或未来的 `microvm`。

### 16.1.1 OSS 默认轻执行与 Sandbox Backend 边界

- `OSS / Community` 默认保持 `worker-first`：普通 workflow 节点继续轻执行，不把默认 sandbox 作为所有部署的硬前置。
- sandbox 协议、能力声明和接入点默认开放；社区、官方或企业后端都应沿统一 contract 挂入，而不是反向改写 workflow semantics。
- 对需要强隔离且不可安全降级的路径，例如 `sandbox_code`、高风险 `tool/plugin` 或显式要求受控 `sandbox / microvm` 的 profile，应在没有兼容且健康的 sandbox backend 时 `fail-closed` 为 blocked / unavailable，而不是静默退回 `inline`。
- core IR 优先只理解最小 sandbox contract，例如 `profile`、`language`、运行时限制、依赖引用和 capability 声明；镜像、挂载、私有 registry、wheelhouse、bundle 安装等企业依赖细节，优先留在 backend/profile/admin 扩展。

推荐的最小 capability 与注册模型：

```ts
type DependencyMode = 'builtin' | 'dependency_ref' | 'backend_managed'

type SandboxBackendCapability = {
  supportedExecutionClasses: ('sandbox' | 'microvm')[]
  supportedLanguages: string[]
  supportedProfiles: string[]
  supportedDependencyModes: DependencyMode[]
  supportsBuiltinPackageSets: boolean
  supportsBackendExtensions: boolean
  supportsNetworkPolicy: boolean
  supportsFilesystemPolicy: boolean
}

type SandboxBackendRegistration = {
  id: string
  kind: 'official' | 'custom'
  endpoint: string
  enabled: boolean
  healthStatus: 'healthy' | 'degraded' | 'offline'
  capability: SandboxBackendCapability
}
```

补充约束：

- `image / mount / bundle` 可以是后续候选的 shared dependency mode；但在至少两个 backend 真实共享相同语义之前，优先通过 `backendExtensions` 或 profile registry 表达，不要过早抬升成 workflow 核心字段。
- 官方默认 backend 若存在，应只维护少量官方受控 builtin package set；企业第三方依赖环境应通过自定义 backend 自行实现。

对 `sandbox` 执行类，建议默认安全策略如下：

| 维度 | 策略 |
|------|------|
| 进程隔离 | 默认运行在独立容器（Docker）或独立沙盒服务中 |
| 网络隔离 | 默认禁止自由出站，通过白名单放行声明域名 |
| 文件系统 | 只读挂载代码与依赖，`/tmp` 可写但容量受限（默认 100MB） |
| 资源限额 | CPU: 1 core, Memory: 512MB, 执行超时: 30s（可配） |
| 凭证注入 | 通过环境变量或 Secret Mount 注入，不明文传递 |
| 结果回传 | 通过 artifact / callback / result channel 返回，不直接暴露宿主文件 |

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

#### 16.2.3 统一敏感访问控制（Sensitive Access Control）

7Flows 首版不预置“支付信息 / 个人隐私 / 危险工具能力”这类行业分类，而是提供统一的**分级访问管理基座**：

- 业务厂商或应用侧负责声明资源文本、用途说明与 `sensitivity_level`
- 平台负责管理访问请求、策略决策、人工审核、通知与审计闭环
- 授权在首版视为统一运行时能力，而不是先定义独立“人工审核节点”

最小对象模型：

```ts
type SensitivityLevel = 'L0' | 'L1' | 'L2' | 'L3'
type AccessDecision = 'allow' | 'deny' | 'require_approval' | 'allow_masked'
type AccessRequesterType = 'human' | 'ai' | 'workflow' | 'tool'
type AccessActionType = 'read' | 'use' | 'export' | 'write' | 'invoke'

type SensitiveResourceRecord = {
  id: string
  label: string
  description?: string
  sensitivityLevel: SensitivityLevel
  source:
    | 'credential'
    | 'workspace_resource'
    | 'local_capability'
    | 'published_secret'
  metadata?: Record<string, unknown>
}

type SensitiveAccessRequest = {
  id: string
  runId?: string
  nodeRunId?: string
  requesterType: AccessRequesterType
  requesterId: string
  resourceId: string
  actionType: AccessActionType
  purposeText?: string
  decision?: AccessDecision
  reasonCode?: string
  createdAt: string
}

type ApprovalTicket = {
  id: string
  accessRequestId: string
  runId?: string
  nodeRunId?: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  waitingStatus: 'waiting' | 'resumed' | 'failed'
  approvedBy?: string
  decidedAt?: string
}

type NotificationDispatch = {
  id: string
  approvalTicketId: string
  channel: 'in_app' | 'webhook' | 'feishu' | 'slack' | 'email'
  target: string
  status: 'pending' | 'delivered' | 'failed'
  deliveredAt?: string
  error?: string
}
```

运行规则：

1. `human / ai / workflow / tool` 访问受控资源前先提交 `SensitiveAccessRequest`
2. Policy Engine 按 `sensitivityLevel + requesterType + actionType` 输出 `allow / deny / require_approval / allow_masked`
3. 命中 `require_approval` 时，创建 `ApprovalTicket`，Run 进入 `waiting`，通知适配器负责触达人类
4. 审批通过后触发 `resume`；审批拒绝或过期则写入拒绝事件并终止当前访问

设计原则：

- 平台优先放行“使用权”而不是“原文”，能给 handle / masked value 就不要给明文
- 高敏资源默认不直接进入 AI prompt、`run_events` 或 artifact 摘要
- 通知是人工审核的触达机制，审批结果仍以平台事实层和 `resume` 为准

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
4. 任何敏感资源访问都必须先经过 `SensitiveAccessRequest`，不允许节点或前端绕过运行时直接读原文
5. 即使决策为 `allow`，也应优先通过 handle、本地受控工具或脱敏值继续执行，而不是默认把高敏明文注入 AI prompt、日志或事件流
6. 命中 `require_approval` 时，节点或工具访问应进入 `waiting` / `need_review`，由审批票据与通知闭环驱动后续恢复

### 16.4 发布接口安全

通过 `PublishedEndpoint`（`product-design.md` 中定义）发布的接口，需额外保护：

| 维度 | 策略 |
|------|------|
| API Key 存储 | SHA-256 哈希存储，不可逆 |
| IP 白名单 | 可选配置，仅允许指定 IP/CIDR 访问 |
| 频率限制 | 每 API Key 独立计数，默认 60 RPM，可配 |
| 请求体大小 | 默认上限 10MB |
| 敏感导出控制 | 若响应包含高敏资源的 `export` / `write` 动作，应先走统一敏感访问控制与审批闭环 |
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
| Intermediates | 中间变量快照（LLM 节点的 prompt / tool calls / evidence / artifact refs 等） |
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

**运行事实 handoff**：只要 published 调用已经生成 `run`，无论是同步成功、异步 waiting / succeeded，还是流式响应，Header 都应继续暴露 `X-7Flows-Run-Id` 与 `X-7Flows-Run-Status`，让 direct caller 不必先反序列化整份协议 body 或等待流结束，仍能立即回跳到统一的 run trace / follow-up 主链；若本次调用在发布层被直接拒绝（包括 sync / async 协议限制），还应额外返回 `X-7Flows-Reason-Code`，并在错误 body 中提供带 `reason_code` 的结构化 detail；若拒绝发生在 `run` 创建前，则不返回 `X-7Flows-Run-Id` / `X-7Flows-Run-Status`。

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

---

## 20. Durable Runtime 与 Phase State Machine

### 20.1 设计目标

7Flows 的运行时目标不是“单个同步 HTTP 请求驱动整条链式执行”，而是 Durable Agent Workflow Runtime：

- 工作流执行器始终是唯一主控，子执行器只承接具体执行
- 节点可以进入 waiting 状态
- waiting 后能通过 checkpoint 恢复
- 工具慢、assistant 慢、外部回调慢时，主流程实例不丢失
- 运行态、事件流、artifact、AI/tool 调用都可追溯
- 运行基础事实层先独立成立，再把同一份事实分发给人类界面、人 + AI 协作入口和 AI 自治入口，避免不同消费方式各自维护一套运行真相

### 20.2 当前 Phase 1 落地事实（2026-03-11）

当前已经落地的 Phase 1 MVP：

- 最小 `Flow Compiler`：把 workflow/version 快照编译为运行时 blueprint
- `RuntimeService`：以 phase state machine 风格驱动节点执行
- 当前节点执行主路径仍以 worker 内联执行为主，尚未把 `execution class` 与 execution adapter registry 收口成独立层
- `POST /api/runs/{run_id}/resume`：作为最小恢复入口
- `run_artifacts`、`tool_call_records`、`ai_call_records`：作为独立运行态事实表
- `waiting / resume + callback ticket` 已具备承接未来审批流的基础原语

当前还未完整落地、不能假装已完成的部分：

- 统一的 `ExecutionClass / NodeExecutionPolicy / Execution Adapter Registry`
- `sandbox_code` 的正式运行时执行与高风险节点默认隔离链
- 独立 queue / scheduler
- `WAITING_CALLBACK` 的后台自动唤醒
- 延迟重试和 timeout 的统一调度器
- Loop 的正式 durable 运行语义
- 统一的 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 事实层与 API

### 20.3 FlowRun / NodeRun 双层状态模型

推荐 `FlowRun` 状态：

```ts
type FlowRunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'timed_out'
```

推荐 `NodeRun` 采用 `status + phase` 双层表达：

```ts
type NodeRunStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'retrying'
  | 'skipped'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'need_review'
  | 'canceled'

type NodeRunPhase =
  | 'preparing'
  | 'running_main'
  | 'waiting_tool'
  | 'running_assistant'
  | 'waiting_callback'
  | 'finalizing'
```

补充语义：

- `need_review` 表示节点或工具访问已命中 `require_approval`，等待统一授权决策
- `node_runs.waiting_reason` 建议至少区分 `approval_required`、`callback_pending`、`input_required`

持久化层建议至少保存：

- `runs.current_node_id`
- `runs.checkpoint_payload`
- `node_runs.phase`
- `node_runs.execution_class`
- `node_runs.retry_count`
- `node_runs.phase_started_at`
- `node_runs.checkpoint_payload`
- `node_runs.waiting_reason`

### 20.3.1 运行基础事实层共享契约

`runs / node_runs / run_events / run_artifacts` 是 7Flows 运行基础事实层的主干；MCP、发布接口、调试 UI 和 operator 入口都只能消费这条事实层派生出的投影，而不能各自维护第二套状态。

| 事实对象 | 粒度 | 必须承载 | 不应承载 |
| --- | --- | --- | --- |
| `runs` | 每个 workflow run 一条主记录 | workflow 级状态、入口来源、绑定版本、当前节点、checkpoint、最终结果摘要 | 节点逐步明细、大体量原始 payload |
| `node_runs` | 每个节点执行实例一条记录 | 节点状态、phase、waiting reason、execution class、重试、节点输出摘要 | workflow 级最终状态裁决 |
| `run_events` | append-only 事件流 | timeline、streaming、phase 迁移、关键说明与可观察事件 | 大文件、超长原文、最终结果唯一事实 |
| `run_artifacts` | 原始结果与引用 | 文件、tool raw output、AI prompt/response 快照、大 JSON / 长文本、evidence 来源引用 | 主状态流转与路由决策 |

补充约束：

- `tool_call_records`、`ai_call_records`、callback ticket、approval ticket 等侧边事实，必须通过 `run_id / node_run_id` 继续挂回这条主事实链。
- 当多个入口都需要同一组字段时，应新增共享投影或共享 serializer，而不是为某个入口再存一份局部状态。
- 如果某个字段只存在于 UI 本地 state、发布缓存或单一 adapter 响应里，却无法回溯到事实层，应视为契约漂移。

### 20.3.2 共享投影与消费规则

Runtime Fact Layer 之上允许存在共享读模型，但这些读模型必须保持“派生而非主事实”的身份。当前建议至少维护以下投影：

- `run_snapshot`
  - 面向跨入口的 compact 状态摘要，服务 run detail、operator 动作结果、published invocation detail 等场景。
- execution view
  - 面向 diagnostics / operator 的时间线、focus node、waiting blocker、artifact/tool summary。
- evidence view
  - 面向人类与 AI 的高质量摘要、证据引用和 follow-up 解释。
- `authorized_context`
  - 面向 MCP 与节点运行时的授权读取投影。

消费规则如下：

- MCP
  - 只能读取 `authorized_context` 这类授权投影或其引用，不能绕过权限直接扫表，也不能依赖 UI 拼装结果。
- 发布接口
  - 同步响应、异步状态、流式事件、published invocation detail 与导出，都必须从事实层或共享投影派生；协议缓存只做加速，不做真相存储。
- UI
  - 调试面板、发布治理页、sensitive access inbox、operator result 页面只消费共享投影；前端本地 state 只负责交互态，不负责保存运行真相。

### 20.3.3 演进约束

- 需要新增新的消费入口时，优先判断它应复用现有投影，还是补一层新的共享投影。
- 不要为“人看”“AI 看”“协议看”分别设计三套事实表；差异应落在投影层与权限层，而不是事实层。
- 如果某个入口需要额外解释字段，优先把字段补到共享 serializer / projection builder，再由多个入口一起消费。

### 20.4 Checkpoint / Resume

最小 checkpoint 建议形态：

```ts
type FlowCheckpointState = {
  orderedNodeIds: string[]
  activatedBy: Record<string, string[]>
  upstreamInputs: Record<string, Record<string, unknown>>
  mappedInputs: Record<string, Record<string, unknown>>
  completedNodeIds: string[]
}
```

恢复规则：

1. 先读取 `runs.checkpoint_payload`
2. 再读取当前 `node_runs` 的 phase 与 node-level checkpoint
3. 若 `waiting_reason = approval_required`，则先读取 `ApprovalTicket` 的最终决策，再决定是恢复执行还是终止
4. 依据 phase 决定从 `tool_execute`、`assistant_distill` 或 `main_finalize` 继续
5. 恢复后继续写统一 `run_events`

### 20.5 Phase 2 演进方向

Phase 2 才补完整 durable 语义：

- scheduler / callback bus
- 自动重试调度
- 后台 timeout / fallback
- worker 侧自动 resume

---

## 21. Composite Agent Node Pipeline

### 21.1 设计目标

`llm_agent` 不应只是“一次模型调用”，而应是节点内复合 pipeline：

1. `Prepare`
2. `Main Plan`
3. `Tool Execute`
4. `Assistant Distill`
5. `Main Finalize`
6. `Emit Output`

### 21.2 配置模型

```ts
type AgentNodeExecutionConfig = {
  provider?: string
  modelId?: string
  systemPrompt?: string
  prompt?: string
  execution?: {
    class?: 'inline' | 'subprocess' | 'sandbox' | 'microvm'
    profile?: string
    timeoutMs?: number
  }
  toolPolicy?: {
    allowedToolIds?: string[]
  }
  assistant?: {
    enabled: boolean
    trigger:
      | 'always'
      | 'on_large_payload'
      | 'on_search_result'
      | 'on_multi_tool_results'
      | 'on_high_risk_mode'
  }
  fallbackOutput?: Record<string, unknown>
}
```

### 21.3 assistant 边界

assistant 的职责：

- 整理工具返回
- 压缩长文本
- 生成 `EvidencePack`
- 标记冲突与未知项

assistant 不负责：

- 决定流程下一步
- 直接输出给最终用户
- 默认调用额外工具

### 21.4 主 AI 与 assistant 的控制边界

关键约束：

- 主 AI 始终保留最终控制权
- assistant 是节点内辅助认知层，不是第二主 AI
- assistant 关闭时应退化兼容旧式单主 AI 路径

---

## 22. 上下文分层与 Artifact/Evidence

### 22.1 四层上下文模型

```ts
type GlobalContext = Record<string, unknown>
type NodeWorkingContext = Record<string, unknown>

type EvidencePack = {
  summary: string
  keyPoints: string[]
  evidence: Array<{
    title: string
    detail: string
    sourceRef?: string
  }>
  conflicts: string[]
  unknowns: string[]
  recommendedFocus: string[]
  confidence?: number
}

type ArtifactReference = {
  uri: string
  type: 'text' | 'json' | 'file' | 'tool_result' | 'message' | 'llm_io'
  summary?: string
  contentType?: string
}
```

四层分别承担：

- `Global Context`：工作流级共享输入、变量、约束
- `Node Working Context`：节点内部阶段性状态
- `Evidence Context`：供主 AI 消费的高质量证据
- `Artifact Store`：原始大结果与文件引用

### 22.2 Prompt 构建原则

主 AI prompt 构建应遵循：

1. 优先读取 `EvidencePack`
2. 再读取必要的 working context
3. 原始大结果只通过 artifact 引用或短摘要进入 prompt
4. 不允许把工具原始大 JSON / 长文全文无节制直接塞给主 AI

### 22.3 Artifact Store 职责

Artifact Store 负责保存：

- 工具原始返回
- AI 输入 / 输出快照
- 大 JSON
- 长文本
- 文件或二进制结果

它既服务：

- 调试与审计
- AI / 自动化追溯
- execution view / evidence view

---

## 23. Tool Gateway 与执行追踪

### 23.1 Tool Gateway 职责

所有工具调用都应经过 Tool Gateway，而不是散落在节点执行器内部。

Tool Gateway 至少负责：

- 工具注册入口复用
- 参数校验
- 权限控制
- execution class 选择与执行适配器分发
- 敏感访问决策挂点
- 审批票据与通知触发挂点
- 超时
- 重试
- 结果标准化
- artifact 持久化
- 调用追踪
- native / compat / local agent / remote API 桥接

当前 compat adapter 调用约定额外要求：

- Tool Gateway 在解析出统一 `ResolvedExecutionPolicy` 后，应把标准化 `execution` payload（`class / source / profile / timeoutMs / networkPolicy / filesystemPolicy`）连同 `traceId` 一起透传给当前真正可执行的 compat adapter `/invoke` 请求，而不是只在 7Flows 内部 trace / artifact 中可见。
- **当前共享事实**：compat adapter 与 native tool 的 `sandbox / microvm` 请求在 sandbox backend 声明 `supports_tool_execution` 后，都不会再继续透传到原始 host invoker / adapter `/invoke`，而是统一改走 sandbox-backed tool runner；只有 runner capability 不满足时才按同一条事实链 `fail-closed`。
- **当前共享事实**：sandbox-backed tool runner 返回的 normalized result `summary / content_type / raw_ref / meta` 已继续接回 runtime tool fact chain；compat adapter `/invoke` 回执里的 `requestMeta` 也会继续落回 `tool_call_records.response_meta` 与 run execution trace，方便 operator 在 diagnostics 里核对 adapter 实际收到的 `traceId / execution / executionContract`，减少 native / compat / callback 路径在 operator 视角的再次分叉。
- **当前共享事实**：单 run operator action 的后端返回面已继续收口到 compact `run_snapshot` 共享契约；手动恢复与 callback cleanup 现在都会直接返回包含 execution focus / callback waiting / artifact / raw_ref 摘要的 compact snapshot，前端优先消费同一份后端事实，不再默认额外回拉一次 `fetchRunSnapshot` 再做页面级兜底拼装。
- **后续重点**：继续把 native / compat sandbox tool runner 的 payload contract、artifact / trace 语义和更多作者侧解释入口统一起来，避免两条工具路径在 UI 与治理面再次分叉。

### 23.1.1 Sandbox Backend 执行协议

`sandbox_code` 与高风险 `tool/plugin` 应优先复用同一套 sandbox backend 协议，而不是分别发明独立执行面。

```ts
type SandboxExecutionRequest = {
  profile: string
  language: string
  code?: string
  command?: string[]
  files?: ArtifactReference[]
  dependencyMode: DependencyMode
  builtinPackageSet?: string
  dependencyRef?: string
  runtimePolicy: {
    timeoutMs?: number
    networkPolicy?: 'inherit' | 'restricted' | 'isolated'
    filesystemPolicy?: 'inherit' | 'readonly_tmp' | 'ephemeral'
  }
  traceId: string
  backendExtensions?: Record<string, unknown>
}

type SandboxExecutionResult = {
  status: 'success' | 'failed' | 'waiting'
  summary: string
  structured?: Record<string, unknown>
  stdout?: string
  stderr?: string
  artifactRefs?: string[]
  requestedExecutionClass: 'sandbox' | 'microvm'
  effectiveExecutionClass: 'sandbox' | 'microvm'
  backendRef: string
  fallbackReason?: string
}
```

约束：

- `backendExtensions` 对 7Flows core 保持 opaque；host 只做透传、审计和 capability gating，不负责解释镜像、挂载、私有 registry 或内部 runner 细节。
- 只有当 sandbox backend capability 已声明支持相应 profile / language / dependency mode / policy 维度时，运行时才应把请求发出；否则应在 host 侧显式阻断。
- 对强隔离必需路径，这里的“阻断”应表现为 blocked / unavailable，而不是回退到普通 worker 执行。

### 23.2 标准化工具返回

```ts
type ToolExecutionResult = {
  status: 'success' | 'failed' | 'partial' | 'waiting'
  contentType: 'text' | 'json' | 'file' | 'table' | 'binary' | 'mixed'
  summary: string
  rawRef?: string
  structured?: Record<string, unknown>
  meta: {
    toolName: string
    latencyMs: number
    truncated: boolean
    executionClass?: 'inline' | 'subprocess' | 'sandbox' | 'microvm'
    executorRef?: string
    accessDecision?: 'allow' | 'deny' | 'require_approval' | 'allow_masked'
    waitingReason?: string
    approvalTicketId?: string
  }
}
```

### 23.3 运行追踪事实

建议把下面几类事实拆开持久化：

```ts
type RunArtifactRecord = {
  id: string
  runId: string
  nodeRunId?: string
  scope: 'tool' | 'assistant' | 'main_ai' | 'runtime'
  uri: string
  summary?: string
  contentType?: string
}

type ToolCallTrace = {
  toolName: string
  executionClass?: 'inline' | 'subprocess' | 'sandbox' | 'microvm'
  executorRef?: string
  inputSummary: string
  outputSummary?: string
  rawRef?: string
  latencyMs?: number
  error?: string
}

type AICallTrace = {
  role: 'main' | 'assistant'
  phase: string
  inputSummary: string
  outputSummary?: string
  promptRef?: string
  responseRef?: string
  latencyMs?: number
  tokenUsage?: {
    prompt?: number
    completion?: number
    total?: number
  }
}

type AccessDecisionTrace = {
  requestId: string
  resourceId: string
  requesterType: 'human' | 'ai' | 'workflow' | 'tool'
  actionType: 'read' | 'use' | 'export' | 'write' | 'invoke'
  sensitivityLevel: 'L0' | 'L1' | 'L2' | 'L3'
  decision: 'allow' | 'deny' | 'require_approval' | 'allow_masked'
  approvalTicketId?: string
  reasonCode?: string
}

type NotificationTrace = {
  approvalTicketId: string
  channel: string
  status: 'pending' | 'delivered' | 'failed'
  target?: string
  error?: string
}
```

### 23.4 日志粒度原则

执行追踪默认记录：

- 摘要
- 引用
- phase 转换
- latency / error
- 敏感访问的分级、动作、决策与审批票据引用

而不是默认把超长原文直接写进事件流或前端面板。
对敏感资源而言，原始明文不应进入默认事件流，只保留脱敏摘要、handle 或审计引用。

## 24. Skill Catalog 与 Retrieval Protocol

### 24.1 设计目标

7Flows 的 product skill 应保持为**服务侧托管的轻量技能文档**，专门服务于 `llm_agent` 的认知注入与参考资料检索，而不是再造一套流程语义。

它至少需要满足以下原则：

1. **skill 是知识注入层，不是执行层**
   - skill 本身不拥有 DAG 控制、waiting / resume、重试或本地环境接管能力
2. **结构极简，正文自由**
   - 首版只保留 `name / description / body / references`
   - `body` 保持自由文本，不预设重表单 schema
3. **reference 按需拉取**
   - 主 skill 先返回正文与 reference 摘要
   - reference 正文在模型或运行时确有需要时再继续获取
4. **托管在 7Flows 服务侧**
   - skill 是平台服务层资产，不是默认下发到本地客户端的安装包
5. **不与仓库协作 skill 混用**
   - `.agents/skills/*` 是 AI 协作开发资产
   - product skill 是产品运行时资产

### 24.2 最小 Skill 结构

```ts
type SkillDoc = {
  id: string
  name: string
  description: string
  body: string
  references: Array<{
    id: string
    name: string
    description: string
  }>
}

type SkillReferenceDoc = {
  id: string
  name: string
  description: string
  body: string
}
```

补充约束：

- `name` 和 `description` 默认适合作为主 AI 的快速认知注入摘要
- `body` 保持自由表达，不把 skill 约束成一组固定表单字段
- `references` 在主文档中只保留最小索引信息；reference 正文单独获取
- 若未来接入通用 skill 规范、外部 marketplace 或本地助手 skill 格式，应先映射到这一内部结构

### 24.3 获取协议

建议同时预留 HTTP API 与 MCP 风格协议，两者指向同一份服务侧事实：

- HTTP
  - `GET /api/skills`
  - `GET /api/skills/{skill_id}`
  - `GET /api/skills/{skill_id}/references/{ref_id}`
- MCP
  - `skills.list`
  - `skills.get`
  - `skills.get_reference`

建议语义：

- `list` / `GET /api/skills`
  - 返回 `id / name / description` 等轻量列表，用于发现
- `get`
  - 返回主 `SkillDoc` 正文与 reference 摘要
- `get_reference`
  - 按需返回单个 `SkillReferenceDoc`

可以做只读缓存、etag 或 workspace scope，但不要把它演进成“本地下载后长期分叉维护的 skill 包管理器”。

### 24.4 注入与运行语义

skill 的注入对象应明确限制为 `llm_agent`，而不是新的节点种类或第二套 runtime。

推荐语义：

1. 节点配置或运行策略声明一组候选 `skill_id`
2. `llm_agent` 在 `prepare / main_plan` 阶段拉取 skill 摘要与正文
3. 当主 AI 判断需要更深材料时，再拉取单个 reference 正文
4. skill 内容进入 prompt/context/evidence 辅助层，帮助主 AI 决策
5. 真正的工具调用、MCP 查询、浏览器/桌面操作仍走现有 `ToolGateway`、runtime 和 OpenClaw / 本地助手边界

明确禁止：

- 把 skill 设计成新的 `NodeType`
- 让 skill 自己持有流程推进权
- 让 skill 自己接管本地环境安装、下载审批或客户端生命周期

### 24.5 与 OpenClaw / 本地助手的边界

- skill 负责“告诉主 AI 应该如何理解和处理某类任务”
- OpenClaw / 本地助手负责“在真实环境里点击、输入、下载、执行”
- 7Flows 当前不把 skill 设计成接管本地助手应用商店、客户端下载市场或重型本地审核中心

这条边界的价值在于：

- 7Flows 仍保持 workflow kernel 与控制面定位
- OpenClaw 仍保持本地执行入口定位
- skill 只补认知层，不挤占运行时和本地执行层职责

### 24.6 适配边界

- 外部或通用 skill 格式可以通过 adapter 转成 `SkillDoc`
- `.agents/skills/*` 不直接作为 product runtime 的线上 skill source of truth
- 如果未来希望复用仓库 skill 的某些内容，应先经过显式 publish / adapt 步骤，再进入产品运行时 catalog

## 25. 开源 / 商业边界的技���落点

### 25.1 基本原则

- 开源与商业必须共用同一 kernel；商业控制层不得复制 workflow executor、`7Flows IR`、发布协议栈或统一事件流。
- 版本边界优先落在组织治理、控制面、部署形态、托管资源、支持与官方服务层，而不是另起执行引擎。
- adoption-critical 的基础能力应继续留在 OSS kernel / community 层；治理密度高、持续消耗官方维护资源的能力再进入 Team / Enterprise / Managed。

### 25.2 当前代码事实与空缺（2026-03-15）

- 当前仓库主要已经落地的是 OSS kernel 与运行时基础：workflow schema、runtime、published surface、trace / evidence view、插件兼容与自部署链路。
- 这些核心执行与调试能力属于平台底座，不应在后续版本分层中被错误抽走成“只有商业版才能用”的能力。
- 当前代码还没有完整的 `organization / member / role / auth / multi-workspace` 领域模型；部分 `workspace_id` 作用域已经出现在 starter、plugin catalog 等局部模块，但距离 Team / Enterprise 的正式治��面还很远。

### 25.3 推荐技术切分

- `OSS / Community`
  - `7Flows IR` / runtime / trace-replay 基础事实层
  - 可视化编排、基础执行透明、基础 published surface、自部署
  - 插件协议、SDK 与开发者入口
- `Team`
  - 多 workspace、发布确认 / 基础审批、环境隔离、团队报表、告警、私有模板库
- `Enterprise`
  - 组织级治理、审计日志、高级审批链、SSO / SCIM / SAML、预算 / 配额、模型 / 连接器策略、私有节点仓库、私有部署包装
- `Managed / Service`
  - 官方托管执行、日志 / artifact / queue、升级 / 备份 / 灾备、SLA、迁移与咨询交付

### 25.4 实现约束

- edition flag、授权、部署包装和支持边界可以分层，但 runtime orchestration 不能分叉。
- 文档和 UI 必须显式区分“当前事实”和“目标版本能力”，不能把 Team / Enterprise 目标能力提前伪装成已落地功能。
- AI 协作开发在涉及 OpenClaw 场景、版本边界、治理能力或对外定位口径时，应同时参考 `docs/open-source-positioning.md` 与相关 `.agents/skills/*/SKILL.md`，避免只从局部技术实现倒推出错误产品边界。
