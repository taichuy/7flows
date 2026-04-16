# 文档计划审计优化报告

更新时间：`2026-04-17 06:14 CST`

审计模式：`qa-evaluation / project evaluation`

本轮新增重点：

- 不再重复把“发布配置空操作”和“同主题审计高频重写”作为主结论展开，那两项问题仍在，但本轮更值得处理的是：
  - 模块真值层已经开始落后于代码现实
  - QA 门禁工具本身在当前环境下不够可靠
  - 仓库治理规则在文档和热点目录上持续被突破
  - 记忆检索开始出现专题偏置和部分陈旧项

审计输入：

- 最近 `24` 小时 `git log`
- `.memory/AGENTS.md`、`.memory/user-memory.md`
- 相关反馈记忆：
  - `.memory/feedback-memory/interaction/2026-04-12-memory-summary-first-selection.md`
  - `.memory/feedback-memory/repository/2026-04-13-subdir-agents-inline-critical-rules.md`
  - `.memory/feedback-memory/repository/2026-04-14-agents-only-hard-rules-no-guidance.md`
- 本轮展开的项目记忆：
  - `.memory/project-memory/2026-04-14-modules-03-06-07-08-decision.md`
  - `.memory/project-memory/2026-04-15-module-03-application-shell-needs-future-hooks.md`
  - `.memory/project-memory/2026-04-15-module-04-editor-first-pass-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-node-detail-design-direction.md`
- `docs/superpowers/specs/1flowse/2026-04-10-product-design.md`
- `docs/superpowers/specs/1flowse/2026-04-10-product-requirements.md`
- `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
- `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
- `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`
- `docs/superpowers/specs/1flowse/modules/06b-publish-gateway/README.md`
- 当前 `web` / `api` 代码、目录压力、记忆分布

本轮已运行验证：

- `pnpm --dir web lint`
  - 结果：通过
  - 残留：`web/app/src/features/agent-flow/store/editor/provider.tsx` 有 `1` 条 `react-refresh/only-export-components` warning
- `pnpm --dir web test`
  - 结果：通过，`40` 个文件、`125` 条测试通过
  - 说明：上一轮“`me-page` 阻塞 web 全量测试”不再是当前事实
  - 残留：大量 `Tooltip overlayInnerStyle is deprecated` stderr 噪声
- `pnpm --dir web/app build`
  - 结果：通过
  - 产物：主包 `5,268.92 kB`，gzip `1,572.14 kB`
  - 残留：chunk size warning
- `node scripts/node/verify-backend.js`
  - 结果：失败
  - 原因：停在 `rustfmt` diff，后续统一验证链未继续执行
- `cargo check --workspace`
  - 结果：通过
- `cargo test -p api-server application_routes`
  - 结果：通过，`2` 条测试通过
- `cargo test -p api-server application_orchestration_routes`
  - 结果：通过，`1` 条测试通过
- 浏览器运行时取证：
  - 桌面端：直接打开 `style-boundary` 的 `page.application-detail`，确认编排页真实渲染了 editor、detail panel、`发布配置` 按钮和 node detail
  - 移动端：同一场景确认降级为正式“请使用桌面端编辑”，不是硬塞桌面布局
  - API 分区：浏览器中确认页面展示的是 `planned` 状态说明，而不是可操作能力

本轮未形成自动化通过证据：

