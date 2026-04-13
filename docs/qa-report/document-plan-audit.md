# 文档计划审计优化报告

日期：`2026-04-14 00`

说明：本文件为唯一滚动版本；本轮结论已覆盖并替换 `2026-04-13 06` 的旧报告。已失效或已关闭的问题不再重复列为当前 Findings。

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs/todolist`、`docs/qa-report`、`api/`、`web/`
- 输入来源：
  - `.memory/AGENTS.md`
  - `.memory/user-memory.md`
  - `.memory/feedback-memory/interaction/2026-04-12-no-extra-confirmation-when-explicit.md`
  - `.memory/feedback-memory/repository/2026-04-13-style-boundary-scope-only-boundary-and-expansion.md`
  - `.memory/project-memory/2026-04-13-backend-governance-phase-two-direction.md`
  - `.memory/project-memory/2026-04-13-frontend-qa-current-state.md`
  - `.memory/project-memory/2026-04-13-backend-kernel-quality-implemented.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
  - `docs/superpowers/plans/2026-04-13-frontend-bootstrap-realignment.md`
  - `docs/superpowers/plans/2026-04-13-style-boundary-runtime-regression.md`
  - `docs/superpowers/plans/2026-04-13-backend-governance-phase-two.md`
  - `web/app/src/app/router.tsx`
  - `web/app/src/app-shell/AppShellFrame.tsx`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppsPage.tsx`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
  - `web/app/src/styles/globals.css`
  - `api/apps/api-server/src/lib.rs`
  - `api/crates/control-plane/src/auth.rs`
  - `api/crates/runtime-core/src/lib.rs`
  - `api/crates/plugin-framework/src/lib.rs`
  - `api/crates/storage-pg/src/lib.rs`
  - `api/crates/storage-pg/src/repositories.rs`
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：当前审计时间为 `2026-04-14 00:42:27 +0800`
  - `find docs/superpowers/specs/1flowse -maxdepth 1 -type f | wc -l`：`22`
  - `find docs/superpowers/plans -maxdepth 1 -type f | wc -l`：`16`
  - `find docs/qa-report -maxdepth 1 -type f | wc -l`：`1`
  - `find docs/superpowers/specs/1flowse/modules -maxdepth 2 -type f | wc -l`：`9`
  - `README` 索引比对：`docs/superpowers/specs/1flowse/README.md` 当前漏掉 `12` 个 spec 入口
  - 计划勾选统计：
    - `2026-04-12-backend-kernel-and-quality-alignment.md`：`0/25`
    - `2026-04-12-auth-team-access-control-backend.md`：`0/40`
    - `2026-04-13-style-boundary-runtime-regression.md`：`0/23`
    - `2026-04-13-frontend-bootstrap-realignment.md`：`25/25`
    - `2026-04-13-backend-governance-phase-two.md`：`25/25`
  - `pnpm --dir web lint`：通过
  - `pnpm --dir web test -- --testTimeout=15000`：通过，`10` 个测试文件、`19` 个用例全绿
  - `pnpm --dir web/app build`：通过；`dist/assets/index-n9-QTwmx.js` 为 `1,184.41 kB`，触发 Vite chunk size 警告
  - `node scripts/node/check-style-boundary.js all-pages`：
    - 沙箱内失败，原因是 dev server 监听 `3100` 端口报 `listen EPERM`
    - 提权后通过，`page.home`、`page.embedded-apps`、`page.agent-flow` 全部 `PASS`
  - `node scripts/node/verify-backend.js`：
    - 沙箱内失败，原因是集成测试访问本机 `Postgres/Redis` 报 `Operation not permitted`
    - 提权后通过，`fmt / clippy / test / check` 全量通过
  - `wc -l`：
    - `api/crates/storage-pg/src/repositories.rs`：`267`
    - `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md`：`1911`
    - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`：`2967`
