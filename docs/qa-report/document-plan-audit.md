# 文档计划审计优化报告

更新时间：`2026-04-16 09:01 CST`

说明：本轮继续沿用 `document-plan-audit` 主题，只补充上一版没有展开或已发生变化的判断。重点不再重复“03/04 已经落地”本身，而是转向审计“状态表达、计划文档角色、editor 内核、门禁可信度、下一阶段产品口径”。

审计输入：

- `git` 时间窗口：最近 `24` 小时
- 最近 `24` 小时提交数：`47`
- 最近 `24` 小时触达文件数：`185`
- 最近 `24` 小时提交结构：
  - `docs`：`14`
  - `feat`：`9`
  - `feat(web)`：`5`
  - `fix(web)`：`4`
  - `feat(api)`：`3`
- 最近 `24` 小时最活跃文件：
  - `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`：`8` 次
  - `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`：`8` 次
  - `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`：`8` 次
  - `docs/superpowers/plans/2026-04-15-agentflow-editor.md`：`8` 次
  - `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`：`7` 次
- 本轮已运行验证：
  - `pnpm --dir web lint`：通过；`node-registry.tsx` 仍有 `4` 条 `react-refresh/only-export-components` warning
  - `pnpm --dir web test`：通过；`30` 个测试文件、`89` 个测试全部通过
  - `pnpm --dir web/app build`：通过；主包 `dist/assets/index-Csuvz6RI.js` 为 `5,192.02 kB`，gzip 后 `1,554.40 kB`
  - `node scripts/node/verify-backend.js`：失败；卡在 `rustfmt --check`
  - `cargo test -p control-plane flow_service_tests`：通过；`2` 个测试
  - `cargo test -p api-server application_orchestration_routes`：通过；`1` 个测试
  - `cargo test -p storage-pg flow_repository_tests`：通过；`3` 个测试
- 本轮未覆盖项：
  - `node scripts/node/check-style-boundary.js page page.application-detail` 未跑通；`dev-up ensure` 因 `vite` 监听 `3100` 端口命中 `listen EPERM` 而失败，运行时 UI 质量结论仍是受限结论
- 当前工作树：
  - 干净，无未提交改动

## 1. 现状

### 1.1 现在开发情况和状态

- 当前真实代码状态已经不是“03/04 待开发”，而是：
  - `03 Application 宿主基线已落地`
  - `04 agentFlow authoring baseline 已落地`
  - `05/06B` 仍未形成最小产品价值闭环
- 这轮速度本身不慢。按 AI 日更节奏看，最近 `24` 小时已经完成的是“真实垂直切片推进”，不是“文档空转”：
  - `Application` 列表、创建、详情四分区已在前后端落地
  - `agentFlow` 已有默认 Draft、保存、历史、恢复、容器子画布、Inspector、节点增删改交互
  - 前端与后端定向测试都能证明主路径成立
- 当前不是“没做出来”，而是“做出来了，但阶段表达和治理口径没有同步收口”

### 1.2 本轮新增或升级的问题

#### 问题一：模块状态真值层已经不是轻微落后，而是多层文档互相打架

- 证据：
  - `docs/superpowers/specs/1flowse/modules/README.md:48-52` 仍把：
    - `03` 写成 `已确认待开发`
    - `04` 写成 `未来设计`
    - `05` 写成 `未来设计`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md:24-31` 仍写：
    - 当前首页还不是应用列表页
    - 当前前后端还没有 `Application` 列表、创建、详情和四分区路由
  - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md:1-9` 又写成：
    - `状态：已完成`
  - `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md:1-9` 又写成：
    - `状态：已确认`
- 这说明状态字段现在同时在表达三件不同的事：
  - 设计是否定稿
  - 代码是否已实现
  - 能力是否已经验证
- 为什么是问题：
  - 不是简单“文档慢半拍”，而是“一个状态词承载了三类事实”
  - 结果是用户、AI、计划文档和模块 README 都可能从不同文件读出相反结论
  - 在 AI 日更阶段，这会比代码 bug 更早干扰优先级判断

#### 问题二：计划文档已经从“执行入口”膨胀成“执行入口 + 日志 + QA 记录 + 设计补丁”

