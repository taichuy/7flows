# 文档计划审计优化报告

日期：`2026-04-13 00`

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs`、`api/`、`web/`
- 输入来源：
  - `docs/userDocs/AGENTS.md`
  - `docs/userDocs/user-memory.md`
  - `docs/userDocs/project-memory/2026-04-12-qa-skill-backend-alignment.md`
  - `docs/userDocs/project-memory/2026-04-12-backend-kernel-quality-plan-stage.md`
  - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md`
  - `docs/userDocs/project-memory/2026-04-12-plugin-interface-boundary.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
  - `api/`、`web/` 当前实现与测试文件
- 已运行的验证：
  - `cd web && pnpm lint`：通过
  - `cd web && pnpm test`：失败
  - `cd web && pnpm build`：通过，但产物主 chunk `877.94 kB`
  - `cd api && cargo fmt --check`：通过
  - `cd api && cargo clippy --all-targets --all-features -- -D warnings`：失败
  - `cd api && cargo test`：沙箱内失败，提权后通过
- 未运行的验证：
  - 真实浏览器端手工流程
  - 小屏/响应式回归
  - OpenAPI 页面与前端联调
  - `docs/superpowers` 各模块逐条需求对照验收

## Conclusion

- 是否存在 `Blocking` 问题：有。当前 `docs/superpowers` 的模块完成口径不能直接当作实现完成口径继续排期或讨论。
- 是否存在 `High` 问题：有，主要集中在“文档成熟度高于实现成熟度”和“前端测试基线失真”。
- 当前是否建议继续推进：建议有限推进。先修状态表达和验证门禁，再继续扩后端 foundation 或前端真实主路径。
- 当前最主要的风险：团队会把“规格已完成”误读为“代码已具备对应产品能力”，导致优先级判断失真。

## 1. 现状

### 1.1 文档现状

- `docs/superpowers` 已形成较完整的 spec + plan 体系，覆盖产品、架构、模块讨论、后端内核、质量规范与 QA skill 演进。
- `docs/userDocs` 的记忆体系已经比较成型，分类、front matter、检索规则和离线待确认目录都明确，可持续支撑多轮协作。
- 当前文档强项是“设计意图表达清晰、决策沉淀快、边界定义细”；当前文档弱项是“规格完成状态”与“代码兑现状态”没有明确分层。
- `docs/qa-report` 在本轮之前为空，说明项目已有规格和计划，但缺少持续滚动的 QA 基线。

### 1.2 代码现状

- 后端已经真实落地 `auth / team / member / role / permission` 主干，`api-server` 能提供控制面健康检查、登录、成员、角色、权限等基础路由，`cargo test` 提权后全绿。
- 后端的下一阶段 foundation 仍大面积停留在计划层：
  - `runtime-core` 当前只有 `crate_name()`。
  - `plugin-framework` 当前只有 `crate_name()`。
  - `storage-pg` 仍集中在单个 `repositories.rs`，文件 1266 行。
  - `2026-04-12-backend-kernel-and-quality-alignment.md` 中第一批计划文件大多尚未创建。
- 前端目前仍是 bootstrap/shell 级别：
  - 路由只有 `Home`、`agentFlow`、`Embedded Apps`、`Embedded Detail`、`Embedded Mount`。
  - `agentFlow` 和 embedded app 管理页都是占位内容。
  - 还没有与模块 03/04 对应的真实工作台、应用概览、编排主路径。

### 1.3 验证现状

- 前端：
  - lint 可过，说明基本静态规范成立。
  - build 可过，但产物 chunk 已偏大。
  - test 失败不是业务代码直接崩，而是测试 mock 没跟上代码导出变化，导致测试基线不再可信。
- 后端：
  - `fmt` 可过。
  - `clippy -D warnings` 不通过，说明“工程质量门禁”还没闭环。
  - `cargo test` 在当前沙箱里会被本机 Postgres/Redis 访问限制拦截；提权后全量通过，说明功能回归本身当前是成立的。

## Findings

### [High] `docs/superpowers` 的模块完成状态明显领先于实现状态

- 位置：
  - `docs/superpowers/specs/1flowse/modules/README.md:35`
  - `docs/superpowers/specs/1flowse/modules/README.md:37`
  - `docs/superpowers/specs/1flowse/modules/README.md:38`
  - `docs/superpowers/specs/1flowse/modules/README.md:39`
  - `docs/superpowers/specs/1flowse/modules/README.md:40`
  - `docs/superpowers/specs/1flowse/modules/README.md:41`
  - `docs/superpowers/specs/1flowse/modules/README.md:42`
  - `api/crates/runtime-core/src/lib.rs:1`
  - `api/crates/plugin-framework/src/lib.rs:1`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3`