- 未运行的验证：
  - 前端真实登录态、`401` 跳转和设置区交互的浏览器人工回归
  - 小屏主路径人工验收截图
  - `docs/superpowers/specs/1flowse/modules/*/README.md` 与实现状态的逐条人工对账

## Conclusion

- 是否存在 `Blocking` 问题：没有发现已被本轮证据直接证明的 `Blocking` 问题
- 是否存在 `High` 问题：有，主要集中在 `docs/superpowers` 真相层失焦和状态语义混用
- 当前是否建议继续推进：建议继续推进，但先做文档治理和状态收口，不建议此刻继续新增 spec 或扩新域
- 当前最主要的风险：设计讨论状态、实现状态、验证状态被混写在同一套文档里，离线阅读和后续会话都容易误判项目真实进度

## 本轮已关闭的旧结论

- `web` 前端测试不再是红灯。当前 `pnpm --dir web test -- --testTimeout=15000` 已通过，旧报告中的 mock 缺口结论已失效。
- `api/crates/storage-pg/src/repositories.rs` 已不再是超大单文件。当前为 `267` 行，旧报告中的 `1266` 行结论已失效。
- 后端 `clippy` 门禁已不再是当前缺口。`node scripts/node/verify-backend.js` 在可访问本机依赖的环境下已全量通过。
- `style-boundary` 当前能够通过，但依赖可绑定本地端口的运行环境。旧报告里“未验证/失败”的判断不能继续沿用。

## Findings

### [High] `docs/superpowers` 已经失去稳定真相层，并且直接违反目录约定

- 位置：
  - `docs/superpowers/specs/1flowse`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/plans`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-13-style-boundary-runtime-regression.md`
- 证据：
  - `docs/superpowers/specs/1flowse` 当前同级文件数为 `22`，已经超过“单目录不应超过 15 个文件”的仓库约定。
  - `docs/superpowers/plans` 当前同级文件数为 `16`，同样超过目录约定。
  - `docs/superpowers/specs/1flowse/README.md` 只覆盖部分旧文档，当前 `21` 份 spec 中漏了 `12` 份。
  - 已有实现和验证结果的计划文档仍然保持 `0/x`，例如：
    - `2026-04-12-backend-kernel-and-quality-alignment.md`：`0/25`
    - `2026-04-12-auth-team-access-control-backend.md`：`0/40`
    - `2026-04-13-style-boundary-runtime-regression.md`：`0/23`
- 为什么是问题：
  - 当前不是“文档不够”，而是“文档入口不可信、状态不回填、目录失控”。
  - 当索引、计划、代码和验证输出不一致时，QA 报告和后续决策会不断重复旧问题。
- 建议修正方向：
  - 先把 `specs/1flowse` 与 `plans` 拆成主题或阶段子目录，再保留一个总索引。
  - README 只做入口，不再手工漏维护；必要时加一个轻量一致性检查脚本。
  - 已执行计划必须统一回填：至少做到 `completed/archived` 或勾选同步二选一。

### [High] 模块文档当前把“设计确认”与“代码完成”混成了一个状态

- 位置：
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
  - `docs/superpowers/plans/2026-04-13-frontend-bootstrap-realignment.md`
  - `web/app/src/app-shell/AppShellFrame.tsx`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
- 证据：
  - `modules/README.md` 仍将 `03-08` 大量标为 `completed`。
  - `03` 与 `04` 的模块 README 明确写的是“讨论完成/已确认”，但页面实现仍停留在 bootstrap 或说明性骨架。
  - 前端结构整改计划 `2026-04-13-frontend-bootstrap-realignment.md` 已 `25/25` 完成，但它的目标本来就不是正式产品壳层；当前仍有：
    - `1Flowse Bootstrap`
    - `Workspace Bootstrap`
    - `placeholderManifest`
- 为什么是问题：
  - 现在的状态轴既像“讨论进度”，又像“实现进度”，用户和后续 Agent 会自然把 `completed` 理解成“可交付代码完成”。
  - 这会让“模块已定稿”和“模块已开发完”之间的差异消失。
