---
memory_type: feedback
feedback_category: repository
topic: LLM 参数说明归插件 schema 且可选采样参数默认不启用
summary: LLM 节点参数字段的说明 tooltip 应来自插件 `parameter_form.fields[*].description`，宿主只负责通用展示；`top_p` 这类可选采样参数不应因为有默认值就默认开启，除非插件明确有强需求。
keywords:
  - agent-flow
  - llm
  - parameter_form
  - field description
  - tooltip
  - enabled_by_default
  - top_p
match_when:
  - 调整 LLM 节点参数表单说明
  - 调整 provider parameter_form 字段
  - 讨论参数默认开启策略
created_at: 2026-04-24 16
updated_at: 2026-04-24 16
last_verified_at: 2026-04-24 16
decision_policy: direct_reference
scope:
  - web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx
  - ../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/provider/openai_compatible.yaml
---

# LLM 参数说明归插件 schema 且可选采样参数默认不启用

## 规则

- LLM 节点参数字段说明应由插件在 `parameter_form.fields[*].description` 中提供。
- 宿主前端只负责把 `description` 渲染为字段旁的小问号 tooltip，不内置 Temperature、Top P 等 provider 参数解释。
- `top_p`、`temperature`、`max_tokens`、`seed` 等 `send_mode: optional` 参数默认不应开启；有默认值只代表控件默认显示值，不代表默认透传给供应商。

## 原因

- 参数语义属于供应商/插件协议，宿主内置解释会重新制造 provider 差异耦合。
- 可选参数默认开启会让用户误以为未配置时也会主动影响模型调用，和“开启后才透传”的节点配置心智不一致。

## 适用场景

- 修改模型供应商插件 `parameter_form`
- 调整 LLM 节点参数表单的 tooltip、说明、默认开启状态
- 审查官方插件参数 schema 是否符合宿主通用渲染边界
