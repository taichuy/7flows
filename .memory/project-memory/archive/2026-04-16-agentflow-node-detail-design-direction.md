---
memory_type: project
topic: agentFlow node detail 第一版设计边界与关键决策已收敛
project_memory_state: design
summary: 记录 `agentFlow node detail` 第一版设计为何收敛为统一右侧 panel、authoring 优先、运行态留给 `05`；当前主题的有效检索入口已切换到 `2026-04-16-agentflow-node-detail-plan-stage.md`。
keywords:
  - agentflow
  - node detail
  - inspector
  - frontend
  - authoring
  - runtime
match_when:
  - 继续编写 agentFlow node detail 设计稿
  - 需要为 node detail 设计拆计划或执行实现
  - 需要判断 node detail 属于 04 还是 05 模块边界
created_at: 2026-04-16 19
updated_at: 2026-04-17 18
last_verified_at: 2026-04-16 19
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase
  - web/app/src/features/agent-flow
---
# agentFlow node detail 第一版设计边界与关键决策已收敛

## 时间

`2026-04-16 19`

## 归档说明

- 当前主题的有效检索入口已切换到 `2026-04-16-agentflow-node-detail-plan-stage.md`。
- 本文件仅保留设计阶段原始边界和决策细节，不再作为该主题的首选 project-memory。

## 谁在做什么

- 用户正在推动 `agentFlow` 第一版 node detail / inspector 升级设计。
- AI 正在基于 `1flowbase` 当前 `04/05` 模块边界与 `../dify` 参考实现，整理完整设计稿。

## 为什么这样做

- 当前 `NodeInspector` 过于简陋，只能承载基础 schema 字段编辑，无法支撑完整节点详情体验。
- 用户希望先把当前版本全部已接入节点的详情结构一次性收敛清楚，再进入实现。

## 已确认决策

- 设计范围覆盖当前版本全部已接入节点，不包含下一批计划节点。
- 设计深度采用：全部节点到 section 级，高频节点再下钻到字段级。
- 采用统一右侧 `Node Detail Panel` 壳层，支持后续扩展，不改成 Drawer。
- 当前只设计 `配置` 真实内容，但结构上预留未来 `运行` tab；本期不做空占位 UI。
- 头部包含：类型图标、类型名、别名、简介、帮助、更多操作、关闭；类型图标先可用 `Ant Design` icon 占位。
- 更多操作只保留高频项，明确需要支持“一键运行当前节点”和“复制同配置新节点（新 nodeId / edgeId 等）”；不继续铺很多杂项。
- 通用块采用增强版 authoring 面板：字段配置、输出契约、节点说明、Retry Policy、Error Policy、Next Step。
- 允许为 node detail 成立补少量 authoring 元数据/字段，但不顺手重做大批 DSL。
- 所有节点输出在详情中只读，不在当前节点面板直接编辑输出；下游通过输入绑定消费上游输出。
- 容器节点需要保留“进入子画布 / 返回上层”的上下文入口。
- 帮助信息采用“面板内短说明 + 文档外链”。
- Issues 联动先保持当前能力，不额外做字段高亮与修复建议。
- 关系信息需要展示：上一个节点、下一个节点，以及“当前节点可引用上游所有输出变量”的关系说明。
- 当前不额外设计移动端适配；node detail 按桌面结构为主。
- `Last Run` tab 需要纳入设计稿结构，至少包括：
  - 第一层：运行摘要（状态、运行时间、总 token）
  - 第二层：节点输入输出
  - 第三层：元数据（状态、执行人、开始时间、运行时间、总 token）

## 模块边界结论

- `04` 负责 node detail 的 authoring 壳层、配置结构、关系与通用策略块。
- `05` 再接手真实 `Node Run / Flow Run / trace / debug` 数据与运行时行为。
- 但设计稿中应为未来 `运行` tab 和 `Last Run` 面板预留扩展位，避免后续推翻结构。

## 截止与动机

- 当前目标是先形成一份可直接拆计划的设计稿。
- 动机是先把节点详情的信息架构和组件边界收稳，再进入实现，避免在 `04` 和 `05` 之间来回返工。