- 建议修正方向：
  - 模块总览至少拆成三轴：
    - `design_status`
    - `implementation_status`
    - `verification_status`
  - 已确认但未落实现的模块，应改为“设计完成，未实现”而不是直接 `completed`。

### [Medium] 用户侧待办承载缺口真实存在，`docs/userDocs/todolist` 原先并不存在

- 位置：
  - `docs/userDocs/todolist`
  - `.memory/todolist/`
- 证据：
  - 本轮开始时仓库内没有 `docs/userDocs`，只存在 `.memory/todolist/`。
  - 当前用户明确要求把建议沉淀到 `docs/userDocs/todolist`，说明用户需要一个面向讨论和决策的显式待办入口，而不是只放在记忆目录或 QA 报告里。
- 为什么是问题：
  - 没有用户向待办入口，讨论结论只能散落在 QA 报告、plan、memory 三处。
  - 这会让“下一轮先谈什么、先做什么”持续依赖上下文回忆。
- 建议修正方向：
  - 以 `docs/userDocs/todolist` 作为用户讨论专用滚动待办区。
  - 同主题持续更新同一份待办文件，不再每轮新建重复 todo。

### [Medium] 前端工程门禁已绿，但当前壳层仍是 bootstrap/prototype 语义

- 位置：
  - `web/app/src/app-shell/AppShellFrame.tsx`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
  - `web/app/src/app/_tests/app-shell.test.tsx`
  - `web/app/src/features/home/_tests/home-page.test.tsx`
- 证据：
  - 顶部标题仍是 `1Flowse Bootstrap`
  - 首页仍是 `Workspace Bootstrap`，正文仍为英文 bootstrapping 描述
  - `AgentFlowPage` 仍是说明性卡片，不是最小真实工作台入口
  - `EmbeddedAppDetailPage` 仍依赖 `placeholderManifest`
  - 当前测试也在稳定地断言这些 bootstrap 文案存在
- 为什么是问题：
  - `lint/test/build/style-boundary` 全绿只能说明“工程门禁通过”，不能说明“产品主路径已就绪”。
  - 当前前端状态更接近“结构完成、产品语义未接管”。
- 建议修正方向：
  - 下一轮前端工作只能二选一：
    - 正式执行“控制台壳层、认证接入与设置区”方案
    - 暂不产品化，但隐藏或收敛未完成入口，避免继续暴露 prototype 心智

### [Medium] 前端构建仍缺少路由级拆包，主 chunk 已经偏大

- 位置：
  - `web/app`
- 证据：
  - `pnpm --dir web/app build` 产物里 `dist/assets/index-n9-QTwmx.js` 为 `1,184.41 kB`
  - Vite 明确给出 chunk size warning
- 为什么是问题：
  - 当前页面还很轻，主 chunk 已经达到这个体积，后续一旦接入正式设置区、认证、更多 feature，首包会继续快速膨胀。
- 建议修正方向：
  - 在文档真相层收口后，再做路由级 `dynamic import` 和页面级拆包。
  - 不建议在当前文档状态未收口时先做性能细化，否则问题会继续写散。

## 1. 当前现状

### 1.1 代码现状

- 后端：
  - `node scripts/node/verify-backend.js` 在可访问本机依赖的环境下已经全绿，说明后端基础治理成果是真实存在的。
  - `runtime-core`、`plugin-framework`、`storage-pg` 都已从“纯占位”阶段往前推进，不应再沿用旧报告里的占位判断。
- 前端：
  - `lint/test/build/style-boundary` 当前都能过。
  - 但通过的是“工程门禁”，不是“正式产品路径”。
  - 当前页面仍主要承接 bootstrap 壳层、说明性内容和最小 feature 骨架。

### 1.2 文档现状

- `docs/superpowers` 已经积累了足够多的设计、计划和治理文档。
- 当前核心矛盾不是“文档少”，而是：
  - 根索引漏维护
  - 计划勾选回填不一致
  - 模块状态混用不同语义
  - 目录文件数已经超过项目约定
