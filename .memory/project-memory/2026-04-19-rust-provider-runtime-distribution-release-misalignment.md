---
memory_type: project
topic: Rust provider runtime 分发链当前存在 host 与 official release 面不一致
summary: 自 `2026-04-19 23` 起，`1flowbase` host 代码已按 schema v2 executable runtime 与 `artifacts[]` 官方 registry 结构实现，但 `1flowbase-official-plugins` 的远端 `origin/main` 仍发布旧的 flat registry 与 Node.js `runner.entrypoint` manifest；本地 sibling repo 另有 2 个未推送提交完成 Rust 迁移和多 artifact 发布脚本，导致“host 已升级、官方发布面未升级”的链路错位。
keywords:
  - rust-provider
  - runtime-distribution
  - official-registry
  - artifacts
  - openai_compatible
  - plugin-runner
  - source-tree
match_when:
  - 用户说 Rust provider 计划已完成但访问供应商报错
  - 需要判断是 host 接口问题还是 official plugin 仓库/发布面未同步
  - 需要排查 openai_compatible 在本地源码树与官方 registry 之间的契约不一致
created_at: 2026-04-19 23
updated_at: 2026-04-19 23
last_verified_at: 2026-04-19 23
decision_policy: verify_before_decision
scope:
  - api/apps/api-server/src/official_plugin_registry.rs
  - api/apps/plugin-runner/src/package_loader.rs
  - api/apps/api-server/src/config.rs
  - ../1flowbase-official-plugins
---

# Rust provider runtime 分发链当前存在 host 与 official release 面不一致

## 时间

`2026-04-19 23`

## 谁在做什么

- 用户在确认 `docs/superpowers/plans/2026-04-19-rust-provider-plugin-runtime-distribution.md` 已完成后，发现访问模型供应商仍然报错。
- AI 对照 host 仓库、sibling 官方插件仓库、本地与远端 git 状态，以及 focused tests，定位实际不一致点。

## 为什么这样做

- 该问题不是单点实现缺失，而是 host、源码仓、官方 registry、发布产物之间的链路一致性问题。
- 若不记录，会在后续类似报错排查时重复怀疑 host 接口而忽略实际发布面错位。

## 为什么要做

- 当前 host 代码要求官方 registry 提供 `artifacts[]`，并要求插件运行时来自已安装/解包后的 artifact，而不是源码目录。
- 当前 `origin/main` 的 `1flowbase-official-plugins` 仍是旧的 flat registry 和 Node.js provider manifest，无法直接满足 host 运行时契约。

## 截止日期

- 未指定

## 决策背后动机

- `api/apps/api-server/src/official_plugin_registry.rs` 现在只从 `artifacts[]` 里按 host target 选择安装包；旧 registry 的顶层 `download_url/checksum` 不再被消费。
- `api/apps/plugin-runner/src/package_loader.rs` 会拒绝带 `demo/` 或 `scripts/` 的源码树，要求加载已安装或解包后的 artifact。
- 本地 `../1flowbase-official-plugins` 有 2 个未推送提交：
  - `8e76557 chore: publish multi-target official provider assets`
  - `4220e08 feat: migrate openai_compatible provider to rust`
- 远端 `origin/main` 仍保留：
  - flat `official-registry.json`
  - `models/openai_compatible/manifest.yaml` 中的 `runner.language: nodejs` / `runner.entrypoint`
- 因此现阶段如果使用默认官方 registry，会出现 host 端无法选出 artifact；如果直接把本地 `models/openai_compatible` 源码目录喂给 `plugin-runner`，又会被源码树保护拒绝。
