---
memory_type: feedback
feedback_category: repository
topic: agent-flow debug composer submit state
summary: 预览聊天 composer 发送内容后必须立即清空输入框，已发送内容只留在消息流中。
keywords:
  - agent-flow
  - debug-console
  - composer
  - preview-chat
  - submit
match_when:
  - 修改 AgentFlow 预览聊天输入框、调试消息提交链路或 runContext query 状态
  - 处理“消息已发送但输入框仍残留内容”的交互问题
created_at: 2026-05-12 22
updated_at: 2026-05-12 22
last_verified_at: 2026-05-12 22
decision_policy: direct_reference
scope:
  - web/app/src/features/agent-flow/components/debug-console
  - web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts
---

# AgentFlow Debug Composer 发送后清空

## 时间

`2026-05-12 22`

## 规则

预览聊天 composer 一旦提交当前文本，应把提交文本作为参数交给调试运行入口，并立即清空输入框。已发送的内容只能继续展示在 User 消息气泡和运行输入中，不应残留在底部输入框。

## 原因

用户明确指出“前端已经发送了内容，那么就不应该残留在输入框中”。只依赖父级 `runContext` 后续回写会让交互反馈不够确定；composer 提交事件本身应完成“取值 -> 提交 -> 清空”的原子交互。

## 适用场景

- 修改 `DebugComposer`、`DebugConversationPane`、`AgentFlowDebugConsole` 或 `AgentFlowCanvasFrame` 的提交链路。
- 改动 `submitPrompt(prompt?)` 或 Start/query 输入来源时。
- 添加预览聊天回归测试时，应覆盖按钮发送和 Enter 发送都会传递原始文本并清空输入。
