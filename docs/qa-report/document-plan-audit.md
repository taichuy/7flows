# 文档计划审计优化报告

日期：`2026-04-14 04`

说明：本文件为唯一滚动版本；本轮覆盖 `2026-04-14 03` 版本，只保留当前仍有效的结论、证据和建议。

## Scope

- 当前评估模式：`project evaluation mode`
- 评估范围：`docs/superpowers`、`docs/userDocs`、`docs/qa-report`、`api/`、`web/`
- 输入来源：
  - 记忆：
    - `.memory/AGENTS.md`
    - `.memory/user-memory.md`
    - `.memory/project-memory/2026-04-13-backend-governance-phase-two-direction.md`
    - `.memory/project-memory/2026-04-13-frontend-qa-current-state.md`
    - `.memory/project-memory/2026-04-13-frontend-bootstrap-regression-governance-direction.md`
    - `.memory/project-memory/2026-04-12-backend-quality-spec-scope.md`
    - `.memory/project-memory/2026-04-12-qa-skill-backend-alignment.md`
  - 文档：
    - `docs/superpowers/specs/1flowse/README.md`
    - `docs/superpowers/specs/1flowse/modules/README.md`
    - `docs/superpowers/specs/1flowse/modules/*/README.md`
    - `docs/superpowers/specs/1flowse/2026-04-12-memory-retrieval-and-summary-design.md`
    - `docs/superpowers/specs/1flowse/2026-04-13-frontend-bootstrap-directory-and-regression-design.md`
    - `docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md`
    - `docs/userDocs/todolist/document-plan-audit.md`
  - 代码：
    - `web/app/src/routes/route-config.ts`
    - `web/app/src/app-shell/AppShellFrame.tsx`
    - `web/app/src/features/home/pages/HomePage.tsx`
    - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
    - `web/app/src/features/embedded-runtime/pages/EmbeddedMountPage.tsx`
    - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
    - `web/app/src/app/_tests/app-shell.test.tsx`
    - `api/apps/api-server/src/routes/auth.rs`
    - `api/apps/api-server/src/routes/runtime_models.rs`
    - `api/crates/control-plane/src/model_definition.rs`
    - `api/crates/runtime-core/src/runtime_engine.rs`
    - `api/crates/publish-gateway/src/lib.rs`
    - `api/apps/plugin-runner/src/lib.rs`
    - `api/crates/plugin-framework/src/assignment.rs`
- 已运行的验证：
  - `date '+%Y-%m-%d %H:%M:%S %z'`：当前审计时间为 `2026-04-14 04:03:11 +0800`
  - 文档与目录统计：
    - `docs/superpowers/specs/1flowse` 顶层 `md` 文件：`22`
    - `docs/superpowers/specs/1flowse/README.md` 当前索引：`10`
    - `docs/superpowers/plans` 文件：`16`
    - `docs/userDocs` 文件：`1`
    - 超过 `1500` 行约定的 plan：`2`
      - `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md`：`1912` 行
      - `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`：`2968` 行
    - `docs/superpowers/specs/1flowse` 目录文件数：`22`
    - `docs/superpowers/plans` 目录文件数：`16`
  - 前端 shared packages 测试统计：
    - `web/packages` 总数：`8`
    - 带 `_tests/` 的 package：`2`
    - 不带 `_tests/` 的 package：`6`
  - `pnpm --dir web lint`：通过
  - `pnpm --dir web test -- --testTimeout=15000`：通过
    - `web/app`：`10` 个测试文件、`19` 个用例
    - `web/packages/embed-sdk`：`1` 个测试文件、`1` 个用例
    - `web/packages/embedded-contracts`：`1` 个测试文件、`1` 个用例
    - `web/packages/api-client`、`flow-schema`、`page-protocol`、`page-runtime`、`shared-types`、`ui`：`passWithNoTests`
  - `pnpm --dir web/app build`：通过；`dist/assets/index-n9-QTwmx.js` 为 `1,184.41 kB`，触发 Vite chunk size warning
  - `node scripts/node/check-style-boundary.js all-pages`：
    - 沙箱内首次失败：`listen EPERM: operation not permitted 0.0.0.0:3100`
    - 提权复跑通过：`PASS page.home`、`PASS page.embedded-apps`、`PASS page.agent-flow`
  - `node scripts/node/verify-backend.js`：
    - 沙箱内首次失败：`api/apps/api-server/src/_tests/support.rs:37` 连接本机 `Postgres` 时返回 `Operation not permitted`
    - 提权复跑通过：脚本退出 `0`，当前后端统一验证在本机依赖可访问时成立
