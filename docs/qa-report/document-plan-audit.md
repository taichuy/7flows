# 文档计划审计优化报告

日期：`2026-04-13 04`

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs`、`api/`、`web/`
- 输入来源：
  - `docs/userDocs/AGENTS.md`
  - `docs/userDocs/user-memory.md`
  - `docs/userDocs/feedback-memory/interaction/2026-04-12-memory-summary-first-selection.md`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md`
  - `docs/userDocs/project-memory/2026-04-12-backend-kernel-quality-plan-stage.md`
  - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md`
  - `docs/userDocs/project-memory/2026-04-12-qa-skill-backend-alignment.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-memory-retrieval-and-summary-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-qa-evaluation-skill-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md`
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md`
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`
  - `api/`、`web/` 当前实现与本轮命令验证
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：确认本轮审计时间为 `2026-04-13 04`
  - `find docs/userDocs -maxdepth 3 -type f | sort`：`docs/userDocs` 顶层仍收敛为固定入口、四类记忆、`todolist`
  - `rg -n '^memory_type:|^topic:|^summary:|^keywords:|^match_when:|^created_at:|^updated_at:|^last_verified_at:|^decision_policy:|^scope:' docs/userDocs/...`：四类记忆 YAML 摘要层已统一落地
  - `find docs/superpowers/specs/1flowse -maxdepth 1 -type f | wc -l`：同级文件数为 `15`
  - `pnpm lint`：通过
  - `pnpm test`：失败，`web/app/src/app/App.test.tsx` 的 mock 缺少 `getDefaultApiBaseUrl`
  - `pnpm build`：通过，但 `dist/assets/index-C4xoSpad.js` 为 `877.94 kB`，触发 chunk warning
  - `cargo fmt --check`：通过
  - `cargo clippy --all-targets --all-features -- -D warnings`：失败，命中 `AuthenticatorRegistry::new()` 的 `clippy::new_without_default`
  - `cargo test`：沙箱内失败，`api/apps/api-server/src/_tests/support.rs:37` 访问本机 `Postgres/Redis` 时报 `Operation not permitted`
  - 提权后 `cargo test`：通过，全量后端单测、集成测试和 doctest 通过
- 未运行的验证：
  - 真实浏览器下的主路径手工验收
  - 小屏 / 响应式截图与交互回归
  - OpenAPI 页面与前端联调
  - `modules/` 各模块 README 的逐条验收复核

## Conclusion

- 是否存在 `Blocking` 问题：当前未发现已被命令直接证明的 `Blocking` 行为错误
- 是否存在 `High` 问题：有，主要集中在文档真相层漂移与 `project-memory` 新旧事实并存
- 当前是否建议继续推进：建议有限推进；先修文档真相层和验证门禁，再继续扩 backend foundation 或前端主路径
- 当前最主要的风险：用户离线查看或新 agent 接手时，`spec / plan / memory / code / test gate` 会同时给出不一致信号，导致排期判断和 QA 结论一起漂移

## 1. 现状

### 1.1 `docs/superpowers`

- 根 `README` 不是完整索引。`docs/superpowers/specs/1flowse/README.md:5-26` 只列出 `10` 项规格入口和 `modules/README.md`，但同级实际已有 `15` 个文件，缺失：
  - `2026-04-10-orchestration-design-draft.md`
  - `2026-04-12-auth-team-access-control-backend-design.md`
  - `2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
  - `2026-04-12-memory-retrieval-and-summary-design.md`
  - `2026-04-12-qa-evaluation-skill-design.md`
