---
memory_type: project
topic: agentflow 节点详情 tabs 固定放在简介下方
project_memory_state: implemented
summary: 用户明确要求节点详情中的 `设置 / 上次运行` tabs 不要与头部并排，需在标题与简介之后开始；当前实现已通过修正 detail body 的纵向布局，让 tabs 与内容区整体落到简介下面。
keywords:
  - agentflow
  - node detail
  - tabs
  - description
  - layout
match_when:
  - 后续继续调整 agentflow node detail 头部与 tabs 的层级
  - 需要判断 `设置 / 上次运行` tabs 应在标题右侧还是简介下方
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: verify_before_decision
scope:
  - web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx
  - web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx
  - web/app/src/features/agent-flow/components/editor/agent-flow-editor.css
---

# agentflow 节点详情 tabs 固定放在简介下方

## 时间

`2026-04-17 23`

## 谁在做什么

- 用户在审看 schema ui 已迁移后的节点详情界面时，指出 `设置 / 上次运行` tabs 被顶到了头部右侧内容区域附近，视觉和层级都不对。
- AI 已定位到 detail body 仍按横向 flex 排列，并完成布局修正。

## 为什么这样做

- 节点详情头部当前承担的是 L1 聚焦信息：节点身份、主操作、简介。
- `设置 / 上次运行` 属于后续内容切换，不应该与头部主信息竞争首屏层级，也不应该从视觉上切断“标题 -> 简介”的阅读路径。

## 为什么要做

- 固定 node detail 的信息深度顺序：标题与操作 -> 简介 -> tabs -> 配置/运行内容。
- 避免后续继续在 schema runtime 或 overlay shell 调整时，把 tabs 再次错误放回头部横向区域。

## 截止日期

- 无

## 决策背后动机

- `设置 / 上次运行` tabs 仍保留为 detail 主内容切换入口，但位置下沉到简介之后。
- 本轮不改 schema 合同和 header block，只修正 detail body 的容器方向，保持实现最小且不打散当前 schema runtime 分层。