- 未运行的验证：
  - 真实浏览器登录流、成员/角色管理、设置区主路径
  - 小屏关键页面的人工回归
  - 发布网关与插件运行的端到端手动链路

## Conclusion

- 是否存在 `Blocking` 问题：未发现被当前代码和验证结果直接证明的 `Blocking` 问题
- 是否存在 `High` 问题：有，主要集中在文档真相层失真和前端产品语义失真
- 当前是否建议继续推进：建议继续推进，但下一轮应先做治理收口，不建议继续平铺新增顶层 spec/plan
- 当前最主要的风险：工程门禁已经基本可用，但文档状态和前端页面语义仍在误导项目成熟度判断

## Findings

### [High] `docs/superpowers` 缺少稳定的文档类型契约和生命周期入口

- 位置：
  - `docs/superpowers/specs/1flowse/README.md`
  - `docs/superpowers/plans`
  - `docs/superpowers/specs/1flowse`
- 证据：
  - `specs/1flowse` 顶层有 `22` 个 `md` 文件，但 `README.md` 只索引了 `10` 个
  - `plans` 目录当前有 `16` 个文件，已超过“单目录不超过 15 个文件”的约定
  - 两份 plan 超过 `1500` 行约定上限：
    - `2026-04-11-fullstack-bootstrap.md`：`1912`
    - `2026-04-12-auth-team-access-control-backend.md`：`2968`
  - 当前 `plans` 同时混放了设计输入、执行步骤、勾选状态、验证记录和历史流水
- 为什么是问题：
  - 文档入口已经不能稳定回答“这是什么文档、是不是当前执行入口、是否仍该继续维护”
  - 这会直接拉高后续检索成本，并持续破坏目录和文件管理约定
- 建议修正方向：
  - 建立最小职责矩阵：
    - `specs`：稳定决策与长期基线
    - `plans`：当前执行中的任务卡
    - `qa-report`：阶段性审计结论
    - `userDocs`：用户侧真相层
    - `modules`：模块级状态总览，但只保留摘要，不承接流水
  - 为 `plans` 增加统一生命周期：`active / completed / archived`
  - 已完成 plan 不再继续追加执行流水，改沉淀短摘要或归档

### [High] 模块 README 中的 `completed` 语义已经脱离代码现实

- 位置：
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
  - `docs/superpowers/specs/1flowse/modules/06-publish-gateway/README.md`
  - `docs/superpowers/specs/1flowse/modules/08-plugin-framework/README.md`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/features/agent-flow/pages/AgentFlowPage.tsx`
  - `api/crates/publish-gateway/src/lib.rs`
  - `api/apps/plugin-runner/src/lib.rs`
  - `api/crates/plugin-framework/src/assignment.rs`
- 证据：
  - 模块总览中除 `02` 外，其余模块大多写成 `completed`
  - `03` 写“已完成工作台首页和应用容器”，但 `HomePage.tsx` 仍是 `Workspace Bootstrap`
  - `04` 写“已完成模块定稿”，但 `AgentFlowPage.tsx` 仍是占位卡片
  - `06` 写“已确认发布网关”，但 `publish-gateway` 当前只有 `crate_name()`
  - `08` 写“已完成插件体系定稿”，但 `plugin-runner` 目前仍只是健康检查壳层，`assignment.rs` 只覆盖最小绑定规则
- 为什么是问题：
  - 这里的 `completed` 实际在混用“讨论完成”“实现完成”“验证完成”三种完全不同的状态
  - 模块总览一旦不可信，排期、治理顺序和用户沟通都会被持续高估
- 建议修正方向：
  - 把模块状态拆成三轴：
    - `design_status`
    - `implementation_status`
    - `verification_status`
  - 每个模块都补充代码证据或验证证据链接，不再只保留讨论结论

### [High] 正式 `web` 仍暴露 `bootstrap/demo` 语义，并且被测试固化

- 位置：
  - `web/app/src/app-shell/AppShellFrame.tsx`
  - `web/app/src/features/home/pages/HomePage.tsx`
  - `web/app/src/routes/route-config.ts`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`
  - `web/app/src/features/embedded-runtime/pages/EmbeddedMountPage.tsx`
  - `web/app/src/app/_tests/app-shell.test.tsx`
- 证据：
  - 壳层标题仍是 `1Flowse Bootstrap`
  - 首页卡片仍是 `Workspace Bootstrap`
  - 所有路由 guard 都还是 `bootstrap-allow`
  - `EmbeddedAppDetailPage` 仍持有 `placeholderManifest` 和 `Demo Embedded App`
  - `EmbeddedMountPage` 仍写死 `bootstrap-application`、`bootstrap-team`
  - 回归测试仍在断言 `1Flowse Bootstrap` 和当前 placeholder 路由语义
