# 文档计划审计优化报告

更新时间：`2026-04-16 10:06 CST`

说明：本轮继续沿用 `document-plan-audit` 主题，但尽量不重复上一版已经展开过的三类结论：`03/04` 已经落地、主 plan 过重、`agentFlow` editor 仍是第一版壳层式实现。本轮重点补充新的判断：产品北极星和当前交付基线没有分层、最近 24 小时执行重心已经明显偏向 editor、前端已经进入性能治理区、小时级审计刷新本身开始制造噪声。

审计输入：

- `git` 时间窗口：最近 `24` 小时
- 最近 `24` 小时提交数：`47`
- 其中 `docs: refresh/update document plan audit`：`6` 次
- 最近 `24` 小时命中 `agent-flow`/相关 plan/spec 的文件触达：`101`
- 最近 `24` 小时命中 `05/06B/runtime/publish` 相关文件触达：`1`
- 重点记忆：
  - `.memory/project-memory/2026-04-15-module-02-access-control-status-evaluated.md`
  - `.memory/project-memory/2026-04-15-module-03-application-shell-plan-stage.md`
  - `.memory/project-memory/2026-04-15-module-04-editor-first-pass-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
  - `.memory/project-memory/2026-04-13-backend-governance-phase-two-direction.md`
- 重点文档：
  - `docs/superpowers/specs/1flowse/2026-04-10-product-design.md`
  - `docs/superpowers/specs/1flowse/2026-04-10-product-requirements.md`
  - `docs/superpowers/specs/1flowse/modules/README.md`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
  - `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`
  - `docs/superpowers/specs/1flowse/modules/06b-publish-gateway/README.md`
  - `docs/superpowers/specs/1flowse/2026-04-16-agentflow-editor-store-centered-restructure-design.md`
  - `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`
  - `docs/superpowers/plans/2026-04-15-agentflow-editor.md`
- 本轮已运行验证：
  - `pnpm --dir web lint`：通过；`web/app/src/features/agent-flow/components/nodes/node-registry.tsx` 仍有 `4` 条 `react-refresh/only-export-components` warning
  - `pnpm --dir web test`：通过；`30` 个测试文件、`89` 个测试
  - `pnpm --dir web/app build`：通过；主包 `dist/assets/index-Csuvz6RI.js` 为 `5,192.02 kB`，gzip 后 `1,554.40 kB`
  - `node scripts/node/verify-backend.js`：失败；停止在 `cargo fmt --all --check`
  - `cargo test -p api-server application_orchestration_routes`：通过；`1` 个测试
  - `cargo test -p storage-pg flow_repository_tests`：通过；`3` 个测试
- 本轮未覆盖项：
  - 未跑真实浏览器 `style-boundary` 运行时场景，当前 UI 质量仍然缺少浏览器级证据
  - 未补移动端真机/浏览器回归
  - `verify-backend.js` 因 `rustfmt --check` 直接停止，后续 `clippy/test/check` 没有从官方入口完整走完

## 1. 现状

### 1.1 现在开发情况和状态

- 当前真实代码状态已经进入：
  - `03 Application 宿主基线已落地`
  - `04 agentFlow authoring baseline 已落地`
  - `05/06B` 仍处于“未来能力挂点已冻结，但没有最小交付证明”
- 这轮开发不是空转。当前仓库已经同时满足：
  - 工作台应用列表、创建和详情四分区已在前后端落地
  - `agentFlow` 已有默认 Draft、保存、恢复、历史、容器子画布和 Inspector
  - 前端正式门禁全绿
  - 后端至少两条主线定向测试全绿
- 但“官方可交付门禁”依然不成立：
  - `verify-backend.js` 仍然红
  - 浏览器级 UI 门禁这轮没有新证据

### 1.2 本轮新增或升级的问题

#### 问题一：产品北极星和当前交付基线没有分层，文档真值已经不是“慢半拍”，而是“层次错位”

- 证据：
  - `docs/superpowers/specs/1flowse/2026-04-10-product-design.md:28` 仍把 `标准 Agent 兼容发布` 定为主目标
  - 同文件 `:37` 明确写 `发布优先`
  - 同文件 `:55-56` 继续把“Flow 发布成标准 Agent API、外部客户端稳定调用”当成 P1 闭环的一部分
  - `docs/superpowers/specs/1flowse/modules/README.md:48-52` 仍把：
    - `03` 写成 `已确认待开发`
    - `04` 写成 `未来设计`
    - `05/06B` 写成未来专题
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md:27-28` 还保留“当前首页仍是空态、当前前后端还没有 Application 列表/详情”的旧事实
  - 但真实代码已经在 `web/app/src/features/applications` 和 `web/app/src/features/agent-flow` 落地，并被前端测试覆盖
