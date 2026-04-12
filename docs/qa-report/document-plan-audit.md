# 文档计划审计优化报告

日期：`2026-04-13 06`

说明：本文件为唯一滚动版本；本轮证据已覆盖 `2026-04-13 05` 的旧结论。

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`.memory`、`api/`、`web/`
- 输入来源：
  - `.memory/AGENTS.md`
  - `.memory/user-memory.md`
  - `.memory/project-memory/2026-04-12-qa-skill-backend-alignment.md`
  - `.memory/project-memory/2026-04-12-backend-kernel-quality-plan-stage.md`
  - `.memory/project-memory/2026-04-12-plugin-interface-boundary.md`
  - `.memory/project-memory/2026-04-12-design-system-direction.md`
  - `.memory/project-memory/2026-04-12-auth-team-backend-plan-stage.md`
  - `.memory/project-memory/2026-04-12-auth-team-backend-implemented.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md`
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`
  - `api/apps/api-server/src/lib.rs`
  - `api/apps/api-server/src/routes/auth.rs`
  - `api/crates/control-plane/src/auth.rs`
  - `api/crates/runtime-core/src/lib.rs`
  - `api/crates/plugin-framework/src/lib.rs`
  - `api/crates/storage-pg/src/lib.rs`
  - `api/crates/storage-pg/src/repositories.rs`
  - `web/app/src/app/App.test.tsx`
  - `web/app/src/app/router.tsx`
  - `web/app/src/features/home/HomePage.tsx`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx`
  - `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx`
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：确认本轮审计时间为 `2026-04-13 06:02:43 +0800`
  - `find docs/superpowers/specs/1flowse -maxdepth 1 -type f | wc -l`：规格目录当前同级文件数为 `15`
  - `comm` 对比规格文件与 README 链接：README 缺失 `5` 个规格入口
  - 计划勾选统计：
    - `2026-04-12-auth-team-access-control-backend.md`：`0/40`
    - `2026-04-12-userdocs-memory-retrieval-alignment.md`：`0/9`
    - `2026-04-12-qa-evaluation-skill.md`：`10/10`
  - 结构扫描：
    - 排除 `.git`、`node_modules`、`.turbo`、`api/target`、`docker/volumes`、`tmp/dev-up`、`tmp/logs` 后，未发现单目录文件数 `>15`
    - 同样排除后，未发现代码文件 `>1500` 行
  - `wc -l`：
    - `api/crates/storage-pg/src/repositories.rs`：`1266`
    - `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md`：`1911`
    - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`：`2967`
  - `pnpm lint`：通过
  - `pnpm test`：失败，`web/app/src/app/App.test.tsx` 的 mock 缺少 `getDefaultApiBaseUrl`
  - `pnpm build`：通过；`dist/assets/index-C4xoSpad.js` 为 `877.94 kB`，触发 Vite chunk size 警告
  - `cargo fmt --all --check`：通过
  - `cargo clippy --all-targets --all-features -- -D warnings`：失败，命中 `AuthenticatorRegistry::new()` 的 `clippy::new_without_default`
  - `cargo test`：沙箱内失败，`apps/api-server/src/_tests/support.rs:37` 访问本机 `Postgres/Redis` 报 `Operation not permitted`
  - 提权后 `cargo test`：通过，后端单测、集成测试和 doctest 全绿
- 未运行的验证：
  - 真实浏览器主路径验收
  - 小屏 / 响应式截图回归
  - OpenAPI 页面与前端联调
  - `docs/superpowers/specs/1flowse/modules/*/README.md` 的逐条状态回归

## Conclusion

- 是否存在 `Blocking` 问题：没有发现已被本轮证据直接证明的 `Blocking` 问题
- 是否存在 `High` 问题：有，主要集中在文档真相层漂移与 `project-memory` 并行 current-state
- 当前是否建议继续推进：建议有限推进；先统一文档真相层与质量门禁，再继续扩后端基础或前端主路径
- 当前最主要的风险：`spec / plan / memory / code / verification` 同时发出不一致信号，新会话或离线阅读时容易误判项目真实状态

## Findings

### [High] `docs/superpowers` 不能稳定表达当前执行真相

- 位置：
  - `docs/superpowers/specs/1flowse/README.md:5-26`
  - `docs/superpowers/specs/1flowse/modules/README.md:23-42`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md`
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`
- 证据：
  - 规格目录已有 `15` 个同级文件，但 README 只列出 `10` 个入口，缺失：
    - `2026-04-10-orchestration-design-draft.md`
    - `2026-04-12-auth-team-access-control-backend-design.md`
    - `2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
    - `2026-04-12-memory-retrieval-and-summary-design.md`
    - `2026-04-12-qa-evaluation-skill-design.md`
  - `modules/README.md` 仍只有单列 `状态`，且 `03-08` 大量标为 `completed`
  - 三份关键计划的勾选状态分别是 `0/40`、`0/9`、`10/10`
- 为什么是问题：
  - `README / modules / plans` 没有指向同一套当前真相
  - 文档已经足够多，入口不可信会直接降低后续会话和离线阅读效率
- 建议修正方向：
  - 先补齐 `README` 规格索引
  - `modules/README.md` 至少拆成 `spec_status / implementation_status / verification_status`
  - 已执行计划统一维护 `execution_state` 或同步勾选，避免“代码已落地但计划全未勾选”的并存状态

### [High] `.memory/project-memory` 已出现并行 current-state

- 位置：
  - `.memory/project-memory/2026-04-12-design-system-direction.md:4,50-56`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:62-99`
  - `.memory/project-memory/2026-04-12-auth-team-backend-plan-stage.md:4,31-32`
  - `.memory/project-memory/2026-04-12-auth-team-backend-implemented.md:4,32-33`
- 证据：
  - `project-memory` 仍写“深色控制台 + 轻翡翠绿强调色”，但最新前端视觉基线已改为“白底或浅底高对比工作区”
  - 同一 auth/team/access-control scope 同时存在“进入计划阶段”和“首轮落地完成”两条 current-state 叙述
- 为什么是问题：
  - `.memory` 是固定优先读取入口，过期 current-state 会先污染判断
  - 问题不在于保留历史，而在于没有 `superseded / retired / current` 的治理方式
- 建议修正方向：
  - 当新 spec 或新验证结果覆盖旧事实时，旧记忆需要显式标废弃或注明被哪条新事实替代
  - 同一 scope 不再保留多个并行“当前态”

### [Medium] 前端测试门禁目前主要在暴露测试装置失真

- 位置：
  - `web/app/src/features/home/HomePage.tsx:4-15`
  - `web/app/src/app/App.test.tsx:4-25`
- 证据：
  - `HomePage` 依赖 `getDefaultApiBaseUrl(window.location)`
  - `App.test.tsx` 只 mock 了 `fetchApiHealth`
  - 本轮 `pnpm test` 明确报出 `No "getDefaultApiBaseUrl" export is defined on the "@1flowse/api-client" mock`
  - 根路由测试随后掉进错误边界，页面表现成 `Something went wrong!`
- 为什么是问题：
  - 当前前端红灯首先反映的是 mock 装置缺口，不是业务行为真相
  - 这会持续污染后续每轮 QA，对真实回归判断帮助很低
- 建议修正方向：
  - 把 `@1flowse/api-client` 改为部分 mock，或显式补齐 `getDefaultApiBaseUrl`
  - 保留根路由渲染断言，但不要让错误边界掩盖原始失败原因

### [Medium] 后端功能验证成立，但工程质量门禁未闭环

- 位置：
  - `api/crates/control-plane/src/auth.rs:68-79`
  - 验证命令：`cargo clippy --all-targets --all-features -- -D warnings`
- 证据：
  - `cargo fmt --all --check` 通过
  - 提权后 `cargo test` 全绿
  - `cargo clippy` 仍报 `AuthenticatorRegistry::new()` 触发 `clippy::new_without_default`
- 为什么是问题：
  - 现在可以说“后端主干功能成立”，不能说“后端质量门禁全绿”
  - 只要 `clippy -D warnings` 仍是门禁，这个缺口就会在每轮审计里重复出现
- 建议修正方向：
  - 为 `AuthenticatorRegistry` 补 `Default`
  - 报告中继续显式区分“沙箱受限失败”和“真实代码质量失败”

### [Medium] 后端骨架仍落后于最新 kernel spec

- 位置：
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md:216-221`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md:247-260`
  - `api/apps/api-server/src/lib.rs:127-168`
  - `api/apps/api-server/src/routes/auth.rs:24-29`
  - `api/crates/runtime-core/src/lib.rs:1-3`
  - `api/crates/plugin-framework/src/lib.rs:1-3`
  - `api/crates/storage-pg/src/repositories.rs`
- 证据：
  - spec 已明确 `public auth` 和 `GET/DELETE /api/console/session`
  - 当前实现仍把登录入口挂在 `/api/console/auth/login`，并使用单个扁平 `console_router`
  - `runtime-core` 与 `plugin-framework` 仍只有 `crate_name()`
  - `storage-pg/src/repositories.rs` 仍是 `1266` 行单文件
- 为什么是问题：
  - 如果继续先扩 runtime/plugin，新增能力会继续压在旧骨架上
  - 当前 spec 已经回答了核心边界，但实现承载层还没跟上
- 建议修正方向：
  - 下一轮优先推进 backend-kernel plan 的前两块：
    - `public auth / session / Api boundary`
    - `repository + mapper` 拆分
  - 在基础层对齐前，不继续扩更深的 runtime/plugin 能力

### [Medium] 前端实现仍停留在 bootstrap / placeholder，视觉基线尚未进入壳层

- 位置：
  - `web/app/src/app/router.tsx:19-31`
  - `web/app/src/features/home/HomePage.tsx:17-34`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3-10`
  - `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx:9-20`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:62-99`
- 证据：
  - 根壳标题仍是 `1Flowse Bootstrap`
  - 首页仍是 `Workspace Bootstrap + API Health`
  - `AgentFlowPage` 与 `EmbeddedAppsPage` 仍是 placeholder
  - 最新视觉 spec 已明确浅底高对比工作区与更紧凑的 `Editor UI` 子规范，但当前壳层尚未吸收
- 为什么是问题：
  - 当前前端 QA 仍停留在“壳层可跑”，还无法验证真实产品主路径
  - 文档已经有可执行方向，但实现没有形成最小闭环
- 建议修正方向：
  - 先落一条最小真实路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 同步把最小视觉基线吸收到壳层，而不是继续累加 placeholder 页面

### [Medium] 文档收纳空间与计划体量已逼近治理上限

- 位置：
  - `docs/superpowers/specs/1flowse`
  - `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
- 证据：
  - `docs/superpowers/specs/1flowse` 当前同级文件数已到 `15`
  - 两份计划文档分别为 `1911` 行和 `2967` 行
  - 当前虽然还未突破目录约束，但已经没有继续平铺增长的空间
- 为什么是问题：
  - 继续往当前目录平铺，会进一步恶化索引和检索成本
  - 超大计划文档会削弱“可执行清单”的价值，也更难维护勾选状态
- 建议修正方向：
  - 为 `specs/1flowse` 预留主题子目录或归档规则
  - 把超大计划拆成更小的执行单元，保留总索引，不再把多轮执行细节堆在单文件里

## 1. 现状

### 1.1 文档现状

- `docs/superpowers` 已经覆盖产品、需求、架构、后端规范、前端视觉基线、记忆检索与 QA 评估设计，文档数量已经足够支撑开发和审计。
- 当前问题不在“文档少”，而在“文档真相层不统一”：
  - README 漏索引
  - modules 总览仍是单轨状态
  - 计划执行状态维护不一致
  - 规格目录已到 `15` 文件边界
- `.memory` 的目录结构目前是稳定的：
  - `AGENTS.md + user-memory.md + feedback / project / reference / tool / todolist`
  - 四类记忆都已统一 `YAML front matter`
  - 工具记忆仍能真实帮助当前验证，例如 `cargo test` 的提权判断
- `.memory` 当前主要问题是 freshness，而不是结构：
  - 旧 current-state 没有退役机制
  - `project-memory` 已出现并行当前态

### 1.2 代码现状

- 后端：
  - auth/team/member/role/permission/session 主干可跑，提权后测试全绿
  - 但 `api-server` 路由骨架仍未对齐最新 kernel spec
  - `runtime-core`、`plugin-framework` 仍是占位 crate
  - `storage-pg` 仍集中在单一 `repositories.rs`
- 前端：
  - 基础壳层可运行，`lint` 和 `build` 都能过
  - 但首页和关键页面仍以 bootstrap / placeholder 为主
  - 前端 `test` 当前主要在暴露 mock 装置缺口
  - 视觉基线与真实主路径还没有进入实现层

### 1.3 结构约束现状

- 排除缓存、构建产物和数据卷后，未发现单目录文件数 `>15`
- 排除同样范围后，未发现代码文件 `>1500` 行
- 但文档治理层已经明显接近上限：
  - `docs/superpowers/specs/1flowse` 正好 `15` 个同级文件
  - 两份计划文档已达 `1911` / `2967` 行
- `api/crates/storage-pg/src/repositories.rs` 虽未超限，但 `1266` 行已经接近重构压力区间

### 1.4 验证现状

- 前端：
  - `pnpm lint`：通过
  - `pnpm test`：失败，属于 mock 装置缺口
  - `pnpm build`：通过，但主 chunk 为 `877.94 kB`
- 后端：
  - `cargo fmt --all --check`：通过
  - `cargo clippy --all-targets --all-features -- -D warnings`：失败，属于真实代码门禁问题
  - `cargo test`：沙箱内失败，提权后通过

## 2. 基于现状的改进方向与预期结果

| 方向 | 预期结果 |
| --- | --- |
| 统一 `docs/superpowers` 真相层 | README、modules、plans 对外表达同一状态，离线阅读可直接判断当前进度 |
| 统一 `.memory/project-memory` 当前态治理 | 进入记忆入口时不再先读到过期 current-state |
| 修复当前验证门禁 | 前端 `test` 与后端 `clippy` 重新代表真实质量状态 |
| 先补 backend foundation 前两块 | 后续 runtime / plugin 不再继续压在旧骨架上扩写 |
| 前端只落一条最小真实主路径 | QA 从“壳层可跑”升级到“产品路径可验收” |
| 给规格目录和超大计划做收纳 | 文档检索和执行跟踪成本下降，避免再出现超大单文件 |
| 增加轻量一致性守卫 | 把“文档真相漂移”从人工审计时才发现，前移到提交前发现 |

## 3. 这样做的好处与风险

| 方向 | 好处 | 风险 / 代价 |
| --- | --- | --- |
| 统一文档真相层 | 新会话、离线查看、排期沟通都会更稳 | 需要先花一轮纯文档清账时间，短期看不到功能新增 |
| 修复测试与质量门禁 | QA 能快速区分真实回归和装置噪声 | 会占用一轮本可继续扩功能的时间 |
| 先补 backend foundation | 后续结构边界更稳、返工更少 | runtime/plugin 的表层推进速度会暂时变慢 |
| 前端只做一条真实主路径 | 可以尽快建立真实验收样本 | 需要压缩 placeholder 页的并行扩展范围 |
| 拆分超大计划和规格收纳 | 计划更可执行、目录更可维护 | 需要重新设计索引与拆分边界 |
| 增加自动守卫 | 后续不再每次靠人工补漏 | 需要维护少量规则脚本，前期有一次性成本 |

## 4. 我的建议

1. 下一轮先不要继续新增规格文档，也不要继续扩新域功能。
2. 先统一文档真相层：
   - 补齐 `docs/superpowers/specs/1flowse/README.md`
   - 把 `modules/README.md` 改成多轨状态
   - 统一计划执行状态表达
   - 处理已过时或冲突的 `project-memory`
3. 同步修掉两个当前门禁问题：
   - `web/app/src/app/App.test.tsx` 的 mock
   - `api/crates/control-plane/src/auth.rs` 的 `Default`
4. 文档层和门禁层清干净后，再做两件高收益动作：
   - backend foundation 只推进前两块
   - 前端只补一条最小真实主路径
5. `docs/superpowers/specs/1flowse` 和超大计划文档不要再继续平铺增长；下一轮要么拆分，要么先定归档规则。

## Uncovered Areas / Risks

- 本轮没有做真实浏览器和移动端回归，因此前端 UI 一致性与响应式只给受限结论
- 本轮没有逐条核验 `modules/` 子目录 README 与代码状态的一致性，因此模块完成度仍需二次核验
- `cargo test` 的后端结论依赖提权环境；当前可以确认“代码通过”，但也说明本地 QA 仍依赖外部 `Postgres/Redis`
