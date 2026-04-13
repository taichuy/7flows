# 文档计划审计优化报告

日期：`2026-04-14 02`

说明：本文件为唯一滚动版本；本轮内容覆盖 `2026-04-14 01` 版本，仅保留当前仍有效的结论与建议。

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs`、`docs/qa-report`、`api/`、`web/`
- 输入来源：
  - `.memory/AGENTS.md`
  - `.memory/user-memory.md`
  - `.memory/project-memory/2026-04-13-frontend-qa-current-state.md`
  - `.memory/project-memory/2026-04-13-frontend-bootstrap-regression-governance-direction.md`
  - `.memory/project-memory/2026-04-13-backend-qa-remediation-scope.md`
  - `.memory/project-memory/2026-04-12-backend-quality-spec-scope.md`
  - `.memory/feedback-memory/repository/2026-04-13-subdir-agents-inline-critical-rules.md`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/modules/01-user-auth-and-team/README.md`
  - `docs/superpowers/specs/1flowse/modules/02-access-control/README.md`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
  - `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`
  - `docs/superpowers/specs/1flowse/modules/06-publish-gateway/README.md`
  - `docs/superpowers/specs/1flowse/modules/07-state-and-memory/README.md`
  - `docs/superpowers/specs/1flowse/modules/08-plugin-framework/README.md`
  - `docs/qa-report/document-plan-audit.md`
  - `docs/userDocs/todolist/document-plan-audit.md`
  - `web/app/src/app-shell/AppShellFrame.tsx`
  - `web/app/src/routes/route-config.ts`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
  - `web/app/src/app/_tests/app-shell.test.tsx`
  - `web/app/src/features/home/_tests/home-page.test.tsx`
  - `api/apps/api-server/src/routes/auth.rs`
  - `api/apps/api-server/src/routes/team.rs`
  - `api/apps/api-server/src/routes/members.rs`
  - `api/apps/api-server/src/routes/roles.rs`
  - `api/apps/api-server/src/routes/session.rs`
  - `api/apps/api-server/src/routes/model_definitions.rs`
  - `api/apps/api-server/src/routes/runtime_models.rs`
  - `api/apps/api-server/src/_tests/support.rs`
  - `api/apps/api-server/src/_tests/auth_routes.rs`
  - `api/apps/api-server/src/_tests/member_routes.rs`
  - `api/apps/api-server/src/_tests/team_routes.rs`
  - `api/apps/api-server/src/_tests/model_definition_routes.rs`
  - `api/apps/api-server/src/_tests/runtime_model_routes.rs`
  - `api/crates/access-control/src/catalog.rs`
  - `api/crates/control-plane/src/model_definition.rs`
  - `api/crates/runtime-core/src/runtime_engine.rs`
  - `api/crates/publish-gateway/src/lib.rs`
  - `api/apps/plugin-runner/src/lib.rs`
  - `api/crates/plugin-framework/src/assignment.rs`
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：当前审计时间为 `2026-04-14 02:01:12 +0800`
  - 文档目录统计：
    - `docs/superpowers/specs/1flowse` 顶层文件数：`22`
    - `docs/superpowers/plans` 顶层文件数：`16`
    - `docs/userDocs` 当前文件数：`1`
  - `docs/superpowers/specs/1flowse/README.md` 只显式索引了 `10` 个条目，仍漏掉 `12` 份顶层 spec
  - `docs/superpowers/plans` 状态扫描：
    - 总 plan 数：`16`
    - `0` 个勾选完成项的 plan：`8`
    - 部分勾选但未清零的 plan：`8`
    - `0` 个“全部勾选完成”的 plan：`0`
    - 所有 plan 当前都没有统一 `Status:` 生命周期字段
  - 超过项目单文件 `1500` 行约定的 plan：
    - `2026-04-12-auth-team-access-control-backend.md`：`2968` 行
    - `2026-04-11-fullstack-bootstrap.md`：`1912` 行
  - `find api -path '*/_tests/*' -type f | wc -l`：后端 `_tests` 文件总数为 `43`
  - `pnpm --dir web lint`：通过
  - `pnpm --dir web test -- --testTimeout=15000`：通过
    - `web/app`：`10` 个测试文件、`19` 个用例
    - `web/packages/embed-sdk`：`1` 个测试文件
    - `web/packages/embedded-contracts`：`1` 个测试文件
    - `web/packages/api-client`、`flow-schema`、`page-protocol`、`page-runtime`、`shared-types`、`ui`：本轮输出为 `No test files found`
  - `pnpm --dir web/app build`：通过；`dist/assets/index-n9-QTwmx.js` 为 `1,184.41 kB`，触发 Vite chunk size warning
  - `node scripts/node/check-style-boundary.js all-pages`：沙箱内失败，`tmp/logs/web.log` 记录 `listen EPERM: operation not permitted 0.0.0.0:3100`
  - `node scripts/node/verify-backend.js`：沙箱内失败
    - `access-control` 单元测试通过
    - `api-server` 共 `19` 个测试，其中 `4` 个通过、`15` 个失败
    - 失败共因指向 `api/apps/api-server/src/_tests/support.rs:37`，`PgPool::connect` 报 `Operation not permitted`
