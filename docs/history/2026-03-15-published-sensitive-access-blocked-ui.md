# 2026-03-15 Published Sensitive Access Blocked UI

## 背景

- `457a7aa feat: gate published cache inventory access` 已把 published cache inventory 接入统一敏感访问控制主链，published invocation detail 在上一轮也已经有对应后端拦截。
- 但前端 `web/lib/get-workflow-publish.ts` 仍把这类 `403/409` 响应一律当作 `null`，导致 publish 面板把“需要审批 / 已被策略拒绝”的真实状态误渲染成“没有详情 / 没有缓存条目”。
- 这会削弱 7Flows 作为“黑盒变透明”的治理入口：后端已经有统一 access request / approval ticket / notification 事实层，前端却无法把阻塞原因展示给人类排障者。

## 目标

- 让 published invocation detail 与 cache inventory 在命中敏感访问控制时，前端能显示真实阻塞态，而不是吞掉后端信号。
- 复用一套轻量的前端敏感访问响应模型，避免 publish 侧未来继续复制 `403/409` 解析逻辑。
- 保持这次改动聚焦在 publish 治理视图，不额外扩散到无关页面。

## 决策与实现

- 新增 `web/lib/sensitive-access.ts`：定义 `SensitiveAccessBlockingPayload` 与 `SensitiveAccessGuardedResult<T>`，并集中处理 `403/409` JSON 响应解析。
- 新增 `web/components/sensitive-access-blocked-card.tsx`：把 resource、access request、approval ticket、notification 摘要渲染成统一卡片，供 publish 详情和 cache inventory 复用。
- 调整 `web/lib/get-workflow-publish.ts`：
  - `getPublishedEndpointCacheInventory()` 改为返回受控结果，而不是简单 `null`。
  - `getPublishedEndpointInvocationDetail()` 同样改为保留 blocked 响应。
- 调整 publish 面板链路：
  - `web/lib/get-workflow-publish-governance.ts` 改为保留受控结果类型。
  - `web/components/workflow-publish-binding-card.tsx` 在 cache inventory 被阻塞时直接展示审批/拒绝信息；网络失败时也不再误报为“暂无缓存条目”。
  - `web/components/workflow-publish-activity-panel-sections.tsx` 在 invocation detail 被阻塞时展示统一阻塞卡片；详情拉取失败时显示明确的 unavailable 状态。
  - `web/components/workflow-publish-activity-panel-helpers.ts` 同步 props 类型链，避免 detail panel 仍按旧式 `null | payload` 模型传递。

## 影响范围

- `web/lib/get-workflow-publish.ts`
- `web/lib/get-workflow-publish-governance.ts`
- `web/lib/sensitive-access.ts`
- `web/components/sensitive-access-blocked-card.tsx`
- `web/components/workflow-publish-binding-card.tsx`
- `web/components/workflow-publish-activity-panel-sections.tsx`
- `web/components/workflow-publish-activity-panel-helpers.ts`
- `web/components/workflow-publish-panel.tsx`

## 验证

- `cd web && pnpm lint`
- `cd web && pnpm exec tsc --noEmit`

## 结论与下一步

- 这次补齐后，published detail/cache 至少已经具备“被拦截时如实告知”的最小治理可见性，不再把敏感访问主链做成只在后端成立的黑盒。
- 下一步仍应优先延续到：
  1. publish export 入口的敏感导出控制；
  2. approval inbox / 通知投递 worker 的真实闭环；
  3. credential path 的 `allow_masked` 语义收敛。
