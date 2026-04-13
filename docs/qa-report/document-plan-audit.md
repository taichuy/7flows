# 文档计划审计优化报告

日期：`2026-04-14 06`

说明：本文件为滚动版本，覆盖 `2026-04-14 05` 的同主题旧结论；只保留当前仍有效、且已被代码、文档或验证结果支撑的判断。

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：
  - `docs/superpowers`
  - `docs/userDocs`
  - `docs/qa-report`
  - `api/`
  - `web/`
  - `scripts/node/verify-backend.js`
  - `scripts/node/check-style-boundary.js`
- 输入来源：
  - 记忆：
    - `.memory/AGENTS.md`
    - `.memory/user-memory.md`
    - `.memory/project-memory/2026-04-12-backend-quality-spec-scope.md`
    - `.memory/project-memory/2026-04-13-backend-governance-phase-two-direction.md`
    - `.memory/project-memory/2026-04-13-frontend-qa-current-state.md`
    - `.memory/project-memory/2026-04-13-frontend-bootstrap-regression-governance-direction.md`
    - `.memory/project-memory/2026-04-13-api-docs-scalar-evaluation.md`
  - 文档：
    - `docs/superpowers/specs/1flowse/README.md`
    - `docs/superpowers/specs/1flowse/modules/README.md`
    - `docs/superpowers/specs/1flowse/modules/*/README.md`
    - `docs/superpowers/specs/1flowse/2026-04-13-console-shell-auth-settings-design.md`
    - `docs/userDocs/todolist/document-plan-audit.md`
  - 代码：
    - `web/AGENTS.md`
    - `web/app/src/app-shell/AppShellFrame.tsx`
    - `web/app/src/app-shell/Navigation.tsx`
    - `web/app/src/routes/route-config.ts`
    - `web/app/src/features/home/pages/HomePage.tsx`
    - `web/app/src/features/embedded-apps/pages/EmbeddedAppsPage.tsx`
    - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
    - `web/app/src/features/embedded-runtime/pages/EmbeddedMountPage.tsx`
    - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
    - `web/app/src/app/_tests/app-shell.test.tsx`
    - `web/app/src/routes/_tests/route-config.test.ts`
    - `web/app/src/routes/_tests/route-guards.test.tsx`
    - `web/app/src/style-boundary/scenario-manifest.json`
    - `web/package.json`
    - `web/packages/*/package.json`
    - `api/crates/publish-gateway/src/lib.rs`
    - `api/apps/plugin-runner/src/lib.rs`
    - `api/crates/plugin-framework/src/assignment.rs`
    - `api/crates/control-plane/src/model_definition.rs`
    - `api/crates/runtime-core/src/runtime_engine.rs`
    - `api/crates/storage-pg/src/model_definition_repository.rs`
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：`2026-04-14 06:01:49 +0800`
  - `pnpm --dir web lint`：通过
  - `pnpm --dir web test -- --testTimeout=15000`：通过
    - `web/app`：`10` 个测试文件、`19` 个用例通过
    - `web/packages/embed-sdk`：`1` 个测试文件、`1` 个用例通过
    - `web/packages/embedded-contracts`：`1` 个测试文件、`1` 个用例通过
    - `web/packages/api-client`、`flow-schema`、`page-protocol`、`page-runtime`、`shared-types`、`ui`：`passWithNoTests`
  - `pnpm --dir web/app build`：通过；`dist/assets/index-n9-QTwmx.js` 为 `1,184.41 kB`，触发 Vite chunk size warning
  - `node scripts/node/check-style-boundary.js all-pages`：
    - 沙箱内首次失败：`listen EPERM: operation not permitted 0.0.0.0:3100`
    - 提权复跑通过：`PASS page.home`、`PASS page.embedded-apps`、`PASS page.agent-flow`
  - `node scripts/node/verify-backend.js`：
    - 沙箱内首次失败：`api/apps/api-server/src/_tests/support.rs:37` 返回 `Operation not permitted`
    - 提权复跑通过：后端统一验证脚本退出 `0`
    - 关键通过项：
      - `api-server`：`19` 个库内测试通过
      - `control-plane`：`14` 个测试通过
      - `runtime-core`：`6` 个测试通过
      - `storage-pg`：`12` 个测试通过
      - `plugin-framework`：`3` 个测试通过
- 未运行的验证：
  - 真实浏览器登录、退出、改密、团队设置主路径
  - 移动端人工回归
  - `publish-gateway` 与 `plugin-runner` 端到端联调

