---
memory_type: project
topic: 模型供应商主实例改为虚拟聚合实例
summary: 模型供应商的主实例不再指向某个真实子实例，而是改为供应商级固定存在的虚拟聚合实例；节点保存来源实例与模型标识，真实执行命中具体子实例。
keywords:
  - model-provider
  - main-instance
  - aggregation
  - source-instance
  - llm-node
match_when:
  - 需要实现或评估模型供应商主实例逻辑
  - 需要修改设置页模型供应商实例管理
  - 需要调整 LLM 节点模型选择合同
  - 需要修改模型供应商运行时解析方式
created_at: 2026-04-23 00
updated_at: 2026-04-23 00
last_verified_at: 2026-04-23 00
decision_policy: verify_before_decision
scope:
  - web/app/src/features/settings
  - web/app/src/features/agent-flow
  - web/packages/api-client
  - api/apps/api-server/src/routes/plugins_and_models/model_providers.rs
  - api/crates/control-plane/src/model_provider
  - api/crates/control-plane/src/orchestration_runtime
---

# 模型供应商主实例改为虚拟聚合实例

## 时间

`2026-04-23 00`

## 谁在做什么

- 用户明确要求重构模型供应商“主实例”语义。
- AI 负责把设置页、节点合同、后端接口和运行时解析统一到新的聚合模型上。

## 为什么这样做

- 现状的主实例本质上是“从真实子实例里挑一个作为解析目标”，会让设置页和运行时都把主实例误解成真实实例。
- 同一供应商下不同子实例存在同名模型时，当前节点合同无法表达来源实例。

## 为什么要做

- 让主实例回到“统一入口”的产品角色，只负责聚合模型，而不是承载真实执行。
- 让节点配置在多实例场景下能精确落到正确的真实实例。

## 截止日期

- 未指定

## 决策背后动机

- 主实例定义为供应商级固定存在的虚拟聚合实例，不保存密钥，不直接执行请求。
- 子实例才是真实模型供应商实例，仍负责配置、校验和执行。
- 主实例按实时派生聚合子实例模型，不做快照复制。
- 子实例只支持按整实例接入主实例，不支持按单模型粒度接入。
- 供应商级新增 `auto_include_new_instances` 默认规则；子实例新增 `included_in_main` 开关。
- LLM 节点保存 `provider_code + source_instance_id + model_id`。
- LLM 选择器按实例分组展示模型，但单个模型项只显示模型名。
- 实例被移出主实例后，已有节点保留旧值，由校验和运行时报错提示管理员调整。
- 当前项目阶段按开发初期处理，不做旧 `manual_primary` 兼容、迁移和回退逻辑。

## 关联文档

- `docs/superpowers/specs/2026-04-23-model-provider-main-instance-aggregation-design.md`
