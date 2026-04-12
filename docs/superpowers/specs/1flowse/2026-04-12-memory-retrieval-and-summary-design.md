# 1Flowse 记忆目录检索与摘要层设计

日期：2026-04-12
状态：已确认，执行中
关联输入：
- [.memory/AGENTS.md](../../../.memory/AGENTS.md)
- [.memory/user-memory.md](../../../.memory/user-memory.md)
- [.memory/feedback-memory](../../../.memory/feedback-memory)
- [.memory/project-memory](../../../.memory/project-memory)
- [.memory/reference-memory](../../../.memory/reference-memory)

## 1. 目标

本文档用于收敛 `.memory` 记忆目录的后续检索方式、目录边界和摘要元数据约束。

本轮要解决的问题不是“如何存更多记忆”，而是：

1. 随着 `feedback-memory`、`project-memory`、`reference-memory` 文件数增长，AI 如何在不扫全文的前提下完成有效检索。
2. 哪些记忆可以直接参考，哪些记忆只能在影响当前决策时再验证。
3. 工具失败案例应该放在哪里，如何避免它污染其他类型记忆。

## 2. 现状问题

当前 `.memory` 中的记忆文件以正文为主，缺少统一的检索层。

这会带来三个直接问题：

1. AI 每次检索都容易直接扫正文，随着文件增长成本会持续变高。
2. 新旧记忆混杂时，难以在第一轮判断“是否与当前任务相关”。
3. 工具失败经验没有独立语义位置，容易被塞进 `feedback-memory` 或 `project-memory`，后续检索信号会变脏。

## 3. 目录边界

`.memory` 后续只保留记忆相关文件，不再把其他杂项文档作为记忆检索输入。

固定参与检索的范围如下：

- `.memory/AGENTS.md`
- `.memory/user-memory.md`
- `.memory/feedback-memory/`
- `.memory/project-memory/`
- `.memory/reference-memory/`
- `.memory/tool-memory/`

固定排除的范围如下：

- `docs/draft/`
- `.memory/todolist/`
- `.memory/` 根目录下不属于上述范围的其他历史或杂项文件

如果旧文件仍然保留在仓库中，也不再把它们当作记忆检索入口。

## 4. 记忆类型职责

### 4.1 `user-memory.md`

用于保存长期稳定的用户角色、背景、工作习惯、知识水平和沟通偏好。

它仍然是固定入口文件，不参与批量摘要筛选。

### 4.2 `feedback-memory/`

用于保存可复用的协作规则、纠正、肯定反馈和稳定行为约束。

这类记忆通常比项目事实更稳定，但也只在与当前任务相关时纳入决策。

### 4.3 `project-memory/`

用于保存项目阶段事实、短期共识、当前边界和阶段性决策背景。

这类记忆衰减更快，超过两天后默认视为待验证事实，不应直接替代当前代码和当前正式文档。

### 4.4 `reference-memory/`

用于保存“去哪里看什么”的入口索引。

这类记忆只做索引，不直接作为结论来源。

### 4.5 `tool-memory/`

新增 `.memory/tool-memory/`，专门用于保存项目环境中已经真实发生过的工具失败案例与已验证解法。

边界如下：

- 只记录真实失败过的问题
- 只记录已经验证过的解法
- 不写通用工具使用文档
- 不写未来风险提示
- 不写一次性流水账

目录结构固定为：

- `.memory/tool-memory/<tool>/`
- 文件名：`yyyy-mm-dd-<tool>-<problem-key>.md`

示例：

- `.memory/tool-memory/docker/2026-04-12-docker-permission-denied.md`
- `.memory/tool-memory/pnpm/2026-04-12-pnpm-workspace-lock-conflict.md`

如果是同一工具、同一问题、同一处理办法复现，则追加到原文件；若根因或解法变化，则新建文件。

## 5. 摘要元数据

除 `AGENTS.md` 与 `user-memory.md` 外，`feedback-memory`、`project-memory`、`reference-memory`、`tool-memory` 统一使用 `YAML front matter` 作为检索层。

固定字段如下：

```yaml
---
memory_type: project
topic: 统一开发启动入口与默认端口
summary: 统一开发入口固定为 node scripts/node/dev-up.js，并约定前端 3100、后端 7800、plugin-runner 7801。
keywords:
  - dev-up
  - port
  - frontend
  - backend
match_when:
  - 需要启动本地开发环境
  - 需要确认默认端口
created_at: 2026-04-12 17
updated_at: 2026-04-12 17
last_verified_at: 2026-04-12 17
decision_policy: verify_before_decision
scope:
  - scripts/node/dev-up.js
  - README.md
---
```

字段语义如下：

- `memory_type`
  - 仅允许 `feedback`、`project`、`reference`、`tool`
- `topic`
  - 单行主题，说明文件核心内容
- `summary`
  - 用一句话说明这条记忆告诉 AI 什么
