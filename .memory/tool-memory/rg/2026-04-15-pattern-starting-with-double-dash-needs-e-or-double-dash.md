---
memory_type: tool
topic: rg 模式以双横线开头时需用 -e 或 -- 终止参数解析
summary: 执行 `rg` 时，如果搜索模式本身以 `--` 开头，`rg` 会把它当作命令参数而不是正则模式；已验证需改用 `rg -e 'pattern' ...` 或在模式前加 `--`。
keywords:
  - rg
  - pattern
  - double-dash
  - cli
match_when:
  - `rg` 的搜索模式以 `--` 开头
  - 需要查找 CLI 参数文本如 `--file`、`--help`
  - `rg` 报 argument wasn't expected
created_at: 2026-04-15 22
updated_at: 2026-04-15 22
last_verified_at: 2026-04-15 22
decision_policy: reference_on_failure
scope:
  - rg
  - shell
---

# rg 模式以双横线开头时需用 -e 或 -- 终止参数解析

## 时间

`2026-04-15 22`

## 为什么做这个操作

需要在 `scripts/node/check-style-boundary` 目录里搜索脚本用法文本，目标模式包含 `--file` 这类以双横线开头的参数名。

## 失败现象

执行：

```bash
rg -n "--file|process\\.argv|Usage|usage|impactFiles|scene" scripts/node/check-style-boundary -g '*.js'
```

输出：

```text
error: Found argument '--file|process\.argv|Usage|usage|impactFiles|scene' which wasn't expected
```

## 根因

模式字符串以 `--file` 开头，`rg` 将其按命令行参数继续解析，而不是当作正则模式处理。

## 已验证解法

改成以下任一形式：

```bash
rg -n -e "--file|process\\.argv|Usage|usage|impactFiles|scene" scripts/node/check-style-boundary -g '*.js'
```

或

```bash
rg -n -- "--file|process\\.argv|Usage|usage|impactFiles|scene" scripts/node/check-style-boundary -g '*.js'
```

即可正常搜索。

## 后续避免建议

- 只要 `rg` 模式可能以 `-` 或 `--` 开头，优先写成 `-e PATTERN`。
- 搜索 CLI 参数文本时，不要默认把模式直接放在命令位置，先判断会不会和 `rg` 自身参数冲突。
