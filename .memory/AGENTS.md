# 背景

`.memory` 是开发者私有记忆目录，用来记录 AI 与开发者之间的约定、协作边界和可复用决策。

进入用户交互后，优先阅读本文件；如果记忆仍为空，与用户沟通初始化。

所有日期统一使用绝对时间格式：`yyyy-mm-dd hh`。

## 检索规则

1. 固定先读 `.memory/AGENTS.md`。
2. 固定再读 `.memory/user-memory.md`。
3. 对 `feedback-memory`、`project-memory`、`reference-memory`、`tool-memory`，第一轮只读取每个文件前 30 行的 `YAML front matter`。
4. 单轮最多扫描 200 个记忆文件。
5. 单轮只展开与当前任务最相关的最多 5 条有效记忆全文。
6. 有效记忆选择原则固定为：宁缺毋滥，只选有用的，可少选，不凑满 5 条。
7. 是否直接参考某条记忆，不只看时间，还要结合记忆类型、`decision_policy` 与当前任务相关性判断。
8. `project-memory` 超过两天后，仅在其确实影响当前决策时，才回到当前代码、当前文档或当前运行结果验证。
9. `reference-memory` 只作为索引，不直接作为结论来源。
10. `tool-memory` 只在当前任务会用到对应工具或该工具刚刚失败时参与检索。

## 存什么

记忆的目标不是做用户画像，而是帮助 AI 在后续任务中更快、更准地复用已有结论。

### 用户记忆

记录用户是谁、技术背景、工作习惯、知识水平和沟通偏好。

### 反馈记忆

当用户给出指正或最终同意后，应整理成可复用的反馈记忆。

反馈记忆应遵守以下规则：

1. 每一条都包含：规则、原因、适用场景。
2. 既记录纠正，也记录肯定，避免 agent 越来越保守。
3. 按`interaction/` 和 `repository/` 两类分目录维护。
4. 在 `YAML front matter` 中必须显式写 `feedback_category`，用于说明是哪一类纠正。
5. 使用 `YAML front matter` 作为摘要层，`decision_policy` 默认使用 `direct_reference`。

### 项目记忆

记录项目当前正在发生的事情、阶段共识和短期事实，这类记忆衰减较快。

项目记忆正文至少回答：

1. 谁在做什么？
2. 为什么这样做？
3. 为什么要做？
4. 截止日期？
5. 决策背后动机？

项目记忆使用 `YAML front matter` 作为摘要层，`decision_policy` 默认使用 `verify_before_decision`。

### 引用记忆

这里只记录“去哪里看什么”的入口索引，不记录正文结论。

引用记忆使用 `YAML front matter` 作为摘要层，`decision_policy` 默认使用 `index_only`。

### 工具记忆

`tool-memory` 专门记录项目环境中已经真实发生过的工具失败案例与已验证解法。

边界如下：

1. 只记录真实失败过的问题。
2. 只记录已验证可复用的解法。
3. 不写通用工具使用文档。
4. 不写未来风险提示。
5. 同一工具、同一问题、同一处理办法复现时，直接追加到原文件。

工具记忆使用 `YAML front matter` 作为摘要层，`decision_policy` 默认使用 `reference_on_failure`。

## 不存什么

过多无关记忆会显著增加检索噪声，以下内容不应放入记忆中：

1. 可直接从当前代码中读取的代码模式、架构和路径。
2. 版本管理历史，优先回看 `git`。
3. 不能复用的一次性调试过程或一次性修复流水账。
4. 配置文件中已经明确声明的内容。
5. 临时性任务细节。
6. 与记忆目录无关的运行摘要、草稿或历史杂项文件。

## 目录索引

- `.memory/user-memory.md`
  - 用户记忆主文件，固定入口。
- `.memory/feedback-memory/`
  - 反馈记忆根目录，存放模板与分类子目录。
- `.memory/feedback-memory/interaction/`
  - 用户沟通、执行流程、记忆检索等交互类纠正。
- `.memory/feedback-memory/repository/`
  - 仓库结构、目录管理、脚本放置、版本控制等工程类纠正。
- `.memory/project-memory/`
  - 项目记忆目录，存放阶段事实、短期共识和模板。
- `.memory/reference-memory/`
  - 引用记忆目录，存放入口索引和分类说明。
- `.memory/tool-memory/`
  - 工具记忆目录，按工具分目录、按问题建文件，记录真实失败案例与解法。
- `.memory/todolist/`
  - AI 自主开发且用户离线时的待确认目录，处理后直接删除，不做沉淀。

## 目录外排除项

以下内容即使仍然保留在仓库中，也不再作为 `.memory` 记忆检索输入：
1. `.memory/` 根目录下不属于 `AGENTS.md`、`user-memory.md` 和四类记忆目录的其他文件