- 为什么是问题：
  - 当前产品文档同时在表达两种不同东西：
    - 北极星目标
    - 当前可交付基线
  - 当这两层不拆开时，所有“进度、优先级、算不算完成”的讨论都会混线
  - 在 AI 日更节奏下，这种错位比传统“文档落后”更危险，因为代码推进速度已经快到一天能改写一个阶段

#### 问题二：最近 24 小时的执行重心已经明显偏向 editor-first，而不是文档里声明的 publish-first

- 证据：
  - 最近 `24` 小时命中 `agent-flow`/相关 plan/spec 的文件触达为 `101`
  - 同窗口命中 `05/06B/runtime/publish` 相关文件触达只有 `1`
  - `web/app/src/features/applications/components/ApplicationSectionState.tsx:92` 仍明确写 `06B 再落地`
  - 同文件 `:110-111` 仍明确写 `05 会把 Application Run / Node Run / Event Trace 接进这里`
  - 同文件 `:148` 仍明确写监控图表和配置留到后续专题
- 为什么是问题：
  - 当前项目的产品身份是“以发布为优先的 AI 工作流平台”，不是“一个持续加细节的 editor”
  - 现在的实现节奏已经先把编排面打厚，但还没有补一条真正的外部价值证明
  - 如果再连续几轮只做 editor 细节，项目对外会越来越像“流程编辑器”，而不是“可发布、可调用、可观测的平台”

#### 问题三：前端已经进入性能治理阶段，但工程结构还停留在全量 eager load

- 证据：
  - `pnpm --dir web/app build` 输出主包 `index-Csuvz6RI.js = 5,192.02 kB`
  - Vite 明确给出 `Some chunks are larger than 500 kB after minification`
  - `web/app/src/app/router.tsx:13-21` 直接静态导入 `SignInPage`、`ApplicationDetailPage`、`HomePage`、`SettingsPage` 等页面
  - `web/app/vite.config.ts:11` 只有 `plugins: [react()]`
  - 同文件没有 `manualChunks`
  - 全仓只在测试里出现 `import(...)`，活跃业务路由没有真正的路由级懒加载
- 为什么是问题：
  - 现在不是“将来可能有性能问题”，而是构建产物已经在发警告
  - 这类问题在 AI 日更环境下会比过去积累得更快，因为每次新增页面和 editor 能力都会继续塞进同一个主包
  - 一旦后续把 `05/06B` 也直接堆进当前壳层，性能债会和结构债一起放大

#### 问题四：小时级审计刷新本身开始制造噪声，审计文档正在从“辅助决策”变成“高频重写对象”

- 证据：
  - 最近 `24` 小时 `47` 次提交里，`6` 次直接是 `docs: refresh/update document plan audit`
  - `docs/qa-report/document-plan-audit.md` 与 `docs/userDocs/todolist/document-plan-audit.md` 在最近 `24` 小时共被命中 `14` 次
  - 两份主计划文档仍分别为 `2335` 行和 `2188` 行
  - `docs/superpowers/plans/history` 当前已有 `22` 个文件
  - `docs/superpowers/specs/history` 当前已有 `20` 个文件
- 为什么是问题：
  - 当前审计链路已经不是“写一次结论供决策”，而是在小时级节奏里反复重写同一主题
  - 结果不是信息变多，而是新增事实被同主题大文本不断覆盖
  - 对用户和 AI 来说，真正有价值的是 `delta`，不是每次重写整份历史

#### 问题五：官方门禁和功能真值仍然不在同一层，当前还不能把“功能可用”直接等同于“可交付”

- 证据：
  - 前端 `lint/test/build` 全绿
  - 后端两条定向测试全绿
  - 但 `node scripts/node/verify-backend.js` 停在 `cargo fmt --all --check`
  - `scripts/node/verify-backend.js:27` 采用串行 `spawnSync` 跑 `fmt -> clippy -> test -> check`
