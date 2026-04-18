---
memory_type: project
topic: Dify 编排 DSL 与复制实现可作为 1Flowbase 导入导出设计参照
summary: 对照 `../dify` 当前代码后，已确认 Dify 的 workflow 持久化以整份 graph 文档为核心，导入导出围绕 DSL 合同，应用复制本质是 `export DSL + import DSL`，节点复制则是前端 graph 层局部复制与 ID 重映射。
keywords:
  - dify
  - workflow
  - dsl
  - import
  - export
  - copy
  - authoring-document
match_when:
  - 需要为 1Flowbase 设计编排导入导出能力
  - 需要判断节点复制是否必须做后端节点级 API
  - 需要参考 Dify 的 workflow graph 持久化与复制方式
created_at: 2026-04-15 19
updated_at: 2026-04-15 19
last_verified_at: 2026-04-15 19
decision_policy: verify_before_decision
scope:
  - ../dify/api/models/workflow.py
  - ../dify/api/services/app_dsl_service.py
  - ../dify/api/controllers/console/app/app.py
  - ../dify/web/app/components/workflow/hooks/use-nodes-interactions.ts
  - ../dify/web/app/components/workflow/nodes/_base/components/panel-operator/panel-operator-popup.tsx
  - web/packages/flow-schema/src/index.ts
  - api/crates/control-plane/src/flow.rs
---

# Dify 编排 DSL 与复制实现可作为 1Flowbase 导入导出设计参照

## 时间

`2026-04-15 19`

## 谁在做什么

在评估 1Flowbase `04` 编排模型是否会阻塞后续“导入导出、应用复制、节点复制”能力时，对照核查了本地 `../dify` 的 workflow 真值代码与前端复制逻辑。

## 看到的事实

1. Dify 后端不是把 workflow 节点拆成多张业务表，而是把整份 graph JSON 持久化在 `workflows.graph`，同时把 `features`、`environment_variables`、`conversation_variables` 作为同一 workflow 版本的配套配置保存。
2. Dify 的导入导出不是直接做数据库级搬运，而是围绕一份 DSL 合同：顶层含 `version`、`kind`、`app`，workflow 场景下包含 `workflow` 与 `dependencies`。
3. Dify 的应用复制接口不是单独维护一套“深拷贝 App”逻辑，而是服务端先 `export_dsl(include_secret=True)`，再立即 `import_app(...)` 创建新应用。
4. Dify 的节点复制不是后端 API，而是前端把当前 clipboard 中的节点做局部 graph 复制，重建 node id、子容器节点与内部 edge，再同步整份 draft。

## 为什么这样做

1. 这样可以把“编辑态真相”固定为可迁移、可序列化的文档合同，而不是数据库表结构本身。
2. 导入、导出、应用复制三类需求都可复用同一份文档合同与校验路径，避免出现三套不一致逻辑。
3. 节点复制保留在前端 graph 变换层，可以避免过早设计节点级后端 API，并保持编辑器交互足够灵活。

## 对 1Flowbase 当前决策的影响

1. 1Flowbase 当前 `Authoring Document` 作为编辑态真相的方向没有问题，后续导入导出与复制能力不要求先把节点拆表。
2. 后续应优先定义稳定的“外部 DSL / 导出合同”，再让应用复制复用该合同；不要让 `Compiled Plan` 反向承担导入导出格式。
3. 节点复制优先做前端本地 graph 复制与 ID 重映射；只有未来出现多人协同、操作日志回放或服务端审计要求时，再考虑节点级后端操作接口。

