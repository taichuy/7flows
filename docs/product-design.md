# 7Flows 产品设计方案

## 1. 产品定位与问题定义

### 1.1 产品定位

7Flows 是一个面向多 Agent 协作的大模型工作流编排平台，核心目标是让团队能够以可视化方式组合多个 AI 节点、工具节点与沙盒节点，形成可调试、可发布、可复用的工作流系统。

它的定位不是单纯复刻 Dify ChatFlow，也不是通用自动化平台，而是专门面向以下问题：

- 一个工作流中需要多个大模型节点协作，每个节点可绑定不同模型供应商与不同工具权限。
- Agent 之间既需要静态参数传递，也需要运行时按权限动态查询前序上下文。
- 工作流最终不仅要给人看结果，还要对外发布成标准接口，作为其他系统的大模型供应商能力源。
- 团队需要兼顾可视化编排效率、节点隔离能力、插件复用能力和开放接口规范。

### 1.2 解决的核心问题

现有方案存在几个明显缺口：

- Dify 的 ChatFlow 适合快速搭建，但对外发布协议不够标准化，不适合作为长期的模型供应能力层。
- OpenClaw 这类系统需要稳定、明确、成熟的供应商接口，而不是只接收平台内部 DSL。
- 多 Agent 协作往往缺少精细的上下文授权模型，导致节点间数据共享过于粗放。
- 节点执行与代码运行如果不做沙盒隔离，安全边界不够清晰。
- 现有生态虽有丰富插件，但很少有平台能把插件复用、Agent 编排、接口发布三件事放在同一体系里完成。

### 1.3 产品价值主张

7Flows 首要提供四个价值：

- 为多 Agent 协作提供原生编排能力，而不是把 Agent 当普通 LLM 调用包装。
- 用统一的 `7Flows IR` 承载内部节点语义，再向外发布 OpenAI / Anthropic 风格接口。
- 用插件适配层兼容 Dify 插件生态，降低冷启动成本。
- 用节点级沙盒、权限化上下文和发布网关支撑生产可用性。

## 2. 目标用户与典型场景

### 2.1 目标用户

- AI 应用工程团队：需要快速搭建多 Agent 工作流并对外提供 API。
- 平台工程团队：需要统一管理模型供应商、插件能力、执行安全与接口治理。
- 自动化与运维团队：需要把 AI 工作流作为上层能力接给内部系统或外部机器人平台。
- 开发者个人与中小团队：需要自托管、可视化、可扩展的 Agent 编排工具。

### 2.2 典型使用场景

#### 场景 A：研究型多 Agent 协作

- 节点 1 负责任务拆解。
- 节点 2 调用检索工具收集资料。
- 节点 3 使用更强推理模型生成方案。
- 节点 4 通过 MCP 查询前序节点产出并做校验。
- 节点 5 输出结构化结果并发布为 API。

#### 场景 B：工具增强型执行流

- 用户请求进入 Trigger 节点。
- 任务被 Router 分发到不同 Agent。
- 某些 Agent 启用工具和 MCP。
- 某些 Agent 禁用工具，仅允许纯模型推理。
- 代码执行或浏览器执行节点在独立沙盒中运行。

#### 场景 C：作为 OpenClaw 的工作流供应商

- 外部系统把 7Flows 视为一个模型供应商入口。
- 发布网关接收 OpenAI 或 Anthropic 风格请求。
- 请求被路由到一个已发布工作流。
- 工作流内部完成多 Agent 协作后，将结果映射回兼容响应。

## 3. 核心概念模型

### 3.1 核心对象

| 概念 | 说明 |
| --- | --- |
| Workspace | 项目级工作空间，包含工作流、凭证、插件、发布配置 |
| Workflow | 可视化编排单元，描述节点、连线、变量和发布方式 |
| Node | 工作流中的执行单元，包含 LLM、工具、MCP、路由、循环等 |
| Edge | 节点间连接关系，定义控制流和数据流 |
| Run | 工作流一次执行实例 |
| Node Run | 某节点的一次执行实例 |
| Sandbox | 节点执行隔离环境 |
| Plugin Adapter | Dify 插件兼容层 |
| Published Endpoint | 对外发布的 API 入口 |

### 3.2 7Flows IR

`7Flows IR` 是平台内部统一协议，负责把画布配置、节点能力、运行时状态和发布形态收敛到同一模型中。它不直接等同于 OpenAI、Anthropic 或 Dify 的任一协议。

核心类型如下：

#### Workflow

