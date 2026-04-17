---
memory_type: project
topic: agentflow node detail 配置区已按用户决策取消折叠板
summary: 用户已明确要求移除 node detail 配置区中的 `Inputs / Policy / Advanced` 折叠板，改为常驻 section 平铺展示；输出变量区继续保留为独立区块。
keywords:
  - agentflow
  - node detail
  - inspector
  - accordion
  - config section
match_when:
  - 后续继续调整 agentflow node detail 配置区结构
  - 需要判断 Inputs / Policy / Advanced 是否应继续使用折叠板
created_at: 2026-04-17 16
updated_at: 2026-04-17 16
last_verified_at: 2026-04-17 16
decision_policy: verify_before_decision
scope:
  - web/app/src/features/agent-flow/components/inspector
  - web/app/src/features/agent-flow/components/detail
  - web/app/src/features/agent-flow/_tests
---

# agentflow node detail 配置区已按用户决策取消折叠板

## 时间

`2026-04-17 16`

## 谁在做什么

- 用户在审看 agentflow 节点详情面板时，明确指出 `Inputs / Policy / Advanced` 这些折叠板不需要保留。
- AI 已按该决策把配置区改成常驻 section 平铺展示，并补了对应测试与校验。

## 为什么这样做

- 当前配置区字段量并不大，折叠交互增加了额外点击成本，也让信息结构显得更碎。
- 用户希望配置区更接近“输出变量”这类直接可见的区块式信息组织，而不是 accordion。

## 为什么要做

- 固定 node detail 第一版的配置层信息架构，避免后续实现继续回到折叠板方案。
- 让节点详情的配置阅读和编辑路径更直接，减少多层容器带来的理解负担。

## 截止日期

- 无硬截止；该决策自本轮实现后作为当前有效共识。

## 决策背后动机

- 第一版 node detail 以 authoring 优先，强调“看见即编辑”，不需要用折叠容器做渐进式披露。
- 输出变量仍保留独立区块，因为它承担的是只读结果契约展示，不与配置字段混排。

## 关联文档

- `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
- `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
