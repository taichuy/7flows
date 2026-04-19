---
memory_type: feedback
feedback_category: repository
topic: Rust provider manifest 应补齐 i18n metadata 且保留 executable path
summary: 当维护 schema v2 的 Rust provider plugin manifest 时，不能只写最小运行时字段；应补齐 `metadata.label` 与 `metadata.description` 等面向展示的 i18n 元数据。同时 `runtime.executable.path` 仍是当前 host 契约必需字段，不能因为精简结构而省略。
keywords:
  - rust-provider
  - manifest
  - metadata
  - label
  - description
  - executable
  - path
match_when:
  - 编写或调整 schema v2 provider manifest
  - 修改 Rust provider plugin 脚手架模板
  - 对齐 official plugin manifest 与 host runtime 契约
created_at: 2026-04-20 00
updated_at: 2026-04-20 00
last_verified_at: 2026-04-20 00
decision_policy: direct_reference
scope:
  - scripts/node/plugin
  - ../1flowbase-official-plugins/models
  - .memory/feedback-memory/repository
---

# Rust provider manifest 应补齐 i18n metadata 且保留 executable path

## 时间

`2026-04-20 00`

## 规则

- schema v2 的 Rust provider plugin manifest 不应只停留在最小可运行字段。
- 应补齐：
  - `metadata.label`
  - `metadata.description`
- 如果插件面向多语言界面，应至少提供 `en_US` 与 `zh_Hans`。
- `runtime.executable.path` 仍是当前 host 装载二进制运行时的必需字段，不能删除。

## 原因

- 缺少 `label` / `description` 会导致 official plugin manifest 与用户期望、展示面和脚手架产物不一致。
- 只补显示字段但删掉 `runtime.executable.path` 会破坏当前 host 对可执行 runtime 的装载契约。

## 适用场景

- 新增 Rust provider plugin
- 调整 existing provider 的 manifest 结构
- 修改 `plugin init` 脚手架模板