- 未运行的验证：
  - 提权环境下的 `style-boundary` 重跑
  - 提权环境下带本地 `Postgres/Redis` 的后端完整验证
  - 真实浏览器登录流、`401` 跳转、设置区与成员/角色管理交互
  - 小屏关键路径截图复核

## Conclusion

- 是否存在 `Blocking` 问题：没有发现被本轮证据直接证明的新的代码级 `Blocking` 回归
- 是否存在 `High` 问题：有，仍集中在“文档真相层不可信”和“模块状态语义失真”
- 当前是否建议继续推进：建议继续推进，但先做一轮文档治理和状态收口，不建议现在继续平铺新增 spec/plan 或按旧状态口径扩模块
- 当前最主要的风险：你会比代码真实成熟度更早地相信模块已经“完成”，从而让排期、讨论和 QA 反复建立在错误状态上

## Findings

### [High] 模块总览仍把“讨论完成”与“实现完成”混在同一状态轴里

- 位置：
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/modules/01-user-auth-and-team/README.md`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
  - `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`
  - `docs/superpowers/specs/1flowse/modules/06-publish-gateway/README.md`
  - `docs/superpowers/specs/1flowse/modules/07-state-and-memory/README.md`
  - `docs/superpowers/specs/1flowse/modules/08-plugin-framework/README.md`
  - `web/app/src/routes/route-config.ts`
  - `api/apps/api-server/src/routes/auth.rs`
  - `api/apps/api-server/src/routes/model_definitions.rs`
  - `api/apps/api-server/src/routes/runtime_models.rs`
  - `api/crates/publish-gateway/src/lib.rs`
  - `api/apps/plugin-runner/src/lib.rs`
- 证据：
  - `modules/README.md` 当前除 `02` 外几乎全部标为 `completed`
  - `01` 模块文档写“已完成当前轮”，而代码现状是：后端已有登录、团队、成员、角色、会话路由和路由测试，但前端 `route-config` 只有 `home / embedded-apps / embedded-runtime / agent-flow` 四个入口，没有登录、设置、成员、角色、团队管理页面
  - `03` 模块文档写“已完成工作台首页、应用列表、创建入口、左侧导航”，但 `HomePage.tsx` 仍是 `Workspace Bootstrap` 卡片
  - `04` 模块文档标 `completed`，但 `AgentFlowPage.tsx` 目前仍是单卡片占位页
  - `05` 和 `07` 并非纯空白：`runtime_models.rs`、`model_definitions.rs`、`runtime_engine.rs`、`model_definition.rs` 与对应测试表明运行时和状态建模后端基础已经存在
  - `06` 模块文档标 `completed`，但 `publish-gateway/src/lib.rs` 当前只有 `crate_name()`
  - `08` 模块文档标 `completed`，但 `plugin-runner/src/lib.rs` 仍是健康检查壳层，`plugin-framework/src/assignment.rs` 只做到最小绑定约束
- 为什么是问题：
  - 同一个 `completed` 同时在表达“讨论定稿”“后端基础已写”“前端产品完成”三种不同含义，已经失去判断价值
  - 这会直接误导你对模块顺序、投入和剩余工作量的估计
- 建议修正方向：
  - 立即把模块状态拆成三轴：
    - `design_status`
    - `implementation_status`
    - `verification_status`
  - 第一版不用追求优雅，先写实：
    - `01`：后端主链路已实现并有路由测试，前端控制台未完成
    - `02`：ACL 与角色权限后端基础已实现，仍未做完整用户侧交付
    - `03`：前端壳层落点存在，但仍是 bootstrap 阶段
    - `04`：设计完成，页面占位
    - `05`：运行时后端基础部分落地
    - `06`：基本未实现
    - `07`：状态建模后端基础部分落地
    - `08`：插件骨架存在，产品能力未完成

### [High] `docs/superpowers` 入口层和 plan 生命周期已经不再可信

- 位置：
  - `docs/superpowers/specs/1flowse`
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/plans`
- 证据：
  - `specs/1flowse` 顶层文件数 `22`、`plans` 顶层文件数 `16`，都已突破“单目录不应超过 15 个文件”的项目约定
  - `README.md` 当前只索引 `10` 个条目，漏掉 `12` 份顶层 spec
  - `plans` 目录 `16` 份文档里：
    - `8` 份是 `0` 勾选
    - `8` 份是部分勾选
    - `0` 份是全部勾选完成
    - 全部缺少统一生命周期字段
  - 两份 plan 已超过 `1500` 行约定上限，最大达到 `2968` 行