- `keywords`
  - 供检索命中使用的 3 到 8 个关键词
- `match_when`
  - 什么任务或什么失败情形下值得展开全文
- `created_at`
  - 创建时间，格式固定为 `yyyy-mm-dd hh`
- `updated_at`
  - 最近一次正文更新的时间
- `last_verified_at`
  - 最近一次对照当前代码、当前文档、当前命令结果完成核验的时间；未核验时可写 `无`
- `decision_policy`
  - 仅允许 `direct_reference`、`verify_before_decision`、`index_only`、`reference_on_failure`
- `scope`
  - 相关模块、目录、工具、命令或文档范围

约束如下：

- `YAML front matter` 必须位于文件前 30 行内
- 第一轮检索只读 `YAML front matter`，不读正文
- 不额外引入“可靠性分数”或“自动评分”字段

## 6. 决策策略

`decision_policy` 与记忆类型的默认关系如下：

- `feedback`
  - 默认使用 `direct_reference`
- `project`
  - 默认使用 `verify_before_decision`
- `reference`
  - 默认使用 `index_only`
- `tool`
  - 默认使用 `reference_on_failure`

需要强调的是，是否纳入本轮决策，不只由时间决定，而是由以下三项联合判断：

1. 记忆类型
2. `decision_policy`
3. 与当前任务的相关性

时间只决定“是否需要在真正依赖它之前再验证”，不决定“是否必须被纳入本轮检索结果”。

## 7. 检索流程

AI 每轮处理任务时，记忆检索流程固定如下：

1. 固定先读 `.memory/AGENTS.md`
2. 固定再读 `.memory/user-memory.md`
3. 在 `feedback-memory`、`project-memory`、`reference-memory`、`tool-memory` 中，只读取每个文件前 30 行
4. 单轮最多扫描 200 个记忆文件
5. 第一轮只选与当前任务最相关的最多 5 条有效记忆
6. 只有这最多 5 条，才允许继续展开全文

有效记忆选择原则固定为：

> 宁缺毋滥，只选有用的，可少选，不凑满 5 条。

取样顺序固定为：

1. 先按类别是否命中当前任务
2. 再按关键词、工具名、问题特征筛选
3. 最后按 `updated_at` 倒序作为同类候选的辅助排序

如果筛选后相关性已经很弱，可以提前停止，不必把 200 个文件扫满。

## 8. 时效与验证规则

### 8.1 `feedback-memory`

只要内容与当前任务相关，通常可以直接参考。

但若其规则依赖当前项目实现细节，也应在真正依赖前回到当前代码核对。

### 8.2 `project-memory`

超过两天后，默认视为待验证事实。

只有在其内容会影响当前决策时，才需要回到当前代码、当前正式文档或当前运行结果验证；不相关的旧项目记忆无需为形式合规而全部验证。

### 8.3 `reference-memory`

始终只作为入口索引。

真正做决策或执行时，应以打开后的当前源码、当前 API、当前脚本结果为准。

### 8.4 `tool-memory`

只有在以下场景下才参与检索：

- 当前任务明确会用到该工具
- 该工具刚刚发生失败

对 `tool-memory` 的验证规则不是单纯看天数，而是看：

- 当前工具版本或环境是否变化
- 当前失败特征是否仍然一致
- 当前准备采用的解法是否仍然可执行

## 9. 非目标

本轮设计不做以下事情：

- 不引入独立总索引文件
- 不引入自动可靠性分数
- 不把所有旧文档自动迁移成新的正式设计文档
- 不把 `tool-memory` 扩展成通用工具知识库

## 10. 后续落地建议

若用户确认本设计，可按以下顺序落地：

1. 更新 `.memory/AGENTS.md`，明确检索范围与新目录结构
2. 新增 `.memory/tool-memory/` 及模板文件
3. 将现有 `feedback-memory`、`project-memory`、`reference-memory` 文件补齐 `YAML front matter`
4. 明确旧根目录杂项文件不再参与记忆检索
5. 后续增加轻量校验脚本，仅检查字段完整性、枚举值和目录归属

## 11. 本轮结论

本轮已确认以下决策：

1. `feedback-memory`、`project-memory`、`reference-memory`、`tool-memory` 必须增加可检索摘要层。
2. 摘要层采用 `YAML front matter`，作为统一第一轮检索入口。
3. AI 每轮只读每个记忆文件前 30 行，最多扫描 200 个文件，只展开最多 5 条最相关有效记忆。
4. 是否直接参考记忆，按“类型 + 策略 + 当前任务相关性”联合判断，不只按时间判断。
5. `project-memory` 超过两天后，仅在其确实影响当前决策时才回代码或文档验证。
6. 新增 `tool-memory/`，并按工具分目录、按问题建文件，文件名必须带工具名。
7. `tool-memory` 只记录真实失败过的坑和已验证解法，不记录未来风险或工具教程。
8. 同一工具、同一问题、同一处理办法复现时，直接追加到原文件。