- `node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
  - 未通过，不是样式断言失败，而是脚本前置 `dev-up ensure` 在当前环境下反复超时 / `EPERM`
  - 因此本轮前端样式边界结论，部分来自真实浏览器取证，部分仍是受限结论

## 1. 现状

### 1.1 当前开发情况和状态

- 最近 `24` 小时共有 `31` 次提交：
  - `docs`: `13`
  - `feat + feat(web)`: `9`
  - `refactor`: `5`
  - `fix + fix(css)`: `3`
  - `test`: `1`
- 按 AI 日更节奏看，吞吐是快的，不是“项目停滞”。
- 代码真实前进点也比上一轮更明确：
  - `HomePage` 已切到应用列表
  - 应用列表支持标签、筛选、编辑
  - `/applications/:id/orchestration` 已接通 editor、draft 保存、版本恢复、node detail
  - 后端 `applications` 和 `application_orchestration` 路由、服务、测试都在
- 但闭环也同样清楚：
  - 真正闭合的是 `03` 宿主壳层和 `04` authoring 基线
  - `05` 运行态和 `06B` 发布态仍未进入最小可用闭环

### 1.2 当前开发健康判断

结论：`开发速度好，产品真值层偏弱，工程健康整体偏黄`

| 维度 | 判断 | 说明 |
| --- | --- | --- |
| 内部吞吐 | `好` | `31` 次提交里有 `9` 次功能类提交，`agent-flow` 和 `application shell` 继续推进 |
| 前端稳定性 | `中上` | lint/test/build 全通过，桌面和移动端都能拿到真实渲染证据 |
| 后端稳定性 | `中` | `cargo check` 和近期改动相关路由测试通过，但统一后端验证被 `rustfmt` 卡住 |
| 模块真值层 | `差` | 模块 README、计划状态、代码现实已经不再同步 |
| QA 门禁可靠性 | `中下` | 自动化门禁存在，但 `style-boundary` 在当前环境下不能稳定自举 |
| AI 检索效率 | `中下` | 记忆数量继续增长，专题集中度过高，且已有陈旧结论未收口 |

### 1.3 本轮最值得指出的 5 个问题

### [High] `03` 模块文档已经明显落后于代码现实，开始误导判断

- 位置：
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `web/app/src/features/applications/**`
  - `api/apps/api-server/src/routes/applications.rs`
  - `api/apps/api-server/src/routes/application_orchestration.rs`
- 证据：
  - `03` README 仍写：
    - `状态：已确认，待写 implementation plan`
    - `当前前后端还没有 Application 列表、创建、详情和应用内四分区路由`
  - 但当前代码和测试已经存在：
    - 应用列表 / 创建 / 详情
    - `/applications/:id/orchestration|api|logs|monitoring`
    - `application_routes` 和 `application_orchestration_routes` 测试通过
- 为什么是问题：
  - 这不是“文档稍微滞后”，而是模块真值源已经错误。
  - 后续无论是 AI 检索、进度汇报还是功能排序，只要先读模块文档，就会先得到过期结论。
- 建议修正方向：
  - 把 `03` README 改成当前事实口径：
    - `03` 已实现宿主基线
    - `04` 已实现 authoring 基线挂接
    - `05/06B` 仍是 future hook / 能力状态页
  - 不再让“设计已确认”“待写 plan”“已形成代码现实”三种状态写在同一层级里。

### [High] 当前进度很容易被高估，因为只有 `orchestration` 是真实能力，其他三分区仍是状态模型

- 位置：
  - `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
  - `web/app/src/features/applications/components/ApplicationSectionState.tsx`
  - `api/crates/control-plane/src/application.rs`
  - `api/crates/storage-pg/src/mappers/flow_mapper.rs`
  - `api/crates/publish-gateway/src/lib.rs`
- 证据：
  - 浏览器运行时确认：
    - `orchestration` 进入真实 editor
    - `api` 页面仅展示 `planned / application_api_key / api_key_bound_application`
  - 后端 `planned_sections()` 和 `flow_sections()` 中，`api/logs/monitoring` 仍全部是硬编码 `planned`
  - `publish-gateway` 仍只有 `crate_name()` 骨架
- 为什么是问题：
  - 如果继续按旧人力时代“有路由 = 有模块”来算，会误判项目已经完成了大半闭环。
  - AI 时代更准确的进度口径应该是：
    - `内部 authoring 进展`: 快
    - `外部交付闭环`: 仍明显滞后
- 建议修正方向：
  - 不改产品方向，但必须改排序和进度口径：
    - `03`: 宿主已落地
    - `04`: authoring 基线已落地
    - `05`: 运行态未闭环
    - `06B`: 发布态未闭环

### [Medium] QA 门禁存在，但前端样式回归入口在当前环境下不够可靠

- 位置：
  - `scripts/node/check-style-boundary/core.js`
  - `scripts/node/dev-up/core.js`
  - `.memory/tool-memory/node/2026-04-17-dev-up-ensure-timeout-use-pty-vite-for-browser-check.md`
  - `tmp/logs/web.log`
- 证据：
  - `check-style-boundary` 强依赖 `dev-up ensure --frontend-only --skip-docker`
  - 当前环境里 `dev-up ensure` 反复出现 frontend 启动超时
  - `web.log` 中能看到 `listen EPERM` 和多次旧 `VITE ready` 记录混在一起
  - 手工前台 `vite` 能起，Chrome 也能做真实渲染取证，但脚本本身复用不了这类实例
- 为什么是问题：
  - 这意味着“UI 已被 style-boundary 兜底”这句话在当前环境下不稳定成立。
  - 当近期前端持续修改 `agent-flow-editor.css` 和 `scenario-manifest.json` 时，这会让样式门禁的可信度下降。
- 建议修正方向：
  - `check-style-boundary` 需要支持显式复用现有 base URL 或跳过 `dev-up ensure`
  - 否则它更像一个理想门禁，而不是当前可靠门禁

### [Medium] 仓库治理规则在文档和热点目录上已经开始失守

- 位置：
  - `docs/superpowers/plans/history`
  - `docs/superpowers/specs/history`
  - `web/app/src/features/agent-flow/_tests`
  - `api/crates/control-plane/src`
  - `api/apps/api-server/src/_tests`
- 证据：
  - 按仓库规则，单目录文件数不应超过 `15`
  - 当前已超限：
    - `docs/superpowers/plans/history`: `22`
    - `docs/superpowers/specs/history`: `20`
    - `web/app/src/features/agent-flow/_tests`: `16`
    - `api/crates/control-plane/src`: `16`
    - `api/apps/api-server/src/_tests`: `16`
  - 按仓库规则，单文件不应超过 `1500` 行
  - 当前已超限：
    - `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`: `2335`
    - `docs/superpowers/plans/2026-04-15-agentflow-editor.md`: `2188`
    - `docs/superpowers/plans/2026-04-16-agentflow-editor-store-centered-restructure.md`: `2024`
    - `docs/superpowers/plans/2026-04-16-agentflow-node-detail.md`: `1734`
- 为什么是问题：
  - 这类问题短期不一定炸，但会直接拖慢 AI 检索、人工回溯和后续局部修改效率。
  - 当前真正先变重的不是代码复杂度，而是文档和热目录。
- 建议修正方向：
  - 对超长计划文档做阶段归档
  - 对 `_tests` 和热点 service 目录做二级收纳

### [Medium] 记忆系统开始出现专题偏置和陈旧项共存

- 位置：
  - `.memory/project-memory`
  - `.memory/tool-memory`
- 证据：
  - 当前记忆数量：
    - `project-memory`: `65`
    - `tool-memory`: `79`
  - 活跃项目记忆高度集中在：
    - `module-03`
    - `agentflow editor`
    - `node detail`
  - 工具记忆中，`3100` 端口、`vite/dev-up`、`style-boundary`、`vitest` 已形成多条高度近邻记录
  - 现有 `vitest/2026-04-15-web-test-blocked-by-existing-me-page-timeout.md` 与本轮 `pnpm --dir web test` 全量通过已经不一致
- 为什么是问题：
  - AI 会优先命中近期高密度主题，继续把注意力压到 `agent-flow` 实现细节上。
  - 同时，部分陈旧结论如果不降级或归档，会直接污染后续判断。
- 建议修正方向：
  - 项目记忆优先做“主题收口”，不是继续横向堆
  - 工具记忆优先清理已被当前验证推翻的项，避免 stale hit

### 1.4 当前开发健康是好还是差

不是“差项目”，但也不能叫“健康完成态”。

更准确的判断是：

- `开发速度`：好
- `主线路线`：基本正确
- `当前完成定义`：偏松
- `真值层同步`：偏差
- `长期软件健康`：黄灯

### 1.5 短期与长期风险收益

短期收益：

- `03 + 04` 的真实体验已经成型，不再是只有 spec 没有产品壳
- web 全量验证通过，说明当前前端主路径不是脆弱原型
- 后端近期改动相关路由和编排接口测试通过，说明 `applications` 主线不是只写了 UI

短期风险：

- 如果继续用“看起来像模块”替代“真正可交付模块”，项目会持续被高估
- 如果不先修模块真值层，后续每小时审计都会反复花时间纠正文档而不是增加新信息
- 如果继续把重心压在 `04` 的 authoring 微调，P1 最关键的 `05/06B` 还会继续后移

长期收益：

- 当前结构边界没有完全塌，`web` 和 `api` 仍基本符合各自 `AGENTS` 的方向
- 产品方向没有跑偏，问题更多是排序和治理，而不是战略错误

长期风险：

- 最先拖慢 AI 的不一定是代码，而是“模块文档、计划、记忆都越来越多，但真值越来越不集中”
- 当 QA 工具本身不稳定时，后续“完成”会越来越依赖主观判断

### 1.6 AI 时代应如何评估当前开发进度

不建议再按旧人力时代的“一个模块一个阶段慢慢收口”去看。

当前更适合拆成两个指标：

1. `内部吞吐`
   - 当前很强
   - `03/04` 在按天推进
2. `外部闭环`
   - 当前一般
   - “建出来”进展快
   - “发出去、跑起来、查得到”仍明显滞后

因此当前更准确的阶段判断是：

- `不是慢`
- `也不是闭环`
- `而是 authoring 已快跑，publish/runtime 仍待补主链`

### 1.7 产品方向是否清晰、是否需要调整

产品方向本身仍然清晰，而且没有必要改定位。

稳定证据：

- `2026-04-10-product-design.md` 明确：
  - `Flow` 是核心资产
  - `Publish Endpoint` 是核心交付物
- `2026-04-10-product-requirements.md` 明确：
  - `Flow Run`
  - `Node Run`
  - `checkpoint`
  - `callback`
  - 发布 API
  - 日志与监控

因此当前问题不是“方向错了”，而是：

- 方向对
- 排序偏了
- 真值层没有跟上实现速度

## 2. 可能方向

### 方向 A：先收口模块真值层

- 更新 `03` 模块 README、模块状态矩阵和同主题审计文档
- 明确当前真实状态：
  - `03` 宿主基线已落地
  - `04` authoring 基线已落地
  - `05/06B` 仍未闭环

### 方向 B：下一条主切片直接转 `05/06B` 最小闭环

- 停止继续深挖 `04` 的次级 authoring 体验
- 直接补最小可跑的运行态 / 发布态主链

### 方向 C：先把 QA 门禁硬起来

- 先修 `verify-backend` 最前置格式门禁
- 让 `style-boundary` 支持复用现有 frontend host
- 顺手收 `Tooltip` 弃用和 fast refresh warning / invalidation 噪声

### 方向 D：做一轮资料与记忆减噪

- 超长 plan 归档
- 超限目录收纳
- 合并阶段性 project-memory
- 清理已与当前验证相矛盾的 tool-memory

### 方向 E：继续沿 `04` authoring 深挖

- 保持当前最快的 UI 迭代节奏
- 继续补 node detail、画布交互、编辑体验细节

## 3. 不同方向的风险和收益

### 方向 A

- 收益：
  - 后续每轮判断都会更准
  - AI 不会再被旧模块口径带偏
- 风险：
  - 短期新增用户可见功能有限

### 方向 B

- 收益：
  - 最直接回到 P1 主目标
  - 让“发布优先”重新变成真实开发顺序
- 风险：
  - 需要压住继续打磨 editor 的惯性
  - `05/06B` 会比继续做 `04` 更重、更容易暴露底层欠账

### 方向 C

- 收益：
  - 完成定义会更硬
  - 后续减少“看起来过了但证据不完整”的情况
- 风险：
  - 容易演变成纯治理专题

### 方向 D

- 收益：
  - 对 AI 检索效率帮助最大
  - 会显著减少“重新理解当前阶段”的成本
- 风险：
  - 用户短期感知不强
  - 如果不同时修真值层，只移动文件意义有限

### 方向 E

- 收益：
  - 继续保持最高视觉进展速度
  - 最容易持续产出“可见变化”
- 风险：
  - 会进一步拉大 `04` 与 `05/06B` 的投入差
  - 让项目看起来更完整，实际上更偏离 publish-first 主链

## 4. 对此你建议是什么？

建议顺序：`A -> B -> C-lite -> D`

### 4.1 总建议

- 不建议改产品方向
- 建议立即修正开发排序和真值表达
- 下一条主线不应再是 `04` 的 authoring 细化，而应是最小 `05/06B` 闭环

### 4.2 我建议先做的 4 件事

1. 先把模块真值说对
   - 更新 `03` README
   - 在总模块视图里明确 `03/04/05/06B/07/08` 的真实状态
2. 把 `04` 暂时视作“够用基线”，不要再把它当主线继续深挖
3. 用一轮轻治理把验证门禁拉回可信状态
   - `rustfmt`
   - `style-boundary` 入口
   - `Tooltip overlayInnerStyle`
   - `provider.tsx` / fast refresh 噪声
4. 再做资料和记忆减噪
   - 归档超长计划
   - 收纳超限目录
   - 合并阶段性记忆

### 4.3 建议清理或合并的记忆

#### 优先合并的 project-memory

- `2026-04-15-module-03-application-shell-plan-stage.md`
- `2026-04-15-module-03-application-shell-needs-future-hooks.md`
  - 合并为一条 `03 application shell implemented baseline`

- `2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
- `2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
  - 合并为一条 `agentflow editor store-centered restructure implemented baseline`

- `2026-04-16-agentflow-node-detail-design-direction.md`
- `2026-04-16-agentflow-node-detail-plan-stage.md`
  - 合并为一条 `agentflow node detail implemented baseline`

#### 优先清理或降级的 tool-memory

- `vitest/2026-04-15-web-test-blocked-by-existing-me-page-timeout.md`
  - 当前 `pnpm --dir web test` 已全量通过，这条至少要标记陈旧或移出默认命中范围

#### 优先做索引收口的 tool-memory 家族

- `vite/2026-04-14-web-app-dev-port-3100-requires-escalation.md`
- `vite/2026-04-15-web-app-dev-port-3100-already-in-use-reuse-existing-vite.md`
- `node/2026-04-17-dev-up-ensure-timeout-use-pty-vite-for-browser-check.md`
- `bash/2026-04-14-style-boundary-dev-up-needs-escalation-for-port-3100.md`
  - 这几条实质上都属于“本地 3100 前端验收链路”问题，建议收成一条 reference-memory 索引，正文只保留最常用的 canonical 解法

- `style-boundary/2026-04-14-router-scene-reload-drops-seeded-auth.md`
- `style-boundary/2026-04-14-settings-scene-missing-permission-times-out-rail-probe.md`
- `style-boundary/2026-04-16-networkidle-timeout-on-vite-dev-server.md`
  - 不建议强行合正文，但建议补一条 `style-boundary troubleshooting index`

### 4.4 一句话结论

当前项目不是“做得慢”，而是“`03/04` 已明显快于文档、门禁和记忆系统；如果不先把真值层和排序收正，后续每一轮 AI 加速都会继续放大这种偏差”。  
最优先的不是再做一个 editor 小切片，而是先说对当前阶段，再补最小 `05/06B` 主链。
