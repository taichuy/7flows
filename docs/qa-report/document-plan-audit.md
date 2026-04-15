# 文档计划审计优化报告

更新时间：`2026-04-16 04:00 CST`

说明：本轮继续沿用同主题滚动更新，但只补充新的问题证据与判断，不重复上一轮已经明确的“文档真值漂移、统一门禁未全绿、authoring 强于 publish/run”三类结论。

审计输入：

- `git` 时间窗口：`2026-04-15 04:00:53 CST` 到 `2026-04-16 04:00:53 CST`
- 最近 `24` 小时提交数：`42`
- 变更分布：
  - `web/app/src/features/agent-flow`：`86` 条路径命中
  - `web/app/src/features/applications`：`13` 条路径命中
  - `api/`：`49` 条路径命中
  - `docs/superpowers`：`33` 条路径命中
  - `api/crates/publish-gateway`、`api/apps/plugin-runner`、`api/crates/runtime-core`、`api/crates/observability`：本窗口内无新增提交命中
- 本轮重点抽样：
  - 产品文档：`docs/superpowers/specs/1flowse/2026-04-10-product-requirements.md`
  - 产品设计：`docs/superpowers/specs/1flowse/2026-04-10-product-design.md`
  - 模块总览：`docs/superpowers/specs/1flowse/modules/README.md`
  - 当前主线路径：`web/app/src/features/applications/*`、`web/app/src/features/agent-flow/*`
  - 路由与权限：`web/app/src/routes/*`、`api/crates/control-plane/src/application.rs`、`api/crates/control-plane/src/flow.rs`
  - 发布与运行骨架：`api/crates/publish-gateway/src/lib.rs`、`api/apps/plugin-runner/src/lib.rs`

## 1. 现状

### 1.1 现在开发情况和状态

- 当前真实主线已经很清楚：`工作台 -> Application -> orchestration -> agentFlow editor`。
- 最近 `24` 小时的代码推进明显偏向 `03/04`：
  - `ApplicationListPage`、`ApplicationDetailPage`、`AgentFlowEditorPage` 持续收口
  - `agentFlow` 编辑器继续增强保存、历史、视口保持、连线重连
  - 后端也主要围绕 `application` 与 `orchestration` 控制面接口补齐
- 但最近 `24` 小时几乎没有把主线往 `05/06B` 推进：
  - `publish-gateway` 仍只有 `crate_name()`
  - `plugin-runner` 仍只有 `/health`、CORS 和 tracing 初始化
  - `runtime`、`observability` 本窗口内没有继续形成产品能力证据

### 1.2 对当前开发健康来说是好还是差

- 如果只看速度：`好`
  - `42` 次提交说明不是停滞期，且不是纯文档空转，主线页面和后端 DTO/路由都在真实推进
- 如果看“今天做完一段闭环没有”：`中上`
  - `Application` 宿主容器和 `agentFlow` 编辑器已经形成可演示主路径
- 如果看“明天继续推进时会不会越来越稳”：`中偏弱`
  - 权限真值、路由真值、产品阶段口径仍然分裂
  - 现在不是“做不动”，而是“推进速度已经开始超过治理速度”

### 1.3 当前新增问题

#### 问题一：编排写权限没有真正切到 `flow.*`

- 证据：
  - 权限目录里已经定义了 `flow.view.*`、`flow.edit.*`：`api/crates/access-control/src/catalog.rs`
  - 但 `FlowService::save_draft`、`restore_version` 只先调用 `ApplicationService::get_application`：`api/crates/control-plane/src/flow.rs`
  - `ApplicationService::get_application` 实际只检查 `application.view.own/all`：`api/crates/control-plane/src/application.rs`
  - 现有测试也只覆盖“看不见应用就不能进 editor”，没有覆盖“可见但不可编辑 flow”应被拒绝：`api/crates/control-plane/src/_tests/flow_service_tests.rs`
- 这意味着什么：
  - 当前“看得见应用”和“能改编排”事实上被混成了一套权限
  - 等 `publish`、协作角色、审核流接进来后，这会直接变成权限口径错误，不只是文档问题

#### 问题二：应用主路径还没有完全切到前端路由真值

- 证据：
  - 创建成功后使用 `window.location.assign(...)`：`web/app/src/features/applications/pages/ApplicationListPage.tsx`
  - 应用卡片入口还是 `<a href=...>`：`web/app/src/features/applications/components/ApplicationCardGrid.tsx`
  - 但壳层和主路由已经是 `TanStack Router`：`web/app/src/app/router.tsx`、`web/app/src/app-shell/AppShellFrame.tsx`