- 证据：
  - `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`：`2335` 行
  - `docs/superpowers/plans/2026-04-15-agentflow-editor.md`：`2188` 行
  - 最近 `24` 小时两份主 plan 都被改了 `8` 次
  - `docs/qa-report/document-plan-audit.md` 和 `docs/userDocs/todolist/document-plan-audit.md` 也都被改了 `6` 次
  - `docs/superpowers/plans/history`：`22` 个文件
  - `docs/superpowers/specs/history`：`20` 个文件
- 为什么是问题：
  - 按仓库本地规则，单文件不应超过 `1500` 行；现在两份计划文档都明显超出
  - 更关键的是，plan 已不再只是“怎么做”，而是在承接：
    - 执行勾选
    - 实现流水
    - 验证结论
    - 历次修补说明
  - 这会让 AI 下一轮更难快速抓到“当前该做什么”，也让用户更难看出“本轮新增了什么”

#### 问题三：`agentFlow` 已经可用，但 editor 内核仍然是第一版壳层式实现，和今天已确认的重构方向还存在执行差

- 证据：
  - `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx:61-145`
    - 同时持有 `editorState`、`document`、保存快照、viewport、selection、issues/history drawer、restore、autosave 接入等职责
  - `web/app/src/features/agent-flow/components/nodes/node-registry.tsx:44-52`
    - 仍通过 `window.dispatchEvent('agent-flow-insert-node')` 做交互桥
  - `web/app/src/features/agent-flow/hooks/useEditorAutosave.ts:28-30`
    - 每次 render 都用 `JSON.stringify(document)` 和 `JSON.stringify(lastSavedDocument)` 做整文档差异判断
  - 新设计稿 `docs/superpowers/specs/1flowse/2026-04-16-agentflow-editor-store-centered-restructure-design.md`
    - 已经明确指出当前 `Shell / Canvas / Inspector / node-registry` 的边界分散问题
- 为什么是问题：
  - 当前主路径能跑，但内核并没有跟上今天已经确认的 store-centered 方向
  - 现在继续加节点、边中插入、批量命令、容器编辑，成本不会线性增长，而会先被这些边界债放大
  - `JSON.stringify` 全量快照在第一版还扛得住，但当节点数、历史和 binding 增长后，会先变成性能税，再变成定位问题

#### 问题四：统一门禁的可信度仍然碎裂，功能结论大于交付结论

- 证据：
  - 前端 `lint/test/build` 全绿
  - 后端三条定向测试全绿
  - 但官方后端入口 `node scripts/node/verify-backend.js` 仍红，失败原因是 `rustfmt --check`
  - 运行时样式门禁理论上已经有 `page.application-detail` 场景，但这轮实际执行失败：
    - `node scripts/node/check-style-boundary.js page page.application-detail`
    - `dev-up ensure` 超时
    - `tmp/logs/web.log` 记录了 `listen EPERM: operation not permitted 127.0.0.1:3100/0.0.0.0:3100`
- 为什么是问题：
  - 现在可以说“功能行为大体成立”
  - 但还不能说“官方门禁可信、运行时 UI 已被正式验过”
  - 如果继续接受“局部测试绿、官方入口红、运行时样式未验证”为常态，后续收尾标准会越来越依赖人工解释

#### 问题五：产品方向没有错，但阶段表述仍然跑得比真实价值闭环更快

- 证据：
  - 当前实现重心仍在：
    - `Application` 宿主
    - `agentFlow` authoring
    - Draft / History / Restore
  - `05` 运行时和 `06B` 发布网关仍未形成最小用户价值证明
  - 但外层产品口径仍容易被读成“P1 平台闭环即将完成”
- 为什么是问题：
  - 当前项目真正进入的是“Application-hosted authoring baseline stabilization”
  - 还不能用“P1 平台闭环收尾”来描述
  - 如果阶段语言不收口，会让团队高估离可交付外部价值还有多近

#### 问题六：长期技术健康开始出现两类可量化压力，之前更多是感觉，现在已经有硬指标

- 证据：
  - 前端生产构建主包 `index-Csuvz6RI.js` 已达 `5,192.02 kB`
  - `vite build` 直接给出 `Some chunks are larger than 500 kB after minification`
  - `api/crates/control-plane/src` 当前已有 `16` 个文件，已经轻微超过本地目录 `15` 个文件规则
- 为什么是问题：
  - 这不是立即阻塞当前迭代，但说明“03/04 的实现成功”正在快速积累下一轮性能债和目录治理债
  - AI 日更会把这些债滚得比过去人工周更更快，因为实现速度已经先于结构治理速度

