# 2026-03-16 Callback Waiting Action Surface Refresh

## 背景

- `docs/dev/runtime-foundation.md` 已把 `WAITING_CALLBACK` 的下一步重点收敛到“何时建议 operator 先 resume、何时应先 cleanup / approve”的 action suggestion。
- 当前项目已经具备 callback waiting summary、manual resume、expired ticket cleanup、approval inbox slice 与 notification retry，但建议与动作仍偏松散：operator 需要自己把推荐文案和实际按钮对应起来。
- 当 callback waiting 与 pending approval / failed notification 同时出现时，现有 summary 也还不能明确指出“应该先去 inbox 重试通知还是直接恢复 run”。

## 目标

1. 让 callback waiting 的推荐动作不只停留在说明文字，而是能直接落到对应 CTA。
2. 把 pending approval + failed notification 的联合信号补进同一条 operator 建议链。
3. 保持改动聚焦在现有 presenter / summary card / inline actions，不新增新的治理模型或页面。

## 实现

### 1. callback waiting presenter 改为输出结构化推荐动作

- `web/lib/callback-waiting-presenters.ts`
  - 为 `CallbackWaitingRecommendedAction` 增加 `kind` 与 `ctaLabel`，把建议从纯文本提升为可映射到 UI 动作的结构化结果。
  - 新增 pending approval 与 failed notification 的聚合判断。
  - `listCallbackWaitingChips()` 现在会额外展示 `notify failed N`，让 operator 一眼看出等待链路是否还伴随通知失败。

### 2. callback summary card 直接承接推荐 CTA

- `web/components/callback-waiting-summary-card.tsx`
  - 当推荐动作为 `open_inbox` 或 `inspect_termination` 时，直接渲染对应的 inbox / blocker CTA，而不只留一句说明。
  - 当推荐动作为 `manual_resume` 或 `cleanup_expired_tickets` 时，把推荐信息继续传给 inline actions，用于调整动作优先顺序。

### 3. inline actions 顺序按推荐动作收口

- `web/components/callback-waiting-inline-actions.tsx`
  - 新增 `preferredAction`，在 compact action panel 中把更应该先执行的动作排到前面。
  - 当推荐为手动恢复或 cleanup 时，额外显示简短提示，减少 operator 在两个按钮之间自己猜测顺序。

## 影响评估

### 对架构链条的意义

- 这轮改动没有新增第二套 callback / approval 模型，也没有引入新的 route 或状态机。
- 它强化的是现有 `run diagnostics -> callback waiting summary -> inbox / cleanup / manual resume` 这条操作链，因此增强的是可维护性、排障效率与操作一致性。

### 对产品场景的意义

- 主要服务对象是**人类 operator**，同时提升了“人与 AI 协作层”与“AI 治理层”的恢复效率。
- 改动前：summary 已能解释阻塞原因，但推荐动作和实际可执行入口还没有完全对齐。
- 改动后：summary 会更明确地区分“先处理审批/通知”“先 cleanup”“直接 resume”“观察定时恢复”这几类路径，并把 CTA 直接放到当前卡片里。

## 验证

- `web/pnpm exec tsc --noEmit`
  - 通过
- `web/pnpm lint`
  - 通过

## 下一步

1. 继续把 `monitor_callback / watch_scheduled_resume` 两类建议也补成更显式的 operator surface，而不只是一句说明。
2. 继续把 callback waiting 建议与 `/sensitive-access` inbox 内的 notification retry / retarget 结果联动成更完整的 triage 闭环。
3. 继续治理 publish detail 与 run diagnostics 的 presenter / section 热点，避免动作面继续回流到大组件内联逻辑。
