---
memory_type: project
topic: 官方 provider 插件 GitHub Release 安装闭环已执行完成
summary: 自 `2026-04-18 20` 起，官方 provider 插件的五段实施计划已全部执行完成。主仓库已落地 `plugin package`、后端 `official-catalog / install-official`、设置页官方安装区；sibling repo `../1flowbase-official-plugins` 已落地官方 registry 与 release workflow，并发布 `openai_compatible-v0.1.0`。本地宿主 smoke test 已验证官方 catalog 可见、release asset 可下载、`install-official` 可返回 `201` 并把插件分配到当前 workspace。
keywords:
  - official-plugin
  - execution-complete
  - github-release
  - official-registry
  - install-official
  - smoke-test
match_when:
  - 需要确认官方 provider 插件 GitHub Release 安装链路是否已真正打通
  - 需要继续在 official marketplace / install-official 基础上迭代
  - 需要复用本轮 release tag、asset checksum 或 smoke test 结果
created_at: 2026-04-18 20
updated_at: 2026-04-18 20
last_verified_at: 2026-04-18 20
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-18-official-plugin-release-install.md
  - .memory/project-memory/2026-04-18-official-plugin-release-install-plan-stage.md
  - scripts/node/plugin/core.js
  - ../1flowbase-official-plugins
  - api/apps/api-server/src/routes/plugins.rs
  - api/crates/control-plane/src/plugin_management.rs
  - web/app/src/features/settings/pages/SettingsPage.tsx
---

# 官方 provider 插件 GitHub Release 安装闭环已执行完成

## 完成状态

- 主仓库已完成三次功能提交：
  - `feat: add provider plugin package command`
  - `feat: install official plugins from release assets`
  - `feat: add official provider install panel`
- 官方插件 sibling repo `../1flowbase-official-plugins` 已完成一次功能提交：
  - `feat: automate official plugin releases`
- 官方 release tag `openai_compatible-v0.1.0` 已创建并推送，GitHub Release 已发布 `.1flowbasepkg` 资产：
  - `1flowbase@openai_compatible@0.1.0@72384b58abe31a26892cb0c40917286cc1de290fa54304ee3b812e8d6794eb0d.1flowbasepkg`

## 关键验证

- 官方 release 下载验证通过：
  - `gh release view openai_compatible-v0.1.0 --repo taichuy/1flowbase-official-plugins` 可见 release 与 asset
  - `gh release download ... --dir /tmp/official-plugin-smoke` 成功下载 `.1flowbasepkg`
- 宿主后端 smoke test 通过：
  - 首次请求命中过旧 `api-server` 进程，重启 `node scripts/node/dev-up.js restart --backend-only` 后恢复为新代码版本
  - `GET /api/console/plugins/official-catalog` 返回 `200`，安装前 `install_status=not_installed`
  - `POST /api/console/plugins/install-official` 返回 `201`
  - installation 结果包含：
    - `source_kind=official_registry`
    - `verification_status=valid`
    - `checksum=sha256:72384b58abe31a26892cb0c40917286cc1de290fa54304ee3b812e8d6794eb0d`
  - assign task 直接终态：
    - `task_kind=assign`
    - `status=success`
  - 安装后二次读取：
    - `GET /api/console/plugins/official-catalog` 返回 `install_status=assigned`
    - `GET /api/console/plugins/catalog` 返回 `assigned_to_current_workspace=true`
- 前端设置页验证通过：
  - Task 4 的定向 Vitest、style-boundary check、`web/app build` 全部通过
  - 全量 `pnpm --dir web test` 在高并发下仍存在一条既有 `agent-flow` 超时噪音：`src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
  - 上述失败单独重跑通过，因此本轮设置页官方安装区改动没有形成稳定回归

## 后续迭代入口

- 可在当前闭环上继续增加版本选择、升级治理、更多官方 provider 条目，以及更正式的签名校验链路。
- 若后续 smoke test 再次命中 `404 official-catalog/install-official`，优先检查本地 `api-server` 是否已重启到当前代码版本。