### 1.3 对当前开发健康来说是好还是差

- 如果只看推进速度：`好`
  - 最近 `24` 小时不是空谈，而是连续打通 `03` 和 `04` 的可验证垂直切片
  - 工作树当前干净，说明收尾纪律比上一轮更稳
- 如果看治理与表达：`中等偏弱`
  - 状态真值层失真
  - 计划文档过重
  - editor 架构边界未收口
  - 官方门禁与运行时 UI 证据未统一
- 更准确的判断是：
  - `实现速度：好`
  - `治理健康：中`
  - `阶段表达：差`
  - `产品方向：对`

### 1.4 从短期来看风险和收益

- 短期收益：
  - 已经拿到了真实主路径，不再是概念设计：
    - `工作台应用列表 -> 应用详情 -> orchestration -> Draft -> 保存 / 历史 / 恢复`
  - 前端主路径和后端定向接口都有自动化证明
  - 这意味着下一步不需要再证明“能不能做”，只需要决定“先收治理还是先补价值”
- 短期风险：
  - 如果不先修状态真值层，后续任何优先级讨论都会继续失真
  - 如果不先收口 editor 内核，再加节点或交互会把壳层式实现继续放大
  - 如果不先把官方门禁拉回可信，当前通过结论就无法沉淀成稳定交付标准

### 1.5 从长期来看软件健康和质量

- 长期正向点：
  - 前端和后端都已经进入“先实现、再验证”的稳定节奏
  - 新能力不是裸写页面，而是大多配了对应测试
  - 产品方向仍围绕 `Application -> agentFlow -> runtime/publish` 主线，没有漂掉
- 长期风险点：
  - 文档和计划系统若继续膨胀，会先形成“理解债”和“状态债”
  - editor 若继续在壳层实现上叠功能，会先形成“内核债”
  - 生产主包若继续单入口膨胀，会形成“性能债”
  - 运行时 UI 门禁若长期因环境失效，会形成“视觉 QA 盲区”

### 1.6 开发进度如何评估，不要再用旧人力时代口径

- 当前不建议继续用“模块完成百分比”评估进度
- 在 AI 日更阶段，更适合看五个指标：
  - `已验证垂直切片数量`
  - `官方门禁可信度`
  - `状态同步延迟`
  - `实现架构波动幅度`
  - `距离最小外部价值证明还差几步`
- 按这个口径看当前项目：
  - 已验证垂直切片：`快`
    - 已有 `03 Application host`
    - 已有 `04 agentFlow authoring baseline`
  - 官方门禁可信度：`中`
    - 前端高，后端官方入口低，运行时 UI 低
  - 状态同步延迟：`高`
    - README、模块总览、计划文档和代码事实不同步
  - 实现架构波动幅度：`高`
    - `agentFlow` 已经进入 store-centered 重构前夜
  - 最小外部价值证明距离：`仍有明显距离`
    - `05/06B` 还没给出最小可交付证明
- 所以当前进度不该被评价为“慢”，而应该被评价为：
  - `推进很快`
  - `阶段尚未稳定`

### 1.7 产品方向定位是否清晰，是否正确，是否需要调整

- 当前产品大方向仍然正确：
  - `Application` 作为一等宿主
  - `agentFlow` 作为第一条 authoring 主线
  - `runtime / publish` 作为后续闭环
- 需要调整的不是方向，而是阶段口径：
  - 北极星目标继续保留：
    - `可发布、可调用、可观测的 AI 应用平台`
  - 当前阶段建议改口径为：
    - `先稳定 Application-hosted authoring baseline`
    - `再补 05/06B 的最小价值证明`
- 如果不改口径，会持续产生两个误判：
  - 外部看起来像“平台已经快闭环”
  - 内部实际上还处在 editor 内核和文档真值层收口阶段

## 2. 可能方向

### 方向 A：先重建状态真值层

- 把模块状态拆成至少三列：
  - `设计状态`
  - `实现状态`
  - `验证状态`
- 统一回写：
  - `modules/README`
  - `03/04/05/06B README`
  - 当前 PRD 阶段描述

### 方向 B：先给计划文档减重并重新分工

- 把超长 plan 拆成：
  - `正式计划`
  - `执行日志`
  - `QA delta / 滚动结论`
