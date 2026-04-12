# 文档计划审计优化报告

日期：`2026-04-13 05`

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs`、`api/`、`web/`
- 输入来源：
  - `docs/userDocs/AGENTS.md`
  - `docs/userDocs/user-memory.md`
  - `docs/userDocs/feedback-memory/interaction/2026-04-12-no-extra-confirmation-when-explicit.md`
  - `docs/userDocs/project-memory/2026-04-12-backend-kernel-quality-plan-stage.md`
  - `docs/userDocs/project-memory/2026-04-12-plugin-interface-boundary.md`
  - `docs/userDocs/project-memory/2026-04-12-qa-skill-backend-alignment.md`
  - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-plan-stage.md`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md`
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`
  - `api/`、`web/` 当前实现与本轮命令验证
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：确认本轮审计时间为 `2026-04-13 05:03:08 +0800`
  - `find docs/userDocs -maxdepth 3 -type f | sort`：`docs/userDocs` 仍收敛为固定入口、四类记忆、`todolist`
  - `python` 检查 `docs/superpowers/specs/1flowse/README.md` 覆盖率：同级共有 `15` 个文件，README 缺失 `5` 个规格入口
  - `python` 检查计划勾选数：`auth-team` 计划 `0/41`、`userdocs-memory` 计划 `0/10`、`qa-evaluation-skill` 计划 `10/11`
  - `python` 检查目录与文件规模：排除缓存和构建产物后，未发现源码目录文件数 `>15`；未发现代码文件 `>1500` 行；但 `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md` 为 `1911` 行，`docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md` 为 `2967` 行
  - `pnpm lint`：通过
  - `pnpm test`：失败，`web/app/src/app/App.test.tsx` 的 mock 缺少 `getDefaultApiBaseUrl`
  - `pnpm build`：通过，`dist/assets/index-C4xoSpad.js` 为 `877.94 kB`
  - `cargo fmt --check`：通过
  - `cargo clippy --all-targets --all-features -- -D warnings`：失败，命中 `AuthenticatorRegistry::new()` 的 `clippy::new_without_default`
  - `cargo test`：沙箱内失败，`api/apps/api-server/src/_tests/support.rs:37` 访问本机 `Postgres/Redis` 报 `Operation not permitted`
  - 提权后 `cargo test`：通过，后端单测、集成测试和 doctest 全绿
- 未运行的验证：
  - 真实浏览器下的主路径手工验收
  - 小屏 / 响应式截图与交互回归
  - OpenAPI 页面与前端联调
  - `modules/` 各模块 README 的逐条回归验收

## Conclusion

- 是否存在 `Blocking` 问题：未发现已被当前证据直接证明的 `Blocking` 问题
- 是否存在 `High` 问题：有，主要是文档真相层漂移和 `project-memory` 当前事实冲突
- 当前是否建议继续推进：建议有限推进；先修文档真相层与验证门禁，再继续扩后端基础或前端主路径
- 当前最主要的风险：`spec / plan / memory / code / test gate` 同时发出不一致信号，新会话或离线阅读时很容易误判项目真实状态

## Findings

### [High] `docs/superpowers` 不能稳定表达当前执行真相

- 位置：
  - `docs/superpowers/specs/1flowse/README.md:5-26`
  - `docs/superpowers/specs/1flowse/modules/README.md:31-42`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md`
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`
- 证据：
  - 根 README 只列出 `10` 个入口，但目录内实际已有 `15` 个文件，缺失 `2026-04-10-orchestration-design-draft.md`、`2026-04-12-auth-team-access-control-backend-design.md`、`2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`、`2026-04-12-memory-retrieval-and-summary-design.md`、`2026-04-12-qa-evaluation-skill-design.md`
  - 模块总览仍是单列 `状态`，并把 `03-08` 大量标为 `completed`
  - 三份关键计划的勾选状态分别是 `0/41`、`0/10`、`10/11`
