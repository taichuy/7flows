# 文档计划审计优化报告

更新时间：`2026-04-17 00:40 CST`

说明：本轮继续沿用 `document-plan-audit` 主题，但尽量不重复上一版已经展开过的“大审计文档过长”与“03/04 已开始落地”旧结论。当前更值得关注的新问题有五个：`文档真值层内部互相打架`、`Node Detail 第一版实现已经出现二次修正信号`、`官方验证链和真实可用性分裂`、`前端已经进入性能与开发回路治理区`、`最近 24 小时执行仍然明显偏向 editor 而不是 publish/runtime`。

审计输入：

- `git` 时间窗口：最近 `24` 小时
- 最近 `24` 小时提交数：`32`
  - `docs`: `14`
  - `feat`: `8`
  - `refactor`: `5`
  - `fix`: `4`
  - `test`: `1`
- 最近 `24` 小时提交文件命中记录：
  - `web/`: `170`
  - `api/`: `12`
  - `docs/`: `35`
  - `.memory/`: `16`
  - 其中 `web/app/src/features/agent-flow`: `155`
  - 其中 `web/app/src/features/applications`: `6`
- 本轮重点记忆：
  - `.memory/project-memory/2026-04-15-module-03-application-shell-plan-stage.md`
  - `.memory/project-memory/2026-04-15-module-04-editor-first-pass-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-node-detail-plan-stage.md`
  - `.memory/feedback-memory/repository/2026-04-15-application-api-routing-bound-by-key-not-path.md`
