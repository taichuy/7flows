# 2026-03-17 Callback Inline Action Alignment

## 背景

- `docs/dev/runtime-foundation.md` 的 `P0 WAITING_CALLBACK` 主线已经连续把 callback waiting、approval pending 与 notification retry 往同一条 operator triage 主链收口。
- 2026-03-17 上一轮提交 `b8f2ae3 feat: inline callback notification retarget` 已让 `CallbackWaitingSummaryCard` 可以在当前页直接改派 notification target 并重试。
- 但推荐动作文案仍停留在“先去 inbox slice 处理审批 / 通知”，与当前页已经具备的 inline action surface 不一致，容易让 operator 误判为还必须跳页操作。

## 目标

1. 让 callback waiting 的 `Recommended next action` 与当前页已经具备的 inline operator actions 保持一致。
2. 在 summary 内补齐更直接的 sensitive access 摘要，减少 operator 在 callback scene 和 inbox scene 之间来回确认的次数。
3. 继续沿 waiting / governance 主线推进真实闭环，而不是回到纯文件整理或样式微调。

## 实现

### 1. 推荐动作改为优先指向当前页动作面

- `web/lib/callback-waiting-presenters.ts`
  - 新增 `resolve_inline_sensitive_access` 推荐动作分支。
  - 当 callback summary 已能选出可直接处理的 approval / notification 条目时，优先提示“在这里批准 / 拒绝 / 改派并重试”，不再默认要求先打开 inbox slice。
  - 只有在当前页没有可操作条目时，才继续退回 `open_inbox` 建议。

### 2. summary 补齐 sensitive access 摘要

- 同文件新增 `formatCallbackWaitingSensitiveAccessSummary()`，统一拼装：
  - resource label
  - decision label
  - reason label
  - policy summary
- `web/components/callback-waiting-summary-card.tsx`
  - 在 approval / notification 概览之间新增 `Sensitive access:` 文本摘要。
  - 同步把新摘要纳入卡片显隐条件，避免只存在治理摘要时卡片被意外折叠。

## 影响评估

### 对架构链条的意义

- 本轮没有新增 route、状态机、数据模型或新的治理旁路。
- 增强的是既有 `SensitiveAccessTimelineEntry -> callback waiting presenter -> summary card -> SensitiveAccessInlineActions` 这一条 operator 解释 / 动作链。
- 这说明当前架构不只是能继续承接动作按钮，也能继续承接“动作建议与实际动作面一致”的产品细化，而不需要回头重做 runtime 或治理模型。

### 对产品场景的意义

- 主要服务对象仍是**人类 operator**，但它直接增强了“人与 AI 协作层”的 callback 排障体验。
- 改动前：
  - summary 已支持就地审批 / 改派通知；
  - 但推荐文案仍提示先去 inbox，动作建议和实际动作面割裂。
- 改动后：
  - operator 能先在 callback summary 里看清当前敏感访问对象、决策和策略摘要；
  - 推荐动作会明确指向当前页的 inline approval / notification actions；
  - inbox 仍保留为 drilldown 入口，但不再是默认唯一下一步。

## 文件解耦判断

- 本轮未继续拆文件。
- 判断结论：当前热点不在文件长度阈值，而在 callback summary 的职责需要继续承接 operator explanation。
- 仍维持以下解耦规则：
  1. 先看是否出现稳定的独立职责边界；
  2. 再看是否接近偏好阈值：后端约 `1500` 行、前端约 `2500` 行；
  3. 同时评估是否真的降低维护、扩展及 AI / 人协作理解成本；
  4. 不为“看起来整齐”而拆，优先保证主业务闭环推进。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 下一步

1. 继续补 callback waiting 场景下 approval / notification 成功后的结果解释，减少 operator 还要跳去其它页面确认“是否真的恢复”的次数。
2. 继续评估是否把 callback waiting 的外部 callback / scheduler 状态做成更明确的 operator badge，而不是只保留 recommendation 文案。
3. 保持优先级在 waiting / governance / editor 主线，不回到“纯文件整理优先”的路径。
