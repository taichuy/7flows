# 文档计划审计优化报告

日期：`2026-04-13 01`

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs`、`api/`、`web/`
- 输入来源：
  - `docs/userDocs/AGENTS.md`
  - `docs/userDocs/user-memory.md`
  - `docs/userDocs/project-memory/2026-04-12-backend-kernel-quality-plan-stage.md`
  - `docs/userDocs/project-memory/2026-04-12-backend-quality-spec-scope.md`
  - `docs/userDocs/project-memory/2026-04-12-plugin-interface-boundary.md`
  - `docs/userDocs/project-memory/2026-04-12-qa-skill-backend-alignment.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
  - `api/`、`web/` 当前实现、测试文件与验证命令结果
- 已运行的验证：
  - `cd web && pnpm lint`：通过
  - `cd web && pnpm test`：失败，`web/app/src/app/App.test.tsx` 的 mock 缺少 `getDefaultApiBaseUrl`
  - `cd web && pnpm build`：通过，但产物主 chunk `877.94 kB`
  - `cd api && cargo fmt --check`：通过
  - `cd api && cargo clippy --all-targets --all-features -- -D warnings`：失败，命中 `clippy::new_without_default`
  - `cd api && cargo test`：沙箱内因访问本机服务报 `Operation not permitted`，提权后全量通过
- 未运行的验证：
  - 真实浏览器端手工流程
  - 小屏/响应式回归
  - OpenAPI 页面与前端联调
  - `docs/superpowers` 各模块逐条需求对照验收

## Conclusion

- 是否存在 `Blocking` 问题：有。当前 `docs/superpowers` 的模块完成口径仍不能直接当作实现完成口径继续排期或讨论。
- 是否存在 `High` 问题：有，主要集中在“文档状态领先实现状态”和“前端测试基线失真”。
- 当前是否建议继续推进：建议有限推进。先修状态表达、追踪索引和验证门禁，再继续扩 backend foundation 或前端主路径。
- 当前最主要的风险：团队会把“规格已完成”误读为“能力已落地”，并在此基础上继续扩新域，导致排期、QA 和实现边界同时失真。

## 1. 现状

### 1.1 文档现状

- `docs/superpowers` 已形成稳定的 `spec + plan` 体系，能快速沉淀产品、架构、模块讨论、后端内核与质量规范。
- `docs/userDocs` 已形成较清晰的记忆体系，`AGENTS.md` 明确了摘要优先、最多 5 条有效记忆、`todolist` 仅做离线待确认等规则，目录边界也清楚。
- `docs/qa-report/document-plan-audit.md` 与 `docs/userDocs/todolist/document-plan-audit.md` 现在已经成为滚动入口，说明 QA 基线开始沉淀，不再像上一轮那样为空。
- 当前文档最大缺口不是“有没有文档”，而是“文档之间如何形成一条可追踪链路”：
  - `docs/superpowers/specs/1flowse/README.md` 负责列出规格入口。
  - `docs/userDocs/AGENTS.md` 负责记忆与协作规则。
  - QA 与离线建议位于另外两个滚动文件。
  - 但目前仍缺少一个显式的 `spec -> plan -> code -> verification -> qa` 追踪矩阵。
- `docs/superpowers/specs/1flowse/modules/README.md` 仍只有单列 `状态`，没有把“规格完成”与“实现完成”拆开表达。

### 1.2 代码现状

- 后端 `auth / team / member / role / permission` 主干已真实落地；`cargo test` 提权后全绿，说明当前 auth/team slice 的功能回归成立。
- 后端基础能力与质量计划仍主要停留在文档层：
  - `api/apps/api-server/src/routes/auth.rs` 仍是 `/api/console/auth/login`，返回原始 `LoginResponse`，未对齐 `ApiSuccess` 和 public auth/session 方案。
  - `api/apps/api-server/src/lib.rs` 仍是扁平 console router，尚未出现 `session`、`model_definitions`、`runtime_models` 路由模块。
  - `api/crates/runtime-core/src/lib.rs` 与 `api/crates/plugin-framework/src/lib.rs` 仍只有 `crate_name()`。
  - `api/crates/storage-pg/src/repositories.rs` 仍是 1266 行集中实现，未拆分 `repository + mapper`。
  - backend-kernel plan 中列出的 `response.rs`、`session.rs`、`runtime_engine.rs`、`verify-backend.js`、`api/README.md` 等关键文件当前全部缺失。
- 前端仍停留在 bootstrap/shell 阶段：
  - 根壳仍使用 `1Flowse Bootstrap` 标题。
  - 首页主要展示访问计数和 API health。
  - `agentFlow` 页面仍是 “reserved for the next implementation slice”。
  - `Embedded Apps` 仍是 placeholder 管理面。

### 1.3 验证现状

- 前端：
  - `lint` 可过，说明基本静态规范成立。
  - `build` 可过，但产物 chunk `877.94 kB`，已经达到后续需要关注拆包的程度。
  - `test` 失败依然是测试装置问题，不是业务逻辑直接崩：
    - `App.test.tsx` mock 只提供了 `fetchApiHealth`
    - `HomePage` 现在依赖 `getDefaultApiBaseUrl(window.location)`
    - 导致根路由测试被错误边界污染，`4` 个测试里 `1` 个失败、`3` 个通过
