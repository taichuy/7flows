---
memory_type: project
topic: js-extension-platform-acceptance-snapshot
summary: 2026-05-16 04 的 JS 扩展平台验收快照显示：#142 总体与 #143-#149 仍处于 `1.开发中`，当前只有 #149 的子任务 #152 可判 `4.验收通过`；#143 的 `js_dependency_pack` 当前连 targeted cargo test 都无法编译通过，且 manifest 校验仍拒绝讨论稿要求的 `runtime.protocol: declarative` / `entry: none`；#145 的 Code 节点仍只有 not-implemented 错误分支且 live debug 会把 flow 级错误 payload 降级为仅 `message`；#149 的 frontstage 目标测试已扩大为 `31` 中 `9` 红，style-boundary 场景映射仍缺失，因此此前被评论写成 `4.验收通过` 的子任务 `#175`、`#182` 均应回退。
keywords:
  - js-extension-platform
  - acceptance
  - issue-142
  - issue-143
  - issue-144
  - issue-145
  - issue-146
  - issue-147
  - issue-148
  - issue-149
match_when:
  - 需要继续验收 JS 扩展平台相关实现时
  - 需要判断 #142 到 #149 当前应该推进哪一项时
created_at: 2026-05-16 01
updated_at: 2026-05-16 04
last_verified_at: 2026-05-16 04
decision_policy: verify_before_decision
scope:
  - docs/plans/2026-05-15-js-extension-platform-architecture.md
  - docs/plans/2026-05-15-code-node-isolation-architecture.md
  - api/crates/plugin-framework/src/host_contract.rs
  - api/crates/plugin-framework/src/manifest_v1.rs
  - api/crates/orchestration-runtime/src/execution_engine.rs
  - api/crates/control-plane/src/orchestration_runtime/live_debug_run/continuation.rs
  - api/crates/control-plane/src/orchestration_runtime/live_debug_run/run_detail.rs
  - web/app/src/features/frontstage/pages/FrontStagePage.tsx
---

# JS extension platform acceptance snapshot

## 时间

`2026-05-16 04`

## 谁在做什么

用户安排对 JS 扩展平台总计划 `#142` 及其子计划 `#143` 到 `#149` 做阶段性验收。本轮要求只输出纠正指导，不参与改代码；若已有子项在项目记忆中被确认通过，则跳过重复验收，直接检查下一项。

## 为什么这样做

GitHub issue 评论里已经出现多条“开发完成”同步，但当前主分支的真实代码、测试和门禁证据并没有支撑整个平台进入“测试完成”或“验收通过”。需要把“已提交骨架”与“已通过验收”拆开，减少后续模型误判。

## 为什么要做

JS 扩展平台跨前后端、插件系统、运行时和页面编排；如果不先把当前完成度固定下来，后续容易在没有后端真值、没有运行时闭环和没有 QA 证据的前提下继续堆前端壳层，造成验收口径漂移。

## 截止日期

`2026-05-16 04`

## 决策背后动机

- `#142` 总体状态建议保持 `1.开发中`。
  证据：
  - 总体验收项要求的 dependency pack、Code node import 校验、发布快照、frontend block runtime、`ctx.data` CRUD、runner 扩展预留都没有形成仓库级闭环。
  - 当前主分支虽然新增了 `js_dependency_pack` manifest 校验和 code node not-implemented 分支，但后端 targeted cargo test 已被 `plugin-framework` 编译失败打断，说明仓库主线还没达到可继续串行开发的稳定基线。

- `#143` 建议保持 `1.开发中`。
  证据：
  - `cargo test -p plugin-framework js_dependency_pack -- --nocapture` 当前直接编译失败：`api/crates/plugin-framework/src/manifest_v1.rs` 中 `JsDependencyPermissionsManifest` 没有实现 `Default`，但 `JsDependencyManifest.permissions` 在第 `88` 行使用了 `#[serde(default)]`。
  - `manifest_v1.rs` 第 `209-214` 行仍强制 `runtime.protocol` 只能是 `stdio_json` / `native_host` 且 `runtime.entry` 非空，与讨论稿示例 `runtime.protocol: declarative`、`entry: none` 不一致。
  - 仓库搜索仍未发现 plugin install registration、workspace dependency catalog 或安装后查询链路，说明该 issue 的“manifest + 安装登记”只落了前半段，而且当前前半段还未达到可编译状态。

