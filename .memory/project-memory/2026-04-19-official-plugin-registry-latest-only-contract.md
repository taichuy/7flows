---
memory_type: project
topic: 官方插件目录 latest-only 契约
summary: `official-registry.json` 与主项目 `official plugin catalog` 接口统一采用 latest-only 契约：每个 `provider_code` 只保留一个官方最新版条目；本地多版本只允许出现在版本管理视图，不允许出现在官方安装目录。
keywords:
  - plugin
  - official-registry
  - provider_code
  - latest_version
  - update
  - official catalog
match_when:
  - 需要调整官方插件目录展示
  - 需要判断供应商是否可升级
  - 需要维护 official-registry.json
  - 需要区分官方目录与本地版本管理职责
created_at: 2026-04-19 16
updated_at: 2026-04-19 16
last_verified_at: 2026-04-19 16
decision_policy: verify_before_decision
scope:
  - api
  - web
  - plugin registry
---

# 官方插件目录 latest-only 契约

## 时间

`2026-04-19 16`

## 谁在做什么

- 用户在修正模型供应商安装页的数据契约，要求官方安装目录只显示每个供应商的一个最新版。
- AI 需要同时收口主项目接口与 `1flowbase-official-plugins` 仓库中的 registry 生成规则。

## 为什么这样做

- 安装页的职责是“从当前官方源安装最新版并提醒可升级”，不是展示官方历史版本。
- 如果同一 `provider_code` 在官方目录里同时出现多个版本，前端会被迫猜测哪个是最新版本，导致“当前已是最新版本”与升级提示失真。
- 如果把其它产品线条目混进 `1flowbase-official-plugins` 的 registry，会直接污染 1flowbase 的官方安装目录。

## 为什么要做

- 固定 `official-registry.json` 的输出契约，避免后续再出现 `0.1.0` 与 `0.2.0` 同时出现在同一供应商官方目录里的问题。
- 让“当前安装版本 vs 官方最新版本”的判断在后端和前端保持一致。

## 截止日期

- 未指定

## 决策背后动机

- `official-registry.json` 只允许每个 `provider_code` 保留一个条目，且该条目必须是当前官方最新版本。
- `official plugin catalog` 接口只返回 latest-only 结果，不返回官方历史版本。
- 本地已安装的多个版本只允许出现在“版本管理 / 回退”视图，不允许出现在官方安装目录。
- `1flowbase-official-plugins` registry 不允许混入 `1flowse.*` 等其它产品线条目；遇到同 `provider_code` 新发布时，应清掉旧条目与外来条目。
