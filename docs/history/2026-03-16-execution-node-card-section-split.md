# 2026-03-16 Execution Node Card Section Split

## 背景

- `docs/dev/runtime-foundation.md` 已把 run diagnostics / publish detail 继续拆层列为持续优先事项。
- `web/components/run-diagnostics-execution/execution-node-card.tsx` 同时承载执行元信息、callback waiting、tool calls、AI calls、callback tickets、sensitive access timeline 与 artifacts，虽然未到失控长度，但职责已开始聚合，不利于后续继续补 operator explanation、恢复动作与 publish/run 共享展示逻辑。

## 目标

- 在不改变 execution node card 现有行为的前提下，把后续最可能继续演进的块状内容拆成独立 section。
- 为 callback waiting / sensitive access / tool & AI trace 的后续迭代预留稳定插槽，避免每次都回到单个大组件里叠逻辑。

## 实现

- 新增 `web/components/run-diagnostics-execution/execution-node-card-sections.tsx`，把以下块抽成独立 section：
  - tool calls
  - AI calls
  - callback tickets
  - artifacts
  - sensitive access timeline
- `web/components/run-diagnostics-execution/execution-node-card.tsx` 保留节点级总览、execution chips、callback waiting summary 和 inbox slice 链接，把明细块改为组合 section。
- sensitive access timeline 增补独立 section heading 与说明文案，明确其承载审批票据、通知与策略决策的 operator 视角。

## 影响范围

- `web/components/run-diagnostics-execution/execution-node-card.tsx`
- `web/components/run-diagnostics-execution/execution-node-card-sections.tsx`

## 验证

- 计划执行 `web/pnpm exec tsc --noEmit`
- 计划执行 `web/pnpm lint`

## 结果判断

- 这次改动属于“结构热点治理 + 后续功能插槽准备”，不是单纯样式整理。
- 它没有新增新的用户面能力，但直接降低了 run diagnostics 继续扩展 callback waiting / approval / tool / artifact 排障入口时的耦合成本。

## 下一步

- 优先继续把 execution node card 内与 operator 恢复动作强相关的块保持 presenter / section 化，避免 waiting / governance 逻辑重新回流到单体组件。
- 继续按 `runtime-foundation` 中的优先级推进 editor 治理入口与 publish/detail 细部体验，而不是停留在纯重构循环。
