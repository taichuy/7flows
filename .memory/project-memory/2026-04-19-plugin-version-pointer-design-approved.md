---
memory_type: project
topic: 插件版本决策上提为全局插件层并先接入模型供应商页面
summary: 自 `2026-04-19 10` 起，用户已明确插件版本切换不应只属于 `/settings/model-providers`，而应上提为全局插件层 contract；当前轮次只实现通用后端能力与 `model-providers` 第一份消费表面，通用插件版本管理页面后置到下一轮。版本语义固定为“插件是指针”：升级到 `latest` 直接使用 `latest`，回退仅允许切回本地已安装旧版本，且该供应商下全部实例一起切换到目标版本。
keywords:
  - plugin-version
  - plugin-pointer
  - global-plugin-management
  - model-providers
  - switch-version
  - latest-upgrade
  - local-rollback
match_when:
  - 需要继续实现插件版本切换
  - 需要判断版本决策是全局插件能力还是模型供应商特有能力
  - 需要确认升级 latest 与本地回退的正式语义
  - 需要知道通用插件版本页面是否属于当前轮次
created_at: 2026-04-19 10
updated_at: 2026-04-19 10
last_verified_at: 2026-04-19 10
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-19-plugin-version-switch-design.md
  - api/crates/control-plane/src/plugin_management.rs
  - api/crates/control-plane/src/model_provider.rs
  - web/app/src/features/settings/pages/SettingsPage.tsx
---

# 插件版本决策上提为全局插件层并先接入模型供应商页面

## 时间

`2026-04-19 10`

## 谁在做什么

- 用户明确拍板：插件版本管理应适用于全局插件，而不是只适用于模型供应商页面。
- AI 已据此产出正式设计稿，并把当前轮次范围收口为“通用后端能力 + `model-providers` 第一份消费表面”。

## 为什么这样做

- 当前版本切换如果只做在 `/settings/model-providers`，后续其他插件类型仍会重复造一套“当前版本 / latest / 回退”语义。
- 插件安装、启用、分配原本就属于全局插件生命周期，版本决策必须与这套状态机在同一层维护。

## 为什么要做

- 让“当前 workspace 这个供应商正在用哪个插件版本”拥有单一真值。
- 让升级到 `latest` 与回退到本地旧版本共享同一套后端 contract、任务和审计。

## 截止日期

- 无

## 决策背后动机

- 当前轮次固定采用“插件是指针”语义：
  - 下载 `latest` 后，当前 workspace 下该供应商直接使用 `latest`
  - 回退只允许切回本地已安装旧版本
  - 本地没装过的旧版本不支持直接下载回退
  - 同一供应商下全部实例一起迁移到目标插件版本
- 切版本后：
  - 不把实例直接打成 `invalid`
  - 但模型目录缓存必须失效
  - 页面必须提示建议刷新模型并验证关键实例
- 当前轮次明确不做：
  - 通用插件版本管理页面
  - 官方历史版本在线下载
  - 旧版本删除/清理入口

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-19-plugin-version-switch-design.md`