- 为什么是问题：
  - 这和 `web/AGENTS.md` 中“禁止 placeholder/mock/TODO 文案进入正式 UI”的本地规则直接冲突
  - 不仅页面语义没有切到产品真相层，连回归测试都在帮这些原型语义续命
- 建议修正方向：
  - 把这类问题独立成一个“前端语义收口”专题，而不是零散边改边混
  - 至少同步清理：
    - 壳层和首页的 `bootstrap` 文案
    - detail / mount 页面中的 demo 与 placeholder 常量
    - `route-config` 与测试里的 `bootstrap-allow` 语义
  - 若暂时继续 prototype，就应隐藏未开放入口，不再把它们伪装成正式模块

### [Medium] 当前测试绿灯混合了真实覆盖与 `passWithNoTests`

- 位置：
  - `web/package.json`
  - `web/packages/*`
- 证据：
  - `pnpm --dir web test -- --testTimeout=15000` 通过
  - 但 `web/packages` 一共 `8` 个 package，只有 `2` 个存在 `_tests/`
  - `api-client`、`flow-schema`、`page-protocol`、`page-runtime`、`shared-types`、`ui` 都是 `passWithNoTests`
- 为什么是问题：
  - 当前“测试通过”同时代表了“真实通过”和“没有测试也放行”两种不同含义
  - 一旦 shared package 开始承接更多正式语义，这类绿灯会持续被误读
- 建议修正方向：
  - 把验证说明拆成：
    - `static gates`
    - `sandbox-safe tests`
    - `local-service integration`
    - `manual product checks`
  - 为 `passWithNoTests` 的 package 建一张“补测或豁免”清单

### [Medium] `docs/userDocs` 还没有承担用户侧真相层职责

- 位置：
  - `docs/userDocs`
  - `docs/userDocs/todolist/document-plan-audit.md`
- 证据：
  - 当前 `docs/userDocs` 下只有 `1` 个文件
  - 该文件本质上仍是治理待办，不是用户看项目现状的入口
  - 当前模块进度、验证语义和真实成熟度仍主要散落在 `docs/superpowers` 与 `.memory`
- 为什么是问题：
  - 用户离线回看时，仍需要钻入内部 spec/plan 才能知道“项目现在到底到哪一步”
  - 这会让 `docs/userDocs` 失去存在价值
- 建议修正方向：
  - 先冻结 `docs/userDocs` 的最小信息架构，再开始补正文档
  - 最小建议：
    - 项目现状页
    - 模块进度矩阵页
    - 状态 / 术语说明页
    - 滚动 todo 页

## 1. 当前现状

### 1.1 文档现状

- `docs/superpowers` 当前的问题不是“文档少”，而是“入口失真、类型混放、生命周期不清”
- `docs/superpowers/specs/1flowse` 与 `docs/superpowers/plans` 都已经触发单目录文件数压力
- 模块 README 目前更接近“讨论结论摘要”，不再适合作为模块交付状态看板
- `docs/userDocs` 仍处于空壳阶段，尚未形成用户侧真相层

### 1.2 代码现状

- 后端：
  - `node scripts/node/verify-backend.js` 在可访问本机 `Postgres/Redis` 的环境下通过
  - 认证、团队、成员、角色、会话、状态模型、运行时数据和 ACL 主链路已经有真实代码与测试支撑
- 前端：
  - 路由真值层、壳层、`style-boundary` 门禁、基础测试链路已经建立
  - 但产品语义仍然停留在 bootstrap/prototype 阶段，尚未切换为正式控制台表达
- 结论：
  - 当前真实成熟度是“后端主链路明显领先，前端结构门禁初步站住，但语义和页面内容未对齐”

### 1.3 模块现状矩阵

| 模块 | 文档口径 | 代码现状 | 当前更准确描述 |
| --- | --- | --- | --- |
| `01` 用户登录与团队接入 | `completed` | `auth.rs` 与相关后端测试已通过，前端正式登录/团队主路径未补齐 | 后端主链路已实现，前端待补 |
| `02` 权限与资源授权 | `in_progress` | `access-control`、角色权限与 runtime ACL 测试存在 | 文档偏保守，后端基础已部分落地 |
| `03` 工作台与应用容器 | `completed` | `HomePage.tsx` 仍是 bootstrap 首页 | 壳层阶段，不是模块完成 |
| `04` agentFlow | `completed` | `AgentFlowPage.tsx` 仍为占位页 | 设计完成，页面占位 |
| `05` 运行时编排 | `completed` | `runtime_models.rs`、`runtime_engine.rs` 已有真实路由与运行时逻辑 | 后端基础部分落地 |
| `06` 发布网关 | `completed` | `publish-gateway` 仍是骨架 crate | 基本未实现 |
| `07` 状态与记忆 | `completed` | `model_definition.rs` 与 runtime model CRUD 已存在 | 后端建模基础部分落地 |
| `08` 插件体系 | `completed` | `plugin-runner` 与 `assignment.rs` 仍是骨架级实现 | 骨架阶段，不是产品完成 |

