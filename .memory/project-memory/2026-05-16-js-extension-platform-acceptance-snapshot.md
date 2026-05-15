---
memory_type: project
topic: js-extension-platform-acceptance-snapshot
summary: 2026-05-16 07 的 JS 扩展平台验收跟进显示：#142 总体与 #143、#144、#146、#147、#148、#149 仍处于 `1.开发中`；#143 依旧被 `JsDependencyPermissionsManifest: Default` 编译错误和 `runtime.protocol`/`entry` 合同错位阻断；#145 在主干上已经修复 flow 级结构化错误载荷持久化，但当前验证又被 #143 与未提交的 `access-control` E0282 阻断，Code 节点仍只有 not-implemented 分支；#149 的 target suite 已改善到 `34` 项里 `1` 红，但 style-boundary 缺失、前台 API 仍返回空树，因此当前仍只有 #152 可判 `4.验收通过`，#182 继续维持 `5.验收不通过`，#175 不能按“验收通过”处理。
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
updated_at: 2026-05-16 07
last_verified_at: 2026-05-16 07
decision_policy: verify_before_decision
scope:
  - docs/plans/2026-05-15-js-extension-platform-architecture.md
  - docs/plans/2026-05-15-code-node-isolation-architecture.md
  - api/crates/plugin-framework/src/host_contract.rs
  - api/crates/plugin-framework/src/manifest_v1.rs
  - api/crates/orchestration-runtime/src/execution_engine.rs
  - api/crates/control-plane/src/orchestration_runtime/live_debug_run/continuation.rs
  - api/crates/control-plane/src/orchestration_runtime/live_debug_run/run_detail.rs
  - api/apps/api-server/src/routes/frontstage/mod.rs
  - web/app/src/features/frontstage/pages/FrontStagePage.tsx
---

# JS extension platform acceptance snapshot

## 时间

`2026-05-16 07`

## 谁在做什么

用户继续对 JS 扩展平台总计划 `#142` 及其子计划 `#143` 到 `#149` 做阶段性验收。本轮只允许输出纠正建议，不参与改代码；若某子项已在项目记忆中确认通过，则后续轮次可直接跳过重复复核。

## 为什么这样做

凌晨的验收快照里有两类已过时信息：一类是 `#145` 里“flow 级错误 payload 被降级成 message”的问题已经在主干修掉；另一类是 `#149` 的前端 target suite 已从大面积失败收敛到只剩一条红灯。如果不把这两点同步回项目记忆，后续模型会继续按旧失败分布做错误判断。

## 为什么要做

JS 扩展平台跨插件 manifest、运行时、Code 节点、前台路由和页面编排。验收的价值不是只看“是否有提交”，而是持续记录当前真正卡在哪一层，避免后续模型在错误的前提上继续串行推进。

## 截止日期

`2026-05-16 07`

## 决策背后动机

- `#142` 总体状态建议保持 `1.开发中`。
  证据：
  - 总体验收项要求的 dependency pack 安装登记、应用依赖启用与发布快照、Code node import 校验、frontend block runtime、`ctx.data` CRUD、runner 扩展预留都没有形成仓库级闭环。
  - 当前各子项虽然持续有“开发完成/测试完成”评论，但还没有一个主链路把前后端和运行时串成可稳定复核的 green baseline。

- `#143` 建议保持 `1.开发中`。
  证据：
  - `cargo test -p orchestration-runtime unknown_node_type_returns_not_implemented_failure_in_debug_runtime -- --nocapture` 与 preview 对应 targeted test 都在编译 `plugin-framework` 阶段失败，直接卡在 `api/crates/plugin-framework/src/manifest_v1.rs:88` 的 `JsDependencyPermissionsManifest` 缺少 `Default`。
  - `api/crates/plugin-framework/src/manifest_v1.rs:209-214` 仍强制 `runtime.protocol` 只能是 `stdio_json` / `native_host` 且 `runtime.entry` 非空，与讨论稿要求的 `runtime.protocol: declarative`、`entry: none` 仍然不一致。
  - 仓库里依旧没有 plugin install registration、workspace dependency catalog 或安装后查询链路，说明本 issue 仍停留在 manifest 层且 manifest 本身还未达到可编译状态。

- `#144` 建议保持 `1.开发中`。
  证据：
  - 仓库搜索仍未发现 application dependency selection、dependency snapshot、Code import alias 校验或发布快照固化的实现痕迹。
  - 当前前后端新增内容都没有把 dependency pack 真正接进应用级启用和运行时 import 解析链路。

