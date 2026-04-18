# 05 运行时编排与调试

日期：2026-04-10
状态：已确认

## 讨论进度

- 状态：`completed`
- 完成情况：已完成运行时恢复、调度、流式、重试与调试执行模型定稿，并获用户确认。
- 最后更新：2026-04-10 17:56 CST

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)
- [2026-04-10-orchestration-design-draft.md](../../2026-04-10-orchestration-design-draft.md)

## 本模块范围

- Flow Run / Node Run 模型
- 调度、暂停、恢复
- checkpoint 与 callback
- 节点级调试与可观测性

## 与模型供应商接入的边界补充（2026-04-18）

- `05` 只消费已经解析好的 `provider instance + model`
- `05` 只消费 provider plugin 输出的标准化流事件与最终结果
- `05` 需要接住 `tool call / MCP / usage / finish reason` 等运行时语义
- `05` 不负责 provider 配置管理、凭据存储和 catalog 管理

## 已确认

- 运行时必须支持暂停、恢复、回调、checkpoint。
- callback 回填后必须先恢复当前节点，再继续推进下游。
- 运行时一等对象至少包括：`Flow Run`、`Node Run`、`Checkpoint`、`Callback Task`。
- `Flow Run` 状态已收敛为：`queued`、`running`、`waiting_callback`、`waiting_human`、`paused`、`succeeded`、`failed`、`cancelled`。
- `Node Run` 状态已收敛为：`pending`、`ready`、`running`、`streaming`、`waiting_tool`、`waiting_callback`、`waiting_human`、`retrying`、`succeeded`、`failed`、`skipped`。
- LLM 节点触发工具调用时，必须暂停当前节点，不得直接推进到下游。
- 节点暂停后必须先落 checkpoint，再进入等待外部输入或 callback 完成状态。
- P1 部署上先不拆独立 `runtime-worker`，但逻辑边界仍需保留控制面与运行面的分层。
- 当前系统基线仍是前后端分离，后端单 Rust 服务，使用 PostgreSQL、Redis、RustFS。
- 运行时不直接消费 `Authoring Document`，而是消费编译后的 `Compiled Plan`。
- `Flow Draft`、`Draft Inspect Value`、`Flow Run`、`Node Run` 必须分层存储。
- `Draft Inspect Value` 独立于 graph 存储；`Node Run Output` 按运行实例独立存储。
- PostgreSQL 存元数据与中小值，Object Storage 存大文本/大 JSON/文件，Redis 只做热缓存和运行时加速。
- 调试能力至少覆盖静态预览、输入预览、Prompt 预览、单节点调试、整流调试、容器单步调试。
- `Iteration` 采用 copy 父作用域；`Loop` 采用 share 父作用域，并在每轮清理内部遗留输出。
- 继承 `04` 结论：节点运行结果统一使用 `outputs` 对象承载，并统一进入 `VariablePool`；节点通过静态或动态 `outputSchema` 声明可供下游引用的输出。
- 保留键统一采用 `__` 前缀，默认隐藏，不进入变量选择器。
- `Checkpoint` 定义为“最小可恢复快照”，不是普通日志；仅在节点即将进入 `waiting_callback`、`waiting_human`、`paused` 或工具调用后等待外部结果时落点。
- `Checkpoint` 最小内容至少包含：`flow_run_id`、`node_run_id`、当前状态、当前节点/容器定位、恢复所需最小变量集、等待原因、外部关联信息、恢复入口。
- 调度模型采用“状态机主表 + 事件日志附属”，其中 `flow_runs` / `node_runs` 保存当前事实状态，事件日志用于调试、审计、时间线与故障排查。
- 单 Rust 服务内采用“状态驱动调度 + worker pool + recovery loop + callback requeue”组织执行；数据库为事实来源，恢复与再次调度由状态变化驱动。
- 队列串行粒度按 `conversation/session` 而不是按 `agentFlow`；同一会话内 FIFO，不同会话可并发。
- 同一会话内若旧任务仍处于 `queued` 且尚未消费，新消息可以将其标记为 `superseded` 并由最新任务取代；已进入 `running` 的任务不做强行覆盖。
- 流式输出采用双层并存模型：对外 API 与前端主消费 `Flow Run` 聚合流，对内调试与可观测性保留 `Node Run` 事件流。
- 自动重试仅允许 `LLM Node` 处理明确的瞬时错误（如超时、限流、临时不可用），次数控制在 1~2 次；其他节点、容器级与整流级不做自动重试。
- 若 `LLM Node` 在自动重试后仍失败，则本次 `Flow Run` 直接失败；其他节点失败同样直接结束本次运行，后续仅允许人工重跑或从 checkpoint 恢复，不提供自动整流重试。
- 调试态与正式运行态复用同一套执行引擎，仅通过运行模式切换调试开关、trace 粒度、单步能力与副作用限制。

## 当前结论摘要

- 对外业务对象以 `Flow Run` 为主，对内执行对象以 `Node Run` 为主，二者通过状态机与事件流协同。
- `Checkpoint` 是恢复锚点，主表状态是当前事实，事件日志是历史轨迹。
- `scheduler + worker + recovery + callback requeue` 构成单服务运行骨架，并为后续拆分独立 worker 保留边界。
- 模型供应商接入后，`05` 继续只消费标准化 provider 运行时语义，不承担 provider 配置与目录治理。
