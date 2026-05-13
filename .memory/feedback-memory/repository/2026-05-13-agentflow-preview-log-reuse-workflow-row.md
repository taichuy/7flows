---
memory_type: feedback
feedback_category: repository
topic: agentflow_preview_log_reuse_workflow_row
summary: Agent Flow 对话日志追踪列表应复用预览工作流节点行组件，避免另写一套相似节点列表 UI。
keywords:
  - agent-flow
  - preview
  - conversation-log
  - trace
  - workflow-row
match_when:
  - 修改 Agent Flow 预览工作流、对话日志追踪、节点运行追踪列表
  - 在预览与日志中展示同一批运行节点
created_at: 2026-05-13 12
updated_at: 2026-05-13 12
last_verified_at: 无
decision_policy: direct_reference
scope:
  - web/app/src/features/agent-flow/components/debug-console
---

# Agent Flow 日志追踪复用工作流节点行

## 时间

`2026-05-13 12`

## 规则

Agent Flow 对话日志的追踪节点列表，应复用预览消息里的工作流节点行 UI，不要另写一套外观相似的节点按钮列表。

## 原因

用户明确指出日志追踪列表应该复用右侧预览里的节点行组件。两处展示的是同一类运行节点，独立实现会导致视觉、状态、图标、耗时和节点类型表达漂移。

## 适用场景

- 修改 `DebugWorkflowProcess`、`ConversationLogPanel` 或相关追踪节点列表。
- 新增运行追踪、节点运行明细、预览日志等同类节点执行列表。

## 备注

测试应覆盖日志追踪列表实际渲染共享的 workflow node row，而不是只验证文本内容。
