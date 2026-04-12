---
memory_type: feedback
topic: 记忆检索应优先摘要并严格控制有效记忆数量
summary: 记忆检索先看摘要层，最多扫描 200 个文件，只选择与当前任务最相关的最多 5 条有效记忆；工具失败经验单独进入 tool-memory。
keywords:
  - memory
  - summary
  - retrieval
  - tool-memory
  - top5
match_when:
  - 需要读取 docs/userDocs 记忆做决策
  - 需要为任务筛选相关记忆
  - 工具失败后需要回看历史失败案例
created_at: 2026-04-12 19
updated_at: 2026-04-12 19
last_verified_at: 2026-04-12 19
decision_policy: direct_reference
scope:
  - docs/userDocs/AGENTS.md
  - docs/userDocs/feedback-memory
  - docs/userDocs/project-memory
  - docs/userDocs/reference-memory
  - docs/userDocs/tool-memory
---
# 记忆检索应优先摘要并严格控制有效记忆数量

## 时间

`2026-04-12 19`

## 规则

- 读取记忆时，固定先读 `docs/userDocs/AGENTS.md` 与 `docs/userDocs/user-memory.md`。
- 对 `feedback-memory`、`project-memory`、`reference-memory`、`tool-memory`，第一轮只读取文件前 30 行的摘要层。
- 单轮最多扫描 200 个记忆文件，只选择与当前任务最相关的最多 5 条有效记忆展开全文。
- 记忆选择原则为：宁缺毋滥，只选有用的，可少选，不凑满 5 条。
- `tool-memory` 只记录真实失败过的问题与已验证解法，不写工具教程或未来风险。

## 原因

- 多文件长文本记忆继续直接扫正文，后续检索成本和误判成本都会持续上升。
- 先用摘要层筛选，再展开极少量正文，可以显著降低噪声并提高命中率。
- 工具失败案例独立成类后，AI 在工具失败时可以直接命中历史问题和解决方案，而不会污染其他记忆类型。

## 适用场景

- AI 需要从 `docs/userDocs` 中读取记忆参与当前任务决策。
- AI 正在筛选本轮最相关的历史反馈、项目事实、引用入口或工具失败案例。
- 当前操作涉及 `docker`、`pnpm`、`cargo` 等工具并出现已知失败特征时。

## 分类

- 团队协作偏好

## 备注

- 是否直接参考某条记忆，不只看时间，还要结合记忆类型、决策策略和当前任务相关性判断。
- 超过两天的 `project-memory` 只在确实影响当前决策时才回到当前代码或当前文档验证。
