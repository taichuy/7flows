# 7Flows 产品设计方案

> 文档分层约定：本文与 `docs/technical-design-supplement.md` 只保留产品/技术基线；当前实现索引放在 `docs/dev/`；带日期开发记录统一归档到 `docs/history/`；废弃文档统一归档到 `docs/expired/`。

## 1. 产品定位与问题定义

### 1.1 产品定位

7Flows 是一个面向多 Agent 协作的大模型工作流编排平台，核心目标是让团队能够以可视化方式组合多个 AI 节点、工具节点与沙盒节点，形成可调试、可发布、可复用的工作流系统。

7Flows 的服务对象不只是一线操作人员，也包括把工作流当作执行主体来消费、调用和续跑的 AI。因此产品设计不能只围绕“人点按钮、人看结果”展开，而要同时兼容人类操作视角与 AI 操作视角。

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

7Flows 首要提供五个价值：

- 为多 Agent 协作提供原生编排能力，而不是把 Agent 当普通 LLM 调用包装。
- 用统一的 `7Flows IR` 承载内部节点语义，再向外发布 OpenAI / Anthropic 风格接口。
- 用“原生插件生态 + 兼容层代理”复用现有生态并保留长期自主演进空间。
- 用节点级沙盒、权限化上下文和发布网关支撑生产可用性。
- 用 Durable Agent Runtime 承载“流程级确定性 + 节点级智能性”，让节点执行具备暂停、恢复、降级和可追溯能力。

## 2. 目标用户与典型场景

### 2.1 目标用户

- 人类用户：
  - AI 应用工程团队：需要快速搭建多 Agent 工作流并对外提供 API。
  - 平台工程团队：需要统一管理模型供应商、插件能力、执行安全与接口治理。
  - 自动化与运维团队：需要把 AI 工作流作为上层能力接给内部系统或外部机器人平台。
  - 开发者个人与中小团队：需要自托管、可视化、可扩展的 Agent 编排工具。
- AI 用户：
  - 作为 workflow consumer 的 AI agent：需要把 7Flows 发布工作流当作稳定工具、供应商能力或子流程来调用。
  - 作为平台内部协作者的 AI：需要在调试、续跑、排障和结果消费时依赖一致的运行时事实源，而不是只依赖面向人的 UI 表达。

### 2.1.1 用户形态与结果一致性要求

7Flows 必须把“人”和“AI”同时视为产品用户，并在以下三类场景中保持结果一致性：

- 人机交互：人直接通过工作台、调试面板或发布接口发起运行并消费结果。
- 人与 AI 协作：人负责设定目标、校验过程或局部介入，AI 负责部分执行、分析或续跑。
- AI 独立操作：AI 通过发布接口、运行态接口或自动化链路独立调用、恢复和消费工作流结果。

