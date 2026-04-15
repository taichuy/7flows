# 文档计划审计优化报告

更新时间：`2026-04-16 07:07 CST`

说明：本轮继续沿用同主题滚动更新，只补上一轮没有展开的新角度，不重复前几轮已经明确的旧问题。此前关于“顶层真值漂移”“产品阶段表达失真”“前端装载边界偏重”的结论仍然有效，本轮重点转到：`进度衡量是否失真`、`文档治理是否反向拖慢开发`、`统一门禁是否可信`、`当前工作树是否已经稳定`。

审计输入：

- `git` 时间窗口：`2026-04-15 07:07 CST` 到 `2026-04-16 07:07 CST`
- 最近 `24` 小时提交数：`46`
- 最近 `24` 小时触达文件数：`192`
- 最近 `24` 小时提交结构：
  - `docs`：`12`
  - `feat`：`9`
  - `feat(web)`：`5`
  - `fix(web)`：`5`
  - `feat(api)`：`3`
- 最近 `24` 小时最活跃文件：
  - `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`：`8` 次
  - `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`：`8` 次
  - `docs/superpowers/plans/2026-04-15-agentflow-editor.md`：`8` 次
  - `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`：`7` 次
  - `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`：`7` 次
- 本轮已运行验证：
  - `pnpm --dir web lint`：通过，但 `web/app/src/features/agent-flow/components/nodes/node-registry.tsx` 仍有 `4` 条 `react-refresh/only-export-components` warning
  - `pnpm --dir web test`：通过，`30` 个测试文件、`89` 个测试
  - `pnpm --dir web/app build`：通过，但主包 `dist/assets/index-Csuvz6RI.js` 仍为 `5,192.02 kB`，gzip 后 `1,554.40 kB`
  - `node scripts/node/verify-backend.js`：失败，直接停在 `rustfmt --check`
  - `cargo test -p control-plane flow_service_tests`：通过，`2` 个测试
  - `cargo test -p api-server application_orchestration_routes`：通过，`1` 个测试
  - `cargo test -p storage-pg flow_repository_tests`：通过，`3` 个测试
