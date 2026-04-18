---
memory_type: tool
topic: check-style-boundary 脚本路径按仓库根解析，误在 web 目录执行会报模块不存在
summary: 执行 `node scripts/node/check-style-boundary.js ...` 时，脚本路径是相对仓库根 `1flowbase/` 解析的；如果在 `web/` 目录下直接跑同样命令，会变成查找 `web/scripts/node/check-style-boundary.js` 并报 `MODULE_NOT_FOUND`。已验证可复用解法是回到仓库根执行，或把命令写成绝对/完整相对路径。
keywords:
  - node
  - style-boundary
  - scripts
  - check-style-boundary
  - MODULE_NOT_FOUND
match_when:
  - 在 `web/` 目录执行 `node scripts/node/check-style-boundary.js ...`
  - 日志出现 `Cannot find module '/.../web/scripts/node/check-style-boundary.js'`
created_at: 2026-04-17 22
updated_at: 2026-04-17 22
last_verified_at: 2026-04-17 22
decision_policy: reference_on_failure
scope:
  - node
  - scripts/node/check-style-boundary.js
  - web
---

# check-style-boundary 脚本路径按仓库根解析，误在 web 目录执行会报模块不存在

## 时间

`2026-04-17 22`

## 失败现象

在 `web/` 目录执行：

```bash
node scripts/node/check-style-boundary.js page page.application-detail
```

报错：

```text
Error: Cannot find module '/home/taichu/git/1flowbase/web/scripts/node/check-style-boundary.js'
```

## 为什么当时要这么做

- 需要验证 `agentflow schema ui` 计划里的 `style-boundary` 最终回归步骤是否还能作为当前有效基线。

## 为什么失败

- `scripts/node/check-style-boundary.js` 实际位于仓库根 `1flowbase/scripts/node/`。
- 当前工作目录误设为 `1flowbase/web/`，导致 Node 把相对路径解析成了不存在的 `web/scripts/node/check-style-boundary.js`。

## 已验证解法

1. 回到仓库根执行：

```bash
cd /home/taichu/git/1flowbase
node scripts/node/check-style-boundary.js page page.application-detail
```

2. 或者保留当前目录，但把脚本写成完整相对路径：

```bash
node ../scripts/node/check-style-boundary.js page page.application-detail
```

## 验证方式

- `2026-04-17 22` 已验证：同一条 `check-style-boundary` 命令在仓库根可进入真实 `dev-up/style-boundary` 校验链路，不再报 `MODULE_NOT_FOUND`。

## 后续避免建议

- 跑 `scripts/node/*` 下的项目脚本时，优先把工作目录固定到仓库根。
- 如果任务上下文位于 `web/` 子目录，先确认命令中的脚本路径是否仍以仓库根为参照。