- 为什么是问题：
  - 当前结论只能是：
    - “主线功能行为大体成立”
    - 不能说“官方后端交付门禁已成立”
  - 只要团队继续接受“局部测试绿、官方入口红”的状态，之后每次收尾都会更依赖人工解释

### 1.3 对当前开发健康来说是好还是差

- 如果只看推进速度：`好`
  - 最近 `24` 小时不是停在 spec，而是持续形成真实垂直切片
  - `03` 和 `04` 已经能被代码和自动化证明
- 如果看产品与治理健康：`中等偏弱`
  - 产品北极星和当前交付基线没有拆开
  - 发布优先主线被 editor-first 执行稀释
  - 前端性能债已经进入显性区
  - 审计和计划文档开始进入高频重写状态
  - 官方门禁仍然不能代表当前分支可交付
- 更准确的判断是：
  - `实现速度：好`
  - `阶段治理：中`
  - `产品真值层：差`
  - `长期结构健康：开始转弱`

### 1.4 从短期来看风险和收益

- 短期收益：
  - 已经拿到了两条重要的已验证切片：
    - `Application host`
    - `agentFlow authoring baseline`
  - 这意味着项目不再停留在概念设计，下一步可以真正讨论“先收治理还是先补对外价值”
- 短期风险：
  - 如果继续只做 editor 细节，项目会偏离 `publish-first` 定位
  - 如果不把产品真值层拆清楚，任何“做到哪、先做什么”的讨论仍然会继续误判
  - 如果官方门禁不拉回绿色，当前通过结论无法沉淀成稳定完成标准

### 1.5 从长期来看软件健康和质量

- 长期正向点：
  - 当前团队已经形成“先实现、再验证”的高频推进方式
  - 新能力通常不是裸写，而是会同步补测试
  - 后端和前端都有明确的边界约束，不是彻底失控的堆功能状态
- 长期风险点：
  - `产品真值债`：北极星和当前基线不分层
  - `交付真值债`：官方门禁和真实功能结果分裂
  - `性能债`：主包已到 `5.19 MB`
  - `结构债`：
    - `api/crates/control-plane/src` 已有 `16` 个顶层文件
    - `web/app/src/features/agent-flow/components` 已到 `15` 个文件，已经踩到目录阈值
  - `文档债`：高频 audit refresh 稀释新增结论

### 1.6 开发进度如何评估，不要再用旧人力时代口径

- 当前不建议再用“模块百分比”或“文档完成度”评估进度
- 在 AI 日更时代，更适合看五个指标：
  - `已验证垂直切片数量`
  - `与产品主目标的对齐度`
  - `官方门禁可信度`
  - `状态同步延迟`
  - `离最小外部价值证明还差多少`
- 按这个口径看当前项目：
  - 已验证垂直切片：`快`
    - `03 Application host`
    - `04 editor baseline`
  - 与产品主目标对齐度：`下降`
    - 北极星是发布优先，但最近执行显著偏向 editor
  - 官方门禁可信度：`中低`
    - 前端高，后端官方入口低，浏览器级 UI 证据缺口仍在
  - 状态同步延迟：`高`
    - 模块 README、PRD、当前代码事实仍然错位
  - 最小外部价值证明距离：`仍有明显距离`
    - 还没有 `05/06B` 的最小闭环
- 所以当前进度不该被评价为“慢”，而应该被评价为：
  - `推进很快`
  - `对外交付主线还没有被重新拉正`

### 1.7 项目设计与产品方向定位是否清晰、是否正确、是否需要调整

- 北极星方向本身仍然正确：
  - `Application` 作为交付容器
  - `agentFlow` 作为第一条 authoring 主线
  - `runtime / publish` 作为真正把产品变成平台能力的闭环
- 需要调整的不是北极星，而是“当前阶段的命名和执行顺序”：
  - 现在不应继续把当前阶段描述成“P1 平台闭环推进中”
  - 更准确的说法应该是：
    - `当前处于 Application-hosted authoring baseline 已验证`
    - `下一阶段必须补 publish/runtime 最小价值证明`
- 如果不做这个调整，会持续产生两个误判：
  - 外部误以为项目已经接近平台闭环
  - 内部实际上还停留在 authoring 与治理收口阶段

