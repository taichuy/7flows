---
memory_type: tool
topic: bash 双引号里的反引号会触发命令替换
summary: 在 `bash -lc` 或普通 shell 命令中，如果把带反引号的文档文本直接放进双引号参数，shell 会把反引号内容当命令执行，导致出现“未找到命令”等误报；应改用单引号、转义反引号，或避免把 markdown 片段直接拼进命令。
keywords:
  - bash
  - backtick
  - command substitution
  - rg
  - quote
match_when:
  - 在 shell 命令里搜索或匹配包含 markdown 反引号的文本
  - 输出出现“未找到命令”但目标其实只是文档字样
  - 需要把带反引号的模式传给 `rg`、`grep`、`sed`
created_at: 2026-04-13 15
updated_at: 2026-04-13 15
last_verified_at: 2026-04-13 15
decision_policy: reference_on_failure
scope:
  - bash
  - rg
  - grep
  - sed
---

# bash 双引号里的反引号会触发命令替换

## 时间

`2026-04-13 15`

## 失败现象

执行 `rg` 自检命令时，shell 输出：

- `/bin/bash: 行 1: api: 未找到命令`
- `/bin/bash: 行 1: components: 未找到命令`

但目标文件本身并没有要执行这两个命令。

## 为什么做这个操作

需要在 spec 自检时搜索文档里是否已经包含 `shared/ui`、`shared/utils`、`features/*/api`、顶层 `api`、顶层 `components` 等关键字，确认新增规范没有矛盾或遗漏。

## 触发条件

- 在 `bash -lc` 命令字符串中使用双引号包裹整个命令
- 命令内部又直接包含 markdown 反引号文本，如 `` `api` ``、`` `components` ``

## 根因

反引号在 shell 中是命令替换语法。即使只是想把它当普通字符传给 `rg`，放在双引号内仍会先被 shell 解释。

## 解法

- 对整段模式使用单引号，避免 shell 解释反引号
- 或对反引号做转义
- 更稳妥的是不要把 markdown 片段原样拼进 shell 命令，而是改搜无反引号关键词

## 验证方式

- 将目标关键字改为不带反引号的普通文本后，`rg` 正常返回命中结果
- 文档内容核对正常，无额外 shell 报错

## 复现记录

- `2026-04-13 15`：在前端 spec 自检时，为了同时搜索“顶层 `api` / 顶层 `components`”等文档字样，把带反引号的模式直接放进双引号命令，触发 shell 命令替换并报错；改为搜索不带反引号的普通文本后恢复正常。
