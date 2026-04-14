---
memory_type: tool
topic: bash 下用 rg 拼接复杂正则时容易被引号截断
summary: 在 bash 里把大量单引号、双引号和正则片段拼进同一条 `rg` 命令时，容易出现 `unexpected EOF`；已验证的解法是统一改成双引号包裹并转义，或拆成多次更小的搜索。
keywords:
  - shell
  - rg
  - quoting
  - bash
match_when:
  - `rg` 命令报 `unexpected EOF`、`syntax error` 或明显是 shell 引号错误
  - 需要搜索同时包含单双引号的复杂正则
created_at: 2026-04-14 16
updated_at: 2026-04-14 16
last_verified_at: 2026-04-14 16
decision_policy: reference_on_failure
scope:
  - shell
  - rg
  - bash
---

# bash 下用 rg 拼接复杂正则时容易被引号截断

## 时间

`2026-04-14 16`

## 失败现象

执行 `rg` 时 bash 直接报：

- `unexpected EOF while looking for matching ...`
- `syntax error: unexpected end of file`

## 触发条件

在同一条 shell 命令里，把包含单引号、双引号、括号和转义的复杂正则直接拼接给 `rg`。

## 根因

bash 先解释命令字符串；如果引号边界没控制好，shell 会在 `rg` 运行前就把命令截断。

## 解法

- 优先用双引号包住整个 `rg` pattern，并对内部反斜杠做显式转义。
- 如果 pattern 过长或同时含多类引号，拆成多次更小的 `rg`。

## 验证方式

同一轮任务里，改成双引号转义版和分批 `rg` 后，legacy sweep 与残余扫描都能正常执行。

## 复现记录

- `2026-04-14 16`：一次 legacy pattern 扫描因为引号拼接失败，改成双引号转义和分批搜索后恢复正常。
