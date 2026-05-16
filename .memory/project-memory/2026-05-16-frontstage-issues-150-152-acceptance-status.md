---
memory_type: project
topic: frontstage-issues-150-155-218-acceptance-status
summary: 2026-05-16 13 更新：#218 已验收通过，前台页面树后端写 API 已走 control-plane/repository 真值入口并持久化；schema root 仍为保留 UID、删除不清理 schema/block/code 是已明示的本子任务限制。#149 仍保持开发中，父 issue 状态暂不改。
keywords:
  - frontstage
  - acceptance
  - issue-149
  - issue-150
  - issue-151
  - issue-152
  - issue-154
  - issue-155
  - issue-182
  - issue-218
  - issue-195
  - qa
  - style-boundary
match_when:
  - 验收前台路由、设计模式入口骨架或登录态权限切换时
  - 判断 #149 / #150 / #151 / #152 / #154 / #155 / #182 / #195 / #218 是否已通过验收时
created_at: 2026-05-16 01
updated_at: 2026-05-16 13
last_verified_at: 2026-05-16 13
decision_policy: verify_before_decision
scope:
  - web/app/src/app/router.tsx
  - web/app/src/routes/route-config.ts
  - web/app/src/features/frontstage/pages/FrontStagePage.tsx
  - web/app/src/features/frontstage/_tests/FrontStagePage.test.tsx
  - api/apps/api-server/src/routes/frontstage/mod.rs
  - api/crates/access-control/src/catalog.rs
---

# Frontstage issues 150-155 acceptance status

## 时间

`2026-05-16 07`，`2026-05-16 13` 追加 #218 后端写 API 验收状态。

## 谁在做什么

用户继续对 `#149`「前台路由、页面设计模式与区块编排管理」及其前台子任务做验收，只允许输出纠正建议，不参与业务代码修改。本轮重点是把凌晨那版“31 项里 9 红”的旧结论刷新成现在的 target suite、路由、样式门禁和后端 API 真值现状。

`2026-05-16 13` 独立验收 subagent 对 `#218`「前台页面树后端写 API 与持久化权限」完成验收：issue 标题已从 `[2.开发完成]` 依次更新为 `[3.测试完成]`、`[4.验收通过]`；父 issue `#149` 未改状态。

## 为什么这样做

前台链路是 JS 扩展平台里最容易被“页面看起来能点”误判为通过的一段。当前实际情况已经明显优于凌晨，但仍然没跨过验收线；如果记忆不更新，后续模型既可能低估当前进展，也可能错误高估可交付程度。

## 为什么要做

`#149` 相关 issue 评论里同时存在大量“开发完成/测试完成”记录。项目记忆需要提供更稳定的判定口径：哪些项可以直接跳过，哪些项虽然前端测试大部分已绿，但仍因为仓库门禁或后端真值缺失而不能签收。

## 截止日期

`2026-05-16 07`

## 决策背后动机

- `#149` 整体状态保持 `1.开发中`。
  原因：
  - `pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/app-shell/_tests/navigation.test.tsx src/features/frontstage/_tests/FrontStagePage.test.tsx` 当前结果已改善为 `34` 项中的 `1` 项失败，不再是凌晨的多点红灯。
  - 但页面仍未达到仓库交付门槛：`FrontStagePage.tsx` 与 `route-config.ts` 都没有 style-boundary 场景映射；`#218` 已补齐后端页面树写 API，但前端 UI mutation 接入仍不属于 #218。
  - 当前前台大部分功能仍是前端本地状态模拟，不是 schema storage / page tree / block runtime 的真实闭环。

- `#152` 建议状态保持 `4.验收通过`。
  证据：
  - `src/routes/_tests/route-config.test.ts` 与 `src/app-shell/_tests/navigation.test.tsx` 本轮继续通过。
  - `web/app/src/routes/route-config.ts` 仍保持 `permissionKey: null` 与 `guard: 'session-required'`，符合“内部登录用户可浏览前台”的验收规则。

- `#150` 继续保持 `5.验收不通过`。
  证据：
  - 路由与导航 targeted tests 本轮是绿的，说明基础接入本身没有回归。
  - 但 `node scripts/node/check-style-boundary.js file web/app/src/routes/route-config.ts` 仍失败，缺少场景映射；在本仓库前端规则下，这意味着路由接入还不能签收为验收通过。

