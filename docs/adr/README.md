# ADR 索引说明

本目录用于存放 Architecture Decision Record，以及需要跨多个回合长期保留的协作 / 安全 / 架构决策。

适合写 ADR 的场景：

- 决策会改变架构、协作、安全、集成或审查边界。
- 团队需要稳定记录“背景 / 决策 / 后果”。
- 仅靠当前事实索引或临时过程说明，已经不足以解释后续为什么要继续遵守某条规则。

不适合写 ADR 的场景：

- 当前开发者自己的按日期开发过程留痕。
- 只与某一轮实现细节有关、不会长期约束后续工作的说明。

这类按日期的个人开发留痕应放在 `docs/.private/history/`，不作为共享事实来源。

## 命名约定

- `0000-template.md`
- `0001-<topic>.md`
- 文件名保持稳定、简短、可描述

## 最小结构

1. 状态
2. 背景
3. 决策
4. 后果
5. 后续动作

## 当前 ADR 列表

| 编号 | 标题 | 状态 |
|---|---|---|
| [ADR-0001](0001-shared-language-local-notes-and-review-guardrails.md) | 共享语言、本地笔记与审查边界 | Accepted |
| [ADR-0002](0002-layered-agents-chain-guidance-and-local-memory.md) | 分层 Agent 链路指导与本地记忆 | Accepted |
| [ADR-0003](0003-runtime-fact-layer-and-consumer-projections.md) | 运行时事实层与消费者投影 | Accepted |
| [ADR-0004](0004-retire-token-publish-auth-and-keep-governance-handoff.md) | 退役 token publish auth，保留 workflow 级治理 handoff | Accepted |
| [ADR-0005](0005-same-origin-api-and-unified-backend-authz-boundary.md) | 同源 API 入口与 backend 统一授权边界 | Accepted |