- `#144` 建议保持 `1.开发中`。
  证据：
  - 仓库中未见 application dependency selection、dependency snapshot 或 import alias 校验的实现痕迹。
  - 本轮仓库扫描没有发现与应用级 dependency 启用、发布快照固化或 Code import 校验相匹配的控制面/运行时实现提交。

- `#145` 建议保持 `1.开发中`。
  证据：
  - `cargo test -p orchestration-runtime code_node_returns_not_implemented_failure_in_debug_runtime -- --nocapture` 当前无法执行到目标测试，编译阶段就被 #143 的 `plugin-framework` 错误阻断。
  - `api/crates/orchestration-runtime/src/execution_engine.rs` 与 `api/crates/control-plane/src/orchestration_runtime/live_debug_run/continuation.rs` 现在只新增了 code 节点的显式失败分支，并没有 `CompiledCodeRuntime`、`CodeInvoker`、真实 JS runner 或 `zod` import 闭环。
  - `api/crates/control-plane/src/orchestration_runtime/live_debug_run/continuation.rs` 第 `951-972` 行先构造了包含 `error_code/node_type/message` 的 node 级 payload，但 `run_detail.rs` 第 `70` 行会把 flow 级失败持久化为仅 `{ "message": ... }`，导致错误语义在 flow 级别丢失。

- `#146` 建议保持 `1.开发中`。
  证据：
  - 仓库搜索未发现 `frontend_block` manifest、`@1flowbase/antd-facade`、`@1flowbase/block-sdk`、worker runtime 或 `ctx.data` 受控 CRUD 桥接实现。
  - 当前 `web/app/src/features/frontstage/` 虽已新增本地页面树交互，但仍只有前台壳层页面与测试文件，没有区块 runtime、facade、host renderer 或 schema primitive 实现。

- `#147` 建议保持 `1.开发中`。
  证据：
  - `api/crates/plugin-framework/src/host_contract.rs` 的 `RuntimeSlotCode` 仍无 `code_executor`。
  - 仓库搜索未发现 `NodeIsolationProfile` 或 resolved isolation profile 进入 Code 节点执行链路。

- `#148` 建议保持 `1.开发中`。
  证据：
  - 仓库搜索未发现 `ui_block.javascript.native`、independent React root、portal containment 或 native trusted block 运行时实现。

- `#149` 建议保持 `1.开发中`。
  证据：
  - `pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/app-shell/_tests/navigation.test.tsx src/features/frontstage/_tests/FrontStagePage.test.tsx` 当前结果是 `route-config` 与 `navigation` 通过，但 `FrontStagePage` 为 `31` 项中的 `9` 项失败。
  - `node scripts/node/page-debug.js snapshot /frontstage/workspace-1/page-1 --wait-for-selector "text=页面管理" --wait-for-url "http://127.0.0.1:3100/frontstage/workspace-1/page-1"` 当前仍返回 `ready_with_selector`，说明浏览路径和登录态路由没有坏；但 `node scripts/node/check-style-boundary.js file web/app/src/features/frontstage/pages/FrontStagePage.tsx` 与 `... route-config.ts` 仍都报“未声明页面/组件场景映射”。
  - `web/app/src/features/frontstage/pages/FrontStagePage.tsx` 已从静态空态推进到本地 `pageTree` / `selectedPageId` 状态管理，但页面树、默认首页和删除逻辑仍是前端内存态，不是后端 DTO 真值；`api` 目录下搜索 `frontstage_pages` 与 `frontstage_block_codes` 仍无结果。
  - 已有项目记忆确认只有子任务 `#152` 可判 `4.验收通过`；而此前在 issue 评论里被写成 `4.验收通过` 的 `#182` 缺少项目记忆背书，且当前 target suite 仍为红灯，因此需要回退。

- 子任务 `#175` 建议状态回退为 `5.验收不通过`。
  证据：
  - 该 issue 评论已写成 `4.验收通过`，但项目记忆中此前没有任何通过记录。
  - 当前与其直接相关的 targeted cargo test 链路被 #143 的编译错误阻断，无法在当前主干复核通过。
  - 即便静态看代码，live debug flow 级错误 payload 仍被降级成只有 `message`，不满足“稳定错误语义可观察”的收口要求。
