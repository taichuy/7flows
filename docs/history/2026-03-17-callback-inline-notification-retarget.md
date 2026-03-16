# 2026-03-17 Callback Inline Notification Retarget

## 背景

- `docs/dev/runtime-foundation.md` 的 `P0 WAITING_CALLBACK` 已连续把 callback waiting、approval pending 与 notification retry 往统一 operator triage 主链收口。
- 上一轮 `CallbackWaitingSummaryCard` 已能就地展示最新通知摘要，并复用 `SensitiveAccessInlineActions` 直接批准 / 拒绝或重试最新失败通知。
- 但当 operator 已经在 callback summary 看见“通知 target 不对”或“当前 target 明显不可达”时，仍需要跳回 `/sensitive-access` inbox 才能改派 target；这会让单页 triage 重新退回“问题在这里，修复在别处”的割裂。

## 目标

1. 让 callback waiting summary 内的通知动作支持就地改派 target 后立即重试。
2. 保持复用既有 `retrySensitiveAccessNotificationDispatch` action，不新增第二套 notification retry 入口。
3. 继续沿 callback waiting 的 operator action surface 推进，而不是回到纯结构整理或样式微调。

## 实现

### 1. inline notification retry 改为可编辑 target

- `web/components/sensitive-access-inline-actions.tsx`
  - 为 inline notification 补充 `channel / target` 字段读取。
  - 把原来的隐藏 `target` 字段改成可编辑输入框，默认填入最新通知的当前 target。
  - 按 inbox 页面既有语义复用“留空则沿用当前目标”的说明与提交方式。

### 2. callback summary 保留当前通知上下文

- 同一组件在提交按钮上改为“改派目标并重试”，并在表单里直接显示最新通知的 `channel / status / target` 摘要。
- 这样 operator 在 callback waiting summary 内即可判断“是继续沿用当前 target 重试，还是先改派再重试”。

## 影响评估

### 对架构链条的意义

- 本轮没有新增 route、状态机或新的治理模型。
- 它增强的是既有 `NotificationDispatch -> SensitiveAccessInlineActions -> callback waiting summary` 这一条 action surface：
  - 提高 notification triage 的单页完成度；
  - 进一步缩短 callback waiting 与 notification governance 之间的跳转距离；
  - 继续验证当前架构足以沿统一事实层持续加厚 operator 闭环，而不需要回头重搭主骨架。

### 对产品场景的意义

- 主要服务对象是**人类 operator**，同时支撑“人与 AI 协作层”的共享排障入口。
- 改动前：
  - callback summary 已能看到最新通知摘要并直接重试；
  - 但一旦怀疑 target 错误，仍要跳转 inbox 才能改派目标。
- 改动后：
  - operator 能在 callback summary 当前页判断 target 是否合理；
  - 能直接改派并重试，不再被迫切页；
  - callback waiting、approval pending 与 notification retarget/retry 更接近真正的单页 triage。

## 文件解耦判断

- 本轮没有新增拆文件，因为当前主要矛盾不是组件过长，而是 callback summary 的动作面仍缺一个关键治理动作。
- 仍按以下标准判断是否需要继续解耦：
  1. 是否出现稳定的独立职责边界；
  2. 是否接近用户偏好阈值：后端约 `1500` 行、前端约 `2500` 行；
  3. 是否能显著降低后续维护、扩展和 AI / 人工协作理解成本；
  4. 是否真的推进主业务闭环，而不是为了“看起来更整齐”而拆。

## 验证

- 计划执行 `web/pnpm exec tsc --noEmit`
- 计划执行 `web/pnpm lint`

## 下一步

1. 继续把 callback waiting summary 与 notification retry 结果的 explanation 收得更完整，减少 operator 在成功 / 失败后仍需切页确认的次数。
2. 继续评估是否把 callback waiting 的外部 callback 状态与 scheduler 状态做成更细的 operator 标签，而不是只有推荐动作。
3. 保持优先级在 waiting / governance / editor 主线，不回到“纯文件整理优先”的路径。
