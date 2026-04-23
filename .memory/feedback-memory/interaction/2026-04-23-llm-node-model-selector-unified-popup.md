---
memory_type: feedback
feedback_category: interaction
topic: LLM 节点模型选择应采用单入口弹层并合并参数编辑
summary: 用户希望 LLM 节点参考 `../dify`，将“大语言模型选择 + 参数编辑”合成一个点击即开的统一弹层，避免当前“供应商下拉 + 设置按钮 + 独立参数区”三段式交互。
keywords:
  - interaction
  - agent-flow
  - llm
  - model selector
  - popup
  - parameters
  - dify
match_when:
  - 调整 agent-flow 的 LLM 节点交互
  - 需要决定模型选择与参数编辑是分开还是合并
  - 用户提到参考 `../dify` 的 LLM 节点交互
created_at: 2026-04-23 08
updated_at: 2026-04-23 08
last_verified_at: 2026-04-23 08
decision_policy: direct_reference
scope:
  - web/app/src/features/agent-flow/components/detail/fields
  - web/app/src/features/agent-flow/schema
  - 前端交互设计
---

# LLM 节点模型选择应采用单入口弹层并合并参数编辑

## 时间

`2026-04-23 08`

## 规则

- LLM 节点里的大语言模型选择，优先使用单个触发器打开统一弹层或浮层。
- 弹层内应同时承载模型选择与参数编辑，不再拆成“供应商下拉 + 设置按钮 + inspector 里独立参数区”三段式。
- 模型选择区域需要体现供应商与主实例聚合关系，但节点保存结构仍保持 `provider_code + source_instance_id + model_id`。

## 原因

- 当前三段式交互把一次完整配置动作拆散了，用户需要在多个位置来回切换，路径不直观。
- 参考 `../dify` 的交互更符合“先选大语言模型，再顺手改参数”的连续心智。
- 当前项目已经把主实例定义为供应商级聚合视图，界面上应该体现这种聚合关系，但不能丢失实际来源实例。

## 适用场景

- agent-flow 的 LLM 节点模型选择器改版。
- 需要重构模型选择、参数编辑和响应格式等相邻配置入口时。
- 其他 provider-aware 节点未来需要设计“模型 + 参数”统一配置入口时。
