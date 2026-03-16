# 2026-03-17 Callback Waiting Inline Sensitive Actions

## 背景

- `docs/dev/runtime-foundation.md` 的 `P0 WAITING_CALLBACK` 已经把 callback waiting 的推荐动作、观察型 CTA、inbox slice cross-link 接回统一 triage 主链。
- 但上一轮之后仍有一个可感知缺口：当 callback waiting 的真正阻塞点其实是 `pending approval + failed notification` 时，operator 仍常常需要先从 run diagnostics / publish callback 卡片跳到 `/sensitive-access` inbox，再做批准或通知重试。
- 这类“先理解阻塞原因，再切页执行动作”的模式会放大排障链路长度，不利于把 callback waiting、approval、notification retry 收成同一条人类 operator 可直接操作的闭环。

## 目标

1. 让 callback waiting summary card 直接暴露最相关的 sensitive access operator action。
2. 在卡片里先说明“最新通知失败/待发送了什么”，减少跳转前的猜测。
3. 保持现有事实链不变，只复用已有 `SensitiveAccessInlineActions` 与 timeline 数据，不新增第二套审批/通知状态模型。

## 实现

### 1. presenter 选择最适合就地操作的 sensitive access entry

- `web/lib/callback-waiting-presenters.ts`
  - 新增 `pickCallbackWaitingInlineSensitiveAccessEntry()`，在 callback waiting 关联的 `SensitiveAccessTimelineEntry[]` 中优先挑出：
    - 仍处于 `pending + waiting` 的 approval ticket；
    - 或存在可重试通知的 entry。
  - 排序优先级按“待审批 > failed notification 数量 > 是否可重试 > 最近活动时间”收敛，避免卡片命中无关 entry。
  - 新增 `formatCallbackWaitingNotificationSummary()`，直接输出最新通知的 `channel / status / target / error` 摘要。

### 2. callback waiting card 直接承接审批/通知动作

- `web/components/callback-waiting-summary-card.tsx`
  - 新增 `Notification:` 摘要行，在 operator 进入 inbox 前先看到最近通知失败在哪、发给谁、错在哪。
  - 在 callback waiting summary 内直接复用 `SensitiveAccessInlineActions`：
    - 若 approval ticket 仍在等待，卡片可直接批准/拒绝；
    - 若最新通知可重试，卡片可直接触发 retry。
  - 保留原有 `CallbackWaitingInlineActions`，因此现在同一张卡片既能做 callback cleanup/resume，也能做 approval/notification triage。

## 影响评估

### 对架构链条的意义

- 这轮没有新增 route、状态机、数据库结构或第二套 operator surface。
- 强化的是既有的统一事实链：
  - `callback waiting summary`
  - `sensitive access timeline entry`
  - `approval ticket / notification dispatch`
  - `inline operator actions`
- 因此增强的是：
  - `WAITING_CALLBACK` 与 sensitive access 的联动一致性；
  - operator 恢复链路的可执行性；
  - 人类排障时的可靠性与稳定性，因为动作面更贴近真正 blocker。

### 对产品场景的意义

- 主要服务对象是**人类 operator**，同时改善“AI 与人协作层”的共享排障入口。
- 改动前：
  - callback waiting card 能告诉你“先去处理审批/通知”；
  - 但处理动作多数还要跳转到 inbox 才能完成。
- 改动后：
  - callback waiting card 能直接展示最新通知摘要；
  - 审批与通知重试动作可以在当前卡片内完成；
  - operator 只在需要更大范围治理时才进入 inbox。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`

## 下一步

1. 继续把 notification retry / retarget 的结果摘要同步回 callback waiting headline / recommendation，进一步减少 operator 来回切页判断。
2. 评估是否需要把 callback waiting card 内的 sensitive access action 抽成共享 section helper，避免 summary card 后续继续增厚。
3. 按 `runtime-foundation` 的优先级继续推进 execution capability 与 editor 敏感策略入口，不回到纯结构整理优先的路径。
