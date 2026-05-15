---
memory_type: project
topic: frontstage-issues-150-155-acceptance-status
summary: 2026-05-16 04 对 #149 前端子任务复核后确认：#152 仍可判 `4.验收通过`；但当前 `FrontStagePage` 目标测试已扩大为 `31` 中 `9` 红，style-boundary 场景映射仍缺失，页面树语义也因 `li` 被覆盖为 `role=\"button\"` 出现无障碍回退，因此 #150、#151、#154、#155 仍不能签收，且此前在评论中写成 `4.验收通过` 的 #182 需要回退为 `5.验收不通过`；#149 整体状态继续保持 `1.开发中`。
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
  - qa
  - style-boundary
  - page-debug
match_when:
  - 验收前台路由、设计模式入口骨架或登录态权限切换时
  - 判断 #149 / #150 / #151 / #152 / #154 / #155 是否已通过验收时
created_at: 2026-05-16 01
updated_at: 2026-05-16 04
last_verified_at: 2026-05-16 04
decision_policy: verify_before_decision
scope:
  - web/app/src/app/router.tsx
  - web/app/src/routes/route-config.ts
  - web/app/src/features/frontstage/pages/FrontStagePage.tsx
  - web/app/src/features/frontstage/_tests/FrontStagePage.test.tsx
  - web/app/src/style-boundary/scenario-manifest.json
---

# Frontstage issues 150-155 acceptance status

## 时间

`2026-05-16 04`

## 谁在做什么

用户安排对 JS 扩展平台中 #149「前台路由、页面设计模式与区块编排管理」的前端子任务做继续验收，只允许输出纠正建议，不改业务代码。本轮在已有 #150、#151、#152、#154、#155 结论基础上，继续核对最新 frontstage 提交 `9c1e6bed`、`ea9f4790`，重新执行最小测试、style-boundary 和 page-debug，把仍然有效的结论与新增证据合并进同一条项目记忆。

## 为什么这样做

用户要求按子 issue 逐项给出验收判断，并在后续轮次中优先复用已验收记忆，避免重复从零核对已经通过的子项。本轮因此直接把哪些项可继续跳过、哪些项必须回退重做写清楚。

## 为什么要做

当前仓库里 #149 相关 issue 与评论同时存在「开发完成」表述，但并不等于已经达到仓库的 QA 门禁。需要把“开发完成”和“验收通过”明确分开，避免后续模型继续在错误状态上串行推进。

## 截止日期

`2026-05-16 04`

## 决策背后动机

本轮验收得到以下边界：

- `#152` 建议状态保持 `4.验收通过`。
  证据：
  - `pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/app-shell/_tests/navigation.test.tsx src/features/frontstage/_tests/FrontStagePage.test.tsx` 中 `route-config` 与 `navigation` 用例继续通过。
  - `node scripts/node/page-debug.js snapshot /frontstage/workspace-1/page-1 --wait-for-selector "text=页面管理" --wait-for-url "http://127.0.0.1:3100/frontstage/workspace-1/page-1"` 返回 `ready_with_selector`，最终 URL 正确落在登录态前台页面；本轮输出目录为 `tmp/page-debug/2026-05-15T20-41-08-407Z/`。
  - 本轮复核时 `web/app/src/routes/route-config.ts` 仍保持 `permissionKey: null` + `guard: 'session-required'`，与“内部登录用户可浏览前台”的规则一致。

- `#151` 建议状态改为 `5.验收不通过`。
  证据：
  - `FrontStagePage` 的空态与设计模式入口行为本身已具备，`src/features/frontstage/_tests/FrontStagePage.test.tsx` 第 `45-70` 行断言可以通过。
  - 当前同一测试文件已经扩大为 `31` 项中的 `9` 项失败，失败不再只是旧 DOM 选择器；还包含页面树列表语义消失（`listitem` 角色不存在）和 `pageId` 回退预期漂移。
  - `node scripts/node/check-style-boundary.js file web/app/src/features/frontstage/pages/FrontStagePage.tsx` 仍返回“未声明页面/组件场景映射”，页面级验收门禁未闭合。

