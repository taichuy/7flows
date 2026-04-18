---
memory_type: project
topic: 主仓库正式统一为 1Flowbase
summary: 用户在 `2026-04-18` 明确要求把主仓库正式项目名统一为 `1Flowbase / 1flowbase`，并已把主仓库远程地址改为 `https://github.com/taichuy/1flowbase`；当前仓库内路径、包作用域、schema/version、插件包扩展名与官方插件 sibling 引用都应按新名字维护。
keywords:
  - rename
  - 1flowbase
  - repository
  - package-scope
  - docs
  - official-plugins
created_at: 2026-04-18 21
updated_at: 2026-04-18 21
last_verified_at: 2026-04-18 21
decision_policy: verify_before_decision
match_when:
  - 需要确认仓库当前正式项目名
  - 需要新增或修改包作用域、schema version、插件包命名
  - 需要更新 docs、脚本、路径或 sibling 官方插件仓库引用
scope:
  - README.md
  - DESIGN.md
  - docs/superpowers/specs/1flowbase
  - api/
  - web/
  - scripts/
  - .memory/
  - ../1flowbase-official-plugins
---

# 主仓库正式统一为 1Flowbase

## 时间

`2026-04-18 21`

## 谁在做什么

- 用户已把主仓库远程地址改为 `https://github.com/taichuy/1flowbase`。
- AI 已按用户要求在当前仓库内统一替换旧项目名对应命名，并把旧 `specs` 目录迁移为 `docs/superpowers/specs/1flowbase`。

## 为什么这样做

- 继续保留旧项目名会导致包作用域、文档路径、脚本默认值、官方插件引用与仓库远程信息长期分叉。
- 当前项目仍处于高频开发阶段，命名如果不一次性收口，后续每轮改动都会继续扩散旧名字。

## 为什么要做

- 让代码、文档、配置、脚本和本地记忆对外只暴露一个统一项目名。
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
- 后续如果发现新增文件仍出现旧项目名，应优先视为遗留命名未清扫，而不是继续接受双命名并存。