这里的“一致性”指向的是同一工作流在相同输入、相同授权和相同版本前提下，应尽量产出一致的执行语义、结果结构、追溯入口和状态判断；不能因为入口从“人操作 UI”切换成“AI 调接口”就变成两套事实。

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
| Plugin Ecosystem | 7Flows 原生插件注册、分类、发布与发现体系 |
| Compatibility Adapter | 面向 Dify 等外部插件生态的兼容层代理 |
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
  globalContext: Record<string, unknown>
  workingContext: Record<string, unknown>
  evidenceContext?: EvidencePack
  artifactRefs: ArtifactReference[]
}
```

#### EvidencePack

```ts
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
```

#### ArtifactReference

```ts
type ArtifactReference = {
  uri: string
  type: 'text' | 'json' | 'file' | 'tool_result' | 'message' | 'llm_io'
  summary?: string
  contentType?: string
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
  alias?: string
  path?: string
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
- 原生优先，兼容旁挂：原生能力是主线，外部生态通过兼容层接入，不反向主导核心模型。
- 权限优先：上下文共享必须经授权，不走隐式全量可见。
- 节点自治：每个节点可独立定义模型、工具、沙盒与重试策略。
- 分层扩展：新增插件生态、模型协议、发布协议时，应追加适配层，而不是分叉执行链。
- 发布导向：工作流不仅能运行，还能被稳定发布为接口。
- 可开关部署：高耦合外部生态能力应可独立启停，避免把非必需依赖塞进平台主体。
- 双用户一致性：产品同时服务人和 AI，设计工作台、运行时、发布接口与追溯链路时，应保证人机交互、人与 AI 协作、AI 独立操作三种场景的结果语义保持一致。

## 4. MVP 范围与中期路线图

### 4.1 MVP 范围

MVP 以“最小可上线的多 Agent 编排平台”为目标，包含以下能力：

- 工作流编辑器：基于 `xyflow` 的可视化画布。
- 节点体系：Trigger、LLM Agent、Tool、Sandbox Code、MCP Query、Condition/Router、Loop、Output。
- 工作流引擎：支持 DAG、条件分支、循环、重试和基础失败恢复。
- Durable Agent Runtime：`llm_agent` 节点按 phase state machine 执行，支持 waiting / resume / artifact / evidence。
- 模型供应商配置：一个 LLM 节点可切换不同供应商或模型。
- 节点权限模型：显式配置可读取的前序节点数据。
- MCP 上下文查询：节点可在运行时查询获批上下文。
- 沙盒执行：代码节点默认独立沙盒，LLM 节点可配置是否允许工具和沙盒。
- 对外发布：平台原生接口、OpenAI 风格接口、Anthropic 风格接口。
- 插件体系：支持 7Flows 原生插件、兼容层代理注册、调用和结果映射。
- 基础运行调试：运行日志、节点输入输出、错误信息、流式事件查看。

### 4.1.1 当前落地状态（2026-03-11）

截至 2026-03-11，运行时已经落地 Durable Agent Runtime Phase 1：

- 已有最小 `Flow Compiler`，把设计态 workflow/version 编译为运行时 blueprint。
- `Run / Node Run / Run Event` 已扩展为带 checkpoint、phase、artifact、tool call、AI call 的持久化模型。
- `llm_agent` 已按复合节点执行，支持 `prepare -> main_plan -> tool_execute -> assistant_distill -> main_finalize -> emit_output`。
- assistant 当前作为节点内可插拔 pipeline，默认可关闭；关闭时退化兼容旧式单主 AI 输出。
- 已开放 `POST /api/runs/{run_id}/resume` 作为 Phase 1 的最小恢复入口。

当前尚未完整落地、不能假装已完成的部分：

- 独立 queue / scheduler / callback event bus
- `WAITING_CALLBACK` 的后台自动唤醒
- Loop 节点的正式运行时执行
- 完整发布态 compiled blueprint 绑定与开放 API 映射

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
- Flow Compiler：把设计态 `7Flows IR` 校验并编译为发布态 / 运行态 blueprint。
- Flow Runtime：驱动 DAG、等待、恢复、重试、超时和状态流转。
- Agent Runtime：负责复合 `llm_agent` 的主 AI、assistant、prompt/context 构建与结构化输出。
- Tool Gateway：统一工具注册、权限、超时、重试、结果标准化与桥接调用。
- Context Service / Artifact Store：管理 global / working / evidence / artifact 四层上下文。
- 沙盒管理器：管理代码节点和受限工具节点的隔离执行环境。
- 原生插件注册中心：管理 7Flows 原生插件、插件分类、版本和能力发现。
- 兼容层代理服务：以可启用/可停用方式接入 Dify 等外部插件生态，并完成注册、调用和数据映射。
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

### 5.4 项目架构图（文字化）

下面用“分层 + 流向”方式描述 7Flows 的整体架构，帮助快速理解这个项目不是单个工作流编辑器，而是一套从设计、执行、追溯到发布都围绕 `7Flows IR` 收口的平台。

```text
┌──────────────────────────────────────────────────────────────┐
│ 设计态 / 人机协作层                                          │
│ Web Editor / Node Config / Debug Panel / Publish Console    │
└──────────────────────┬───────────────────────────────────────┘
                       │ 工作流编辑、版本保存、调试触发、发布配置
                       v
┌──────────────────────────────────────────────────────────────┐
│ 编排与控制层                                                 │
│ Orchestration API / Workflow Service / Publish Management   │
│ - 校验 workflow 定义                                          │
│ - 保存 workflow/version/publish 配置                          │
│ - 提供 run / debug / resume / callback 入口                  │
└──────────────────────┬───────────────────────────────────────┘
                       │ 统一以 7Flows IR 进入编译与执行
                       v
┌──────────────────────────────────────────────────────────────┐
│ 编译与运行时核心层                                            │
│ Flow Compiler -> Runtime Blueprint -> Flow Runtime          │
│ - DAG / branch / join / waiting / resume                    │
│ - Run / NodeRun / RunEvent 持久化                             │
│ - phase state machine 驱动 llm_agent                         │
└───────┬──────────────────────┬──────────────────────┬────────┘
        │                      │                      │
        │ 调用节点能力          │ 管理上下文与工件       │ 写入统一事件流
        v                      v                      v
┌───────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ Agent Runtime │   │ Context / Artifact   │   │ Event / Trace Layer  │
│ - main AI     │   │ - global context     │   │ - run_events         │
│ - assistant   │   │ - working context    │   │ - audit / metrics    │
│ - evidence    │   │ - evidence pack      │   │ - streaming mapping  │
└───────┬───────┘   │ - artifact refs      │   └──────────────────────┘
        │           └──────────┬───────────┘
        │ 调用工具/模型/沙盒              │
        v                                  v
┌──────────────────────────────────────────────────────────────┐
│ 能力接入层                                                   │
│ Tool Gateway / Native Plugin Registry / Compatibility Adapter│
│ Sandbox Manager / MCP / Model Providers                      │
│ - 原生工具与供应商                                            │
│ - Dify 兼容层代理                                             │
│ - 受限代码执行与浏览器执行                                     │
└──────────────────────┬───────────────────────────────────────┘
                       │ 对内返回标准化结果 / artifact / evidence
                       v
┌──────────────────────────────────────────────────────────────┐
│ 对外发布与集成层                                              │
│ Native API / OpenAI-Compatible / Anthropic-Compatible       │
│ OpenClaw workflow-backed provider                            │
└──────────────────────────────────────────────────────────────┘
```

用一句话概括这张图：

- 前端和外部请求都不直接操纵底层执行细节，而是先进入编排与控制层。
- 编排与控制层不把外部协议当内部事实，而是统一编译成 `7Flows IR -> runtime blueprint`。
- 真正执行时由 Flow Runtime 驱动，节点内复杂智能行为交给 Agent Runtime，节点外统一工具/插件/沙盒能力交给 Tool Gateway 和适配层。
- 所有调试、回放、流式输出和发布响应，尽量都复用同一批运行态事实与事件流，而不是各维度各维护一套私有状态。

## 6. 工作流运行模型

### 6.1 执行模型

7Flows 的目标运行模型是 `DAG + 显式循环 + Durable Waiting/Resume`。

- 支持顺序执行。
- 支持条件分支和汇聚。
- 支持显式循环节点。
- 支持节点进入等待态后通过 checkpoint 恢复，而不是依赖单个长 HTTP 请求存活。
- 不允许任意隐式回边，循环必须通过 `Loop` 节点表达。

这样可以同时兼顾复杂度和可控性，避免把整个系统退化成只能串行的链式调用，也避免无边界循环难以观测。

当前 Phase 1 事实：

- DAG、条件分支、join、edge mapping、waiting tool / resume 已落地。
- Loop 仍属于目标设计的一部分，但当前执行器会显式拒绝 Loop 运行，直到完整运行时语义补齐。

### 6.2 运行状态机

工作流 Run 推荐状态：

- `queued`
- `running`
- `waiting`
- `waiting_input`
- `waiting_callback`
- `succeeded`
- `failed`
- `canceled`
- `timed_out`

节点 Run 建议采用 `status + phase` 双层表达。

节点 Run `status` 推荐值：

- `pending`
- `ready`
- `running`
- `retrying`
- `skipped`
- `succeeded`
- `failed`
- `blocked`
- `canceled`
- `need_review`

节点 Run `phase` 推荐值：

- `preparing`
- `running_main`
- `waiting_tool`
- `running_assistant`
- `waiting_callback`
- `finalizing`

### 6.3 重试与失败策略

- 每个节点可单独配置重试次数、退避策略、超时时间。
- Tool、LLM、Sandbox Code 节点支持自动重试。
- Condition、Router、Output 节点默认不重试，除非底层依赖失败。
- Loop 节点必须配置最大迭代次数和退出条件，避免无限执行。
- 任一关键节点失败时，可选择终止整个工作流或转入失败分支。

### 6.4 流式事件总线

运行时需要统一事件流，供调试面板和对外流式接口复用。推荐事件类型：

- `run.started`
- `run.resumed`
- `run.waiting`
- `node.started`
- `node.phase.changed`
- `tool.completed`
- `assistant.completed`
- `node.output.delta`
- `node.output.completed`
- `node.failed`
- `run.completed`
- `run.failed`

平台原生调试与 OpenAI / Anthropic 兼容流式输出都从这个事件总线二次映射。

### 6.5 关键时序图（文字化）

下面不是实现细节级伪代码，而是帮助理解“这个系统一条请求通常怎么走”的关键时序。

#### 时序 A：在工作流编辑器里发起一次运行/调试

```text
用户
  -> Web Editor
     -> 编排 API
        -> 读取 workflow definition + version snapshot
        -> Flow Compiler 把设计态定义编译成 runtime blueprint
        -> Runtime 创建 Run / NodeRun
        -> 从 Trigger 节点开始推进 DAG
           -> 遇到 llm_agent 时交给 Agent Runtime
              -> 构建 prompt / working context / evidence 输入
              -> 如需工具则调用 Tool Gateway
                 -> Tool Gateway 选择 native tool / compat adapter / sandbox
                 -> 原始结果写入 artifact store
                 -> 摘要结果回流给 Agent Runtime
              -> assistant（若开启）整理 evidence
              -> 主 AI finalize 输出节点结果
           -> Runtime 持续写入 run_events / node_runs / artifacts
        -> Output 节点产出最终结果
     -> Web Editor / Debug Panel 读取 run detail + trace + events
用户看到节点状态、时间线、输入输出和错误
```

这个时序强调的是：设计态只是入口，真正执行前一定会经过编译；执行过程中 AI、工具、artifact、events 都是统一运行时的一部分，而不是零散拼接。

#### 时序 B：外部系统通过已发布接口调用工作流

```text
外部调用方 / OpenClaw / 其他系统
  -> 发布网关（native / OpenAI / Anthropic）
     -> 根据 endpoint alias / model alias 找到已发布 workflow version
     -> 加载 publish config + workflow blueprint
     -> 把外部请求映射为 Trigger 输入
     -> Runtime 执行工作流
        -> 节点内仍走 Agent Runtime / Tool Gateway / Context / Artifact
        -> 统一写 run_events
     -> Output 节点得到内部结果
     -> 发布网关按协议映射结果
        -> native 响应
        -> OpenAI chat/responses 响应
        -> Anthropic messages 响应
外部调用方收到兼容协议响应
```

这个时序强调的是：OpenAI / Anthropic 兼容只是发布层映射，内部并不会为了外部协议改写一套新的执行链；OpenClaw 看到的是 workflow-backed provider，而不是 7Flows 的内部 DSL。

#### 时序 C：工具进入等待态并通过 callback / resume 继续执行

```text
Runtime 执行到某个 llm_agent phase 或 tool 节点
  -> Tool Gateway 调用外部工具 / 兼容层 / 沙盒任务
     -> 工具返回 waiting_tool 或 waiting_callback
  -> Runtime 持久化当前 checkpoint / phase / waiting reason
  -> Run 状态切为 waiting，并写入 run.waiting 事件

后续有两条恢复路径：

路径 1：时间驱动恢复
  -> Scheduler / Worker 收到 scheduled resume
  -> 调用 resume 入口
  -> Runtime 从 checkpoint 恢复 phase

路径 2：事件驱动恢复
  -> 外部系统携带 callback ticket 调用 callback ingress
  -> callback 服务写回 tool result / artifact / trace
  -> Runtime resume 当前 run

恢复后：
  -> Agent Runtime / Runtime 继续后续 phase
  -> Output 节点产出结果
  -> Run 完成并写 run.completed
```

这个时序体现了 7Flows 和普通“单次同步链式调用”的关键差异：节点允许进入 durable waiting，恢复依赖 checkpoint 和统一事件流，而不是依赖单个 HTTP 请求一直挂着。

## 7. Agent 上下文与 MCP 访问模型

### 7.1 基本原则

上下文访问采用 `按节点授权` 模型。

- 节点默认只能读自己的静态输入和运行时上下文。
- 如需读取前序节点结果，必须在节点配置中显式声明授权来源。
- 未授权节点的数据即使已执行成功，也不应对当前节点可见。

### 7.2 运行时上下文四层

7Flows 的 Agent 运行时上下文应拆为四层：

- `Global Context`
  - 工作流级共享信息，例如触发输入、全局变量、公共约束
- `Node Working Context`
  - 当前节点内部临时工作区与阶段中间结果
- `Evidence Context`
  - assistant 或其他提炼阶段生成的结构化证据包，供主 AI 优先消费
- `Artifact Store`
  - 工具原始返回、长文本、大 JSON、文件与二进制结果的持久化引用层

关键原则：

- 原始大结果不应默认直接塞进主 AI prompt。
- 主 AI 优先消费 `Evidence Context`。
- `Artifact Store` 既服务调试、审计，也服务 AI / 自动化的可追溯读取。

### 7.2.1 为什么要做四层上下文管理

这套分层不是为了把概念说复杂，而是为了解决两个在多 Agent 系统里很容易失控的问题：

- 上下文爆炸
  - 工具原始返回、检索原文、长文本、大 JSON 如果都直接进入主 AI prompt，成本、延迟和噪声都会迅速失控。
- 多 AI 协作失焦
  - 如果主 AI、assistant、工具结果和节点局部状态都混在一个上下文池里，后续几乎无法判断“哪些内容是原始事实、哪些内容是提炼结论、哪些内容只是阶段性草稿”。

因此 7Flows 把上下文明确拆为四层：

1. `Global Context`
   - 只放流程级共享信息，例如用户输入、全局变量、公共约束和触发参数。
   - 它解决的是“整个 workflow 都应该知道什么”。
2. `Node Working Context`
   - 只放当前节点内部阶段结果、局部变量和临时工作区。
   - 它解决的是“当前节点正在思考什么、做到哪一步了”。
3. `Evidence Context`
   - 只放 assistant 或提炼阶段产出的结构化证据、关键点、冲突和未知项。
   - 它解决的是“主 AI 真正应该优先消费什么高质量决策材料”。
4. `Artifact Store`
   - 保存工具原始返回、检索原文、长文本、文件内容、大 JSON 和二进制结果。
   - 它解决的是“哪些内容必须保留，但不适合直接塞进 prompt”。

### 7.2.2 防止上下文爆炸的核心机制

7Flows 不希望把“上下文管理”做成一个无限增长的消息列表，而是做成“摘要优先、原文可追溯”的分层管道：

- 大体量原始结果先进入 `Artifact Store`，保留引用和摘要，而不是全文直灌主 AI。
- assistant 或节点内提炼阶段把原始结果压缩成 `Evidence Context`。
- 主 AI 默认优先读取 `Evidence Context`，只在必要时通过 artifact 引用追溯原文。
- `Node Working Context` 只保留当前节点真正需要继续推进 phase 的局部状态，不把全局历史都复制一遍。

这样主 AI 面对的不是“所有东西的拼盘”，而是“全局约束 + 当前任务局部状态 + 已提炼证据 + 可按需追溯的原始引用”。

### 7.2.3 assistant 与主 AI 的贡献关系

在 7Flows 的设计里，assistant 不是第二个主控 Agent，而是节点内的辅助认知层。它对主 AI 的贡献链应当是：

```text
工具原始结果 / 检索原文 / 长文本
  -> 写入 Artifact Store
  -> assistant 做摘要、冲突标记、未知项整理
  -> 形成 Evidence Context
  -> 主 AI 基于 Evidence 做最终判断与输出
```

这条链路有几个边界：

- assistant 负责提炼，不负责拥有最终流程控制权。
- 主 AI 负责最终决策、最终输出和是否继续调用能力。
- Artifact 保留原始证据来源，Evidence 提供高质量决策材料，两者不能互相替代。

### 7.2.4 Prompt 构建默认顺序

为了把这套设计落到执行路径里，主 AI 的 prompt 构建默认顺序应当是：

1. 先读取 `Global Context`
2. 再读取当前节点必要的 `Node Working Context`
3. 优先读取 `Evidence Context`
4. 最后只在必要时附带 `Artifact Store` 的摘要或引用

明确禁止的默认做法：

- 把工具原始大 JSON 全量塞进主 AI prompt
- 把检索长文全文默认塞进主 AI prompt
- 把多个 AI 的中间草稿全部拼在一起传给下一阶段

这也是 7Flows 在多 Agent 协作里避免上下文失控、保留 AI 之间“贡献链”和可追溯性的核心约束。

### 7.2.5 上下文与证据流转图（文字化）

下面这张图专门回答“这四层上下文到底怎么流”的问题：

```text
用户输入 / 全局变量 / 公共约束
  -> Global Context

当前节点收到输入
  -> 建立 Node Working Context
     -> 记录当前 phase 的局部状态、计划、临时变量

如果节点调用工具 / 检索 / 沙盒：
  -> 原始结果不直接进入主 AI prompt
  -> 先写入 Artifact Store
     -> 保存长文本 / 大 JSON / 文件 / 二进制 / 原始工具结果

Artifact Store 中需要供主 AI 使用的内容
  -> assistant 或提炼阶段读取原始结果
  -> 生成 Evidence Context
     -> 摘要
     -> key points
     -> 冲突项
     -> 未知项
     -> 推荐关注点

主 AI 最终消费顺序
  -> Global Context
  -> Node Working Context
  -> Evidence Context
  -> 必要时再按引用回看 Artifact

最终输出
  -> 写回 Node Run / Run Events / Artifact Refs
  -> 供下游节点按授权读取
```

这张图的关键意思是：

- `Global Context` 决定流程级共识。
- `Node Working Context` 决定当前节点内部推进状态。
- `Evidence Context` 决定主 AI 优先看的高质量材料。
- `Artifact Store` 决定原始事实如何被保留、追溯和按需引用。

### 7.2.6 节点内部 phase 的上下文流转时序

如果把一个 `llm_agent` 当作节点内复合 pipeline 来看，它的上下文流转顺序应当接近下面这样：

```text
Trigger / 上游节点输入
  -> Runtime 为当前节点建立 Global Context + Node Working Context

Phase 1: Prepare
  -> 读取全局约束、节点配置、授权上下文引用
  -> 在 Node Working Context 中写入本轮任务目标和输入整理结果

Phase 2: Main Plan
  -> 主 AI 基于当前输入决定是否需要工具、检索、MCP 或后续步骤
  -> 计划结果写入 Node Working Context

Phase 3: Tool Execute
  -> Tool Gateway 调用工具 / compat adapter / sandbox
  -> 原始返回写入 Artifact Store
  -> Node Working Context 只保留必要摘要、引用和状态

Phase 4: Assistant Distill
  -> assistant 读取 Artifact 引用和必要 working context
  -> 产出 Evidence Context
  -> 标记关键事实、冲突、未知项和推荐关注点

Phase 5: Main Finalize
  -> 主 AI 优先消费 Evidence Context
  -> 必要时按引用回看 Artifact
  -> 生成最终节点输出

Phase 6: Emit Output
  -> 输出写入 Node Run
  -> 事件写入 run_events
  -> artifact refs / evidence refs 随节点结果进入可追溯链路
```

这个时序的价值在于：

- assistant 的贡献被限制在“提炼证据”，不会和主 AI 抢最终控制权。
- 原始大结果留在 `Artifact Store`，不会在每个 phase 里被不断复制放大。
- 下游节点默认读取的是被授权的结果与引用，而不是前面所有 phase 的全部内部草稿。

### 7.3 节点可见的信息

每个 Agent 节点在运行时至少可获得：

- `workflow_run_id`
- `workflow_id`
- `node_id`
- `node_run_id`
- `trace_id`
- 静态输入参数
- 当前节点被授权读取的上下文引用列表
- `global_context`
- `working_context`
- `evidence_context`
- `artifact_refs`

### 7.4 MCP 查询模型

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

### 7.5 授权链设计

- 工作流设计阶段配置节点级可读来源。
- 运行时调度器生成 `AuthorizedContextRefs`。
- MCP 服务只接受当前 Run 上下文内的合法查询。
- 审计日志记录“谁在何时读取了哪个节点产物”。

## 8. 节点体系与沙盒策略

### 8.1 节点类型

首版标准节点类型如下：

- `Trigger`：输入入口，接收表单、API、Webhook 或内部调用。
- `LLM Agent`：复合智能节点，可启用工具、MCP、assistant 和沙盒策略。
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
- 任务目标与输出契约
- 工具开关
- 工具权限策略
- MCP 开关
- 沙盒开关
- assistant 开关与触发策略
- 上下文授权配置
- 输入输出 schema
- 超时、重试、降级和 review 策略

### 8.2.1 Composite Agent Node 内部阶段

`LLM Agent` 的推荐执行阶段如下：

1. `Prepare`
2. `Main Plan`
3. `Tool Execute`
4. `Assistant Distill`
5. `Main Finalize`
6. `Emit Output`

边界要求：

- 主 AI 保留最终控制权。
- assistant 只负责整理工具结果、压缩长文本和生成 evidence。
- assistant 默认不直接调用工具，也不负责流程推进。
- assistant 关闭时应退化为更接近传统单次 LLM 节点的执行路径。

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

## 9. 插件生态与模型供应商策略

### 9.1 总体原则

7Flows 的插件策略不是把某个外部生态硬编码进后端，而是分成两层：

- `7Flows Native Plugin Ecosystem`
  - 平台原生插件生态
  - 长期主线，服务 7Flows 自己的节点、供应商、工具和未来能力扩展
- `Compatibility Adapter Ecosystem`
  - 兼容层代理生态
  - 用插件形式挂载外部生态兼容能力，可按部署或工作空间启用/停用

这意味着：

- Dify 兼容不是写死在 API 里的“特殊分支”
- 首版虽然主要兼容 Dify 插件生态，但架构上预留多个兼容层并存
- 后续若要接 n8n 等其他生态，应新增兼容层插件，而不是改写内部事实模型

### 9.2 插件分类

参考 Dify 当前存在工具插件、模型插件、智能体策略插件、扩展插件、数据源插件、触发器插件等类型，7Flows 建议把插件体系抽象成以下分类：

- 节点插件（Node Plugins）
  - 为工作流提供可编排节点能力，例如工具节点、触发器节点、数据源节点、未来的策略节点
- 供应商插件（Provider Plugins）
  - 为模型供应商、向量服务、外部平台能力等提供统一接入
- 兼容层插件（Compatibility Adapter Plugins）
  - 负责把外部插件生态转译为 7Flows 可发现、可调用的能力集合
  - 首版重点是 Dify 兼容层；未来可扩展到其他生态

兼容层插件本身也属于插件，但它服务的是“生态接入”，不是单个业务节点。

### 9.3 推荐部署边界

建议按下面方式拆分职责：

- `api/` 原生后端
  - 持有 7Flows 原生插件注册中心
  - 暴露统一插件注册、发现、鉴权、调用和生命周期接口
  - 不直接硬编码某个外部插件生态的实现细节
- `compatibility adapter service`
  - 作为单独服务或可独立部署模块存在
  - 负责某个外部生态的协议适配、插件安装、运行和健康检查
  - 例如 `dify adapter service` 专门承载 Dify 插件生态

这让 7Flows 后端始终保持“原生平台 + 统一插件接口”的主体地位，而 Dify 兼容只是挂在平台旁边的一类适配能力。

### 9.4 Dify 兼容范围

首版只做 `Dify Plugin Ecosystem Adapter`，不承诺完整 Dify ChatFlow 兼容。

兼容目标：

- Dify 插件注册
- Dify 插件能力发现
- Dify 插件鉴权
- Dify 插件输入输出映射
- Dify 插件结果转成 `Tool` 节点或供应商节点可消费的统一结构

不在首版范围：

- Dify ChatFlow DSL 全量导入
- Dify UI 配置格式兼容
- Dify 平台级多模块复刻

### 9.5 多生态并存策略

平台内应允许多个生态同时存在，并在仓库、部署和管理视图中清晰分类：

- 7Flows Native
- Dify Compatibility
- 未来其他 Compatibility，例如 n8n

在产品与实现上要满足：

- 每个兼容层可独立启用或停用
- 每个兼容层有独立的安装源、运行时服务和健康状态
- 插件管理页按生态分类展示，而不是把全部插件混为一类
- 统一从 `7Flows IR` 与平台插件接口向工作流暴露能力，避免节点层直接绑定某个外部协议

### 9.6 推荐统一工具响应结构

```json
{
  "tool_name": "plugin.search",
  "status": "succeeded",
  "content": [
    { "type": "text", "text": "..." },
    { "type": "json", "json": {} }
  ],
  "usage": {},
  "raw": {},
  "ecosystem": "dify"
}
```

### 9.7 模型供应商策略

7Flows 不把单一模型供应商协议当内部标准，而是分三层处理：

- 平台内部统一为 `7Flows IR`
- 节点层通过原生插件或兼容层插件适配不同供应商
- 发布层映射为 OpenAI / Anthropic 风格接口

这样可以保证：

- 节点配置不被某一家协议绑死
- 同一工作流内可混用多个供应商
- 对外输出接口可以稳定演进

### 9.8 OpenClaw 集成边界

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
- 插件管理页需按生态分类展示插件元数据、鉴权状态、兼容层来源和可映射能力。

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
- 新插件生态可通过兼容层插件扩展，而不是侵入核心运行时

## 13. 风险与边界

### 13.1 主要风险

- `DAG + 循环` 比纯顺序链复杂，运行时和可视化表达都需要更强约束。
- Dify 插件兼容若没有清晰边界，容易被外界误解为兼容整个 Dify 平台。
- OpenAI / Anthropic 兼容接口如果映射不统一，会导致平台原生语义与外部协议割裂。
- 沙盒如果过早支持过多模式，会增加部署复杂度和维护成本。

### 13.2 控制策略

- 用显式 `Loop` 节点约束循环语义。
- 在文档和产品中明确“兼容插件生态，不兼容 Dify 全量工作流 DSL”，并避免把 Dify 兼容写死进核心后端。
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
- Dify 兼容范围：`可启用的插件生态兼容层`
- OpenClaw 定位：`workflow-backed provider`
