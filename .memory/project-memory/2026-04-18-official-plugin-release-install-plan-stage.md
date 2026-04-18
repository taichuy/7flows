---
memory_type: project
topic: 官方 provider 插件发布与安装页进入实施计划阶段
summary: 自 `2026-04-18 20` 起，`docs/superpowers/plans/2026-04-18-official-plugin-release-install.md` 成为“官方 provider 插件打包发布 + 宿主安装页”专题的执行计划。计划固定按五段推进：主仓库 `plugin package`、官方插件仓库 registry 与 GitHub Actions、宿主后端 official catalog / install-official、设置页官方安装区，以及最终的 GitHub Release 发布与线上 smoke test。
keywords:
  - official-plugin
  - implementation-plan
  - release-asset
  - official-registry
  - install-official
  - settings
match_when:
  - 需要按计划继续实现官方插件 GitHub Release 安装链路
  - 需要知道这一轮任务拆分、文件边界和验证命令
  - 需要继续推进 sibling repo `../1flowbase-official-plugins` 和主仓库的联合改动
created_at: 2026-04-18 20
updated_at: 2026-04-18 20
last_verified_at: 2026-04-18 20
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-18-official-plugin-release-install.md
  - docs/superpowers/specs/1flowbase/2026-04-18-official-plugin-release-install-design.md
  - scripts/node/plugin.js
  - ../1flowbase-official-plugins
  - api/apps/api-server/src/routes/plugins.rs
  - api/crates/control-plane/src/plugin_management.rs
  - web/app/src/features/settings/pages/SettingsPage.tsx
---

# 官方 provider 插件发布与安装页进入实施计划阶段

## 时间

`2026-04-18 20`

## 谁在做什么

- AI 已根据已确认设计，把官方 provider 插件发布与安装页专题写成正式 implementation plan。
- 用户下一步可以直接选择按该计划执行，而不需要再次讨论“GitHub Release asset、official-registry、安装页是否只指向官方仓库”等方向问题。

## 为什么这样做

- 该专题跨主仓库、官方插件 sibling repo、后端安装链路和设置页，若没有明确顺序，极易出现“先改 UI，再回头补发布协议和下载校验”的返工。
- 用户已明确希望把“打包出来”“装上安装页面”“插件仓库推到线上”“看打包效果并从 GitHub 拉取安装”一起规划，因此计划需要覆盖最终线上 smoke test，而不是只停在本地代码层。

## 为什么要做

- 让 `openai_compatible` 成为第一份真正可发布、可下载、可安装的官方 provider 插件。
- 给后续 marketplace 留下稳定的最小产品闭环：`plugin package`、`official-registry.json`、GitHub Release asset、`install-official` 接口、设置页官方安装卡片区。

## 截止日期

- 无

## 决策背后动机

- 实施顺序固定为五段：
  - 主仓库补 `plugin package`
  - 官方插件仓库补 registry 与 GitHub Actions
  - 宿主后端补 official catalog / install-official
  - 设置页补官方安装区与 task polling
  - 最后推送仓库、打 tag、发布 GitHub Release 并做线上 smoke test
- 计划执行继续遵守用户当前偏好：直接在当前仓库推进，不使用 `git worktree`。
- sibling repo `../1flowbase-official-plugins` 的改动独立提交，但仍视为本专题同一轮工作的一部分。

## 关联文档

- `docs/superpowers/plans/2026-04-18-official-plugin-release-install.md`
- `docs/superpowers/specs/1flowbase/2026-04-18-official-plugin-release-install-design.md`
- `.memory/project-memory/2026-04-18-official-plugin-release-install-design-approved.md`