- 为什么是问题：
  - 当前的主要问题不是“文档少”，而是“入口失真、状态失真、目录继续平铺增长”
  - 没有生命周期字段时，任何人都只能靠勾选痕迹猜 plan 还活不活着
  - plan 一旦兼任“实施计划 + 执行流水账”，就不再适合作为下一轮执行入口
- 建议修正方向：
  - `specs/1flowse` 与 `plans/` 先按阶段或主题拆子目录，再保留一个稳定总索引
  - 为 plan 增加最小生命周期字段，例如 `active / completed / archived`
  - 已完成 plan 改存执行摘要或归档摘要，不继续无限追加流水账
  - README 索引维护不要再靠人工记忆，至少增加一个可检查规则

### [Medium] `docs/userDocs` 目前还不是用户侧文档层，只是一个滚动待办入口

- 位置：
  - `docs/userDocs`
  - `docs/userDocs/todolist/document-plan-audit.md`
- 证据：
  - 当前 `docs/userDocs` 目录里只有 `1` 个文件，即当前主题 todo
  - 本轮涉及的项目现状、模块边界、验证含义、术语差异仍主要散落在 `docs/superpowers` 和 `.memory`
- 为什么是问题：
  - `docs/userDocs` 如果只承接 todo，就无法承担“给用户看当前项目处于什么状态”的职责
  - 一旦用户离线回看，仍然要跳回内部 spec/plan 才能理解项目实际进度
- 建议修正方向：
  - 先定义 `docs/userDocs` 的最小信息架构，再决定是否增文档
  - 最小建议为：
    - 当前项目现状页
    - 模块进度矩阵页
    - 术语和状态说明页
    - 主题滚动 todo 页
  - 这轮不必马上建全，先把结构设计写进 todo，避免继续把用户侧说明和内部工程文档混写

### [Medium] 模块 01 当前更准确的状态是“后端主链路已站住，前端控制台未交付”

- 位置：
  - `docs/superpowers/specs/1flowse/modules/01-user-auth-and-team/README.md`
  - `api/apps/api-server/src/routes/auth.rs`
  - `api/apps/api-server/src/routes/team.rs`
  - `api/apps/api-server/src/routes/members.rs`
  - `api/apps/api-server/src/routes/roles.rs`
  - `api/apps/api-server/src/routes/session.rs`
  - `api/apps/api-server/src/_tests/auth_routes.rs`
  - `api/apps/api-server/src/_tests/member_routes.rs`
  - `api/apps/api-server/src/_tests/team_routes.rs`
  - `web/app/src/routes/route-config.ts`
  - `web/app/src/app-shell/AppShellFrame.tsx`
- 证据：
  - 后端已经存在登录、团队更新、成员创建/禁用/重置密码、角色与权限、会话撤销等路由和对应测试
  - `route-config.ts` 当前只有 `工作台 / 团队 / 前台` 三个导航语义和一个 runtime 详情路由
  - `AppShellFrame.tsx` 标题仍是 `1Flowse Bootstrap`
  - 本轮在 `web/app/src` 内没有看到成员管理、角色管理、登录页、设置页等正式页面入口
- 为什么是问题：
  - 如果继续把 `01` 理解为“端到端完成”，就会忽略掉控制台前端仍然缺位这一事实
  - 这会让后续对“先做模块 03 还是先补 01 前端”的排期判断失真
- 建议修正方向：
  - 在模块矩阵中把 `01` 明确标成“backend implemented / frontend pending”
  - 后续前端路线如果走正式控制台，应优先补 `01` 的最小用户主路径，而不是先扩更多新模块页面

### [Medium] 前端测试门禁当前在保护 bootstrap/prototype 语义，而不是目标产品语义