- 为什么是问题：
  - `spec / modules / plans` 没有指向同一套当前真相
  - 文档越多，越需要有一个可快速信任的入口；现在反而需要二次考证
- 建议修正方向：
  - README 先补全规格索引
  - `modules/README.md` 至少拆成 `spec_status / implementation_status / verification_status`
  - 计划统一补 `execution_state` 或同步勾选，不再让“已完成实现”与“全未勾选计划”并存

### [High] `docs/userDocs` 结构正确，但 `project-memory` 已出现“多个当前状态”并存

- 位置：
  - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md:4,52`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:62-83`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-plan-stage.md:4`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md:4`
- 证据：
  - `project-memory` 仍写“深色控制台 + 轻翡翠绿强调色”，而最新前端视觉基线已转向“白底或浅底高对比工作区”
  - 同一后端 slice 同时存在“进入计划阶段”和“首轮落地完成”两条当前态叙述
- 为什么是问题：
  - `docs/userDocs` 是固定优先读取入口，过期 current-state 记忆会先污染判断
  - 这不是“保留历史”本身的问题，而是缺少 `superseded / retired / current` 的治理方式
- 建议修正方向：
  - 当新 spec 或验证结果覆盖旧事实时，直接标废弃、覆盖，或在旧文件头部显式指出已被哪条新事实取代
  - 同一 scope 下不再保留多个并行“当前状态”记忆

### [Medium] 前端验证门禁不可信，`pnpm test` 目前主要在暴露测试装置缺口

- 位置：
  - `web/app/src/features/home/HomePage.tsx:4-15`
  - `web/app/src/app/App.test.tsx:4-25`
- 证据：
  - `HomePage` 依赖 `getDefaultApiBaseUrl(window.location)`
  - `App.test.tsx` 只 mock 了 `fetchApiHealth`
  - 本轮 `pnpm test` 失败并明确报出 `No "getDefaultApiBaseUrl" export is defined on the "@1flowse/api-client" mock`
  - 根路由测试随后掉进错误边界，页面表现成 `Something went wrong!`
- 为什么是问题：
  - 当前前端红灯优先反映的是测试装置失真，不是业务行为真相
  - 后续每轮 QA 都会被这个噪声持续污染
- 建议修正方向：
  - 把 `@1flowse/api-client` 改为部分 mock，或显式补齐 `getDefaultApiBaseUrl`
  - 保留真实路由渲染断言，但不要让错误边界掩盖原始失败原因

### [Medium] 后端功能回归成立，但工程质量门禁仍未闭环

- 位置：
  - `api/crates/control-plane/src/auth.rs:68-84`
  - 验证命令：`cargo clippy --all-targets --all-features -- -D warnings`
- 证据：
  - `cargo fmt --check` 通过
  - 提权后 `cargo test` 全绿
  - `cargo clippy` 仍报 `AuthenticatorRegistry::new()` 触发 `clippy::new_without_default`
- 为什么是问题：
  - 现在可以说“后端主干功能成立”，不能说“后端质量门禁全绿”
  - 如果继续以 `clippy -D warnings` 作为门禁，这个缺口会在每轮审计里反复出现
- 建议修正方向：
  - 给 `AuthenticatorRegistry` 补 `Default`
  - 报告里继续显式区分“环境限制导致失败”和“代码质量门禁失败”

### [Medium] 后端基础层仍落后于已确认 spec，继续扩 runtime/plugin 会放大结构偏差