```ts
type Workflow = {
  id: string
  name: string
  version: string
  trigger: TriggerConfig
  nodes: Node[]
  edges: Edge[]
  variables: VariableDef[]
  publish?: PublishedEndpoint[]
}
```

#### Node

```ts
type Node = {
  id: string
  type:
    | 'trigger'
    | 'llm_agent'
    | 'tool'
    | 'sandbox_code'
    | 'mcp_query'
    | 'condition'
    | 'router'
    | 'loop'
    | 'output'
  name: string
  config: Record<string, unknown>
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
  runtimePolicy?: NodeRuntimePolicy
}
```

#### Edge

```ts
type Edge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  channel: 'control' | 'data'
  condition?: string
  mapping?: FieldMapping[]
}
```

#### RuntimeContext

```ts
type RuntimeContext = {
  workflowRunId: string
  workflowId: string
  nodeId: string
  nodeRunId: string
  sessionId?: string
  traceId: string
  variables: Record<string, unknown>
  staticInputs: Record<string, unknown>
}
```

#### AuthorizedContextRefs

```ts
type AuthorizedContextRefs = {
  currentNodeId: string
  readableNodeIds: string[]
  readableArtifacts: Array<{
    nodeId: string
    artifactType: 'text' | 'json' | 'file' | 'tool_result' | 'message'
  }>
}
```

#### PublishedEndpoint

```ts
type PublishedEndpoint = {
  id: string
  name: string
  protocol: 'native' | 'openai' | 'anthropic'
  workflowVersion: string
  authMode: 'api_key' | 'token' | 'internal'
  streaming: boolean
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
}
```

### 3.3 设计原则

- 内部统一，外部适配：所有节点与运行时状态先落到 `7Flows IR`。
- 权限优先：上下文共享必须经授权，不走隐式全量可见。
- 节点自治：每个节点可独立定义模型、工具、沙盒与重试策略。
- 发布导向：工作流不仅能运行，还能被稳定发布为接口。

## 4. MVP 范围与中期路线图

### 4.1 MVP 范围

MVP 以“最小可上线的多 Agent 编排平台”为目标，包含以下能力：

- 工作流编辑器：基于 `xyflow` 的可视化画布。
- 节点体系：Trigger、LLM Agent、Tool、Sandbox Code、MCP Query、Condition/Router、Loop、Output。
- 工作流引擎：支持 DAG、条件分支、循环、重试和基础失败恢复。
- 模型供应商配置：一个 LLM 节点可切换不同供应商或模型。
- 节点权限模型：显式配置可读取的前序节点数据。
- MCP 上下文查询：节点可在运行时查询获批上下文。
- 沙盒执行：代码节点默认独立沙盒，LLM 节点可配置是否允许工具和沙盒。
- 对外发布：平台原生接口、OpenAI 风格接口、Anthropic 风格接口。
- Dify 插件适配层：支持插件注册、调用和结果映射。
- 基础运行调试：运行日志、节点输入输出、错误信息、流式事件查看。

### 4.2 中期版本

中期版本在 MVP 基础上增加：

- 团队协作与权限管理。
- 工作流版本治理和灰度发布。
- 插件市场视图与插件安装流程。
- 发布网关的限流、配额、审计与观测。
- 共享记忆、长时上下文和多轮会话策略。
- SaaS 化抽象准备，但不优先交付多租户。

### 4.3 明确不在首版范围内

- Dify ChatFlow DSL 的全量导入与双向转换。
- 完整插件市场生态运营能力。
- 多租户 SaaS 计费系统。
- 复杂低代码表单引擎。
- 全量企业 IAM / SSO 深度集成。

## 5. 系统架构设计

### 5.1 总体架构

建议后端采用 Python 实现，并按职责拆分为以下服务或模块：

- 编排 API：负责工作流 CRUD、版本、节点配置、调试与发布管理。
- 运行时调度器：解析 `7Flows IR`，驱动 DAG、循环、重试和状态流转。
- 节点执行器：执行 LLM、工具、MCP、条件、输出等节点。
- 沙盒管理器：管理代码节点和受限工具节点的隔离执行环境。
- 插件适配器：兼容 Dify 插件协议，完成注册、调用和数据映射。
- 发布网关：接收原生、OpenAI、Anthropic 风格请求并路由到工作流。
- 事件与观测层：记录运行日志、流式事件、审计信息和指标。

### 5.2 建议技术栈