- 后端：
  - `fmt` 可过。
  - `clippy -D warnings` 不过，说明工程质量门禁仍未闭环。
  - `cargo test` 的沙箱失败是环境限制，不是代码回归；提权后全量通过，说明当前功能面是成立的。

## Findings

### [High] `docs/superpowers` 的模块完成状态仍明显领先于实现状态

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
  - 模块总览仍把 `03-08` 大多标为 `completed`。
  - `runtime-core` 与 `plugin-framework` 仍只有 `crate_name()`。
  - `agentFlow` 页面仍写着 “reserved for the next implementation slice”。
  - backend-kernel plan 中第一批目标文件当前仍缺失，包括 `response.rs`、`session.rs`、`runtime_engine.rs`、`verify-backend.js`、`api/README.md`。
  - 计划文档中的步骤仍全部未勾选。
- 为什么是问题：
  - 这会把“规格定稿”误导为“代码已具备对应能力”，直接影响排期、优先级和 QA 口径。
  - 继续沿这个口径推进时，团队会低估 foundation 未落地带来的返工成本。
- 建议修正方向：
  - 将模块状态至少拆成 `spec_status` 与 `implementation_status`。
  - 为关键模块补一张 `文档 -> 计划 -> 代码 -> 验证 -> QA` 追踪矩阵。
  - 在未有实现证据前，不再用单个 `completed` 表示模块整体状态。

### [High] 前端测试基线仍失真，当前 `pnpm test` 不能可靠代表前端真实可用性

- 位置：
  - `web/app/src/app/App.test.tsx:4`
  - `web/app/src/app/App.test.tsx:21`
  - `web/app/src/features/home/HomePage.tsx:4`
  - `web/app/src/features/home/HomePage.tsx:9`
- 证据：
  - `App.test.tsx` 只 mock 了 `fetchApiHealth`，没有提供 `getDefaultApiBaseUrl`。
  - `HomePage` 已开始依赖 `getDefaultApiBaseUrl(window.location)`。
  - `pnpm test` 真实报错仍为：`No "getDefaultApiBaseUrl" export is defined on the "@1flowse/api-client" mock`。
  - 根路由测试因此落入错误边界，显示 `Something went wrong!`，使“首页是否可用”的断言变成假失败。
- 为什么是问题：
  - 失败点在测试装置而不是业务行为，说明当前前端回归信号带噪声。
  - 这种噪声会让简单导出变更放大为整站红灯，影响节奏和结论可信度。
- 建议修正方向：
  - 把 mock 改为部分 mock，或显式补齐 `getDefaultApiBaseUrl`。
  - 保留“真实路由渲染”断言，但避免让错误边界页掩盖原始失败原因。

### [Medium] 后端功能回归成立，但工程质量门禁仍未闭环

- 位置：
  - `api/crates/control-plane/src/auth.rs:72`
  - 验证命令：`cd api && cargo clippy --all-targets --all-features -- -D warnings`
- 证据：
  - `cargo fmt --check` 通过。
  - `cargo test` 提权后全量通过。
  - `cargo clippy` 仍因 `AuthenticatorRegistry::new()` 缺少 `Default` 实现而失败，命中 `clippy::new_without_default`。
- 为什么是问题：
  - 当前后端不能宣称“质量门禁已全绿”。
  - 只要 `clippy -D warnings` 仍是正式门禁，这个分支就不具备稳定交付状态。
- 建议修正方向：
  - 先补 `Default for AuthenticatorRegistry`，恢复 `clippy` 绿灯。
  - 在验证报告中继续明确区分“环境限制导致的测试失败”和“真实代码失败”。

### [Medium] backend foundation 仍未进入兑现阶段，继续扩新域风险高

- 位置：
  - `api/apps/api-server/src/routes/auth.rs:24`
  - `api/apps/api-server/src/lib.rs:126`
  - `api/crates/storage-pg/src/repositories.rs:1`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
- 证据：
  - 登录路由仍是 `/api/console/auth/login`，尚未进入 public auth/session 对齐。
  - router 仍是扁平 console 路由，不是 plan 里要求的模块化注册形态。
  - `storage-pg/src/repositories.rs` 仍是 1266 行大文件。
  - `response.rs`、`session.rs`、`model_definitions.rs`、`runtime_models.rs`、`resource_descriptor.rs`、`assignment.rs`、`verify-backend.js`、`api/README.md` 等计划关键文件仍全部不存在。
- 为什么是问题：
  - 当前 auth/team slice 还撑得住，但一旦直接叠加 dynamic modeling、runtime slots、plugin assignment，边界会继续被压进旧结构。
  - 这与质量 spec 中明确要求的分层、资源模板和验证脚本方向相违背。
- 建议修正方向：
  - 后端下一步固定只执行 backend-kernel plan 的 Task 1 与 Task 2。
  - 在这两块完成前，不继续扩新的 runtime/modeling/plugin 业务面。