- 位置：
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md:22`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md:220-221`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md:260`
  - `api/apps/api-server/src/lib.rs:113-169`
  - `api/apps/api-server/src/routes/auth.rs:24-64`
  - `api/crates/runtime-core/src/lib.rs:1-3`
  - `api/crates/plugin-framework/src/lib.rs:1-3`
  - `api/crates/storage-pg/src/repositories.rs`
- 证据：
  - spec 已明确 `public auth`、`GET/DELETE /api/console/session` 和模块 `router()`
  - 当前实现仍是扁平 `console_router`，登录接口仍挂在 `/api/console/auth/login`
  - `runtime-core` 与 `plugin-framework` 仍然只有 `crate_name()`
  - `storage-pg/src/repositories.rs` 仍是 `1266` 行单文件
- 为什么是问题：
  - 后端如果继续直接扩 `runtime/modeling/plugin`，新能力会继续压在旧骨架上
  - 当前已确认的边界与实际承载层之间仍有明显落差
- 建议修正方向：
  - 下一轮只推进 backend-kernel plan 的前两块：`public auth / session / Api boundary` 与 `repository + mapper`
  - 在基础层对齐前，不继续扩更深的 runtime/plugin 能力

### [Medium] 前端仍缺少可验收主路径，视觉基线还停留在文档层

- 位置：
  - `web/app/src/app/router.tsx:19-31`
  - `web/app/src/features/home/HomePage.tsx:17-34`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3-10`
  - `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx:9-21`
- 证据：
  - 根壳标题仍是 `1Flowse Bootstrap`
  - 首页仍是 `Workspace Bootstrap + API Health`
  - `AgentFlowPage` 和 `EmbeddedAppsPage` 仍是 placeholder
  - 最新视觉 spec 已明确“工具型工作区”的默认基线，但当前壳层还没吸收
- 为什么是问题：
  - 当前前端 QA 仍停留在壳层级别，无法验证真实产品路径
  - 文档已经足够具体，但实现没有形成最小闭环
- 建议修正方向：
  - 先做一条最小真实路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 同步把最小视觉基线落到壳层，而不是继续堆 placeholder 页面

### [Medium] 文档计划体量已经影响可维护性，且规格目录没有继续增长空间