- `modules/README.md:31-42` 仍只有单列 `状态`，并把 `03-08` 标记为 `completed`，但对应代码与验证并未形成同级闭环。
- `plans/` 的执行痕迹维护不一致：
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md` 仍保留未勾选任务，但 `api` 后端主干已经真实落地
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md:13-146` 仍保留未勾选任务，但 `docs/userDocs` 结构、YAML 摘要层和 `tool-memory` 已经落地
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md:37-196` 则已完整勾选
- `docs/superpowers/specs/1flowse` 同级文件数已经到 `15`，下一份同级 spec 再进入时就会触发目录管理压力。

### 1.2 `docs/userDocs`

- 结构层面是当前最稳定的一块：
  - `AGENTS.md + user-memory.md + feedback-memory + project-memory + reference-memory + tool-memory + todolist`
  - 四类记忆均已统一 YAML 摘要层
  - `tool-memory` 在本轮真实生效，`cargo test` 的沙箱限制命中了既有失败记忆并指导提权复核
- 内容层面开始出现 freshness 治理不足：
  - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md:4,52` 仍写“深色控制台 + 轻翡翠绿强调色”
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:62-83` 已把默认方向切到“白底或浅底高对比工作区”
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-plan-stage.md:4` 仍表达“进入计划阶段”
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md:4` 已表达“首轮落地完成并验证”
- `docs/qa-report` 与 `docs/userDocs/todolist` 仍保持单一滚动入口，这个做法是对的，应继续维持。

### 1.3 代码现状

- 后端：
  - `auth / team / member / role / permission / session` 主干真实可用，提权后 `cargo test` 全绿
  - `api/apps/api-server/src/lib.rs:113-169` 仍是扁平 `console` 路由拼接，不是 `router() + nest()` 结构
  - `api/apps/api-server/src/routes/auth.rs:24-33` 仍暴露 `/api/console/auth/login`，未对齐 `public auth + session`
  - `api/crates/runtime-core/src/lib.rs:1-3` 与 `api/crates/plugin-framework/src/lib.rs:1-3` 仍为占位实现
  - `api/crates/storage-pg/src/repositories.rs` 仍是 `1266` 行的大文件，尚未拆成 `repository + mapper`
- 前端：
  - `web/app/src/app/router.tsx:19-31` 根壳仍是 `1Flowse Bootstrap`
  - `web/app/src/features/home/HomePage.tsx:17-34` 仍是 `Workspace Bootstrap + API Health`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3-10` 与 `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx:9-21` 仍是 placeholder
  - `frontend visual baseline` 与 `Shell Layer + Editor UI Layer` 的规范还没有进入真实实现

### 1.4 验证现状

- 前端：
  - `lint` 通过
  - `build` 通过，但主 bundle 体积已经偏大
  - `test` 失败，当前失败点是测试装置没有跟上 `api-client` 新导出
- 后端：
  - `fmt` 通过
  - `test` 真实通过
  - `clippy` 仍红，说明“功能成立”不等于“工程门禁闭环”

## Findings

### [High] `docs/superpowers` 已不能可靠表达当前执行真相