- 位置：
  - `web/app/src/app-shell/AppShellFrame.tsx`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/app/_tests/app-shell.test.tsx`
  - `web/app/src/features/home/_tests/home-page.test.tsx`
  - `web/app/src/routes/_tests/route-config.test.ts`
  - `docs/superpowers/specs/1flowse/2026-04-13-console-shell-auth-settings-design.md`
- 证据：
  - 壳层标题仍是 `1Flowse Bootstrap`
  - 首页仍是 `Workspace Bootstrap`
  - 路由 guard 仍统一为 `bootstrap-allow`
  - 测试显式断言 `1Flowse Bootstrap`、`Workspace Bootstrap` 和 `bootstrap-allow`
  - 最新控制台壳层设计已经明确下一阶段应收敛到正式控制台/设置/登录语义
- 为什么是问题：
  - 现在不是“还没美化”的问题，而是“测试正在把 prototype 语义固化成正确行为”
  - 只要不先做路线决策，后续每加一个页面都还会继续长在 bootstrap 心智上
- 建议修正方向：
  - 前端下一轮先二选一，不要继续混着推进：
    - `A`：正式进入控制台壳层、认证接入、设置区方案
    - `B`：继续 prototype，但隐藏未完成入口，不再默认暴露 bootstrap 心智
  - 一旦定路线，测试基线也要一起改，不要再保护旧文案和旧语义

### [Medium] 当前“验证绿灯”的语义仍然混杂，未显式区分静态门禁、空测试通过和环境依赖验证

- 位置：
  - `web/package.json`
  - `api/apps/api-server/src/_tests/support.rs`
  - `tmp/logs/web.log`
  - `scripts/node/check-style-boundary.js`
  - `scripts/node/verify-backend.js`
- 证据：
  - `pnpm --dir web test` 虽然通过，但 `api-client`、`flow-schema`、`page-protocol`、`page-runtime`、`shared-types`、`ui` 本轮都是 `No test files found`
  - `style-boundary` 本轮在沙箱内无法启动 Vite dev server，日志显示 `0.0.0.0:3100` 端口 `EPERM`
  - `verify-backend` 本轮在沙箱内失败，`api-server` 路由测试因 `PgPool::connect` 权限不足而中断
- 为什么是问题：
  - 当前同样显示“通过/失败”的验证，其含义其实完全不同：
    - 有的是真实自动化通过
    - 有的是“没有测试所以放行”
    - 有的是“代码未证伪，但当前环境不允许验证”
  - 如果文档里不把这三者拆开，之后讨论测试覆盖和质量门禁时会持续误解
- 建议修正方向：
  - 把验证门禁明确拆成四层：
    - `static gates`：lint、typecheck、build
    - `sandbox-safe tests`：纯单元/纯前端测试
    - `local-service integration`：依赖本机 `Postgres/Redis/Port`
    - `manual product checks`：登录流、小屏、设置区、交互路径
  - 对 `passWithNoTests` 的 package 建“补测或显式豁免”清单，不再把它们和真实测试绿灯混写

## 1. 当前现状

### 1.1 文档现状

- `docs/superpowers` 已经积累了足够多的设计与计划文档，但入口索引、目录收纳和 plan 生命周期没有同步治理
- `docs/userDocs` 目前只有一个滚动 todo，尚未形成用户侧说明层
- 当前最主要的问题不再是“文档不足”，而是“真相层失焦”

### 1.2 代码现状

- 后端：
  - `01` 的认证、团队、成员、角色、会话主链路是真实存在的
  - `02` 的 ACL 与角色权限基础已经进入代码，不再只是讨论
  - `05/07` 的 runtime/model definition 后端基础已经部分落地
  - `06/08` 仍主要停留在骨架
- 前端：
  - 工程骨架、路由真值层、样式回归门禁和基本测试已经站住
  - 但壳层语义仍然是 bootstrap/prototype，不是正式控制台
  - `01` 对应的前端控制台路径目前没有落地

### 1.3 模块现状矩阵

| 模块 | 文档状态 | 代码现状 | 更准确的当前描述 |
| --- | --- | --- | --- |
| `01` 用户登录与团队接入 | 文档写 `completed` | 后端路由与测试存在；前端无正式登录/团队/成员/角色/设置页 | 后端主链路已实现，前端控制台未完成 |
| `02` 权限与资源授权 | 文档写 `in_progress` | ACL catalog、角色权限、成员角色替换和相关测试已存在 | 规则与后端基础已部分落地，文档尚未回写实现状态 |
| `03` 工作台与应用容器 | 文档写 `completed` | 主页仍是 `Workspace Bootstrap` | 只有壳层落点，不是模块完成 |
| `04` agentFlow | 文档写 `completed` | 页面仍是占位说明卡片 | 设计完成，页面占位 |
| `05` 运行时编排 | 文档写 `completed` | runtime engine、runtime routes、ACL 测试存在 | 后端基础部分落地，产品工作区未落地 |
| `06` 发布网关 | 文档写 `completed` | `publish-gateway` 基本空壳 | 基本未实现 |
| `07` 状态与记忆 | 文档写 `completed` | model definition / runtime registry / runtime ACL 后端已部分落地 | 后端建模基础部分落地，后台前端未落地 |
| `08` 插件体系 | 文档写 `completed` | `plugin-runner` 为健康检查壳层，plugin assignment 仅最小约束 | 只有骨架，不是产品完成态 |

### 1.4 验证现状

- 已确认通过：
  - 前端 `lint`
  - 前端 `test`
  - 前端 `build`
- 已确认受限：
  - `style-boundary` 受限于端口监听环境
  - `verify-backend` 受限于本机 `Postgres/Redis` 访问
- 当前更准确的解释是：
  - 工程门禁已经初步建立
  - 但产品完成态、模块完成态和验证完成态还没有统一表达

## 2. 基于现状的改进方向与预期结果

| 方向 | 预期结果 |
| --- | --- |
| 把模块总览改成三轴状态 | 讨论完成、实现完成、验证完成不再混淆 |
| 重构 `docs/superpowers` 入口与 plan 生命周期 | 下一轮执行入口更清楚，历史文档不再污染当前判断 |
| 为 `docs/userDocs` 定义最小信息架构 | 用户离线回看时不必再钻内部 spec/plan |
| 回填模块现状矩阵 | 能明确看到 `01` 后端已站住、`05/07` 有后端基础、`06/08` 仍骨架 |
| 前端先做路线决策再继续扩页面 | 不再一边做产品化一边固化 bootstrap 心智 |
| 把验证门禁分层写清 | 测试绿灯的含义更可信，后续 QA 不再混用结论 |

## 3. 这样做的好处和风险

| 方向 | 好处 | 风险 / 代价 |
| --- | --- | --- |
| 模块三轴状态 | 排期和判断更准确 | 需要回补一轮旧模块状态 |
| `docs/superpowers` 生命周期治理 | 活动入口更稳定，旧 plan 不再混杂 | 需要一次性整理目录和归档 |
| 建立 `docs/userDocs` 最小层 | 用户讨论成本更低 | 短期会多一层文档维护工作 |
| 回填模块现状矩阵 | 后续讨论会更少重复误判 | 需要继续基于代码核对，而不是只看文档 |
| 先做前端路线选择 | 避免 prototype 语义继续扩散 | 会压缩一轮“看起来新增功能”的空间 |
| 验证门禁分层 | QA 结论更诚实 | 需要补一轮脚本说明和豁免清单 |

## 4. 我的建议

1. 下一轮先做纯治理回合，不新增新的 `docs/superpowers` 主题文档，也不扩新模块。
2. 纯治理回合只处理四件事：
   - `modules/README.md` 改成三轴状态
   - 回填一版模块现状矩阵
   - 整理 `docs/superpowers` 索引与 plan 生命周期
   - 设计 `docs/userDocs` 的最小信息架构
3. 前端下一轮必须先选路线：
   - `A`：正式控制台
   - `B`：继续 prototype，但隐藏未完成入口
4. 模块口径建议立即改写为：
   - `01`：后端已实现，前端待补
   - `02`：后端 ACL 基础已部分实现
   - `03`：bootstrap 壳层阶段
   - `04`：设计完成，页面占位
   - `05`：运行时后端基础部分实现
   - `06`：未实现
   - `07`：状态建模后端基础部分实现
   - `08`：插件骨架阶段
5. 在上述动作完成前，不建议再用“completed”继续描述任何尚未端到端交付的模块。

## Uncovered Areas / Risks

- 本轮没有在提权环境下重跑 `style-boundary` 和 `verify-backend`，因此这两类验证结论仍是受限结论
- 本轮没有跑真实浏览器登录流、小屏截图和设置区手动回归，因此前端产品路径仍有未验证空白
- `verify-backend` 当前失败证据更接近“环境权限不足”，不是已证明的代码逻辑回归；若后续要下确定结论，必须在可访问本机依赖的环境重跑