### [Medium] 前端产品主路径仍停留在 bootstrap 占位，无法支撑模块 03/04 的真实验收

- 位置：
  - `web/app/src/app/router.tsx:19`
  - `web/app/src/app/router.tsx:45`
  - `web/app/src/features/home/HomePage.tsx:18`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3`
  - `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx:9`
- 证据：
  - 根壳标题仍是 `1Flowse Bootstrap`。
  - 路由仍只有 `Home`、`agentFlow`、`Embedded Apps`、`Embedded Detail`、`Embedded Mount`。
  - 首页仍以 health/bootstrap 信息为主。
  - `agentFlow` 和 embedded app 管理页都仍是 placeholder。
- 为什么是问题：
  - 文档已经讨论了工作台、应用容器和编排主路径，但前端尚无对应最小真实载体。
  - 这使得前端 QA 长期只能验证壳层，而无法验证真实产品路径。
- 建议修正方向：
  - 只落一条最小真实主路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`。
  - 如果短期不做，应在文档状态里明确标记为“设计完成、实现未开始”。

### [Low] 文档体系已经成型，但 `spec / memory / qa` 三套系统之间仍缺少统一追踪入口

- 位置：
  - `docs/superpowers/specs/1flowse/README.md:5`
  - `docs/userDocs/AGENTS.md:87`
  - `docs/qa-report/document-plan-audit.md:1`
- 证据：
  - `docs/superpowers/specs/1flowse/README.md` 负责列出规格入口。
  - `docs/userDocs/AGENTS.md` 负责列出记忆目录与离线待确认目录。
  - QA 报告已经单独沉淀为滚动文件。
  - 但当前仍没有一个固定入口能直接回答“某个模块当前对应哪份 spec、哪份 plan、哪些代码、什么验证结论”。
- 为什么是问题：
  - 用户离线查看或后续 agent 接手时，仍需要手动横向比对三套目录。
  - 这会增加重复解释和旧结论残留的概率。
- 建议修正方向：
  - 把当前 QA 报告继续作为唯一滚动入口，并在其中维护最小追踪索引。
  - 索引粒度建议保持在“模块 / spec / plan / code / verification / next action”，不要再新增平行报告。

## 2. 可改进方向、预期结果、好处与风险

| 方向 | 预期结果 | 好处 | 风险 / 代价 |
| --- | --- | --- | --- |
| 文档状态双轨化 | 模块文档能同时表达“规格定稿”和“实现落地” | 排期、讨论、QA 口径统一，减少假乐观 | 需要维护额外状态列和追踪矩阵 |
| 建立最小追踪索引 | 能从一个入口追到 `spec -> plan -> code -> verification -> qa` | 用户离线查看和后续接手成本更低 | 需要持续淘汰旧结论，不能只追加 |
| 修复验证门禁 | `web` 测试、`api` clippy、后端验证口径恢复可信 | 以后每轮结论都能快速落到证据 | 短期会占用一轮不做新功能的时间 |
| 先补 backend foundation，再扩业务域 | `ApiSuccess / session / router / repository / mapper` 基线先稳定 | 后续 dynamic modeling / runtime / plugin 能在正确边界上继续长 | 当前可见业务功能增长会稍慢 |
| 前端只做一条最小真实主路径 | 工作台、应用概览、agentFlow 至少能串起来 | 可以开始做真实 UI/流程 QA，而不只是验证占位页 | 需要压缩 embedded 和更多占位页的并行范围 |

## 3. 明确建议

1. 先修“状态表达”和“验证门禁”，再继续扩模块。
2. 文档层立即执行两件事：
   - 把 `docs/superpowers` 模块状态改成双轨
   - 在当前 QA 报告里维护最小追踪索引
3. 后端优先顺序建议固定为：
   - 修 `clippy`
   - 执行 backend-kernel plan 的 Task 1 和 Task 2
   - 再讨论 runtime/modeling/plugin 的下一步
4. 前端优先不要并行铺太多方向，先做一条最小真实主路径，确保模块 03/04 至少有一个能被真实验收的载体。
5. 后续同类离线审计继续只更新当前 `docs/qa-report/document-plan-audit.md` 与 `docs/userDocs/todolist/document-plan-audit.md`，直接覆盖废弃结论，不再新增平行版本。

## Uncovered Areas / Risks

- 本轮没有逐页打开前端做人工交互和响应式验证，因此 UI 一致性结论仅限代码结构层。
- 本轮没有对 `docs/superpowers` 所有模块需求逐条打勾，只核对了“模块状态表达”和“关键实现对齐”的主要偏差点。
- `cargo test` 在沙箱内的 `Operation not permitted` 是环境限制，不应误判为代码失败；本轮已通过提权复核真实结果。
- `web` build 已出现大 chunk 警告，但本轮未继续做 bundle 结构分析，因此只记为后续风险，不下更重结论。
- 本轮按用户要求仅更新 `docs/qa-report` 与 `docs/userDocs/todolist`，未直接回写 `docs/superpowers` 的状态字段或 tool-memory。
