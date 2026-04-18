---
memory_type: feedback
feedback_category: interaction
topic: 普通 markdown 超链接不要使用反引号包裹
summary: 当给用户输出文件路径或普通 markdown 超链接时，应直接使用链接语法，不要再用反引号包裹整个链接。
keywords:
  - markdown link
  - file link
  - backticks
  - hyperlink
match_when:
  - 输出文件超链接
  - 输出普通 markdown 链接
  - 需要引用本地文件路径
created_at: 2026-04-18 16
updated_at: 2026-04-18 16
last_verified_at: 2026-04-18 16
decision_policy: direct_reference
scope:
  - .memory/user-memory.md
  - .memory/feedback-memory/interaction
  - final response formatting
---

# 普通 markdown 超链接不要使用反引号包裹

## 时间

`2026-04-18 16`

## 规则

- 输出普通 markdown 超链接时，不要用反引号包裹整个链接。
- 文件链接直接写成 `[name](/abs/path/file)` 或 `[name](/abs/path/file:12)`。
- 只有命令、路径字面量、代码标识符等非链接内容才使用反引号。

## 原因

- 反引号会把超链接当成代码片段显示，格式不符合用户预期，也会影响可读性。

## 适用场景

- 汇报中引用本地文件
- 解释代码时给出文件链接
- 任何需要输出 markdown 超链接的场景