- 本轮重点文档：
  - `docs/superpowers/specs/1flowse/2026-04-10-product-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-10-product-requirements.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
  - `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`
  - `docs/superpowers/specs/1flowse/modules/06b-publish-gateway/README.md`
  - `docs/superpowers/specs/1flowse/2026-04-15-agentflow-editor-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-16-agentflow-node-detail-design.md`
  - `docs/superpowers/plans/2026-04-16-agentflow-node-detail.md`
  - `docs/superpowers/plans/2026-04-16-agentflow-node-detail-panel-revision.md`
- 本轮已运行验证：
  - `pnpm --dir web lint`：通过；仍有 `1` 条 `react-refresh/only-export-components` warning，定位在 `web/app/src/features/agent-flow/store/editor/provider.tsx:39`
  - `pnpm --dir web test`：通过；`39` 个测试文件，`118` 个测试
  - `pnpm --dir web/app build`：通过；主包 `dist/assets/index-CDKz9m7Z.js` 为 `5,254.75 kB`，gzip 后 `1,566.98 kB`
  - `node scripts/node/verify-backend.js`：失败；停止在 `cargo fmt --all --check`
  - `cargo test -p api-server application_orchestration_routes`：通过；`1` 个测试
  - `cargo test -p storage-pg flow_repository_tests`：通过；`3` 个测试
  - `node scripts/node/check-style-boundary.js page page.application-detail`：失败；`dev-up ensure` 无法稳定拉起前端
- 本轮未覆盖项：
  - 没有拿到真实浏览器下的 `style-boundary` 运行时 PASS 证据
  - 没有完成移动端或小屏浏览器回归
  - 后端官方串行验证入口没有完整走完 `fmt -> clippy -> test -> check`

## 1. 现状

### 1.1 现在开发情况和状态

- 当前开发不是停在 spec，而是已经有两条真实落地切片：
  - `03 Application shell`：应用列表、创建、详情四分区、应用标签和编辑链路都已存在
  - `04 agentFlow authoring baseline`：editor store、document transforms、连线交互、node detail 第一版都已落地
- 最近 `24` 小时的推进重心极其清楚：
  - 主线是 `agent-flow` editor 的结构重构、交互修正和 node detail
  - 次线是 `Application` 标签与编辑
  - `05 runtime orchestration` 与 `06B publish gateway` 没有形成新的代码闭环
- 当前工程门禁也不是“全面红”：
  - 前端 lint / test / build 全绿
  - 后端两条关键定向测试通过
  - 但“官方后端验证入口”和“样式运行时门禁”都没有形成可复用的稳定通过证据

### 1.2 对当前开发健康来说是好还是差

- 如果只看执行效率：`好`
  - 最近 `24` 小时是持续落代码、补测试、补计划，不是空转
  - `agent-flow` 的 store-centric 重构方向已经在代码里形成事实，而不是停在设计层
- 如果看治理和交付健康：`中等偏弱`
  - 产品真值层没有同步到当前代码事实
  - 最新设计与最新实现之间已经出现“当天落地，当天再开修正计划”的回摆
  - 后端官方验证入口不可信，样式运行时门禁不可复现
  - 前端包体和开发噪声已经开始显性化
- 更准确的判断是：
  - `实现速度：好`
  - `代码结构收敛：中上`
  - `门禁稳定性：中下`
  - `产品真值同步：差`
  - `对外价值推进：弱`

### 1.3 本轮新增或升级的问题

#### 问题一：文档真值层已经不是“落后一点”，而是内部互相冲突

- 证据：
  - 产品北极星仍明确是 `以发布为优先的 AI 工作流平台`，`Flow` 的完成标准是稳定对外暴露，[`docs/superpowers/specs/1flowse/2026-04-10-product-design.md:8-20`](../superpowers/specs/1flowse/2026-04-10-product-design.md) 与 `:28-38`
  - 但模块总览仍把 `03` 写成 `已确认待开发`、把 `04` 写成 `未来设计`，见 [`docs/superpowers/specs/1flowse/modules/README.md:44-52`](../superpowers/specs/1flowse/modules/README.md)
  - `03` 模块 README 还在写“当前首页仍是空态”“当前前后端还没有 Application 列表、创建、详情和应用内四分区路由”，见 [`docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md:24-31`](../superpowers/specs/1flowse/modules/03-workspace-and-application/README.md)
  - 实际代码已经存在完整应用路由与详情壳层，见 `web/app/src/app/router.tsx:82-155`；对应前端测试 `application-list-page`、`application-shell-routing` 与 `home-page` 本轮全部通过
- 为什么是问题：
  - 现在不是单纯“文档慢半拍”，而是产品文档、模块总览、模块 README 和代码状态在说四种不同的话
  - 这会让后续所有“做到哪了、下一步该做什么、是否偏航”讨论继续反复
  - 在 AI 日更节奏下，真值层如果不收口，速度越快，误判越快

#### 问题二：`Node Detail` 第一版实现已经出现“设计真值未稳定”的回摆

- 证据：
  - 最近最新计划已经不是继续加功能，而是新增一份“修正计划”：`docs/superpowers/plans/2026-04-16-agentflow-node-detail-panel-revision.md`
  - 该修正计划明确要把现状改成 `Splitter` 停靠 panel、header 内联编辑 `别名 / 简介`、`配置 / 上次运行` 共用统一容器
  - 当前代码仍然是绝对定位浮层：
    - `NodeDetailPanel` 自己持有宽度并直接内联到 `<aside style={{ width: nodeDetailWidth }}>`，见 [`web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx:19-36`](../../web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx)
    - `agent-flow-editor.css` 仍把 `.agent-flow-node-detail` 定义为 `position: absolute`，见 [`web/app/src/features/agent-flow/components/editor/agent-flow-editor.css:47-60`](../../web/app/src/features/agent-flow/components/editor/agent-flow-editor.css)
    - header 只展示类型名与 alias 文本，没有内联编辑，见 [`web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx:33-52`](../../web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx)
    - alias / description 仍放在 `NodeSummaryCard` 中编辑，见 [`web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx:41-59`](../../web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx)
- 为什么是问题：
  - 这说明 `04` 目前虽然跑得快，但“设计稿 -> 代码 -> 当前真值”的链路还没有稳定
  - 如果继续在当前实现上叠新交互，会把一个已知中间态继续固化
  - 这不是单纯 UI 微调，而是布局 owner、信息架构和扩展位的二次收口

#### 问题三：官方验证链和真实可用性已经分裂，当前不能把“功能可用”直接等同于“可交付”

- 证据：
  - `node scripts/node/verify-backend.js` 本轮失败，不是失败在逻辑测试，而是失败在 `cargo fmt --all --check`
  - 失败输出主要是格式差异，涉及 `api/apps/api-server/src/routes/applications.rs`、`api/crates/storage-pg/src/flow_repository.rs` 等多个文件
  - 与此同时，两条关键后端定向测试都通过：
    - `cargo test -p api-server application_orchestration_routes`
    - `cargo test -p storage-pg flow_repository_tests`
  - 前端运行时样式门禁尝试执行后失败：
    - `node scripts/node/check-style-boundary.js page page.application-detail`
    - 日志先出现 `Port 3100 is already in use`
    - 随后又出现 `listen EPERM: operation not permitted 0.0.0.0:3100`
    - 结果是这轮拿不到 `page.application-detail` 的浏览器级 PASS 证据
- 为什么是问题：
  - 当前真实状态是“局部行为大概率成立”，不是“官方门禁成立”
  - 一旦继续接受这种状态，后续每次收尾都得靠人工解释“为什么红但其实没问题”
  - 对 AI 驱动开发来说，这会直接降低自动验证链作为完成标准的价值

#### 问题四：前端已经进入性能治理和开发回路治理阶段

- 证据：
  - 构建主包 `dist/assets/index-CDKz9m7Z.js` 已到 `5,254.75 kB`，gzip 后 `1,566.98 kB`
  - Vite 明确给出 chunk 过大警告
  - 路由仍是全量静态导入页面组件，见 [`web/app/src/app/router.tsx:12-23`](../../web/app/src/app/router.tsx)；活跃路由没有 `import()` 或 `lazy()`
  - `vite.config.ts` 只有基础 `react()` 插件，没有 `manualChunks` 等切分策略，见 [`web/app/vite.config.ts:10-60`](../../web/app/vite.config.ts)
  - `pnpm --dir web lint` 仍提示 `web/app/src/features/agent-flow/store/editor/provider.tsx:39` 的 fast refresh warning，且开发日志出现 HMR invalidate
  - 测试输出里 `AgentFlowNodeCard` 使用的 `overlayInnerStyle` 已被 `antd Tooltip` 标记为弃用，定位在 [`web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx:63-73`](../../web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx)
- 为什么是问题：
  - 这说明当前前端不再只是“功能还可以继续加”，而是已经需要正式处理包体、路由切分和开发噪声
  - 如果 `05/06B` 也直接沿当前方式继续叠到主包，性能债会在一个很短周期内继续放大
  - AI 日更会放大这类债务，因为加新页面和改共享组件的频率更高

#### 问题五：最近 24 小时的执行仍然明显是 editor-first，不是 publish/runtime-first

- 证据：
  - 最近 `24` 小时提交数 `32`，其中：
    - `14` 个 `docs`
    - `8` 个 `feat`
    - `5` 个 `refactor`
  - 最近 `24` 小时 `web/app/src/features/agent-flow` 命中记录 `155`
  - 同窗口 `web/app/src/features/applications` 命中记录只有 `6`
  - `api/` 命中记录只有 `12`
  - `docs/superpowers/specs/1flowse/2026-04-10-product-design.md`、`modules/README.md`、`03/04/05/06B README` 这类产品真值文档在本窗口没有同步更新
- 为什么是问题：
  - 当前项目的产品身份仍然是“发布优先平台”，不是“持续打磨 editor 细节的画布产品”
  - editor-first 不是错，但如果连续多轮都只新增 authoring 细节，对外价值证明会继续后移
  - 这会让项目越来越像“做得很细的流程编辑器”，而不是“可发布、可调用、可恢复的工作流平台”

### 1.4 从短期来看风险和收益

- 短期收益：
  - `03` 和 `04` 的实现速度很快，且自动化覆盖显著增加
  - `agent-flow` store / hook / transform 分层已经比前一阶段更像可持续扩展内核
  - 审计文档本身已经被压缩到更小体量：当前 `docs/qa-report/document-plan-audit.md` 为 `329` 行，`docs/userDocs/todolist/document-plan-audit.md` 为 `112` 行，旧的“单文档过重”问题已有改善
- 短期风险：
  - `node detail` 如果不先收口，会继续在已知中间态上加新交互
  - 产品真值层继续不更新，会让后续计划判断继续偏差
  - 后端官方门禁红、样式运行时门禁不可复现，意味着“当前通过”不能稳定复用

### 1.5 从长期来看软件健康和质量

- 长期正向点：
  - 当前代码结构不是失控堆砌，`agent-flow` 已明显向 `store + hooks + transforms + adapters` 收口
  - 目录压力目前仍受控：
    - `web/app/src/features/agent-flow/hooks/interactions`：`9` 个文件
    - `web/app/src/features/agent-flow/lib/document/transforms`：`5` 个文件
    - `api/apps/api-server/src/routes`：`14` 个文件
    - `api/crates/storage-pg/src`：`12` 个文件
  - 测试覆盖随着功能推进同步增长，而不是“先写功能、长期不补测试”
- 长期风险点：
  - `产品真值债`：文档内部冲突，会持续拖慢判断质量
  - `设计真值债`：`04` 的 UI 结构刚落地就出现修正计划，说明设计闭环还没稳定
  - `验证链债`：官方门禁和局部通过结果继续分裂
  - `性能债`：主包已显性超大，且没有路由级懒加载
  - `开发回路债`：HMR invalidation 和弃用警告会持续制造噪声

### 1.6 开发进度如何评估，不要再用旧人力时代口径

- 当前不建议用“模块完成百分比”评估
- AI 时代更适合看五个指标：
  - `已验证垂直切片数量`
  - `当前代码和产品北极星的对齐度`
  - `官方门禁可信度`
  - `设计真值到代码真值的同步速度`
  - `距离最小对外价值证明还差多少`
- 按这个口径看当前项目：
  - `已验证垂直切片`：`快`
    - `03 Application shell`
    - `04 agentFlow authoring baseline`
  - `与北极星对齐度`：`下降`
    - 北极星仍是 publish-first，但最近执行基本是 editor-first
  - `官方门禁可信度`：`中低`
    - 前端高，后端官方入口低，样式运行时证据缺口仍在
  - `设计到代码同步速度`：`中`
    - 有设计和计划，但 `node detail` 刚落地就进入修正计划
  - `离最小对外价值证明的距离`：`仍然明显`
    - `05/06B` 还没有最小闭环
- 因此当前进度不该评价为“慢”，而应该评价为：
  - `实现很快`
  - `结构正在收口`
  - `对外交付主线还没有被拉回正轨`

### 1.7 项目设计与产品方向定位是否清晰、是否正确、是否需要调整

- 北极星方向本身仍然正确：
  - `Application` 作为交付容器
  - `agentFlow` 作为第一条 authoring 主线
  - `runtime / publish` 作为真正的产品闭环
- 需要调整的不是北极星，而是当前阶段的命名和执行口径：
  - 当前不应再写成“03 待开发、04 未来设计”
  - 更准确的说法应该是：
    - `03 Application shell 已实现基线`
    - `04 agentFlow authoring baseline 已实现，但 UI 结构仍在收口`
    - `05/06B` 仍缺最小外部价值闭环
- 如果不做这个调整，会持续产生两个误判：
  - 外部误以为项目离平台闭环很近
  - 内部实际却仍在收 `04` 的信息架构与交付门禁

### 1.8 根据当前项目现状，建议清理或合并哪些记忆

- 当前记忆规模：
  - `project-memory`: `65`
  - `tool-memory`: `78`
  - `feedback-memory`: `15`
  - `reference-memory`: `4`
- 当前最值得清理的是 `project-memory`，因为它已经开始出现“同一主题被切成多个阶段性文件”的检索噪声
- 建议合并组一：`03` 模块的阶段记忆
  - `2026-04-15-module-03-application-shell-plan-stage.md`
  - `2026-04-15-module-03-application-shell-needs-future-hooks.md`
  - 建议合并为一条新的 `module-03-current-state` 记忆，正文只保留“已实现什么、未实现什么、后续挂点是什么”
- 建议合并组二：最近 `04 agentFlow` 的同日多条跟进记忆
  - `2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
  - `2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
  - `2026-04-16-agentflow-branching-and-edge-deletion-follow-up.md`
  - `2026-04-16-agentflow-handle-first-source-trigger-follow-up.md`
  - `2026-04-16-agentflow-node-detail-design-direction.md`
  - `2026-04-16-agentflow-node-detail-plan-stage.md`
  - 建议收成一条 `module-04-current-state` 记忆，把“当前 editor 架构、已落地交互、待修正项、下一步禁止继续发散的边界”写清楚
- 建议合并组三：`tool-memory` 里围绕前端端口和样式门禁的相邻问题
  - `vite/2026-04-14-web-app-dev-port-3100-requires-escalation.md`
  - `vite/2026-04-15-web-app-dev-port-3100-already-in-use-reuse-existing-vite.md`
  - `style-boundary/2026-04-16-networkidle-timeout-on-vite-dev-server.md`
  - 本轮新增现象：`dev-up ensure` 遇到 `3100` 端口占用 / stale pid / `EPERM`
  - 建议整理成“一条端口复用/启动冲突记忆 + 一条 style-boundary 执行前置条件记忆”，减少同类检索噪声
- 暂不建议动 `feedback-memory`
  - 当前只有 `15` 条，且大多是硬规则，检索价值高于噪声

## 2. 可能方向

### 方向 A：先把“当前已验证基线”重写真值层

- 同步更新：
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `03/04/05/06B README`
  - 必要时补一份“当前基线状态”摘要文档
- 目标不是重写北极星，而是把当前代码事实和阶段口径写对

### 方向 B：先收口 `04` 的已知中间态，不再继续堆 editor 新功能

- 直接执行 `docs/superpowers/plans/2026-04-16-agentflow-node-detail-panel-revision.md`
- 目标是把：
  - `Node Detail` 停靠布局
  - header 身份编辑
  - `config / last run` 同容器
  - 样式门禁
  收到最新设计真值

### 方向 C：修复验证链，让“通过”重新可信

- 让 `verify-backend.js` 回绿
- 清掉前端 fast refresh warning 与 `overlayInnerStyle` 弃用噪声
- 让 `style-boundary` 至少形成一条稳定可重复执行的页面回归路径

### 方向 D：下一条功能切片直接补最小 `05/06B` 外部价值证明

- 候选最小切片：
  - `Application API Key + invoke skeleton`
  - `Application Run List / Run Detail` 最小闭环
  - `Publish Endpoint` 最小对象 + 一次调用证明

### 方向 E：补第一轮前端性能治理

- 路由级懒加载
- chunk 切分
- editor / settings / api docs 等重页面拆包

## 3. 不同方向的风险和收益

### 方向 A：真值层同步

- 收益：
  - 后续所有讨论会回到统一事实层
  - AI 检索文档时噪声显著下降
  - 模块进度判断终于能和当前代码对齐
- 风险：
  - 短期没有新的产品演示
  - 需要投入一轮纯治理成本

### 方向 B：收口 `04` 中间态

- 收益：
  - 先把一个已知不稳定的 UI 真值收稳
  - 可以阻止继续在错 owner 上叠功能
  - 为 `05` 接真实运行态保留正确扩展位
- 风险：
  - 如果做过头，会继续把项目拖在 authoring 视角
  - 容易被误做成“再打一轮 editor polish”

### 方向 C：修复验证链

- 收益：
  - “通过”重新成为可信的完成标准
  - 适合 AI 高频开发节奏，减少人工解释成本
  - 也能顺手清掉开发噪声
- 风险：
  - 对外观感不如新功能直接
  - 如果没有同时冻结新增点，修完后很快又会继续漂

### 方向 D：补最小 `05/06B`

- 收益：
  - 最快把项目重新拉回 publish-first 主线
  - 能把“平台价值”从文档层推进到真实对外证明
- 风险：
  - 如果不先修门禁和 `04` 中间态，会把旧债一起带进新模块
  - 很容易在 `04` 还没收稳时又开一条更重的主线

### 方向 E：性能治理

- 收益：
  - 在 `05/06B` 进场前先控制前端包体
  - 对后续扩展非常关键
- 风险：
  - 现在做它，对产品主线的直接帮助不如 `A/B/C/D`
  - 容易被当成“纯技术打磨”而被不断延后

## 4. 对此你建议是什么？

建议顺序：`A + B + C -> D -> E`

### 我建议现在先做

1. 先��� `docs/superpowers` 的当前基线写对：
   - `03 = 已实现基线`
   - `04 = 已实现 baseline，但 UI 结构仍在收口`
   - `05/06B = 尚未形成最小闭环`
2. 直接执行 `agentflow-node-detail-panel-revision`，但只做“收真值”，不再顺手扩新功能。
3. 把验证链修到可重复：
   - `verify-backend.js` 回绿
   - `style-boundary` 至少拿到一次稳定 PASS
   - 清掉已知前端开发噪声 warning

### 我建议紧接着做

1. 下一条功能切片不要再默认继续做 editor 细节。
2. 直接补一条最小 `05/06B` 外部价值证明，把项目重新拉回 publish/runtime 主线。

### 我建议随后做

1. 在 `05/06B` 最小切片跑通后，再做前端路由拆包和 chunk 治理。
2. 同步清理 `.memory/project-memory` 与 `.memory/tool-memory` 的同主题碎片记忆，提升后续 AI 检索效率。

### 当前不建议优先做

1. 继续往当前 `agent-flow` 画布里叠新的 authoring 小功能。
2. 继续把“局部测试绿”当成“官方交付门禁绿”。
3. 继续让模块总览、模块 README 和代码状态各说各话。
