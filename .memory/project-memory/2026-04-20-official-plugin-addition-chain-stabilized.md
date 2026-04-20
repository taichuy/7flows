---
memory_type: project
topic: 官方插件新增链路已收口到脚手架、CI 打包发现与 registry 中文展示
summary: 自 `2026-04-20 00` 起，官方插件新增链路的本轮修复已明确落在两仓协同：主仓 `scripts/node/plugin` 初始化脚手架默认生成 `en_US + zh_Hans` i18n 模板；官方插件仓 `provider-ci` 改为自动发现 `models/*/manifest.yaml` 并从 manifest runtime executable 解析二进制名；`openai_compatible` 的 `zh_Hans.provider.label` 与 `official-registry.json` 已回正，避免 official catalog 拉取后仍显示英文 provider 名。
keywords:
  - official-plugin
  - packaging
  - official-registry
  - i18n
  - workflow
  - scaffold
match_when:
  - 需要继续推进新增官方插件的发布流程
  - 需要排查 official catalog 拉取后文案或安装链路异常
  - 需要确认 host plugin scaffold 现在默认产出哪些 i18n 文件
created_at: 2026-04-20 00
updated_at: 2026-04-20 00
last_verified_at: 2026-04-20 00
decision_policy: verify_before_decision
scope:
  - scripts/node/plugin
  - .memory/project-memory
  - ../1flowbase-official-plugins/.github/workflows
  - ../1flowbase-official-plugins/scripts
  - ../1flowbase-official-plugins/models/openai_compatible
  - ../1flowbase-official-plugins/official-registry.json
---

# 官方插件新增链路已收口到脚手架、CI 打包发现与 registry 中文展示

## 时间

`2026-04-20 00`

## 谁在做什么

- 主仓在收口 host 侧插件脚手架，保证新增 provider 从初始化开始就带上中英文 i18n 基线。
- 官方插件仓在收口 CI / release workflow，避免新增 provider 后还要手改 workflow matrix 或二进制名假设。

## 为什么这样做

- 现状问题不是单点接口 bug，而是“新增插件后多处链路默认只对已有 `openai_compatible` 成立”。
- 如果不把脚手架、workflow 发现逻辑和 registry 文案一起修，后续新增第二个 provider 仍会重复踩坑。

## 为什么要做

- 本阶段优先级已切到“新增官方插件能正确打包、发布、拉取、展示、安装”。
- official catalog 的显示体验受 registry i18n 直接影响，不能继续允许 `zh_Hans` 下 provider 名回退英文。

## 截止日期

- 无硬截止日期；作为当前官方插件扩展阶段的基础能力，应在继续新增 provider 前保持成立。

## 决策背后动机

- 先修“通用链路是否支持新增插件”，再考虑新增具体 provider；否则每加一个插件都要临时补 workflow 和展示逻辑。
- 保持后端/前端 i18n contract 不变，优先修正官方插件仓的源数据和打包流程，而不是把显示问题继续下沉给消费端兜底。

## 关联文档

- `scripts/node/plugin/core.js`
- `../1flowbase-official-plugins/.github/workflows/provider-ci.yml`
- `../1flowbase-official-plugins/.github/workflows/provider-release.yml`
- `../1flowbase-official-plugins/scripts/list-provider-package-targets.mjs`