- 后端 API：FastAPI
- 运行时任务：Celery / Arq / 自研异步执行器三选一，首版建议选 Python 异步任务队列
- 数据库：PostgreSQL
- 缓存与事件：Redis
- 对象存储：S3 兼容存储，用于文件与运行产物
- 沙盒：Docker 为主，后续再考虑 Firecracker 或更强隔离方案

### 5.3 核心数据分层

- 设计态：工作流定义、节点配置、凭证引用、发布配置
- 运行态：Run、Node Run、事件流、上下文索引、沙盒状态
- 发布态：Endpoint、API Key、协议映射、流式通道信息

## 6. 工作流运行模型

### 6.1 执行模型

7Flows 首版采用 `DAG + 循环` 运行模型。

- 支持顺序执行。
- 支持条件分支和汇聚。
- 支持显式循环节点。
- 不允许任意隐式回边，循环必须通过 `Loop` 节点表达。

这样可以同时兼顾复杂度和可控性，避免把整个系统退化成只能串行的链式调用，也避免无边界循环难以观测。

### 6.2 运行状态机

工作流 Run 推荐状态：

- `queued`
- `running`
- `waiting_input`
- `succeeded`
- `failed`
- `canceled`
- `timed_out`

节点 Run 推荐状态：

- `pending`
- `ready`
- `running`
- `retrying`
- `skipped`
- `succeeded`
- `failed`
- `blocked`

### 6.3 重试与失败策略

- 每个节点可单独配置重试次数、退避策略、超时时间。
- Tool、LLM、Sandbox Code 节点支持自动重试。
- Condition、Router、Output 节点默认不重试，除非底层依赖失败。
- Loop 节点必须配置最大迭代次数和退出条件，避免无限执行。
- 任一关键节点失败时，可选择终止整个工作流或转入失败分支。

### 6.4 流式事件总线

运行时需要统一事件流，供调试面板和对外流式接口复用。推荐事件类型：

- `run.started`
- `node.started`
- `node.output.delta`
- `node.output.completed`
- `node.failed`
- `run.completed`
- `run.failed`

平台原生调试与 OpenAI / Anthropic 兼容流式输出都从这个事件总线二次映射。

## 7. Agent 上下文与 MCP 访问模型

### 7.1 基本原则

上下文访问采用 `按节点授权` 模型。

- 节点默认只能读自己的静态输入和运行时上下文。
- 如需读取前序节点结果，必须在节点配置中显式声明授权来源。
- 未授权节点的数据即使已执行成功，也不应对当前节点可见。

### 7.2 节点可见的信息

每个 Agent 节点在运行时至少可获得：

- `workflow_run_id`
- `workflow_id`
- `node_id`
- `node_run_id`
- `trace_id`
- 静态输入参数
- 当前节点被授权读取的上下文引用列表

### 7.3 MCP 查询模型

MCP 在 7Flows 中承担运行时上下文查询和能力扩展入口，首版定义如下：

- Agent 可通过 MCP 查询自身可见的节点产出。
- MCP 查询不绕过平台权限模型。
- MCP 返回的是“上下文引用 + 内容”，而不是全工作流原始内存快照。
- 支持动态查询和静态变量传递并存。

推荐查询接口语义：

```json
{
  "workflow_run_id": "run_xxx",
  "node_id": "agent_review",
  "query": {
    "type": "authorized_context",
    "source_node_ids": ["agent_plan", "tool_search"],
    "artifact_types": ["text", "json"]
  }
}
```

### 7.4 授权链设计

- 工作流设计阶段配置节点级可读来源。
- 运行时调度器生成 `AuthorizedContextRefs`。
- MCP 服务只接受当前 Run 上下文内的合法查询。
- 审计日志记录“谁在何时读取了哪个节点产物”。

## 8. 节点体系与沙盒策略

### 8.1 节点类型

首版标准节点类型如下：

- `Trigger`：输入入口，接收表单、API、Webhook 或内部调用。
- `LLM Agent`：模型推理节点，可启用工具、MCP 和沙盒策略。
- `Tool`：调用外部工具或插件能力。
- `Sandbox Code`：运行 Python、Shell 或未来扩展语言的隔离代码节点。
- `MCP Query`：显式查询运行时上下文或外部 MCP 能力。
- `Condition / Router`：根据表达式或模型判定控制路由。
- `Loop`：显式表示循环体、退出条件和上限。
- `Output`：负责最终结果整形、结构化输出和发布映射。

### 8.2 LLM Agent 节点配置要点

每个 LLM Agent 节点至少支持：

