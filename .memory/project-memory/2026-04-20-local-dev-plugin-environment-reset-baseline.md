---
memory_type: project
topic: 本地插件开发环境在协议切换后直接重置，不做旧安装兼容
summary: 自 `2026-04-20 15` 起，当前 1flowbase 本地开发环境在 provider 插件协议升级后，若已安装插件包与宿主不兼容，优先直接清空开发数据库、Redis 会话与插件安装目录并重建空白环境，不再为旧安装包做兼容处理。
keywords:
  - plugin
  - provider_package
  - reset
  - local development
  - environment
match_when:
  - 本地开发环境因旧 provider 插件包与新宿主协议不兼容而报错
  - 需要判断是兼容迁移旧安装，还是直接重置开发环境
  - 需要恢复 `/settings/model-providers` 等依赖插件安装记录的本地页面
created_at: 2026-04-20 15
updated_at: 2026-04-20 15
last_verified_at: 2026-04-20 15
decision_policy: verify_before_decision
scope:
  - scripts/node/dev-up/core.js
  - api/apps/api-server/src/lib.rs
  - /tmp/1flowbase-plugin-installed
---

# 本地插件开发环境在协议切换后直接重置，不做旧安装兼容

## 时间

`2026-04-20 15`

## 谁在做什么

- 用户在排查 `/settings/model-providers` 相关接口因 `provider_package` 报错后，明确要求“直接给我重置了一个新的工作环境，不需要兼容旧的了”。
- AI 按本地开发环境处理：停止后端、清空开发数据库、清 Redis 会话、删除插件安装目录，并重新启动后端服务。

## 为什么这样做

- 当前报错由旧格式已安装插件包与新宿主协议不兼容引起，不是外部模型服务兼容问题。
- 这是本地开发环境，不需要保留旧安装记录或做迁移补丁。
- 直接 reset 比继续兼容旧包更快，也更符合当前开发目标。

## 为什么要做

- 恢复本地控制台和模型供应商设置页的可用性。
- 让后续开发、安装和验证都基于干净的空白环境进行。

## 截止日期

- 无

## 决策背后动机

- 在本地开发态，优先降低状态污染和历史安装包干扰。
- 当插件协议已变更时，把“干净基线”作为默认修复策略，而不是延续旧兼容链路。