- 这意味着什么：
  - 当前“进入应用”仍会触发整页刷新，而不是留在 SPA 内部切换
  - 查询缓存、局部状态、后续无刷新壳层行为会被不断打断
  - 导航真值层已经建立了一半，但最后一步还没接上

#### 问题三：界面开始出现“假可用”与研发内部术语泄露

- 证据：
  - `AgentFlowOverlay` 暴露了主按钮 `发布配置`，但 `onOpenPublish={() => undefined}` 且 `publishDisabled={false}`：`web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
  - `ApplicationSectionState` 直接在用户界面写 `03 / 04 / 05 / 06B` 和 `planned`：`web/app/src/features/applications/components/ApplicationSectionState.tsx`
  - `ToolsPage` 仍是正式“建设中”页面，但还在一级导航：`web/app/src/features/tools/pages/ToolsPage.tsx`、`web/app/src/routes/route-config.ts`
- 这意味着什么：
  - 用户会看到“可点但没有动作”的发布入口
  - 产品界面把内部模块编号和研发分期直接暴露给用户
  - 这不是单纯文案问题，而是产品可信度开始下降的信号

#### 问题四：P1 文档仍在描述“广口径平台”，代码却已经进入“Application-hosted authoring baseline”

- 证据：
  - 需求文档仍要求：
    - `FR-004 应用概览`
    - `FR-005 应用路由管理`
    - `FR-007 页面结构协议`
    - `FR-008 动态页面渲染`
    - `FR-009 嵌入式前端接入`
    - `FR-030 / FR-031 Flow Run / Node Run`
  - 产品设计仍把 `Publish Endpoint` 和对外发布作为核心交付物：`docs/superpowers/specs/1flowse/2026-04-10-product-design.md`
  - 但当前代码真实可证明的是：
    - 工作台应用列表
    - 应用详情四分区
    - `agentFlow` 编辑器与 Draft/History
  - 且最近 `24` 小时提交完全没有把 `publish-gateway / plugin-runner / runtime / observability` 推出最小真实链路
- 这意味着什么：
  - 现在的问题已经不只是“README 落后”，而是产品阶段口径没有切换
  - 如果继续沿旧口径评估，会把“正在做 editor baseline”误读成“正在做完整发布平台”

#### 问题五：一级导航暴露面仍然大于当前主线成熟度

- 证据：
  - `embedded-apps` 和 `tools` 仍是 `primary` chrome：`web/app/src/routes/route-config.ts`
  - `EmbeddedAppsPage` 当前只是能力边界说明页：`web/app/src/features/embedded-apps/pages/EmbeddedAppsPage.tsx`
  - `ToolsPage` 当前是建设中页：`web/app/src/features/tools/pages/ToolsPage.tsx`
- 这意味着什么：
  - 当前最成熟的用户任务还是 `Application -> agentFlow`
  - 但导航会把用户心智拉向“平台已经很完整”
  - 这会稀释当前主线，也让审计和规划更难聚焦

### 1.4 从短期来看风险和收益

- 短期收益：
  - `Application` 宿主和 `agentFlow` 编辑器已经做成真实可演示路径
  - AI 时代用“日更闭环”看，当前推进速度是快的
- 短期风险：
  - 如果继续只加 editor，`publish/run/logs` 的产品证明会继续落后
  - 如果不先修正 `flow.edit.*` 权限边界，越早让多人进入编排，越容易把错误权限固化进测试和心智
  - 如果继续保留假可用入口与内部术语，用户对产品完成度的判断会被误导

### 1.5 从长期来看软件健康和质量

- 长期正向点：
  - 路由壳层、应用宿主、画布编辑器这些一等对象已经开始稳定
  - 后端依然保持 `route / service / repository / mapper` 的主分层
- 长期风险点：
  - 权限语义继续混用，会让后续 `publish_endpoint.*`、`flow.*`、`application.*` 越来越难拆
  - 路由真值层如果长期半套，会导致 SPA 和整页刷新两种模型共存
  - 产品文档如果一直保持“大平台”口径，会持续把 roadmap、实现顺序和用户期望拉偏

### 1.6 开发进度如何评估

- 不适合继续用旧人力时代“这周做了多少页”的口径评估。
- 在当前 AI 日更模式下，更适合看三件事：
  - 今天有没有把一条路径做成真实闭环
  - 今天有没有让明天少走弯路
  - 今天有没有减少产品真值和代码真值之间的歧义
- 按这个口径看：
  - 主线闭环速度：`快`
  - 产品证明闭环速度：`慢于 editor`
  - 真值同步速度：`偏慢`
  - 开发健康结论：`速度健康，治理亚健康`

### 1.7 产品方向定位是否清晰、是否正确、是否需要调整

- 当前方向本身没有错：
  - `Application` 作为一等宿主
  - `agentFlow` 作为第一条 authoring 主线
  - `publish-first` 作为最终产品目标
- 但当前阶段描述需要调整：
  - 现在更准确的阶段口径不是“完整发布优先平台已进入实现”
  - 而是“Application-hosted agentFlow authoring baseline 已建立，下一步需要补最小 publish/run proof”
- 这不是改方向，而是改阶段表达。

## 2. 可能方向

### 方向 A：继续 editor-first

- 继续加节点、面板、发布配置 UI、更多交互与编辑能力

### 方向 B：truth-first

- 先收口权限真值、路由真值、界面文案和模块/需求状态口径

### 方向 C：proof-first

- 暂停大幅扩 editor，优先补最小 `publish / run / logs` 真实链路

## 3. 不同方向的风险和收益

### 方向 A：继续 editor-first

- 收益：
  - 最快看到更多“能演示”的界面与交互
  - 对当前 `03/04` 动量最友好
- 风险：
  - `flow.edit.*` 权限错误会先被沉淀成现状
  - 发布、运行、日志仍没有最小证明，产品定位会越来越偏成“编辑器产品”
  - 假可用按钮和一级导航暴露面会继续放大误判

### 方向 B：truth-first

- 收益：
  - 先把“谁能看、谁能改、怎么跳、怎么描述当前阶段”统一掉
  - 会显著降低后续 AI 协作、QA 审计和文档判断成本
- 风险：
  - 短期看起来像“没有增加很多新功能”
  - 如果只做治理、不补产品证明，用户仍可能觉得平台还停在 authoring

### 方向 C：proof-first

- 收益：
  - 能最快验证 `publish-first` 方向是不是站得住
  - 可把 `API / logs / monitoring` 从“future hooks”至少拉成一条真实产品链路
- 风险：
  - 如果在权限、导航、文案真值仍混乱时直接补 proof，会把错误基础继续带到新模块
  - 容易出现“做出来能跑，但治理债更深”的情况

## 4. 对此你建议是什么

我的建议不是单选，而是固定顺序：`先 B，再 C，最后再回到 A`。

### 建议一：先补真值，不再继续接受“可见应用就能改 flow”

- 先把 `save_draft / restore_version` 的服务入口从 `application.view.*` 切到 `flow.edit.*`
- 同步补 route / service / test 三处证据，避免继续把错误权限变成事实

### 建议二：把 Application 主路径彻底切到 SPA 路由模型

- 去掉 `window.location.assign`
- 去掉应用卡片里的 `<a href>`
- 统一改成 router navigation，避免主线每次进入都整页刷新

### 建议三：立即收掉假可用入口和内部研发术语

- `发布配置` 还没有动作前，不要给可点击主按钮
- UI 中去掉 `03 / 04 / 05 / 06B / planned`
- 改成用户能理解的正式能力文案，例如“未开放 / 准备中 / 尚未配置”

### 建议四：正式把当前阶段口径改成“authoring baseline + next publish/run proof”

- 同步 `product-requirements`
- 同步 `modules/README.md`
- 同步 `03/04` 模块 README
- 目标不是删掉长期愿景，而是把“当前阶段”和“长期 P1 广口径”拆开

### 建议五：下一条真实产品证明不要再是 editor 细节，而是最小发布链路

- 推荐最小证明顺序：
  - 应用级 API Key 只读/创建基线
  - 最小对外调用契约页
  - 最小 `Application Run List`
  - `publish-gateway` 真实接口边界
- 这样既不需要一次做完整 `06B/05`，也能让“发布优先”重新有证据

## 受限项

- 当前工作树存在未提交修改：`web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- 本轮已查看差异，只是 `min-height` 改为 CSS 变量；不影响上述核心结论，但说明前端 UI 高度策略仍在变化中
