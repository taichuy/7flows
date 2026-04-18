---
memory_type: project
topic: 主仓库正式统一为 1Flowbase
summary: 用户在 `2026-04-18` 明确要求把主仓库正式项目名统一为 `1Flowbase / 1flowbase`，并已把主仓库远程地址改为 `https://github.com/taichuy/1flowbase`；随后又确认允许直接重置本地中间件数据，并要求把库名、密码、cookie/session 前缀等运行时默认值也一并切到 `1flowbase` 口径。
keywords:
  - rename
  - 1flowbase
  - repository
  - package-scope
  - docs
  - official-plugins
  - runtime-defaults
  - middleware-reset
created_at: 2026-04-18 21
updated_at: 2026-04-18 21
last_verified_at: 2026-04-18 21
decision_policy: verify_before_decision
match_when:
  - 需要确认仓库当前正式项目名
  - 需要新增或修改包作用域、schema version、插件包命名
  - 需要更新 docs、脚本、路径或 sibling 官方插件仓库引用
  - 需要确认本地 middleware 默认数据库、Redis、对象存储与 cookie/session 命名
  - 需要判断是否可以直接重置本地开发数据
scope:
  - README.md
  - DESIGN.md
  - docs/superpowers/specs/1flowbase
  - api/
  - web/
  - scripts/
  - docker/
  - .memory/
  - ../1flowbase-official-plugins
---

# 主仓库正式统一为 1Flowbase

## 时间

`2026-04-18 21`

## 谁在做什么

- 用户已把主仓库远程地址改为 `https://github.com/taichuy/1flowbase`。
- AI 已按用户要求在当前仓库内统一替换旧项目名对应命名，并把旧 `specs` 目录迁移为 `docs/superpowers/specs/1flowbase`。
- 用户随后明确允许直接重置本地开发数据，要求把 middleware 与运行时默认配置也一并改成 `1flowbase`。
- AI 已把本地 Postgres / Redis / RustFS 默认库名、密码、bucket、cookie/session 前缀等旧值收口到 `1flowbase`，并在本机重建过 `docker/volumes` 后重新拉起中间件验证。

## 为什么这样做

- 继续保留旧项目名会导致包作用域、文档路径、脚本默认值、官方插件引用与仓库远程信息长期分叉。
- 继续保留旧运行时默认值会让本地开发环境与仓库正式命名长期分叉，新的开发者会在 `.env.example`、docker 默认值、测试固定串里反复踩坑。
- 当前项目仍处于高频开发阶段，命名如果不一次性收口，后续每轮改动都会继续扩散旧名字。

## 为什么要做

- 让代码、文档、配置、脚本和本地记忆对外只暴露一个统一项目名。
- 让本地启动脚本、docker 中间件、测试默认连接串和浏览器 cookie/session 命名也保持一致，避免“代码已改名但运行时仍是旧名”的半重命名状态。
- 保证后续新增内容默认直接沿用 `1flowbase` 口径，而不是再混入旧命名。

## 截止日期

- 无

## 决策背后动机

- 当前统一口径包括：
  - 展示名：`1Flowbase`
  - 小写标识：`1flowbase`
  - workspace 包作用域：`@1flowbase/*`
  - schema / contract 版本：`1flowbase.flow/v1`、`1flowbase.provider/v1`
  - 官方插件 sibling 引用：`../1flowbase-official-plugins`
  - 插件包扩展名与产物前缀：`.1flowbasepkg`、`1flowbase@...`
  - 本地 middleware 默认值：`POSTGRES_DB=1flowbase`、`POSTGRES_PASSWORD=1flowbase`、`REDIS_PASSWORD=1flowbase`、`RUSTFS_BUCKET=1flowbase-local`
  - 控制面默认 cookie/session 命名：`flowbase_console_session`、`flowbase:console:session`
- 后续如果发现新增文件仍出现旧项目名，应优先视为遗留命名未清扫，而不是继续接受双命名并存。