## Conclusion

- 是否存在 `Blocking` 问题：未发现被当前代码和验证结果直接证明的 `Blocking` 问题
- 是否存在 `High` 问题：有，集中在文档真相层、模块状态真相层、前端导航语义真相层
- 当前是否建议继续推进：建议继续推进，但不建议继续为同一主题平铺新增顶层 `spec/plan`
- 当前最主要的风险：项目当前最失真的不是统一门禁，而是“文档和界面对项目成熟度的表达”

## 1. 当前现状

### 1.1 代码现状

- 后端：
  - `auth / team / member / role / permission / session / model-definition / runtime-data` 已有真实实现与自动化验证支撑。
  - `publish-gateway` 仍只有 `crate_name()`，见 `api/crates/publish-gateway/src/lib.rs:1-3`。
  - `plugin-runner` 当前主要是健康检查与启动壳层，见 `api/apps/plugin-runner/src/lib.rs:8-62`。
- 前端：
  - 路由真值层、共享壳层、基础测试和 `style-boundary` 门禁都已建立。
  - 但正式控制台语义还没有收口，`AppShellFrame`、页面文案、路由 guard 和测试仍保留 `bootstrap` 口径。
- 规模与压力：
  - `api/ + web/` 非构建产物代码总行数约 `16859`。
  - 当前跟踪测试文件数为 `55`。
  - 最大热点文件为 `api/crates/storage-pg/src/model_definition_repository.rs`，`1181` 行；尚未越过 `1500` 行硬约束，但已进入需要重点观察的区间。

### 1.2 文档现状

- `docs/superpowers/specs/1flowse` 顶层共有 `22` 个 Markdown，合计 `8868` 行。
- `docs/superpowers/plans` 当前有 `16` 个 Markdown，合计 `11664` 行，已超过“单目录不超过 `15` 个文件”的项目约定。
- `docs/superpowers/specs/1flowse/README.md` 当前只索引了 `10` 个入口，见 `docs/superpowers/specs/1flowse/README.md:5-26`。
- `docs/userDocs` 当前只有 `1` 个文件，且该文件仍是内部治理 todo，不是用户侧现状入口。

### 1.3 更准确的成熟度判断

- 模块 `01`：
  - 后端主链路真实完成度最高，且已有统一验证脚本支撑。
  - 前端尚未形成“正式控制台”语义。
- 模块 `02/05/07`：
  - 后端治理基础存在，且自动化验证较完整。
- 模块 `03/04/06/08`：
  - 文档大量写成 `completed`，但实现层分别存在占位页、壳层能力或最小骨架，不能直接按“已完成模块”理解。

## Findings

### [High] `docs/superpowers` 缺少生命周期与入口契约，`plans` 已经在承担执行流水而不是计划

- 位置：
  - `docs/superpowers/specs/1flowse/README.md:5-26`
  - `docs/superpowers/plans`
  - `docs/superpowers/plans/2026-04-13-frontend-bootstrap-realignment.md:917-982`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md:2942-2961`
- 证据：
  - `specs/1flowse` 顶层有 `22` 个文件，但根 `README` 只列了 `10` 个入口。
  - `plans` 目录已有 `16` 个文件，超过目录文件数约定。
  - `plans` 中有 `6` 个文件超过 `1000` 行，`2` 个文件超过 `1500` 行：
    - `2026-04-12-auth-team-access-control-backend.md`：`2967` 行
    - `2026-04-11-fullstack-bootstrap.md`：`1911` 行
  - 计划文档中保留了大量已执行步骤、截图命令、`git commit` 命令和“Expected: PASS”式执行记录，已经更像实现流水账而不是活动计划。
- 为什么是问题：
  - 当前不是“文档太多”，而是“入口失真 + 生命周期缺失 + 类型职责漂移”。
  - 当计划文档既承担计划、又承担执行过程、又承担结果留档时，后续检索会先命中过时步骤，而不是命中当前有效结论。
- 建议修正方向：
  - 固定 `specs / plans / qa-report / userDocs / modules` 的职责矩阵。
  - 给 `plans` 增加统一生命周期：`active / completed / archived`。
  - 已完成 plan 不再保留完整执行流水，改为保留摘要、结果和证据链接。

### [High] 模块状态口径把“设计确认”写成了“模块完成”，项目成熟度被系统性高估

- 位置：
  - `docs/superpowers/specs/1flowse/modules/README.md:31-42`
  - `api/crates/publish-gateway/src/lib.rs:1-3`
  - `api/apps/plugin-runner/src/lib.rs:8-62`
  - `web/app/src/features/home/pages/HomePage.tsx:16-29`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx:5-8`
