---
memory_type: tool
topic: 不要用 node require 直接读取 pnpm-lock.yaml
summary: 在 `1flowbase` 中把 `web/pnpm-lock.yaml` 直接当成 JS 模块执行 `node -e \"require(...)\"` 会报 `SyntaxError: Unexpected token '.'`；已验证应改用 `sed`、`rg`，或显式使用 YAML 解析器读取。
keywords:
  - node
  - pnpm-lock.yaml
  - yaml
  - require
  - syntaxerror
match_when:
  - 需要快速查看 `pnpm-lock.yaml`
  - 想用 `node -e` 或 `require()` 直接读取 lockfile
  - 报错包含 `SyntaxError: Unexpected token '.'`
created_at: 2026-04-15 10
updated_at: 2026-04-15 10
last_verified_at: 2026-04-15 10
decision_policy: reference_on_failure
scope:
  - node
  - web/pnpm-lock.yaml
  - pnpm lockfile
---

# 不要用 node require 直接读取 pnpm-lock.yaml

## 时间

`2026-04-15 10`

## 失败现象

执行：

```bash
node -e "const p=require('./web/pnpm-lock.yaml')"
```

会直接报：

- `SyntaxError: Unexpected token '.'`

## 触发条件

- 想快速确认 lockfile 里的依赖版本
- 直接把 `pnpm-lock.yaml` 当成 CommonJS/JSON 模块读取

## 根因

`pnpm-lock.yaml` 是 YAML 文件，不是 JS 或 JSON；`require()` 会按 JS 语法解析，遇到 YAML 顶层的 `.` 节点时直接报语法错误。

## 解法

- 只做文本查找时，优先使用 `rg`、`sed`
- 如果确实需要结构化读取，显式使用 YAML 解析器，而不是 `require()`

## 验证方式

- 用 `rg -n '@scalar/api-reference' web/pnpm-lock.yaml` 或 `sed -n` 能正常读取目标内容。

## 复现记录

- `2026-04-15 10`：为确认 Scalar 依赖版本，误用 `node require()` 读取 `web/pnpm-lock.yaml`，随后改回文本搜索完成检查。