- 位置：
  - `docs/superpowers/specs/1flowse/README.md:5-26`
  - `docs/superpowers/specs/1flowse/modules/README.md:31-42`
  - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
  - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md:13-146`
  - `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md:37-196`
- 证据：
  - 根索引缺失 `5` 份已存在的规格文档
  - 模块总览只表达单轨 `状态`，却把大量仍未进入实现或验证闭环的模块标成 `completed`
  - 已落地计划与已完成计划的勾选状态维护不一致
- 为什么是问题：
  - 当前 `spec / module / plan / code` 四层同时发出互相冲突的信号
  - 用户离线查看或新 agent 接手时，无法快速判断哪一层才是当前真相
- 建议修正方向：
  - 先补齐根索引
  - 模块状态至少拆成 `spec_status / implementation_status / verification_status`
  - 已落地计划同步勾选，或统一增加 `execution_state`

### [High] `docs/userDocs` 入口结构正确，但 `project-memory` 已出现当前事实冲突

- 位置：
  - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md:4,52`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:62-83`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-plan-stage.md:4`
  - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md:4`
- 证据：
  - 设计方向在 `project-memory` 与更新 spec 之间已明确冲突
  - 同一后端 slice 同时存在“计划阶段”和“已完成首轮落地”两条 current-state 叙述
- 为什么是问题：
  - `docs/userDocs` 是固定先读入口，过期的 `project-memory` 会先污染后续判断
  - 这不是历史文档保留本身的问题，而是缺少 `superseded / retired / verified-current` 的真相治理
- 建议修正方向：
  - 当后续 spec 或验证结果推翻旧口径时，直接覆盖、标废弃，或显式写明被哪条新事实取代
  - 不再保留多个平行“当前状态”文件共同对外表述

### [Medium] 前端测试门禁仍失真，`pnpm test` 不能可靠代表前端真实可用性

- 位置：
  - `web/app/src/app/App.test.tsx:4-10`
  - `web/app/src/features/home/HomePage.tsx:4-14`
- 证据：
  - `App.test.tsx` 只 mock 了 `fetchApiHealth`
  - `HomePage` 已依赖 `getDefaultApiBaseUrl(window.location)`
  - `pnpm test` 实际报错：`No "getDefaultApiBaseUrl" export is defined on the "@1flowse/api-client" mock`
  - 根路由测试因此掉进 `Something went wrong!` 错误边界，真实失败原因被错误边界包住
- 为什么是问题：
  - 当前前端红灯主要是装置噪声，不是业务行为真相
  - 这会持续污染后续 QA 结论
- 建议修正方向：
  - 改为部分 mock，或显式补齐 `getDefaultApiBaseUrl`
  - 保留真实路由渲染断言，但不要让错误边界吞掉原始失败信号

### [Medium] 后端功能回归成立，但质量门禁仍未闭环

- 位置：
  - `api/crates/control-plane/src/auth.rs:68-84`
  - 验证命令：`cargo clippy --all-targets --all-features -- -D warnings`
- 证据：
  - `cargo fmt --check` 通过
  - 提权后 `cargo test` 全绿
  - `cargo clippy` 仍报 `AuthenticatorRegistry::new()` 触发 `clippy::new_without_default`
- 为什么是问题：
  - 当前能说“后端功能成立”，不能说“后端工程门禁已全绿”
  - 如果 `clippy -D warnings` 继续作为质量门禁，这个缺口会持续污染每轮审计
- 建议修正方向：
  - 给 `AuthenticatorRegistry` 补 `Default`
  - 后续报告继续明确区分“环境失败”和“代码失败”

### [Medium] backend foundation 仍明显落后于已确认 spec

- 位置：
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md:212-221`
  - `docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md:102-150`
  - `api/apps/api-server/src/lib.rs:113-169`
  - `api/apps/api-server/src/routes/auth.rs:24-33`
  - `api/crates/runtime-core/src/lib.rs:1-3`
  - `api/crates/plugin-framework/src/lib.rs:1-3`
  - `api/crates/storage-pg/src/repositories.rs:1`
- 证据：
  - spec 已要求 `public auth + /api/console/session + success wrapper + router()`
  - 当前实现仍是 `/api/console/auth/login` 和扁平 router
  - `runtime-core`、`plugin-framework` 仍是占位 crate
  - `storage-pg` 尚未拆成 `repository + mapper`
- 为什么是问题：
  - 后端如果继续直接扩 runtime/modeling/plugin，会把新能力压回旧结构
  - 这会持续拉大“已确认规范”和“实际承载基础”的差距
- 建议修正方向：
  - 下一轮只执行 backend-kernel plan 的 Task 1 与 Task 2
  - 在 `public auth / session / ApiSuccess / repository + mapper` 对齐前，不继续扩更深的 runtime/plugin 面

### [Medium] 前端仍缺一条可验收的真实主路径，视觉基线也还停留在文档层

- 位置：
  - `web/app/src/app/router.tsx:19-79`
  - `web/app/src/features/home/HomePage.tsx:17-34`
  - `web/app/src/features/agent-flow/AgentFlowPage.tsx:3-10`
  - `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx:9-21`
  - `docs/superpowers/specs/1flowse/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:62-99`
- 证据：
  - 根壳仍是 bootstrap 语义
  - 首页仍停在健康检查和 visit count
  - `agentFlow`、`Embedded Apps` 仍是占位页
  - visual baseline 已有较明确的默认方向，但壳层与主路径尚未吸收
- 为什么是问题：
  - 当前前端 QA 还停在壳层级别，无法验证真实产品路径
  - 文档越完整，和实现之间的落差就越显眼
- 建议修正方向：
  - 先做一条最小真实主路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 同步把最小视觉基线落到壳层，而不是继续堆 placeholder

### [Low] 前端构建可通过，但主 bundle 已进入明显偏大区间

- 位置：
  - 验证命令：`pnpm build`
- 证据：
  - `dist/assets/index-C4xoSpad.js` 为 `877.94 kB`
  - Vite 已提示 chunk 超过 `500 kB`