- `#150` 暂不签收，建议状态改为 `5.验收不通过`，原因不是路由行为错误，而是缺少仓库要求的页面样式门禁映射。
  证据：
  - `/frontstage/workspace-1/page-1` 与 `/frontstage/workspace-1` 的 `page-debug` 桌面快照都可正常打开，页面与导航骨架工作正常。
  - 移动端 `390px` Playwright 复核中，`/frontstage/workspace-1/page-1` 的 `scrollWidth === innerWidth === 390`，没有立即出现横向溢出。
  - 但 `node scripts/node/check-style-boundary.js file web/app/src/features/frontstage/pages/FrontStagePage.tsx` 返回“未声明页面/组件场景映射”。
  - `node scripts/node/check-style-boundary.js file web/app/src/routes/route-config.ts` 也没有场景映射。
  - 在本仓库规则下，导航/路由/页面改动缺少 style-boundary 场景，不能直接签收为验收通过。

- `#154` 建议状态改为 `5.验收不通过`。
  证据：
  - `FrontStagePage` 的设计态工具栏按钮行为已存在，`src/features/frontstage/_tests/FrontStagePage.test.tsx` 第 `54-68` 行对应测试可以通过。
  - 但同一测试文件当前为 `22` 通过、`9` 失败，不能把“工具栏骨架”单独抬到 `3.测试完成` 或 `4.验收通过`。
  - `FrontStagePage.tsx` 仍缺少 style-boundary 场景映射，命中仓库前端验收硬门禁。

- `#155` 建议状态改为 `5.验收不通过`。
  证据：
  - 最新提交已经把页面树补到本地交互：`FrontStagePage.tsx` 通过 `useState` 维护 `pageTree`、`selectedPageId`，并补了 `handleAddPage`、`handleDeleteNode` 与 pageId-less 路由同步。
  - 但当前页面管理真值仍完全停留在前端内存态，没有页面树 API、默认首页后端解析、`frontstage_pages` / `frontstage_block_codes` / `codeRef` 对应 DTO 或控制面接入，离 #149 定义的后端真值优先仍有明显距离。
  - 同样受限于前述目标测试红灯与 style-boundary 缺失，不能签收。

- `#182` 建议状态回退为 `5.验收不通过`。
  证据：
  - 该 issue 评论曾写成 `4.验收通过`，但项目记忆中此前没有对应通过记录。
  - 当前 `FrontStagePage` 目标测试套件仍为红灯，其中多条删除相关用例都在 `getByRole('button', { name: '删除' })` 处失败；DOM 中实际可访问名表现为 `删 除`，说明该子任务没有形成稳定的验收证据。
  - `FrontStagePage.tsx` 第 `453-462` 行把页面节点 `li` 覆盖成 `role="button"`，导致此前“页面树节点语义化”子任务的 `listitem` 语义再次消失，也增加了删除类用例与可访问性交互的不稳定性。

- `#149` 整体仍保持 `1.开发中`。
  原因：
  - 先前记忆里把编号写成了 `2.开发中`，与用户本轮固定的 `1-5` 状态枚举不一致；当前已统一修正为 `1.开发中`。
  - 当前前台已从静态壳层推进到“本地状态页面树 + pageId 路由同步”的前端骨架阶段。
  - 但页面树真值、后端默认首页解析、布局持久化、schema storage 编排、block initializer、codeRef/code storage 等主体范围仍未开始闭环。
  - 当前新增问题不止是门禁缺失，还包括页面树语义回退与测试基线漂移；这意味着前端骨架还没进入可稳定继续堆功能的阶段。

## 关联文档

- `docs/plans/2026-05-15-js-extension-platform-architecture.md`
- `web/AGENTS.md`
- `web/app/src/features/frontstage/pages/FrontStagePage.tsx`
- `web/app/src/features/frontstage/_tests/FrontStagePage.test.tsx`
- `tmp/page-debug/2026-05-15T20-41-08-407Z/`
