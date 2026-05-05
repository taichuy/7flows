---
created_at: 2026-05-05 21
memory_type: project
decision_policy: verify_before_decision
scope: agent-flow variable display
---

# AgentFlow Variable Display Format

AgentFlow 变量在用户可见的选择器、模板 chip、调试变量列表和节点运行前输入中，统一显示为 `节点名/变量名`。

当前仓库实现中，“节点名”使用稳定节点标识 `node.id`，“变量名”使用输出变量 key；不使用节点别名 `alias`，也不使用输出标题 `title`。例如 LLM 输出应显示为 `node-llm/text`，不显示为 `LLM / 模型输出`。

原因：变量展示要和可引用的稳定变量语义对齐，避免用户把可编辑别名或中文标题误认为变量名。

后续调整 AgentFlow 变量展示入口时，先核对最新代码和测试，再延续该格式。
