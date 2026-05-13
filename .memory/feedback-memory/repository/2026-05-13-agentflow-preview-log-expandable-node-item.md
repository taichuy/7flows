---
feedback_category: repository
decision_policy: direct_reference
created_at: 2026-05-13 16
---

# Agent Flow 预览日志节点抽象

规则：Agent Flow 预览 / 对话日志里的追踪节点，需要复用完整的“可展开节点项”抽象，而不是只复用节点行内容。

原因：用户明确指出“抽象不完整，不支持展开这些”。仅复用行 UI 会丢失展开箭头、展开状态、详情槽位和节点壳交互，导致右侧节点详情和左侧对话日志追踪体验不一致。

适用场景：后续调整 `debug-console`、预览日志、工作流追踪、节点运行详情时，共享组件应覆盖 row + trigger + expanded detail slot；节点详情内容可作为 children 传入。
