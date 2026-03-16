# 2026-03-16 callback waiting action suggestions

## 背景

- `docs/dev/runtime-foundation.md` 已持续把 `WAITING_CALLBACK` 与 sensitive access 的 operator 闭环列为 `P0`。
- 前几轮已经补齐 callback summary、manual resume、scoped cleanup、priority blockers 与 publish callback drilldown，operator 已经能在多个入口看到阻断事实并直接触发动作。
- 但当前 shared summary 仍主要回答“发生了什么”，还没有稳定回答“下一步最该先做什么”，导致首页 blocker、run diagnostics node card 与 published invocation detail 虽然都能点动作，operator 仍要自行判断应该先审批、先 cleanup、先继续等 callback，还是直接手动恢复。

## 目标

- 在 callback waiting 的 shared presenter 层补一套最小、统一的 next-action suggestion。
- 让 run diagnostics 与 published callback drilldown 共享同一套 operator 建议，而不是各自写分散判断。
- 保持现有主链不变：建议仍然基于统一 waiting / approval 事实生成，不引入第二套 runtime 或第二套治理语义。

## 实现

### 1. 新增 shared recommendation presenter

- 在 `web/lib/callback-waiting-presenters.ts` 新增 `getCallbackWaitingRecommendedAction()`。
- 当前建议优先级按同一套事实判断：
  - 有 pending approval：先打开 inbox slice 处理审批。
  - waiting 已 terminated：先看 termination reason，不建议盲目恢复。
  - 有 expired tickets：先 cleanup expired tickets 再恢复。
  - 有 pending callback tickets：优先继续等 callback / 外部工具结果。
  - 有 late callback 或历史 ticket 且审批已清：优先手动 resume。
  - 仅剩 scheduled resume：提示可继续观察 backoff，也可按需人工绕过。

### 2. 接到 shared callback summary card

- `web/components/callback-waiting-summary-card.tsx` 现在会直接展示 `Recommended next action`。
- 这样 run diagnostics 的 execution node card、overview blocker 卡片等所有复用该 summary card 的入口，都会自动带上同一套 operator 建议。

### 3. 接到 published callback drilldown

- `web/components/workflow-publish-invocation-callback-section.tsx` 也复用同一 presenter，把建议写入 `Resume blockers` 元信息区。
- 这样 published surface 调试时不再只有“阻断现状”，还会告诉 operator 当前更适合先走哪一步。

## 影响

- **人类用户**：run diagnostics 首屏、node card 与 publish detail 不再只给动作按钮，也能更快解释“为什么先做这一步”。
- **人与 AI 协作层**：同一条 callback / approval 主链在多个入口共享相同建议口径，减少人工与 AI 共读运行事实时的判断漂移。
- **AI 治理层**：没有新增治理模型，而是把已有 approval / callback / resume 事实做成更清晰的 operator 决策辅助，这属于主链补厚，不是枝节修饰。

## 验证

- `cd web; pnpm exec tsc --noEmit`
- `cd web; pnpm lint`
- `git diff --check`

## 结论与下一步

- 这轮继续推进的是 `WAITING_CALLBACK` 的 `P0` operator 主链，不是与主业务无关的 UI 小修小补。
- 下一步仍建议沿同一方向继续补 shared suggestion 的 richer hints，例如把“先审批 / 先 cleanup / 先 resume”的依据进一步接到 execution overview blocker 排序与 publish detail 首屏摘要，而不是跳去做无关界面润色。