- 位置：
  - `docs/superpowers/specs/1flowse`
  - `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
- 证据：
  - `docs/superpowers/specs/1flowse` 当前同级文件数已到 `15`
  - 两份计划文档分别为 `1911` 行和 `2967` 行
  - 本轮排除缓存目录后，未发现源码目录文件数 `>15`，说明当前主要压力集中在文档治理层，而不是源码目录爆炸
- 为什么是问题：
  - 规格目录已经没有新增余量，继续平铺只会让索引和检索继续恶化
  - 超大计划文档会降低“可执行清单”的价值，也更难维护勾选状态
- 建议修正方向：
  - `specs/1flowse` 预留主题子目录或归档规则
  - 把超大计划拆成更小的执行单元，保留总索引，但不再把多轮执行细节堆在单文件里

## 1. 现状

### 1.1 文档现状

- `docs/superpowers` 已经覆盖产品、需求、架构、后端规范、前端视觉基线、记忆检索与 QA skill 设计，文档基数足够支撑开发和审计。
- 问题不在“文档少”，而在“文档真相层不统一”：
  - README 漏索引
  - modules 总览仍单轨状态
  - 计划执行状态维护不一致
  - 规格目录达到 `15` 文件上限边缘
- `docs/userDocs` 结构目前是稳定的：
  - `AGENTS.md + user-memory.md + feedback / project / reference / tool / todolist`
  - 四类记忆都已统一 YAML front matter
  - 工具记忆能真实帮助当前验证，例如 `cargo test` 的提权判断
- `docs/userDocs` 当前主要问题是 freshness：
  - 旧 current-state 记忆没有被显式退役
  - `project-memory` 已出现并行当前态

### 1.2 代码现状

- 后端：
  - `auth / team / member / role / permission / session` 主干真实可跑，提权后测试全绿
  - 但 `api-server` 路由骨架仍未对齐最新 kernel spec
  - `runtime-core`、`plugin-framework` 仍是占位 crate
  - `storage-pg` 仍集中在单一 `repositories.rs`
- 前端：
  - 基础壳层可运行，`lint` 和 `build` 都能过
  - 但首页和关键页面仍以 bootstrap / placeholder 为主
  - 视觉基线与真实主路径还没有进入实现层

### 1.3 结构约束现状

- 排除 `node_modules`、`target`、`.turbo` 等缓存目录后，本轮未发现源码目录文件数超过 `15`
- 本轮未发现代码文件超过 `1500` 行
- 但两份计划文档已明显超大，说明“代码目录规整”不代表“文档执行面也规整”
- `api/crates/storage-pg/src/repositories.rs` 为 `1266` 行，虽未超限，但已接近重构压力区间

### 1.4 验证现状

- 前端：
  - `pnpm lint`：通过
  - `pnpm test`：失败，属于 mock 装置缺口
  - `pnpm build`：通过，但主 chunk `877.94 kB`
- 后端：
  - `cargo fmt --check`：通过
  - `cargo clippy --all-targets --all-features -- -D warnings`：失败，属于真实代码门禁问题
  - `cargo test`：沙箱内因本机依赖访问失败，提权后通过

## 2. 基于现状的改进方向与预期结果

| 方向 | 预期结果 |
| --- | --- |
| 统一 `docs/superpowers` 真相层 | README、modules、plans 对外表达同一状态，离线阅读可直接判断当前进度 |
| 统一 `docs/userDocs/project-memory` 当前态治理 | 进入记忆入口时不再先读到过期 current-state 结论 |
| 修复当前验证门禁 | 前端 `test` 与后端 `clippy` 都能重新代表真实质量状态 |
| 先补 backend foundation 前两块 | 后续 runtime / plugin 不再压在旧骨架上扩写 |
| 前端只落一条最小真实主路径 | QA 从“壳层可跑”升级到“产品路径可验收” |
| 给规格目录与超大计划做收纳 | 文档检索和执行跟踪成本下降，避免再出现超大单文件 |
| 增加轻量一致性守卫 | 把“文档真相漂移”从人工审计时才发现，前移到提交前发现 |

## 3. 这样做的好处与风险

| 方向 | 好处 | 风险 / 代价 |
| --- | --- | --- |
| 统一文档真相层 | 新会话、离线查看、排期沟通都会更稳 | 需要先花一轮纯文档清账时间，短期看不到功能新增 |
| 修复测试与质量门禁 | QA 能快速区分真实回归和装置噪声 | 会占用一轮本可继续扩功能的时间 |
| 先补 backend foundation | 后续结构边界更稳，返工更少 | runtime/plugin 方向的表层推进速度会暂时变慢 |
| 前端只做一条真实主路径 | 可以尽快建立真实验收样本 | 需要压缩 placeholder 页面并行扩展范围 |
| 拆分超大计划和规格收纳 | 计划更可执行、目录更可维护 | 需要重新设计索引与拆分边界 |
| 增加自动守卫 | 后续不再每次靠人工补漏 | 需要维护少量规则脚本，前期有一次性成本 |

## 4. 我的建议

1. 下一轮先不要继续新增规格文档或扩新域功能。
2. 先统一文档真相层：
   - 补齐 `docs/superpowers/specs/1flowse/README.md`
   - 把 `modules/README.md` 改成多轨状态
   - 统一计划执行状态表达
   - 处理已过时或冲突的 `project-memory`
3. 同时修掉两个当前门禁问题：
   - `web/app/src/app/App.test.tsx` 的 mock
   - `api/crates/control-plane/src/auth.rs` 的 `Default`
4. 文档层清干净后，再做两件高收益动作：
   - backend foundation 只推进前两块
   - 前端只补一条最小真实主路径
5. `docs/superpowers/specs/1flowse` 和超大计划文档不要再继续平铺增长，下一轮要么拆分，要么明确归档规则。

## Uncovered Areas / Risks

- 本轮没有做真实浏览器和移动端回归，因此前端 UI 一致性与响应式只给受限结论
- 本轮没有逐条核验 `modules/` 子目录 README 与代码状态的一致性，因此模块完成度仍需二次核验
- 首次目录扫描脚本在 `docker/volumes/postgres` 遇到权限错误；后续已通过跳过该路径完成结构检查，但这说明仓库审计脚本需要显式排除受限数据卷目录