- 证据：
  - 模块总览把 `03-08` 大多标为 `completed`。
  - `runtime-core` 与 `plugin-framework` 仍只有 `crate_name()`。
  - `agentFlow` 页面仍写着 “reserved for the next implementation slice”。
  - backend-kernel 计划中列出的 `response.rs`、`session.rs`、`runtime_engine.rs`、`verify-backend.js` 等关键文件当前全部缺失。
- 为什么是问题：
  - 这会把“规格定稿”误导为“能力已落地”，让后续排期、讨论和 QA 结论出现假乐观。
  - 也会让 `docs/superpowers` 失去 source of truth 的可信度，因为读文档的人无法判断它描述的是“设计真相”还是“实现真相”。
- 建议修正方向：
  - 后续把模块状态拆成至少两列：`spec_status` 与 `implementation_status`。
  - 对关键模块补一份“文档 -> 代码 -> 验证”的追踪矩阵。
  - 在未落地前，避免只用 `completed` 单词描述模块整体状态。

### [High] 前端测试基线已失真，当前 `pnpm test` 不能可靠代表前端真实可用性

- 位置：
  - `web/app/src/app/App.test.tsx:4`
  - `web/app/src/features/home/HomePage.tsx:4`
  - `web/app/src/features/home/HomePage.tsx:9`
- 证据：
  - `App.test.tsx` 只 mock 了 `fetchApiHealth`，没有补 `getDefaultApiBaseUrl`。
  - `HomePage` 已开始依赖 `getDefaultApiBaseUrl(window.location)`。
  - `pnpm test` 报错为：`No "getDefaultApiBaseUrl" export is defined on the "@1flowse/api-client" mock`。
- 为什么是问题：
  - 测试失败点在测试装置而非真实业务逻辑，意味着当前前端回归信号有噪声。
  - 这种问题会把“简单导出调整”放大成“整站测试红”，影响后续开发节奏和 QA 判断。
- 建议修正方向：
  - 将该 mock 改为部分 mock，或同时补齐 `getDefaultApiBaseUrl`。
  - 对根路由增加更稳定的渲染断言，避免错误边界页把测试结果污染成假失败。

### [Medium] 后端功能回归已基本成立，但工程质量门禁还没有闭环

- 位置：
  - `api/crates/control-plane/src/auth.rs:72`
  - 验证命令：`cd api && cargo clippy --all-targets --all-features -- -D warnings`
- 证据：
  - `clippy` 直接因 `AuthenticatorRegistry::new()` 缺少 `Default` 实现失败。
  - `cargo fmt --check` 通过，`cargo test` 提权后通过，说明问题不在功能回归，而在质量门禁未收口。
- 为什么是问题：
  - 当前后端不能宣称“质量门禁已全绿”。
  - 一旦把 `clippy -D warnings` 作为正式门禁，当前分支就无法稳定通过。
- 建议修正方向：
  - 先补齐 `Default` 实现，恢复 `clippy` 绿灯。
  - 把“沙箱内不能跑本机 DB/Redis 集成测试”与“真实代码失败”在验证报告里严格区分。

### [Medium] `storage-pg` 和 backend foundation 的计划兑现率偏低，后续扩域风险高

- 位置：
  - `api/crates/storage-pg/src/repositories.rs:1`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
- 证据：
  - `storage-pg/src/repositories.rs` 当前 1266 行。
  - 计划里要求拆出的 repository/mapper、session 路由、model definition、runtime foundation 文件目前均不存在。
  - `scripts/node/verify-backend.js` 和 `api/README.md` 也未创建。
- 为什么是问题：
  - 当前还能支撑 auth/team slice，但一旦继续叠加 dynamic modeling、runtime slots、plugin assignment，很容易继续把基础边界挤进同一层。
  - 后端 quality spec 已经明确要求分层和验证脚本，如果继续只扩功能不补基础，未来返工成本会迅速升高。