- 模型供应商选择
- 模型 ID 选择
- 系统提示词与角色设定
- 工具开关
- MCP 开关
- 沙盒开关
- 上下文授权配置
- 输入输出 schema
- 超时和重试策略

### 8.3 沙盒策略

沙盒是平台核心能力，不是附属功能。

- `Sandbox Code` 节点默认强制独立沙盒执行。
- `LLM Agent` 节点支持是否启用沙盒化工具执行。
- 插件调用如涉及脚本执行、浏览器操作或文件写入，也应支持进入沙盒。
- 默认部署形态以自托管优先，因此沙盒能力需优先兼容本地 Docker 环境。

建议首版沙盒策略：

- 代码执行一节点一沙盒实例。
- LLM 工具执行可选共享沙盒或会话级沙盒。
- 沙盒默认禁用危险宿主挂载。
- 文件和产物通过显式工件目录回传。

## 9. 插件适配与模型供应商策略

### 9.1 Dify 插件兼容范围

首版只做 `插件适配层`，不承诺完整 Dify ChatFlow 兼容。

兼容目标：

- 插件注册
- 插件能力发现
- 插件鉴权
- 插件输入输出映射
- 插件结果转成 `Tool` 节点可消费的统一结构

不在首版范围：

- Dify ChatFlow DSL 全量导入
- Dify UI 配置格式兼容
- Dify 平台级多模块复刻

### 9.2 插件适配器设计

插件适配器分四层：

- 注册层：登记插件元数据、版本、能力与所需凭证
- 发现层：把插件能力转换成 7Flows 可选择的工具列表
- 调用层：运行时完成请求构造、鉴权、超时与结果解析
- 映射层：把插件请求和响应投影到 `7Flows IR`

推荐统一工具响应结构：

```json
{
  "tool_name": "plugin.search",
  "status": "succeeded",
  "content": [
    { "type": "text", "text": "..." },
    { "type": "json", "json": {} }
  ],
  "usage": {},
  "raw": {}
}
```

### 9.3 模型供应商策略

7Flows 不把单一模型供应商协议当内部标准，而是分三层处理：

- 平台内部统一为 `7Flows IR`
- 节点层适配不同模型供应商
- 发布层映射为 OpenAI / Anthropic 风格接口

这样可以保证：

- 节点配置不被某一家协议绑死
- 同一工作流内可混用多个供应商
- 对外输出接口可以稳定演进

### 9.4 OpenClaw 集成边界

OpenClaw 集成在文档中应明确表达为：

`7Flows 可作为 workflow-backed provider，被 OpenClaw 视作一个模型供应商入口`

含义如下：

- OpenClaw 调用的是 7Flows 发布网关，而不是直接理解 7Flows 内部工作流 DSL。
- 7Flows 负责把一个工作流执行结果映射成供应商响应。
- OpenClaw 看到的是兼容的 OpenAI / Anthropic 风格接口或供应商路由入口。

## 10. 对外发布接口与兼容协议

### 10.1 发布面三层结构

对外发布接口分三层：

#### 1. 平台原生调用接口

适用于内部系统和高级集成场景，保留工作流语义。

- `POST /v1/workflows/{workflow_id}/run`
- `GET /v1/runs/{run_id}`
- `GET /v1/runs/{run_id}/events`

平台原生接口支持：

- 同步返回
- 异步任务查询
- SSE 流式输出
- 结构化输入输出 schema

#### 2. OpenAI 兼容接口

目标是让外部系统把 7Flows 当成 OpenAI 风格模型服务使用。

建议首版提供：

- `POST /v1/chat/completions`
- `POST /v1/responses`
- 流式 SSE 返回

映射规则：

- 外部传入的 `model` 对应一个已发布工作流别名
- 系统消息与用户消息转换为 Trigger 输入
- 工作流输出节点结果映射回 OpenAI 风格响应

#### 3. Anthropic 兼容接口

目标是让外部系统把 7Flows 当成 Anthropic 风格模型服务使用。

建议首版提供：

- `POST /v1/messages`
- 流式事件返回

映射规则：

- `model` 对应已发布工作流别名
- `messages`、`system`、`tools` 映射为工作流输入与节点策略
- 输出映射成 Anthropic 风格内容块

### 10.2 发布配置对象

每个工作流的发布配置至少包含：

- endpoint 名称
- 协议类型
- 工作流版本
- 鉴权模式
- 是否支持流式
- 输入 schema
- 输出 schema
- 限流和超时策略