## 2. 可能方向

### 方向 A：重写“北极星产品文档”和“当前交付基线”两层真值

- 保留 `2026-04-10-product-design.md` 作为北极星
- 单独补一份当前基线文档，明确当前只交付到：
  - `03 Application host`
  - `04 authoring baseline`
  - `05/06B` 仅有挂点，没有闭环
- 同步回写：
  - `modules/README`
  - `03/04/05/06B README`
  - 审计文档中的状态语义

### 方向 B：主线纠偏，下一条功能切片不再做 editor 细节，而是补一条最小 `05/06B` 价值证明

- 候选最小切片：
  - `Application API Key + invoke skeleton`
  - `Run List / Run Detail` 最小闭环
  - `Publish Endpoint` 最小对象和一次调用路径证明

### 方向 C：先把官方门禁和审计节奏拉回可信

- 让 `verify-backend.js` 回绿
- 为真实浏览器 UI 回归定义一条稳定执行路径
- 把小时级 audit 改成 `delta-only` 模式，只记录新增证据和新增判断

### 方向 D：补第一轮前端性能治理

- 路由级懒加载
- `manualChunks` 或等价 chunk 策略
- editor 和设置区等重模块切分

### 方向 E：执行 `agentFlow` store-centered 第一阶段重构

- 把 `store / transforms / interaction hooks / adapters` 先收口
- 冻结继续往当前 shell-centric 实现上堆新交互

## 3. 不同方向的风险和收益

### 方向 A：重写双层真值

- 收益：
  - 以后讨论“现在做到哪”和“最终要去哪”时不再混线
  - 用户和 AI 都更容易在同一事实层上做优先级判断
- 风险：
  - 短期看不到新截图或新功能
  - 需要一次性回写多份文档

### 方向 B：主线纠偏，补最小 `05/06B`

- 收益：
  - 最快把项目重新拉回 `publish-first` 身份
  - 可以用真实交付证明抵消“越来越像 editor”的外部观感
- 风险：
  - 当前 editor 内核还未完全收口，过早加深联动可能把旧结构债带进新模块

### 方向 C：修门禁和审计节奏

- 收益：
  - 完成标准重新可信
  - 审计文档重新变回“决策输入”，而不是高频重写对象
- 风险：
  - 主要是治理收益，短期没有直接新功能

### 方向 D：前端性能治理

- 收益：
  - 趁 `05/06B` 还没继续堆进来之前，先控制主包体积和首屏压力
  - 为后续模块留出更健康的前端扩展空间
- 风险：
  - 如果先做过深，会打断主线对外价值推进

### 方向 E：store-centered 重构

- 收益：
  - 把 `04` 从“能跑”提升为“能持续扩展”
  - 能为后续 `connect / publish / run trace` 等交互提供更稳的内核
- 风险：
  - 如果在没有先做主线纠偏的情况下独立推进，项目仍会继续停留在 authoring 视角

## 4. 对此你建议是什么？

建议顺序：`先 A + C，再 B，再 E，最后 D`

### 我建议现在先做

1. 把“北极星产品文档”和“当前交付基线”正式拆开。
2. 同步回写 `modules/README` 与 `03/04/05/06B README`，停止让旧状态继续误导决策。
3. 让 `verify-backend.js` 回绿，并把小时级 audit 改成 `delta-only`。

### 我建议紧接着做

1. 下一条新功能切片不要再是 editor 细节。
2. 直接补一条最小 `05/06B` 价值证明，把项目重新拉回 `publish-first` 主线。

### 我建议随后做

1. 在停止新增 editor 细节的前提下，执行 `agentFlow` store-centered 第一阶段重构。
2. 之后再做前端路由级切分和 chunk 治理。

### 当前不建议优先做

1. 继续刷新同一份大审计报告而不做 delta 收口。
2. 继续把更多 editor 功能叠到当前 shell-centric 结构上。
3. 继续把 `P1` 北极星文档直接当成“当前交付现状”使用。

## 附：受限结论

- 当前“前端功能可用”的结论有正式门禁和自动化支撑。
- 当前“后端主线功能存在”的结论有定向测试支撑，但没有完整官方统一验证支撑。
- 当前“浏览器级 UI 质量通过”的结论仍不能下，因为缺少真实浏览器回归证据。
