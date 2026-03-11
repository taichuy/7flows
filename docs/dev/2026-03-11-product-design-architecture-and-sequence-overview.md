# 2026-03-11 产品设计文档补充：项目架构图与关键时序图

## 背景

`docs/product-design.md` 已经覆盖了产品定位、IR、节点体系、发布协议和运行模型，但对于第一次阅读项目的人来说，仍然缺少一个“把这些概念串成一条主线”的总览入口。

同时，`docs/technical-design-supplement.md` 已经补充了插件兼容层、上下文分层、Durable Runtime、Composite Agent Pipeline 等关键设计；`docs/dev/runtime-foundation.md` 则记录了当前真实已落地的运行时事实。三者内容都正确，但阅读路径更像“按专题深入”，不够像“先看全貌再下钻”。

## 目标

- 在 `docs/product-design.md` 中新增一个适合快速理解项目整体设计的文字化架构图。
- 在同一文档中补充关键时序图，帮助区分设计态、运行态、发布态和 waiting/resume 语义。
- 把“上下文四层管理为什么存在、如何防止上下文爆炸、assistant 如何向主 AI 贡献 evidence”补成更容易理解的总览说明。
- 保持产品文档仍然是“目标设计总览”，不把它改写成实现细节清单。

## 决策

本次补充采用两类文字化图示：

1. `5.4 项目架构图（文字化）`
   - 用分层图描述 `设计态 -> 编排与控制层 -> 编译与运行时核心层 -> 能力接入层 -> 对外发布与集成层`
   - 明确 `7Flows IR` 是从设计进入执行的统一收口点
2. `6.5 关键时序图（文字化）`
   - 运行/调试时序
   - 发布接口调用时序
   - waiting/callback/resume 时序
3. `7.2.1-7.2.4 上下文分层说明`
   - 解释四层上下文的职责边界
   - 明确上下文防爆炸机制
   - 明确 assistant -> evidence -> main AI 的贡献链
4. `7.2.5-7.2.6 上下文流转图与节点 phase 时序`
   - 把 `Artifact -> Evidence -> Main AI` 画成可直接阅读的文字化流转图
   - 把节点内 phase 的上下文演进顺序单独展开

这样处理的好处是：

- 新读者可以先理解“模块怎么分层、请求怎么流动”
- 也能直接理解“为什么不能把所有原始结果都塞给主 AI”
- 还能进一步理解“assistant 到底贡献了什么，贡献发生在哪个 phase”
- 现有专题章节仍然负责各子系统的边界细节
- 当前实现与目标设计的差异可以通过时序中的措辞自然表达，而不需要在产品文档里堆大量实现状态

## 影响范围

- `docs/product-design.md`
  - 新增面向整体理解的图示章节
- `docs/dev/runtime-foundation.md`
  - 补充这次文档同步的留痕入口，避免产品设计和当前事实阅读路径脱节

## 验证

- 对照 `docs/technical-design-supplement.md`，确认架构图已覆盖：
  - compat adapter
  - Tool Gateway
  - Context / Artifact / Evidence
  - Durable Runtime / phase state machine
- 对照上下文专题章节，确认产品文档已把以下原则显式化：
  - 原始大结果不直接进主 AI prompt
  - 主 AI 优先使用 Evidence
  - Artifact 用于追踪、回溯、审计、调试
- 对照 `docs/dev/runtime-foundation.md`，确认时序图没有把尚未完整落地的能力写成已完成事实：
  - Loop 正式运行时语义仍未宣称已完成
  - 发布态 compiled blueprint 全绑定仍保留为目标方向
  - waiting/resume 仅按当前 Phase 1.5 事实描述最小恢复链路

## 下一步

1. 继续在产品文档和开发文档之间维持“总览 + 专题 + 当前事实”的三层阅读结构，避免信息散落。
2. 后续若发布网关、compiled blueprint 绑定或 execution/evidence view 发生明显演进，应同步补强这两类图示，确保总览不落后于实现。
