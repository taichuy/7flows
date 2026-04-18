---
memory_type: project
topic: 官方 provider 插件发布与安装页方向已确认
summary: 用户于 `2026-04-18 20` 确认：本轮模型供应商后续工作要把“官方插件打包发布”和“宿主安装页”一起推进；正式安装对象固定为 `GitHub Release asset`，产物格式固定为 `.1flowbasepkg`，安装页第一版只指向官方仓库，不开放自定义 GitHub 仓库，官方列表来源固定为稳定索引 `official-registry.json`，安装主动作固定为“安装到当前 workspace”，内部仍串行执行 `install -> enable -> assign`。
keywords:
  - official-plugin
  - github-release
  - 1flowbasepkg
  - official-registry
  - settings
  - install-page
match_when:
  - 需要继续实现官方 provider 插件的打包发布链路
  - 需要实现设置页官方插件安装区
  - 需要判断 GitHub 安装入口应该拉源码还是拉 Release asset
  - 需要回看官方仓库、官方索引和宿主安装接口之间的边界
created_at: 2026-04-18 20
updated_at: 2026-04-18 20
last_verified_at: 2026-04-18 20
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-18-official-plugin-release-install-design.md
  - ../1flowbase-official-plugins
  - scripts/node/plugin.js
  - api/apps/api-server/src/routes/plugins.rs
  - api/crates/control-plane/src/plugin_management.rs
  - web/app/src/features/settings/pages/SettingsPage.tsx
---

# 官方 provider 插件发布与安装页方向已确认

## 时间

`2026-04-18 20`

## 谁在做什么

- 用户要求把“插件打包出来”和“安装页面”一起推进，而不是只做产物不做宿主安装入口。
- AI 已与用户完成方向收口，并把该专题落成新的设计稿，准备进入 implementation plan。

## 为什么这样做

- 如果只做本地 `package_root` 安装，用户看不到官方插件线上交付效果，也无法验证“从官方来源安装”的真实产品体验。
- 如果安装页先做成“任意 GitHub 仓库安装”，会把边界从“官方产物安装”直接扩展成“通用市场”，范围明显超出当前轮次。

## 为什么要做

- 让 `openai_compatible` 从本地参考插件升级为可发布、可下载、可安装的第一份官方 provider 插件。
- 给后续 marketplace 留下稳定基线：`official-registry.json`、`GitHub Release asset`、宿主 official catalog 和一键安装入口。

## 截止日期

- 无

## 决策背后动机

- 正式安装对象固定为 `GitHub Release asset`，不是源码仓库，也不是宿主现场拉源码打包。
- 产物格式固定为 `.1flowbasepkg`，允许第一版内部仍为压缩包实现，但产品和接口口径必须先固定。
- `plugin CLI` 的打包 source of truth 继续放主仓库，官方插件仓库通过 GitHub Actions 调用它，不复制独立 pack 脚本。
- 官方插件列表不直接以 GitHub API 为产品契约，而是由官方仓库维护稳定索引 `official-registry.json`。
- 设置页第一版只指向官方仓库来源，不开放自定义 GitHub 仓库输入。
- 安装页主动作固定为“安装到当前 workspace”，内部仍串行执行 `install -> enable -> assign`，不把内部生命周期直接暴露给用户。
- 第一版只展示每个官方插件的 `latest` 版本；签名先不做真实服务，`signature_status` 固定为 `unsigned`，但 `sha256` 必须校验。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-18-official-plugin-release-install-design.md`
- `docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md`