- 让 plan 回到“执行入口”，不要继续承担所有历史记录

### 方向 C：先完成 `agentFlow` store-centered 第一阶段重构

- 先收口：
  - `editor store`
  - `document transforms`
  - `interaction hooks`
- 优先拿掉：
  - `window.dispatchEvent` 交互桥
  - `Shell` 中过重的编辑器职责
  - autosave 的整文档快照 diff

### 方向 D：先把统一门禁拉回同一真相层

- 修复 `verify-backend.js`
- 给 `style-boundary` 一条在当前环境可重复执行的正式路径
- 让“功能通过”和“官方门禁通过”重新回到同一收尾标准

### 方向 E：开始补最小 `05/06B` 价值证明

- 不先做完整 runtime/publish
- 只补最小证明：
  - `Application API Key` 壳层
  - `Run List / Run Detail` 骨架
  - `Publish Endpoint` 最小对象或入口

### 方向 F：开始前端包体与目录治理

- 优先梳理路由级 code splitting
- 控制 `web/app` 单入口继续膨胀
- 开始清理已接近或超过本地规则的目录

## 3. 不同方向的风险和收益

### 方向 A：先重建状态真值层

- 收益：
  - 后续关于“做到哪、该先修什么、现在算不算通过”的讨论会回到同一事实层
  - AI 后续检索噪声会明显下降
- 风险：
  - 短期不会新增用户可见能力

### 方向 B：先给计划文档减重并重新分工

- 收益：
  - 计划文档会重新变回高可执行入口
  - 用户能更快看到“这轮新变化”而不是重新读超长文档
- 风险：
  - 需要一次性做文档拆分和迁移整理

### 方向 C：先做 store-centered 重构

- 收益：
  - 把 `04` 从“可用第一版”升级成“可持续扩展第一版”
  - 后续加节点、加交互、加容器能力的成本会明显下降
- 风险：
  - 短期主要是结构收益，不一定立刻新增明显功能

### 方向 D：先修统一门禁

- 收益：
  - 收尾标准重新清楚
  - QA 结论不再依赖人工口头解释
- 风险：
  - 这是治理投入，不会直接带来新功能截图

### 方向 E：先补最小 `05/06B` 价值证明

- 收益：
  - 最快证明项目没有偏成“只做编辑器”
  - 能更早验证平台方向的对外交付价值
- 风险：
  - 如果 A/B/C 不先做，旧的状态失真、门禁分裂和 editor 边界债会被带入新模块

### 方向 F：先做包体和目录治理

- 收益：
  - 更早控制性能债和结构债
  - 防止后续 `05/06B` 继续把单入口包体推高
- 风险：
  - 对当前最紧迫的产品判断帮助有限，优先级应低于 A/B/C/D/E

## 4. 对此你建议是什么？

建议顺序：`先 A + B，再 C，再 D，再 E，最后再做 F`

### 我建议现在先做

1. 重写模块状态语义
   - 把 `03/04/05/06B` 从单一“状态词”拆成 `设计 / 实现 / 验证`
   - 同步回写 `modules/README` 与对应模块 README
2. 给超长 plan 减重
   - 两份主 plan 不再继续当执行日志滚动追加
   - 正式把 `plan / execution-log / qa-report` 三者分开
3. 直接执行 `agentFlow` store-centered 第一阶段重构
   - 先把 `store / transforms / hooks` 立住
   - 先去掉全局事件桥和整文档快照 diff
4. 修复统一门禁
   - 让 `verify-backend.js` 回绿
   - 明确 `style-boundary` 在当前环境的可执行路径

### 我建议随后做

1. 用最小 `05/06B` 证明项目价值闭环方向没有跑偏
   - `API Key` 壳层
   - `Run List / Run Detail` 骨架
   - `Publish Endpoint` 最小对象
2. 再开始做包体和目录治理
   - 按路由和大功能做 code splitting
   - 收纳过重目录

### 当前不建议优先做

1. 继续用单一状态词同时表达设计、实现和验证
2. 继续让两份 `2000+` 行的 plan 承担执行日志与 QA 记录
3. 继续只追 editor 新功能，而不先收口 editor 内核
4. 接受“局部测试绿、官方门禁红、运行时 UI 未验”作为默认收尾
5. 继续用旧人力时代的“完成百分比”评价当前进度