### 10.3 协议映射原则

- 兼容接口只暴露成熟协议，不暴露内部设计细节。
- 内部复杂多节点执行要被封装为单次供应商响应。
- 流式输出按统一事件总线转换，不为每种协议维护独立执行逻辑。

## 11. 前端设计原则与交互骨架

### 11.1 设计原则

前端参考 Dify 的高效率编排思路，但不复用其设计语言或界面结构。

设计要求：

- 以 `xyflow` 作为画布核心。
- 视觉风格与 Dify 拉开，形成更工程化、模块化的品牌识别。
- 节点配置应强调“多 Agent 协作”和“权限/运行时策略”，而不是只强调 prompt 编辑。
- 调试、运行态和发布配置必须成为一级能力，而不是附属弹窗。

### 11.2 首版页面骨架

首版至少包含以下页面：

- 工作流编辑器
- 节点配置抽屉
- 运行调试面板
- 发布配置页
- 凭证管理页
- 插件管理页

### 11.3 编辑器核心交互

工作流编辑器应支持：

- 拖拽创建节点
- 连线定义控制流和数据流
- 节点状态高亮
- 循环与分支可视化表达
- 运行时节点逐步回放
- 节点输入输出快速查看

### 11.4 节点配置重点

节点配置抽屉中应重点突出：

- 模型供应商切换
- 模型参数
- 工具开关
- 沙盒开关
- MCP 开关
- 上下文授权配置
- 输入映射与输出 schema

### 11.5 发布与调试交互

- 发布配置页需允许为同一工作流配置多个发布协议。
- 调试面板需展示 Run 时间线、节点状态、事件流、错误堆栈和产出预览。
- 插件管理页需展示插件元数据、鉴权状态和可映射能力。

## 12. 非功能需求

### 12.1 安全

- 节点级上下文权限隔离
- 沙盒隔离执行
- 凭证加密存储
- 发布接口鉴权
- 运行审计日志

### 12.2 性能

- 支持并行执行可并发节点
- 流式事件低延迟推送
- 大文件与工件走对象存储
- 对高频工作流发布接口支持缓存与限流

### 12.3 可观测性

- 工作流级与节点级日志
- 运行时 Trace ID
- 错误类型分类
- 调用耗时、Token 使用、重试次数等指标

### 12.4 可扩展性

- 新节点类型可插拔
- 新模型供应商可插拔
- 新兼容协议可在发布层追加
- 新插件生态可通过适配层扩展

## 13. 风险与边界

### 13.1 主要风险

- `DAG + 循环` 比纯顺序链复杂，运行时和可视化表达都需要更强约束。
- Dify 插件兼容若没有清晰边界，容易被外界误解为兼容整个 Dify 平台。
- OpenAI / Anthropic 兼容接口如果映射不统一，会导致平台原生语义与外部协议割裂。
- 沙盒如果过早支持过多模式，会增加部署复杂度和维护成本。

### 13.2 控制策略

- 用显式 `Loop` 节点约束循环语义。
- 在文档和产品中明确“兼容插件，不兼容 Dify 全量工作流 DSL”。
- 所有发布协议统一从 `7Flows IR` 和事件总线映射，不允许分叉执行链。
- 首版坚持自托管优先，减少 SaaS 多租户复杂度。

### 13.3 当前边界结论

- 7Flows 首版不是通用低代码平台，而是多 Agent 工作流编排平台。
- 7Flows 首版不是 Dify 替代品复刻，而是面向 Agent 协作、接口发布和节点安全的新系统。
- 7Flows 首版优先解决“可编排、可调试、可发布、可兼容”的闭环。

## 附：研发拆分建议

为了让工程团队可以直接开工，建议按四条主线拆分：

- 前端线：编辑器、节点配置、调试面板、发布页、插件与凭证管理
- 后端线：编排 API、工作流定义、发布网关、凭证与权限体系
- 运行时线：调度器、节点执行器、状态机、事件总线、MCP 上下文服务
- 接口网关线：原生 API、OpenAI 兼容、Anthropic 兼容、鉴权与流式输出

## 附：默认决策清单

- 工作流执行模型：`DAG + 循环`
- 上下文权限模型：`按节点授权`
- 部署优先级：`自托管优先`
- 内部协议：`7Flows IR`
- 对外发布：`原生 + OpenAI + Anthropic`
- 首版流式能力：`支持`
- Dify 兼容范围：`插件适配层`
- OpenClaw 定位：`workflow-backed provider`