- `#145` 建议保持 `1.开发中`。
  证据：
  - `api/crates/control-plane/src/orchestration_runtime/live_debug_run/run_detail.rs:70-104` 现在已经会保留 JSON 结构化错误 payload，之前“flow 级错误只剩 message”的结论已失效，不能再沿用。
  - 但当前 targeted runtime 验证仍无法真正开始：`plugin-framework` 的 `Default` 缺失仍阻断编译，且未提交的 `api/crates/access-control/src/catalog.rs:189-202` 还新增了 `manager_permissions` 类型推断 `E0282`。
  - `api/crates/orchestration-runtime/src/execution_engine.rs:365-418` 与 `api/crates/control-plane/src/orchestration_runtime/live_debug_run/continuation.rs:951-1005` 目前仍只是在 preview/debug 两条链路上扩展 not-implemented 错误分支；仓库里依然没有 `CompiledCodeRuntime`、`CodeInvoker`、真实 JS runner 或 `zod` import 闭环。
  - `pnpm --dir web/app test -- src/features/agent-flow/_tests/validate-document.test.ts` 当前为 `24 passed`，说明前端 `config.language` 收敛为 `javascript` 的校验补丁本身没有问题；但这只覆盖配置入口，不代表 Code 节点运行时已经具备可验收闭环。
  - 子任务 `#175` 曾被评论写成 `4.验收通过`，但项目记忆从未背书；而当前主干只能确认“结构化错误 payload 修复已落地、整条 targeted runtime 验证仍被阻断”，因此不能按“验收通过”处理，安全口径应停留在 `2.开发完成`。

- `#146` 建议保持 `1.开发中`。
  证据：
  - 仓库中仍未出现 `frontend_block` manifest、`@1flowbase/block-sdk`、`@1flowbase/antd-facade`、worker runtime 或 `ctx.data` 受控 CRUD 桥接实现。
  - 当前前台工作更多集中在页面树和设计态骨架，不是 Block Runtime、schema primitive 或 restricted renderer 的实现。

- `#147` 建议保持 `1.开发中`。
  证据：
  - `api/crates/plugin-framework/src/host_contract.rs:37-59` 的 `RuntimeSlotCode` 仍没有 `code_executor`。
  - 仓库搜索依然没有 `NodeIsolationProfile` 或 resolved isolation profile 进入 Code 节点执行链路的落地代码。

- `#148` 建议保持 `1.开发中`。
  证据：
  - 仓库搜索仍未发现 `ui_block.javascript.native`、独立 React root、portal containment 或 trusted native block runtime 的实现。

- `#149` 建议保持 `1.开发中`。
  证据：
  - `pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/app-shell/_tests/navigation.test.tsx src/features/frontstage/_tests/FrontStagePage.test.tsx` 当前结果是 `34` 项中 `33` 过、`1` 失败；失败点为 `src/features/frontstage/_tests/FrontStagePage.test.tsx:766` 仍按可访问名 `重试` 查按钮，但运行态实际可访问名是 `重 试`。
  - `node scripts/node/check-style-boundary.js file web/app/src/features/frontstage/pages/FrontStagePage.tsx` 与 `... route-config.ts` 仍然双双失败，原因都是缺少页面/组件场景映射；这在仓库规则下意味着页面还未达到可签收状态。
  - `api/apps/api-server/src/routes/frontstage/mod.rs:52-64` 的 `list_frontstage_pages` 现在只是做了 session 和 workspace access 校验，最终仍固定返回空数组；页面树真值尚未进入后端 DTO 或持久化链路。
  - `web/app/src/features/frontstage/pages/FrontStagePage.tsx` 仍以本地 `pageTree` 状态驱动默认页、删除、重命名和分组行为，说明页面编排仍停留在前端内存态骨架。
  - 只有 `#152` 继续满足“内部登录用户可浏览前台”的验收条件；此前被误写成 `4.验收通过` 的 `#182` 已有项目记忆和 issue 评论双重回退依据，不应再恢复。

- 子任务 `#152` 建议状态保持 `4.验收通过`。
  证据：
  - 项目记忆 `2026-05-16-frontstage-issues-150-152-acceptance-status.md` 已确认其路由权限边界满足“`permissionKey: null` + `guard: session-required`”。
  - 本轮 `route-config` 与 `navigation` targeted tests 继续通过，没有出现回归。

- 子任务 `#182` 建议状态保持 `5.验收不通过`。
  证据：
  - 该 issue 评论曾写成 `4.验收通过`，但项目记忆未曾背书，且后续已在 issue 评论里明确回退。
  - 当前 frontstage target suite 虽已大幅收敛，但仍未清零，style-boundary 也仍未闭合，因此没有重新抬回 `4` 的依据。