- 建议修正方向：
  - 后端下一步优先执行 backend-kernel plan 的前两块：`ApiSuccess/session/router` 对齐、`storage-pg` 拆分。
  - 在此之前不要继续扩新的 runtime/modeling 业务面。

### [Medium] 前端产品主路径仍停留在 bootstrap 占位，无法支撑模块 03/04 的真实验收

- 位置：
  - `web/app/src/app/router.tsx:19`
  - `web/app/src/features/home/HomePage.tsx:18`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3`
  - `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx:9`
- 证据：
  - 根壳标题仍是 `1Flowse Bootstrap`。
  - `HomePage` 主要展示访问计数和 API health。
  - `agentFlow` 页面和 embedded app 管理页都仍是 placeholder 卡片。
- 为什么是问题：
  - 文档层面已经讨论了工作台、应用容器、编排主路径，但前端还没有对应的最小真实载体，导致产品讨论和实现验证无法闭环。
  - 这会让前端 QA 长期只能验证壳层，而不能验证产品路径。
- 建议修正方向：
  - 只做一个最小真实主路径即可：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`。
  - 如果短期不做，就应在文档状态里明确标为“设计完成、实现未开始”。

### [Low] QA 资产已经开始重要化，但仓库里还没有滚动式 QA 基线

- 位置：
  - `docs/qa-report/`
  - `docs/userDocs/todolist/`
- 证据：
  - 本轮之前两个目录都为空。
  - 说明前面已有大量 spec 和 plan，但缺少随实现推进持续更新的 QA 入口。
- 为什么是问题：
  - 没有滚动 QA 文档时，后续每轮都要重新解释“目前做到哪、哪些是假完成、哪些是真完成”。
- 建议修正方向：
  - 以后固定在当前两个目录复用同一批文件，按轮次更新，不再增殖多个平行报告。

## 2. 可改进方向、预期结果、好处与风险

| 方向 | 预期结果 | 好处 | 风险 / 代价 |
| --- | --- | --- | --- |
| 文档状态双轨化 | 文档能同时表达“设计已定稿”和“代码已落地到哪” | 排期、沟通、QA 口径统一，减少误判 | 需要额外维护状态字段和追踪表 |
| 修复验证门禁 | `web` 测试、`api` clippy、后端验证脚本恢复可信 | 以后每轮结论都能更快落地为证据 | 短期会占用一轮不做新功能的时间 |
| 先补 backend foundation，再扩业务域 | 先稳住 `ApiSuccess/session/router/repository/mapper` 基线 | 后续 dynamic modeling / runtime / plugin 能在正确边界上继续长 | 当前可见业务功能增长会稍慢 |
| 前端只做一条最小真实主路径 | 工作台、应用概览、agentFlow 至少能串起来 | 可以开始做真实 UI/流程 QA，而不只是看占位页 | 需要压缩 embedded/扩展性相关并行范围 |
| 固定滚动 QA 报告入口 | 后续每轮只更新当前报告和 todolist | 减少重复沟通，便于用户离线查看 | 需要对旧结论持续淘汰和改写，而不是只追加 |

## 3. 明确建议

1. 先把“状态表达”和“验证门禁”拉回可信区，再谈继续扩模块。
2. 后端优先顺序建议固定为：
   - 修 `clippy`
   - 修 `web` 测试基线
   - 落 backend-kernel plan 的 Task 1 和 Task 2
3. 前端优先不要同时铺太多方向，建议只做一条最小真实主路径，验证产品骨架是否成立。
4. 以后这类离线审计固定更新当前 `docs/qa-report/document-plan-audit.md` 与 `docs/userDocs/todolist/document-plan-audit.md`，不要新开平行版本。

## Uncovered Areas / Risks

- 本轮没有逐页打开前端做人工交互和响应式验证，因此 UI 一致性结论仅限代码结构层。
- 本轮没有对 `docs/superpowers` 所有模块需求逐条打勾，只核对了“文档状态”和“代码实现”的主要偏差点。
- `cargo test` 在沙箱内的 `Operation not permitted` 是环境限制，不应误判为代码失败；本轮已通过提权复核真实结果。
- 本轮按用户要求仅更新 `docs/qa-report` 与 `docs/userDocs/todolist`，未直接回写 `docs/superpowers` 的状态字段。