- 为什么是问题：
  - 当前页面还很浅，bundle 已偏大；后续真实页面进入后，首屏和迭代成本都会继续上升
  - 如果长期忽略这个 warning，后续再拆包会更痛
- 建议修正方向：
  - 先等最小真实主路径落地，再开始 route-level code split 或 `manualChunks`
  - 不建议在 placeholder 阶段就做复杂性能工程

## 2. 可改进方向、预期结果、好处与风险

| 方向 | 预期结果 | 好处 | 风险 / 代价 |
| --- | --- | --- | --- |
| 统一 `docs/superpowers + docs/userDocs` 的真相层 | 根索引、模块状态、计划勾选、关键 `project-memory` 表达同一事实 | 用户离线查看、新 agent 接手、排期讨论都会更稳 | 需要先做一轮纯文档清账，短期看不到功能新增 |
| 加一层文档一致性守卫 | 自动检查 spec README 覆盖率、模块状态字段、计划勾选与 memory freshness | 能把真相漂移从“审计时才发现”前移到“提交前就发现” | 需要维护少量规则或脚本，前期有一次性成本 |
| 修复当前验证门禁 | `web` 测试与 `api` clippy 恢复可信 | 每轮 QA 能快速区分真实回归与装置噪声 | 会占掉一轮不扩新功能的时间 |
| 先补 backend foundation 前两块 | `public auth / session / ApiSuccess / repository + mapper` 先稳定 | 后续 runtime/modeling/plugin 能在正确边界上继续长 | 当前新业务面推进速度会暂时变慢 |
| 前端只补一条最小真实主路径并吸收基线 | 至少有一条从工作台到 agentFlow 的可验收链路 | 前端 QA 从“壳层”转向“产品路径”，视觉 spec 开始真正落地 | 需要压缩 placeholder 页面的并行扩展范围 |
| 给 `docs/superpowers/specs/1flowse` 预留收纳方案 | 下一个规格新增时不触发目录过载 | 符合仓库自己的目录规则，也降低检索成本 | 需要做一次小型索引或分目录调整 |
| 在主路径落地后再处理前端拆包 | 构建 warning 从“已知债务”变成“可执行治理项” | 不会在 placeholder 阶段做过早优化 | 如果拖太久，后续拆分范围会更大 |
| 继续维持单一滚动报告与待办 | 后续结论只在一处被覆盖更新 | 用户查看成本最低，也最不容易出现平行版本 | 要持续主动替换旧结论，不能偷懒只追加 |

## 3. 明确建议

1. 下一轮先不要继续扩新域功能，也不要继续新增平行文档。
2. 先统一文档真相层：
   - 补齐 `docs/superpowers/specs/1flowse/README.md`
   - 把 `modules/README.md` 改成多轨状态
   - 同步已落地计划状态
   - 处理已过时或互相冲突的 `project-memory`
3. 同时修掉两个验证门禁噪声点：
   - `web/app/src/app/App.test.tsx` 的 mock
   - `api/crates/control-plane/src/auth.rs` 的 `Default`
4. 然后只推进 backend foundation 的前两块，以及前端一条最小真实主路径。
5. 如果希望这轮整理以后不再反复漂移，下一步应补一个轻量的“文档一致性守卫”，让 README 覆盖率、模块状态和记忆 freshness 在提交前就能被发现。
6. 在新增下一份规格前，先给 `docs/superpowers/specs/1flowse` 做索引收纳或子目录规划，因为它已经到 `15` 个文件边缘。
7. 继续把 `docs/qa-report/document-plan-audit.md` 与 `docs/userDocs/todolist/document-plan-audit.md` 作为唯一滚动入口；旧判断失效时直接覆盖，不再并列新增。

## Uncovered Areas / Risks

- 本轮没有启动真实浏览器和截图流程，因此 UI 一致性结论仍以代码结构和文档对照为主。
- 本轮没有逐条核对每个 module README 的每一条验收项，只抓了最影响判断的索引、状态、代码入口和验证门禁。
- `cargo test` 的首次失败是沙箱限制访问本机 `Postgres/Redis`，不是代码回归；本轮已按既有 `tool-memory` 提权复核真实结果。
- 本轮仅按用户要求更新 `docs/qa-report` 与 `docs/userDocs/todolist`，没有直接回写 `docs/superpowers`、`api/`、`web/` 或 `tool-memory`。