### 1.4 验证现状

- 已真实通过：
  - 前端 `lint`
  - 前端 `test`
  - 前端 `build`
  - `style-boundary` 页面回归
  - 后端统一验证脚本
- 当前仍需单独说明的事实：
  - 前端测试绿灯中包含 `passWithNoTests`
  - 前端产物有 `1.18 MB` 主 chunk warning
  - 人工产品验证仍未闭环，尤其是登录、成员/角色管理、设置区和小屏路径
- 当前最准确的解释不是“项目已经整体成熟”，而是“工程门禁初步健康，但产品语义和文档语义还不诚实”

## 2. 基于现状的改进方向与预期结果

| 方向 | 预期结果 |
| --- | --- |
| 定义文档职责矩阵并引入 plan 生命周期 | 文档入口收敛，下一轮能快速判断该读 spec、plan、report 还是 userDocs |
| 把模块总览改成三轴状态并补代码证据 | 模块成熟度不再被 `completed` 一词误导 |
| 做一轮前端语义收口 | 正式 `web` 不再泄露 `bootstrap/demo` 语义，测试也改为保护真实产品表达 |
| 把验证结果拆成四层并维护 package 补测/豁免表 | “测试通过”的含义更诚实，便于持续治理 |
| 为 `docs/userDocs` 建最小信息架构 | 用户离线回看时可以直接知道当前状态和下一步，而不是钻内部文档 |

## 3. 这样做的好处和风险

| 动作 | 好处 | 风险 / 代价 |
| --- | --- | --- |
| 文档职责矩阵 + 生命周期 | 文档检索和维护成本大幅下降 | 需要统一旧文档口径并做一轮清理 |
| 模块三轴状态 | 排期和沟通建立在真实成熟度上 | 需要逐模块补证据与回填 |
| 前端语义收口 | 页面、测试和用户心智回到同一真相层 | 需要调整一批现有文案、常量和测试断言 |
| 验证四层化 + package 豁免表 | QA 结论更可信，可明确哪些是真测、哪些是豁免 | 需要补一轮 shared packages 治理 |
| `docs/userDocs` 最小结构 | 用户侧沟通成本下降，减少回看内部 spec 的负担 | 会增加一层需要持续维护的说明文档 |

## 4. 我的建议

1. 下一轮先做“治理回合”，不要继续新增 `docs/superpowers` 顶层 spec/plan。
2. 治理回合优先完成四件事：
   - 定义 `specs / plans / qa-report / userDocs / modules` 的职责矩阵
   - 给 `plans` 增加生命周期，并把已完成 plan 从活动入口移走
   - 回填模块三轴状态与代码证据链接
   - 补一轮前端语义收口，清理 `bootstrap/demo/placeholder` 常量和对应测试
3. 治理回合并行补一件工程项：
   - 建立验证四层说明和 `passWithNoTests` package 的补测 / 豁免表
4. 上述工作完成后，再做前端路线决策：
   - `A`：进入正式控制台，优先补 `01` 的登录、团队、成员、角色、设置最小主路径
   - `B`：继续 prototype，但隐藏未完成入口，停止对模块使用 `completed` 口径
5. 当前模块建议立即改写为：
   - `01`：后端已实现，前端待补
   - `02`：后端 ACL 基础已部分实现
   - `03`：壳层阶段
   - `04`：设计完成，页面占位
   - `05`：运行时后端基础部分实现
   - `06`：骨架阶段
   - `07`：状态建模后端基础部分实现
   - `08`：插件骨架阶段

## Uncovered Areas / Risks

- 本轮没有做真实浏览器端到端操作，因此登录流、成员/角色管理、设置区主路径和小屏体验仍是未覆盖项
- `style-boundary` 与后端统一验证都依赖本机端口或本机中间件访问；沙箱内首次失败属于环境限制，不应误判为代码回归
- `publish-gateway` 与 `plugin-runner` 的当前结论主要来自代码骨架抽样，不代表完整产品链路已经验证
