# 2026-03-14 分级执行架构对齐

## 背景

7Flows 先前的产品与技术文档强调了沙盒的重要性，但对“哪些节点应该轻量执行、哪些节点应该进入强隔离运行时”仍缺少统一表达，容易让后续实现滑向“所有节点默认沙箱化”或“节点类型与隔离级别绑定”的方向。

结合本轮关于 n8n / Dify 工程路线的讨论，项目需要更明确地把“工作流执行器唯一主控 + 节点分级执行 + 高风险节点隔离”沉淀为仓库级规则和产品基线。

## 目标

- 明确工作流执行器是唯一 orchestration 主控。
- 明确 `NodeType` 与 `execution class` 分离建模。
- 明确不采用“所有节点默认重沙箱化”的策略。
- 让产品设计、技术补充、当前事实索引与仓库规则在同一术语下收口。

## 决策

### 1. 工作流执行器唯一主控

- `RuntimeService` / Workflow Executor 统一负责 DAG 调度、上下文状态、输入输出传递、重试、超时、checkpoint、waiting / resume 与事件落库。
- sandbox job、插件 runtime、microvm runner、Tool Gateway 回调链都属于被调度层，不拥有第二套流程控制语义。

### 2. 节点语义与执行级别分离

- `NodeType` 继续表达业务语义，例如 `llm_agent`、`tool`、`sandbox_code`。
- `execution class` 表达执行边界，例如 `inline`、`subprocess`、`sandbox`、`microvm`。
- 同样是 `tool` 节点，可根据来源、执行能力和风险等级进入不同执行类。

### 3. 采用分级执行，不做全量沙箱化

- 大多数内建、官方、可信节点默认走 `inline` 或 `subprocess`。
- `sandbox` 主要用于代码节点、用户自定义节点、插件脚本、浏览器操作、文件写入和高风险工具能力。
- `microvm` 保留给极少数高权限、高破坏面或高合规要求节点，首版先预留，不默认铺开。

### 4. 执行隔离与敏感访问控制分轴治理

- `execution class` 负责执行边界和宿主风险控制。
- `sensitivity_level` 负责资源访问、审批、通知和审计流程。
- 两者可以组合使用，但不能混为同一个字段或同一套决策逻辑。

## 影响范围

- `AGENTS.md`
  - 增补仓库级架构边界，明确唯一执行主控、分级执行和双治理轴。
- `docs/dev/user-preferences.md`
  - 记录“节点执行采用分级执行而不是全量沙箱化”为长期偏好。
- `docs/product-design.md`
  - 在核心概念、系统架构、MVP 与节点/沙盒章节中引入 `execution class` 与分级执行架构。
- `docs/technical-design-supplement.md`
  - 在安全与 Durable Runtime / Tool Gateway 章节中补齐分级执行与执行类追踪模型。
- `docs/dev/runtime-foundation.md`
  - 更新当前判断、当前代码事实和下一步规划，强调当前仍以 worker 内联执行为主，execution adapter registry 尚未落地。

## 验证方式

- 逐份核对相关文档，确保以下术语一致：
  - 工作流执行器唯一主控
  - `NodeType` 与 `execution class` 分离
  - 不做所有节点默认重沙箱化
  - `sensitivity_level` 与 `execution class` 分轴治理
- 结合当前代码事实确认：
  - 运行时当前确实仍以 `RuntimeService + AgentRuntime + ToolGateway + worker inline path` 为主
  - `sandbox_code` 和统一 execution adapter registry 仍未正式落地

## 下一步

1. 优先补 `runtimePolicy.execution`、Execution Adapter Registry 与节点/工具默认执行类策略。
2. 把前端 `sandboxEnabled` 等局部开关收口为统一执行策略配置。
3. 在运行追踪中补 `execution_class / executor_ref` 等事实字段，为后续 sandbox / microvm 观察与审计做准备。
