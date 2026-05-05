---
memory_type: feedback
feedback_category: repository
topic: provider-static-model-label-contract
summary: 官方 provider 插件的静态模型 YAML 输入字段固定使用 label，display_name 只属于宿主运行时/接口输出，不应写进 models/llm/*.yaml。
keywords:
  - official-plugins
  - model-provider
  - static-model-yaml
  - label
  - display_name
  - provider-package
  - contract-gate
match_when:
  - 新增或修改官方 model provider 插件静态模型文件
  - 排查 provider package loader 与模型 DTO 字段命名差异
  - 维护 ../1flowbase-official-plugins 的 models/llm 契约门禁
created_at: 2026-05-05 16
updated_at: 2026-05-05 16
last_verified_at: 2026-05-05 16
decision_policy: direct_reference
scope:
  - ../1flowbase-official-plugins/runtime-extensions/model-providers
  - api/crates/plugin-framework/src/provider_package.rs
  - scripts/node/plugin/manifest.js
---

# Provider 静态模型 YAML 字段边界

## 时间

`2026-05-05 16`

## 规则

官方 provider 插件的静态模型描述文件 `models/llm/*.yaml` 必须使用宿主 loader 输入 schema：顶层 `model`、`label`、`family` 等字段；顶层禁止写 `display_name`。

`display_name` 仍然可以存在于宿主运行时 DTO / API 输出以及 provider 自身展示元数据中，但不能作为静态模型 YAML 的输入字段。

## 原因

`api/crates/plugin-framework/src/provider_package.rs` 反序列化 `RawModelDescriptor.label`，再映射成运行时 `ProviderModelDescriptor.display_name`。因此字段语义是：

- 插件静态 YAML 输入：`label`
- 宿主运行时 / 接口输出：`display_name`

这次 Deepseek provider 字段误用的根因不是 CLI 模板错误，也不是宿主应兼容 `display_name`，而是官方 provider 插件文档 / skill / CI gate 没有承载这条静态模型 YAML contract。

## 适用场景

- 新增 Deepseek、OpenAI-compatible 或其他官方 provider 的静态模型描述。
- 编写官方 provider 插件计划、README、skill 或 contract test。
- 判断是否要让 host loader 兼容静态 YAML 顶层 `display_name`。

## 备注

当前优先级最高的修复方式是 `../1flowbase-official-plugins` 加通用 CI gate，扫描 `runtime-extensions/model-providers/*/models/llm/*.yaml`，强制 `model + label`，禁止顶层 `display_name`，并检查 `_position.yaml` 引用文件存在。