- `#151` 继续保持 `5.验收不通过`。
  证据：
  - 设计模式入口和空态骨架相关测试当前都能通过。
  - 但 `FrontStagePage` 仍缺 style-boundary 场景映射，且前台整体 target suite 还未全绿，因此不能把“入口骨架”单独抬到验收通过。

- `#154` 继续保持 `5.验收不通过`。
  证据：
  - 设计态顶部工具栏相关行为现在基本已稳定，按钮和未保存状态联动的大部分测试都通过。
  - 但同一页面仍有一条错误态重试用例失败，且样式门禁未闭合；这意味着“工具栏骨架”还不能独立签收。

- `#155` 的旧后端 API 阻塞已由 `#218` 修正，但 #155 是否重验通过需要另开验收。
  证据：
  - `web/app/src/features/frontstage/pages/FrontStagePage.tsx` 已具备本地页面树、默认页回退、删除与重命名逻辑。
  - `#218` commit `e4402556540383bb0355748a112efbfddcd89b40` 已把后端页面树读写接入 `FrontstagePageService` 和 Postgres `frontstage_pages` repository，不再是固定空树。
  - 但 #155 还需要结合前端 UI mutation 接入、style-boundary 和页面管理交互另行验收。

- `#218` 当前状态为 `4.验收通过`。
  证据：
  - 写 API 已走 `routes/frontstage` -> `control_plane::frontstage::FrontstagePageService` -> `FrontstagePageRepository` -> Postgres `frontstage_pages`。
  - 所有写操作由 service 检查 `frontstage.page.design`；GET 仍只要求登录用户可访问 workspace。
  - 定向测试通过：`cargo test -p api-server frontstage_routes -- --nocapture`、`cargo test -p api-server openapi_contains_frontstage_pages_route_and_error_responses -- --nocapture`、`cargo test -p access-control manager_role_includes_frontstage_design_permission_by_default -- --nocapture`。
  - `cargo test -p control-plane frontstage -- --nocapture` 与 `cargo test -p storage-postgres frontstage -- --nocapture` 过滤编译通过；当前没有同名专项测试。
  - 已知限制可接受：创建 page 只写保留语义 `schema_root_uid = frontstage_page_schema_root:{page_id}`；删除 page/group 暂不清理 schema root、block schema、JS Block code，开发评论已明确后续要纳入同一事务。

- `#182` 继续保持 `5.验收不通过`。
  证据：
  - issue 评论里曾写成 `4.验收通过`，但后续已在 issue 评论中回退，项目记忆也没有通过背书。
  - 当前 frontstage target suite 虽只剩 `1` 红，但 suite 仍未清零，且 style-boundary 仍未完成，因此没有重新恢复通过状态的依据。

- `#195` 当前安全状态只能停在 `2.开发完成`，不能继续上推。
  证据：
  - 未提交改动 `api/crates/access-control/src/catalog.rs:189-202` 试图把 `frontstage.page.design` 默认加给 manager。
  - 但本轮执行 `cargo test -p access-control manager_role_includes_frontstage_design_permission_by_default -- --nocapture` 时直接命中 `E0282`：`manager_permissions` 缺少可推断的具体类型。
  - 这意味着该权限默认值改动当前连本地 targeted compile 都没过，不能进入 `3.测试完成` 或更高状态。

- 当前 frontstage 剩余最直接的红灯是错误态重试按钮的可访问名不一致。
  证据：
  - `src/features/frontstage/_tests/FrontStagePage.test.tsx:766` 仍按 `name: '重试'` 查找按钮。
  - 实际运行态里按钮可访问名表现为 `重 试`，导致当前唯一失败用例没有通过。

- style-boundary 仍是本轮 frontstage 验收的硬阻塞。
  证据：
  - `node scripts/node/check-style-boundary.js file web/app/src/features/frontstage/pages/FrontStagePage.tsx` 失败。
  - `node scripts/node/check-style-boundary.js file web/app/src/routes/route-config.ts` 失败。
  - 两者失败原因一致：未声明页面/组件场景映射。