- `docs/userDocs/todolist` 在本轮之前不存在，说明用户视角的待办沉淀层尚未建立。

### 1.3 验证现状

- 前端工程门禁：
  - `pnpm --dir web lint`：通过
  - `pnpm --dir web test -- --testTimeout=15000`：通过
  - `pnpm --dir web/app build`：通过，但主 chunk 偏大
  - `style-boundary`：提权后通过
- 后端门禁：
  - `node scripts/node/verify-backend.js`：提权后通过
- 环境依赖：
  - 前端样式回归需要本地端口绑定能力
  - 后端集成测试需要访问本机 `Postgres/Redis`

## 2. 基于现状的改进方向与预期结果

| 方向 | 预期结果 |
| --- | --- |
| 收口 `docs/superpowers` 真相层 | README、plans、modules 对外表达同一套当前状态 |
| 拆分模块状态语义 | “设计完成”和“实现完成”不再混淆 |
| 固定 `docs/userDocs/todolist` 为用户讨论待办入口 | 后续多轮讨论有统一承载位置 |
| 决策前端下一步路线 | 要么进入正式控制台壳层方案，要么明确收敛为 prototype |
| 文档治理后再做前端拆包 | 性能优化不会被目录漂移和状态混乱反复打断 |
| 加一层轻量一致性守卫 | README 漏索引、plan 未回填、目录超量可以提前发现 |

## 3. 这样做的好处与风险

| 方向 | 好处 | 风险 / 代价 |
| --- | --- | --- |
| 先治理文档真相层 | 后续所有会话和排期讨论更稳 | 短期看不到新增功能 |
| 拆分状态语义 | 用户能准确判断“已讨论”还是“已开发” | 需要回补一轮旧文档 |
| 建立用户侧待办入口 | 决策项不再散落在 QA 报告和记忆里 | 需要坚持滚动维护 |
| 前端路线先做选择 | 避免既想产品化又继续保留 prototype 语义 | 需要明确短期产品目标 |
| 文档后做拆包 | 优化动作更聚焦、不被反复返工 | 性能收益会延后一个节奏 |
| 加自动守卫 | 后续不必每轮靠人工 QA 才发现索引漂移 | 需要维护少量规则脚本 |

## 4. 我的建议

1. 下一轮先不要新增 `docs/superpowers` 文档，也不要继续扩新模块。
2. 先做一次纯治理回合，只处理三件事：
   - `docs/superpowers` 的索引和目录收纳
   - `modules/README.md` 的多轴状态改造
   - 已执行 plan 的状态回填
3. 把 `docs/userDocs/todolist/document-plan-audit.md` 作为这条议题的唯一滚动待办，后续讨论直接更新，不重复新建。
4. 文档真相层收口后，再决定前端下一步：
   - 如果准备进入正式控制台，就执行“控制台壳层、认证接入与设置区”方案。
   - 如果暂时不做，就隐藏 prototype 心智，别再让 `Bootstrap` 成为默认对外文案。
5. 后端当前不建议重新打开大范围治理；现阶段后端更像“已站稳、待继续扩展”，重点应先转回文档和前端产品语义。

## Uncovered Areas / Risks

- 本轮没有做人手驱动的桌面/移动端完整主路径操作，只能确认工程门禁和样式边界，不对真实产品可用性下最终结论。
- 前端 `style-boundary` 与后端 `verify-backend` 都依赖本地能力：
  - 前者依赖端口绑定
  - 后者依赖本机 `Postgres/Redis`
- 当前工作区存在用户未完成改动：
  - `.memory/tool-memory/bash/2026-04-13-assumed-doc-path-missing.md`
  - `.memory/tool-memory/bash/2026-04-13-find-permission-denied-on-restricted-volumes.md`
  - `docs/superpowers/plans/2026-04-13-web-mock-ui-sync.md`
  本报告未改动这些路径，也未把它们纳入当前结论来源。
