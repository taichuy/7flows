---
created_at: 2026-05-05 21
memory_type: feedback
decision_policy: direct_reference
feedback_category: repository
scope: agent-flow variable display
---

# AgentFlow Variable Label Uses Node Name

规则：AgentFlow 用户可见变量 label 的 `节点名/变量名` 中，节点名必须是用户看得懂的节点名称 `node.alias`，不是节点 id。

原因：变量 label 的目标是让用户清楚变量来自哪一个画布节点；节点 id 是内部引用标识，不适合作为可见来源名称。

适用场景：变量选择器、模板变量 chip、调试变量列表、节点运行前输入、Run Context 等用户可见变量展示入口。内部 selector/token/payload 仍可继续使用 `node.id + key`。
