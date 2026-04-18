# Plugin CLI Demo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主仓库内提供第一版宿主侧 `plugin CLI`，支持 `plugin init`、`plugin demo init <plugin-path>` 和 `plugin demo dev <plugin-path>`，并沿用现有 `scripts/node` 脚本体系。

**Architecture:** 本轮不引入新的 Rust CLI 或 TypeScript 运行链，而是复用仓库现有 `scripts/node/*.js` + `core.js` + `node:test` 模式实现一个 CommonJS CLI。`plugin init` 负责生成 provider 插件源码骨架，`plugin demo init` 负责向插件仓生成可直接本地调试的静态 demo 页面，`plugin demo dev` 负责用 Node 内建 HTTP server 提供该 demo；真实 `plugin-runner` debug runtime 握手暂不在本轮落地，只保留 runner URL 配置位与后续接线边界。

**Tech Stack:** Node.js CommonJS scripts under `scripts/node`, built-in `node:test`, `node:http`, `node:fs`, root README docs

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md`, `docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md`

**Execution Note:** 当前仓库的统一脚本风格是 `scripts/node/<name>.js` 包装 `scripts/node/<name>/core.js`。本计划遵守该约定，不新增仓库根 `package.json`，不把 CLI 直接放入 provider 插件仓库。

**Out Of Scope:** 真正的 provider package 打包、`plugin-runner` `load / invoke / stream` 闭环、debug runtime 协议、跨平台二进制分发、独立 CLI 仓库拆分

---

## File Structure

- Create: `scripts/node/plugin.js`
  - `plugin CLI` 入口脚本，负责分发 `init` / `demo init` / `demo dev`
- Create: `scripts/node/plugin/core.js`
  - CLI 参数解析、脚手架生成、demo 静态服务和模板渲染
- Create: `scripts/node/plugin/_tests/core.test.js`
  - 覆盖 `plugin init`、`plugin demo init`、`plugin demo dev` 的核心行为
- Modify: `README.md`
  - 增加主仓 `plugin CLI` 使用说明
- Modify: `docs/superpowers/plans/2026-04-18-plugin-cli-demo-scaffold.md`
  - 执行过程中同步勾选状态

## Task 1: Build The CLI Shell And `plugin init`

- [x] 写失败测试：`plugin init` 会生成 provider 仓骨架，并拒绝覆盖已有非空目录
- [x] 运行定向测试，确认因为脚本不存在而失败
- [x] 实现 `scripts/node/plugin.js` 和 `scripts/node/plugin/core.js` 的 CLI 分发与 `plugin init`
- [x] 重新运行定向测试，确认通过

## Task 2: Build `plugin demo init`

- [x] 写失败测试：`plugin demo init <plugin-path>` 会在目标插件目录下生成 `demo/` 静态页面、`scripts/` 本地辅助脚本和最小 demo 配置
- [x] 运行定向测试，确认因为模板尚未生成而失败
- [x] 实现 demo 模板输出，保证页面包含 provider instance、validate、list models、prompt/stream、tool call/MCP、usage/token 六个区域
- [x] 重新运行定向测试，确认通过

## Task 3: Build `plugin demo dev` And Docs

- [x] 写失败测试：`plugin demo dev <plugin-path>` 能启动本地静态服务并返回可访问 URL；目标缺少 demo 时给出正式错误
- [x] 运行定向测试，确认失败
- [x] 实现 Node 内建静态服务器、端口参数和 runner URL 配置位
- [x] 更新 `README.md` 中的使用示例和当前能力边界说明
- [x] 运行 `node --test scripts/node/plugin/_tests/core.test.js` 验证脚本行为
- [x] 运行 `git diff --check` 做文本校验