- 证据：
  - 模块总览将 `01`、`03`、`04`、`05`、`06`、`07`、`08` 标为 `completed`。
  - `06 发布网关与 API 文档` 被写成 `completed`，但 `publish-gateway` 代码当前仍只有一个返回 crate 名称的方法。
  - `08 插件体系` 被写成 `completed`，但 `plugin-runner` 仍主要是健康检查壳层；`plugin-framework` 当前只覆盖最小绑定约束。
  - `03`、`04` 对应前端页面仍处于 bootstrap/占位或解释性页面状态，而非正式业务页面。
- 为什么是问题：
  - `completed` 同时混用了“讨论完成”“方案定稿”“骨架存在”“实现完成”“验证通过”五种含义。
  - 这会直接误导下一轮排期、模块优先级和对外沟通口径。
- 建议修正方向：
  - 模块状态改成三轴：
    - `design_status`
    - `implementation_status`
    - `verification_status`
  - 模块总览只允许写能被代码或验证结果举证的状态，并附证据链接。

### [High] `web` 的路由真值层已经“结构集中”，但还没有“语义集中”，导航与页面职责不一致

- 位置：
  - `web/app/src/routes/route-config.ts:12-47`
  - `web/app/src/app-shell/AppShellFrame.tsx:15-18`
  - `web/app/src/features/home/pages/HomePage.tsx:16-29`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppsPage.tsx:11-18`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx:6-30`
  - `web/app/src/features/embedded-runtime/pages/EmbeddedMountPage.tsx:8-26`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx:5-8`
  - `web/app/src/routes/_tests/route-config.test.ts:16-18`
  - `web/app/src/routes/_tests/route-guards.test.tsx:7-15`
  - `web/app/src/app/_tests/app-shell.test.tsx:20-45`
- 证据：
  - 壳层标题仍是 `1Flowse Bootstrap`。
  - `home` 的导航文案是“工作台”，但页面主体仍是 `Workspace Bootstrap` 和 `API Health`。
  - `embedded-apps` 的导航文案是“团队”，但页面主体是 `Embedded Apps`。
  - `agent-flow` 的导航文案是“前台”，但页面主体仍是“后续编排编辑器入口”的说明卡片。
  - 路由元数据和测试都还把 guard 固化为 `bootstrap-allow`。
  - 详情页和挂载页仍保留 `placeholderManifest`、`Demo Embedded App`、`bootstrap-application`、`bootstrap-team` 等过渡语义。
- 为什么是问题：
  - 按 `frontend-logic-design` 口径看，当前问题不只是不够“正式”，而是导航语义、页面职责和下钻模型没有统一真相层。
  - 这会让路由虽然集中在一个文件里，但该文件只集中“字符串”，没有集中“产品语义”。
- 建议修正方向：
  - 前端下一轮不要零散改词，而是做一轮“语义收口”。
  - 更推荐走“模块 `01` 最小正式控制台”路线：只保留当前真实能承载的入口，隐藏未完成模块入口。
  - `route id / navLabel / page title / permissionKey / guard` 需要按同一业务语义一起收口。

### [Medium] 当前绿色门禁更接近“工程门禁已建立”，不等于“产品主路径已验证完毕”

- 位置：
  - `web/package.json:8-15`
  - `web/packages/*/package.json`
  - `web/app/src/style-boundary/scenario-manifest.json:1-134`
  - `scripts/node/verify-backend.js:19-37`
- 证据：
  - `pnpm --dir web test -- --testTimeout=15000` 通过，但 `api-client`、`flow-schema`、`page-protocol`、`page-runtime`、`shared-types`、`ui` 都是 `vitest run --passWithNoTests`。
  - `style-boundary` 当前只注册了 `5` 个场景：`2` 个组件场景、`3` 个页面场景。
  - `style-boundary` 和后端统一验证在沙箱里都不能完整成立，分别依赖本机端口监听和本机测试依赖。
  - 真实浏览器主路径、移动端回归、发布链路和插件运行链路本轮未覆盖。
- 为什么是问题：
  - 当前绿灯能说明“质量门禁骨架可用”，但不能直接说明“所有关键用户路径已就绪”。
  - 如果不拆分验证层级，后续很容易把 `passWithNoTests`、样式边界回归和产品主路径验证混写成同一类“通过”。
- 建议修正方向：
  - 把 QA 结果固定拆成四层：
    - `static gates`
    - `sandbox-safe tests`
    - `local-service verification`
    - `manual product checks`
  - 为 `passWithNoTests` 的 package 建“补测或显式豁免”清单。

### [Medium] `docs/userDocs` 仍未承担用户侧真相层职责

- 位置：
  - `docs/userDocs`
  - `docs/userDocs/todolist/document-plan-audit.md`
- 证据：
  - 当前 `docs/userDocs` 下只有 `1` 个 Markdown。
  - 该文件仍是内部治理 todo，而不是“现在做到哪一步”的稳定入口。
  - 当前项目状态、模块成熟度和验证边界仍主要散落在 `docs/superpowers` 与 `.memory`。
- 为什么是问题：
  - 用户离线回看项目状态时，仍然需要同时钻 `specs`、`plans`、`qa-report` 和 `.memory` 才能知道“现在哪些是真的”。
  - 这会让 `docs/userDocs` 失去应有价值。
- 建议修正方向：
  - 先冻结 `docs/userDocs` 的最小信息架构，再开始写正文。
  - 最小建议：
    - 项目现状页
    - 模块状态矩阵页
    - 状态/术语说明页
    - 滚动 todo 页

## 2. 基于现状的改进方向、结果、好处和风险

| 方向 | 预期结果 | 好处 | 风险 |
| --- | --- | --- | --- |
| 固定文档类型职责矩阵，并给 `plans` 增加 `active / completed / archived` 生命周期 | 文档入口恢复可检索性；执行流水不再污染活动计划 | 降低检索成本，避免同主题重复造文档 | 需要一次性整理历史文档，短期成本较高 |
| 将模块状态改成 `design / implementation / verification` 三轴 | 模块成熟度表达回到可举证状态 | 排期和讨论更诚实，不再高估完成度 | 会暴露一些“此前写成已完成”的模块其实仍未实现 |
| 做一轮前端语义收口，优先回到“模块 `01` 最小正式控制台” | 导航、页面、测试和文档指向同一套语义 | 用户路径更清晰，后续功能扩展不再继续背着 bootstrap 包袱 | 短期内需要隐藏部分 prototype 入口，视觉上会显得更收敛 |
| 固定 QA 四层说明，并为 `passWithNoTests` 建清单 | QA 绿灯含义更诚实 | 后续讨论不会混淆“静态通过”和“产品已验证” | 报告和门禁说明会更复杂，需要维护纪律 |
| 为 `docs/userDocs` 建立最小信息架构 | 用户可以直接看到项目现状与模块矩阵 | 用户离线回看更高效，减少反复钻内部文档 | 需要持续同步，否则会再次失真 |
| 将 `storage-pg` 热点文件纳入 watchlist，在下一轮改动时顺手拆分 | 避免热点文件继续逼近 `1500` 行上限 | 提前阻断后续腐化 | 现在就强拆收益有限，不建议抢在真相层治理前面做 |

## 3. 我的建议

1. 先暂停同主题新增顶层 `spec/plan`，优先做文档类型职责矩阵和模块状态三轴矩阵。
2. 前端下一轮建议明确选择“模块 `01` 最小正式控制台”路线，隐藏暂未承载真实业务语义的入口，不继续在正式 `web` 上叠加 `bootstrap/demo/placeholder`。
3. 把 QA 输出固定拆成四层说明，避免再把 `passWithNoTests`、样式边界、统一验证和手工主路径混写成一个“都通过了”。
4. `docs/userDocs` 的第一页建议先写“项目现状”，第二页再写“模块状态矩阵”；不要先扩更多内部 spec 再回头补用户文档。
5. 当前不建议把前端 bundle 优化、热点文件拆分放到第一优先级；它们是下一轮治理完成后的第二阶段事项。

## Uncovered Areas / Risks

- 本轮未做真实浏览器下的登录、退出、改密、团队设置人工走查。
- 本轮未做移动端人工回归，当前只确认了工程层面可构建，并未确认关键页面小屏体验。
- `style-boundary` 只能证明已注册场景的样式边界与 blast radius，不直接代表泛 UI 质量。
- 后端统一验证当前依赖本机测试环境，报告结论应写成“本地服务依赖可用时通过”，而不是“纯沙箱无依赖通过”。
- `publish-gateway`、`plugin-runner` 当前更多是骨架能力，任何涉及发布链路或插件运行链路的成熟度判断都应谨慎下结论。
