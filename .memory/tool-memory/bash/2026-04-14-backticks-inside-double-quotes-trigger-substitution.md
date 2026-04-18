---
memory_type: tool
topic: bash 中双引号包裹的反引号模式会触发命令替换
summary: 在 bash 里把包含反引号的搜索模式直接写进双引号时，shell 会先执行命令替换，导致模式里的标识符被当成命令运行；已验证应改用单引号包整段模式，或对反引号做转义。
keywords:
  - bash
  - backticks
  - double quotes
  - command substitution
  - rg
match_when:
  - 在 shell 命令里搜索包含反引号的文本
  - 模式字符串被双引号包裹
  - 输出出现 `未找到命令` 且命令名来自搜索模式
created_at: 2026-04-14 07
updated_at: 2026-04-18 08
last_verified_at: 2026-04-18 08
decision_policy: reference_on_failure
scope:
  - bash
  - rg
---

# bash 中双引号包裹的反引号模式会触发命令替换

## 时间

`2026-04-14 07`

## 失败现象

执行：

```bash
rg -n "TODO|TBD|missing `permissionKey`" docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md
```

时，bash 先尝试执行 ``permissionKey``，报：

```text
/bin/bash: 行 1: permissionKey: 未找到命令
```

## 触发条件

- 需要搜索或匹配包含反引号的文本。
- 把整段模式放进双引号。

## 根因

- bash 在双引号中仍会处理反引号命令替换。
- 搜索模式里的 ``permissionKey`` 被 shell 解释成待执行命令，而不是普通文本。

## 已验证解法

改用单引号包裹整段模式，或显式转义反引号：

```bash
rg -n 'TODO|TBD|missing `permissionKey`' docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md
```

## 后续避免建议

- 在 bash 里搜索 Markdown/代码片段时，只要模式包含反引号，默认优先使用单引号。
- 如果必须用双引号，就先检查是否需要对反引号做转义。

## 复现记录

- `2026-04-14 20`：执行 `rg -n "web/app/src/features/settings/api/roles.ts|Extend \`api/crates/storage-pg/src/mappers/role_mapper.rs\`|Placeholder scan:" docs/superpowers/plans/2026-04-14-role-auto-grant-new-permissions.md` 时，bash 先尝试执行 ``api/crates/storage-pg/src/mappers/role_mapper.rs``，报 `/bin/bash: 行 1: api/crates/storage-pg/src/mappers/role_mapper.rs: 权限不够`；随后改回不用反引号或改用单引号包裹模式后恢复正常。
- `2026-04-18 08`：执行 `rg -n "官方 provider catalog|当前 \`workspace\` 可见的 provider catalog|provider catalog 与实例列表" docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md -S` 时，bash 先尝试执行 ``workspace``，报 `/bin/bash: 行 1: workspace: 未找到命令`；随后改用单引号包裹整段 pattern 后恢复正常。
- `2026-04-18 08`：执行 `rg -n "deployment\`|model_discovery_mode|provider_instance_model_catalog_cache|模型发现|models/refresh|最新模型列表" ...` 时，双引号中的反引号导致 bash 在解析阶段直接报“寻找匹配的 \`\` 时遇到了未预期的 EOF”；随后改为不用双引号包裹含反引号的模式，恢复正常。
