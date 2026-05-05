---
created_at: 2026-05-05 21
memory_type: project
decision_policy: verify_before_decision
scope: agent-flow variable display
---

# AgentFlow Variable Display Format

AgentFlow 变量在用户可见的选择器、模板 chip、调试变量列表和节点运行前输入中，统一显示为 `节点名称/变量名`。

当前仓库实现中，“节点名称”使用用户可见节点名称 `node.alias`，“变量名”使用输出变量 key；不使用节点 id，也不使用输出标题 `title`。例如 LLM 输出应显示为 `LLM/text`，不显示为 `node-llm/text`，也不显示为 `LLM/模型输出`。

原因：变量展示要让用户看清变量来自哪一个节点，同时避免把中文输出标题误认为变量名。

后续调整 AgentFlow 变量展示入口时，先核对最新代码和测试，再延续该格式。内部 selector/token/payload 仍使用 `node.id + key`。
