# 2026-03-16 sensitive access 就地 operator 动作补齐

## 背景

- `docs/dev/runtime-foundation.md` 仍把 `P0` 的 waiting / governance 主线放在“事实已经连起来，但动作面还不够厚”的阶段。
- `/sensitive-access` inbox 已具备批量治理，但 run diagnostics、published detail 和 access-blocked 场景里，operator 仍经常需要先跳 inbox 才能批准票据或重试通知。
- 当前项目更需要沿既有治理主链补低跳转闭环，而不是回头重做模型或再增加一层新的治理入口。

## 目标

- 把最常见的 operator 动作直接贴近 blocker 视图，减少“看得到阻断，但必须再跳一层页面才能处理”的摩擦。
- 复用已有 server action，不新增第二套审批 / 通知重试逻辑，只增强现有治理入口的可执行性。

## 实现

- 复用未收口的 `web/components/sensitive-access-inline-actions.tsx`，作为通用的 entry-level operator action 组件。
- 在 `web/components/sensitive-access-timeline-entry-list.tsx` 中，把 inline action 挂到每条 sensitive access timeline entry：
  - 当票据处于 `pending + waiting` 时，支持直接批准 / 拒绝
  - 当最新通知未成功投递时，支持直接重试最新通知
- 在 `web/components/sensitive-access-blocked-card.tsx` 中，同样接入 inline action，让 access-blocked 卡片不再只提供 `open inbox slice`。
- 继续沿用 `web/app/actions/sensitive-access.ts` 中既有的审批与通知重试 server action，并通过 `router.refresh()` 保持页面刷新语义一致。

## 影响范围

- 用户层：人类 operator 在 blocked card、run detail timeline、published approval timeline 里都能就地处理审批与通知失败，不必总是回到 inbox。
- AI 与人协作层：callback waiting / approval pending / notification failure 的排障链更短，run 与 publish 两条视图共享同一套动作语义。
- AI 治理层：没有新增第二套模型或权限分支，而是把统一 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 主链进一步变成可执行控制面。
- 架构层：这次改动增强的是治理入口厚度，不是重构 runtime 主控；同时也验证当前前端组件拆层方向是对的——动作可以独立复用到多个 blocker 视图，而不必复制表单逻辑。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`

## 下一步

- 优先把“就地动作”继续往 callback waiting summary / execution overview 的 blocker 首屏摘要收口，而不只是停留在 timeline entry 与 blocked card。
- 再补更细的 operator action suggestion / explanation，让用户在决定批准、拒绝或重试前有更直接的上下文提示。
