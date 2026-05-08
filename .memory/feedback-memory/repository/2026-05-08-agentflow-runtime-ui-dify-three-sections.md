---
created_at: 2026-05-08 11
memory_type: feedback
decision_policy: direct_reference
feedback_category: repository
scope: agent-flow runtime UI and output contract
---

# AgentFlow Runtime UI Follows Dify Three Sections

规则：Agent Flow 节点运行详情的产品层信息架构按 Dify 风格收敛为 `输入 / 数据处理 / 输出`。其中“数据处理”不是 debug payload 全量展示，只放节点内部执行过程中发生的事件或步骤，例如 LLM 流式事件、工具/代码执行事件、转换计算步骤。

规则：token 用量、路由、finish reason、attempt、耗时这类运行结果指标属于“输出”观察对象，不属于“数据处理”。成功节点的 `output_payload` 可以保留这些指标；失败节点仍不要把空指标或 partial live delta 当业务输出写入节点输出。

规则：`debug_payload` 里可能同时有过程事件、assistant message、provider route、raw/context refs 等内部证据；前端“数据处理”需要筛出事件类/步骤类字段，不应把 assistant message、provider route 或普通指标全量塞进去。变量选择器只展示输出契约声明的 selector。

规则：异常输出如果是节点错误处理策略显式产出的变量，例如 `error_message`、`error_type` 或 fallback result，应进入输出对象；是否允许下游引用仍由输出契约/错误处理策略决定。

规则：需要自定义输出变量的节点应显式支持输出契约编辑与校验/runtime 对齐，不要把所有内置节点都假定成单一固定 `output`；不支持自定义输出的节点应明确保持 fixed output contract。

适用场景：审查或改写 Agent Flow 节点详情、debug console、variable cache、变量选择器、node runtime contract、output contract editor、validate-document 与相关 spec/plan。