- 本轮受限项：
  - `node scripts/node/check-style-boundary.js page page.application-detail` 失败，`dev-up` 未能稳定拉起前端；日志显示当前环境对 `0.0.0.0:3100` 存在 `listen EPERM`
  - 当前工作树仍有未提交改动：
    - `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`
    - `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
    - `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
    - `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
    - `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`

## 1. 现状

### 1.1 现在开发情况和状态

- 当前真实代码状态不是“停在方案期”，也不是“P1 已经整体收尾”，而是：
  - `03` Application 宿主基线已经可运行
  - `04` agentFlow editor 第一版已经可运行
  - `05/06B` 仍缺少最小产品闭环
- 最近 `24` 小时的真实主线高度集中在：
  - `Application 宿主`
  - `agentFlow editor`
  - `draft/history/save/restore`
- 这说明项目没有停滞，且实现速度依然很快；问题主要不在“有没有在开发”，而在“状态系统是否还反映真实开发”。

### 1.2 本轮新增或升级的问题

#### 问题一：项目状态文档已经出现“双向失真”，进度衡量口径失效

- 证据：
  - `docs/superpowers/specs/1flowse/modules/README.md` 仍把：
    - `03` 标成 `已确认待开发`
    - `04` 标成 `未来设计`
  - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md` 仍写：
    - “当前前后端还没有 Application 列表、创建、详情和应用内四分区路由”
  - 但当前代码与最近 `24` 小时提交已经明确存在：
    - `web/app/src/features/applications/pages/ApplicationListPage.tsx`
    - `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
    - `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`
    - 对应前后端实现和测试
  - 与此同时，`docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md` 又把 `04` 标成 `已完成`
- 这意味着什么：
  - 当前状态文档不是简单落后，而是同时存在：
    - `低估真实进度`
    - `高估真实完成度`
  - 结果就是同一个项目会被不同文档说成“还没开始”或“已经完成”。
- 为什么是问题：
  - 在 AI 日更节奏里，最危险的不是慢，而是进度衡量口径错。
  - 一旦“模块状态”不能反映真实代码，你很难判断到底该继续补能力、先做治理，还是已经能切下一阶段。

#### 问题二：统一门禁是红的，但局部行为验证是绿的，交付真相被拆成两套

- 证据：
  - `node scripts/node/verify-backend.js` 本轮仍直接失败在 `rustfmt --check`
  - 但同一轮定向后端测试：
    - `control-plane` 通过
    - `api-server` 路由通过
    - `storage-pg` flow repository 通过
  - 前端：
    - `lint` 通过但有 `4` 条 warning
    - `test` 全绿
    - `build` 通过但主包仍然很重
- 这意味着什么：
  - 当前项目不是“完全不稳”，也不是“已经正式过门禁”。
  - 更准确地说是：
    - `局部行为基本成立`
    - `官方统一门禁不成立`
- 为什么是问题：
  - 如果继续默认“定向测试过了就算完成”，后续收尾会越来越依赖人工解释。
  - 如果继续默认“统一门禁一红就等于都不可用”，又会误伤真实进展判断。
  - 现在最需要的是让两套真相重新合一，而不是继续接受这种分裂状态。

#### 问题三：文档治理本身开始形成维护税，审计流正在逼近功能流

- 证据：
  - 最近 `24` 小时 `46` 次提交中，`docs` 类提交有 `12` 次
  - 最近 `24` 小时最活跃文件里，两份 implementation plan 都被改了 `8` 次
  - 目录规则已经在文档侧被打破：
    - `docs/superpowers/plans/history` 当前有 `22` 个文件
    - `docs/superpowers/specs/history` 当前有 `20` 个文件
  - 文件体量规则也已在文档侧被打破：
    - `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`：`2335` 行
    - `docs/superpowers/plans/2026-04-15-agentflow-editor.md`：`2188` 行
- 这意味着什么：
  - 当前问题已经不只是“文档要不要同步”，而是“文档系统本身是否开始成为新的主维护对象”。
  - 审计、计划、回填在帮助协作，但也在吞掉越来越多的变更额度。
- 为什么是问题：
  - 如果计划文档和审计文档比功能代码更频繁地被重写，文档会从“导航层”退化成“维护税”。
  - 到那一步，AI 协作不会更轻，反而会越来越依赖先修文档再判断代码。

#### 问题四：当前 `HEAD` 不是唯一事实，工作树仍是移动目标

- 证据：
  - 当前工作树仍有 `5` 个未提交修改，且都在主线 editor 路径上
  - 这些改动同时覆盖：
    - 交互组件
    - 样式
    - inspector
    - 对应测试
  - 最近日志也显示这些文件在本地持续发生 HMR 更新
- 这意味着什么：
  - 当前项目真实状态不只在 `HEAD`，还叠加了一层本地未提交增量。
  - 对小时级审计来说，这意味着每轮面对的可能不是“一个已收口状态”，而是“一个正在移动的候选状态”。
- 为什么是问题：
  - 如果不把 `HEAD` 和 `dirty delta` 分开看，文档很容易把尚未收口的局部尝试写成当前正式事实。
  - 这会进一步放大前面提到的“状态文档双向失真”。

### 1.3 对当前开发健康来说是好还是差

- 如果只看实现推进：`好`
  - `03/04` 明显进入了可演示、可验证、可持续追加的阶段。
- 如果看交付治理：`中偏差`
  - 官方统一门禁仍然不可信。
  - 样式边界运行证据仍然拿不稳。
  - 文档系统开始过重。
- 更准确的判断是：
  - `实现健康`
  - `验证亚健康`
  - `状态治理偏差`

### 1.4 从短期来看风险和收益

- 短期收益：
  - 现在已经有一条很清晰的演示主路径：
    - `工作台应用列表 -> 应用详情 -> orchestration -> 默认 Draft -> 保存 / 历史 / 恢复`
  - 这条路径不是纯前端假壳层，已经有后端持久化与定向测试支撑。
- 短期风险：
  - 继续用失真的模块状态来判断进度，会直接影响你接下来资源排序。
  - 继续接受“统一门禁红、局部测试绿”的分裂状态，会让收尾标准越来越模糊。
  - 继续让小时级审计面对 dirty worktree，会不断把未收口尝试和正式事实混在一起。

### 1.5 从长期来看软件健康和质量

- 长期正向点：
  - 代码分层没有塌：
    - `route / service / repository / mapper` 仍在
  - 测试目录纪律基本还在：
    - 前端测试都在 `_tests`
    - 后端新增能力也有定向测试
  - 当前代码文件没有出现明显的超大 God file
- 长期风险点：
  - 如果文档系统继续膨胀，未来最重的不是代码债，而是“判断债”。
  - 如果统一门禁长期红着但局部测试长期绿着，团队会越来越习惯靠口头解释判断是否完成。
  - 如果 `HEAD` 和本地 dirty state 不被分层看待，任何进度审计都会越来越不稳定。

### 1.6 开发进度是如何？不要再用旧人力时代评估

- 不建议再用旧人力时代的“这个模块是不是做完了”来评估现在的进度。
- 在当前 AI 日更模式下，更有用的四个指标是：
  - `基线闭环是否更完整`
  - `统一门禁是否更可信`
  - `状态真值是否更同步`
  - `系统性维护成本是否下降`
- 按这个口径看当前进度：
  - 基线闭环：`快`
  - 统一门禁：`弱`
  - 状态真值同步：`弱`
  - 系统性维护成本控制：`偏弱`
- 所以当前不能简单说“进度好”或“进度差”。
  - 更准确地说是：
    - `做得很快`
    - `但项目状态表达和治理收口明显跟不上`

### 1.7 产品方向定位是否清晰，是否正确，是否需要调整

- 当前高层方向本身没有错：
  - `Application` 做宿主
  - `agentFlow` 做第一条 authoring 主线
  - `publish/runtime` 仍是最终闭环
- 但当前阶段口径需要再明确一层：
  - 现在项目真实处于：
    - `Application-hosted authoring baseline`
  - 还不能直接按：
    - `publish-first 的 P1 闭环正在整体收尾`
    来表述
- 所以需要调整的不是总方向，而是阶段表达方式：
  - `北极星目标` 继续保留 `publish-first`
  - `当前阶段目标` 应显式改成：
    - 先把宿主 + editor + 最小 future hooks 稳定下来
    - 再补 `05/06B` 的最小产品证明

## 2. 可能方向

### 方向 A：重建“状态真值层”，把北极星、阶段目标、已验证基线分开写

- 最小动作：
  - 更新 `product requirements`
  - 更新 `modules/README`
  - 更新 `03/04` 模块 README
  - 给计划文档增加更明确的 `verified baseline` 标识

### 方向 B：先恢复统一门禁可信度

- 最小动作：
  - 让 `node scripts/node/verify-backend.js` 回到可绿状态
  - 让 style-boundary 在当前环境下有稳定执行路径
  - 明确区分：
    - `局部行为通过`
    - `官方门禁通过`

### 方向 C：先给文档系统减重

- 最小动作：
  - 拆分超大 implementation plan
  - 归档 history 目录
  - 减少小时级审计对整份大文档的反复重写
  - 增加轻量的状态汇总表，而不是让结论散在多份长文档里

### 方向 D：开始补 `05/06B` 的最小产品证明

- 最小动作：
  - 应用级 API Key
  - 最小 Run List / 只读 Run Detail
  - `publish-gateway` 的真实边界接口

### 方向 E：继续沿 editor 做高频功能日更

- 最小动作：
  - 继续补节点、交互、容器画布、面板能力

## 3. 不同方向的风险和收益

### 方向 A：重建状态真值层

- 收益：
  - 后续所有关于“项目做到哪”“该先做什么”的讨论会回到同一口径
  - 可直接降低 AI 协作的判断成本
- 风险：
  - 短期看起来不像在加功能

### 方向 B：恢复统一门禁可信度

- 收益：
  - 收尾定义会重新变得清晰
  - 可以减少“局部绿 / 整体红”的解释成本
- 风险：
  - 短期投入主要落在格式、脚本和验证路径，不直接增加用户可见能力

### 方向 C：给文档系统减重

- 收益：
  - 审计、计划、规格会重新回到“导航层”而不是“主维护对象”
  - 小时级更新的维护成本会下降
- 风险：
  - 需要先对现有文档组织方式做一次治理，不是零成本

### 方向 D：补 `05/06B` 最小产品证明

- 收益：
  - 可以最快验证项目没有偏成纯 editor 产品
  - 能把 `publish-first` 从口号重新拉回真实路线
- 风险：
  - 如果 A/B/C 不先做，会把旧的状态漂移和门禁失真继续带进新模块

### 方向 E：继续只追 editor 功能

- 收益：
  - 用户可见变化最快
  - demo 丰富度提升最快
- 风险：
  - 会继续放大：
    - 进度口径失真
    - 文档维护税
    - 收尾标准模糊
    - authoring-first 偏航

## 4. 对此你建议是什么？

建议顺序：`先 A+B，同步做一轮；再 C；然后 D；最后才继续 E`。

### 我建议先做的事

1. 把当前项目状态正式改成三层表达：
   - `北极星目标`
   - `当前阶段目标`
   - `已验证代码基线`
2. 回填并改正以下文档的状态口径：
   - `docs/superpowers/specs/1flowse/2026-04-10-product-requirements.md`
   - `docs/superpowers/specs/1flowse/modules/README.md`
   - `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md`
   - `docs/superpowers/specs/1flowse/modules/04-chatflow-studio/README.md`
3. 让 `node scripts/node/verify-backend.js` 恢复为可绿
4. 给 style-boundary 明确一条当前环境下可执行的正式路径
5. 把 dirty worktree 和 `HEAD` 分开记录，不再让未提交尝试直接进入“当前正式状态”

### 我建议随后做的事

1. 拆分超大 implementation plan，压缩 history 目录入口数量
2. 把小时级审计从“大文档反复重写”改成“轻量状态板 + 证据增量”
3. 在状态真值和统一门禁收口后，再补：
   - 应用级 API Key
   - 最小 Run List / Run Detail
   - `publish-gateway` 真实边界

### 当前不建议优先做的事

1. 继续只看提交数来判断进度
2. 继续让模块状态同时出现“还没开始”和“已经完成”两种口径
3. 继续接受“统一门禁红、局部行为绿”是正常收尾状态
4. 继续让小时级审计直接消费 dirty worktree

## 受限项

- 本轮没有拿到新的 style-boundary 成功结果，因为 `dev-up` 在当前环境下拉起前端时仍会命中 `0.0.0.0:3100` 的 `listen EPERM`
- 因此涉及共享壳层和 editor 样式的 UI 质量结论，本轮仍属于：
  - `部分有测试证据`
  - `缺少完整真实运行门禁证据`
- 当前工作树存在未提交主线改动，因此所有“当前状态”判断都应理解为：
  - `HEAD + 本地正在收口的 editor 增量`
