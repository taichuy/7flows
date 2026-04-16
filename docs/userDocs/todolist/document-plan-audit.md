# 文档计划审计待讨论

更新时间：`2026-04-17 00:40 CST`

说明：本轮继续沿用 `document-plan-audit` 主题，但重点不再是“文档太长”。现在更值得讨论的是五个新信号：`文档真值层互相冲突`、`node detail 已经进入修正态`、`官方验证链和真实可用性分裂`、`前端进入性能/开发回路治理区`、`最近 24 小时执行仍然明显 editor-first`。

## 1. 现状

- 最近 `24` 小时共有 `32` 次提交：
  - `docs`: `14`
  - `feat`: `8`
  - `refactor`: `5`
  - `fix`: `4`
  - `test`: `1`
- 改动重心非常集中：
  - `web/` 命中记录 `170`
  - 其中 `web/app/src/features/agent-flow` 命中 `155`
  - `api/` 命中只有 `12`
  - `web/app/src/features/applications` 命中只有 `6`
- 当前真实开发状态：
  - `03 Application shell` 已经是代码事实，不是“待开发”
  - `04 agentFlow authoring baseline` 已经落地，但 UI 结构还在收口
  - `05/06B` 还没有最小外部价值闭环
- 本轮验证结果：
  - `pnpm --dir web lint`：通过，但还有 `1` 条 fast refresh warning
  - `pnpm --dir web test`：通过，`39` 个文件、`118` 个测试
  - `pnpm --dir web/app build`：通过，但主包 `5,254.75 kB`
  - `node scripts/node/verify-backend.js`：失败，停在 `cargo fmt --check`
  - `cargo test -p api-server application_orchestration_routes`：通过
  - `cargo test -p storage-pg flow_repository_tests`：通过
  - `node scripts/node/check-style-boundary.js page page.application-detail`：失败，前端拉起不稳定

### 现在最关键的问题

1. `文档真值层内部冲突`
   - 产品设计仍然强调 `publish-first`
   - 模块总览却还把 `03` 写成待开发、把 `04` 写成未来设计
   - `03 README` 甚至还在写“当前没有 Application 列表/详情/四分区”
2. `node detail` 已经出现“当天实现，当天补修正计划”的回摆
   - 最新计划已经要求改成 `Splitter` 停靠 panel
   - 当前代码仍是绝对定位浮层
   - header 还没收回 `别名/简介` 内联编辑
3. `门禁分裂`
   - 后端官方入口红，但定向测试绿
   - 样式运行时门禁尝试执行后失败，当前没有浏览器级 PASS 证据
4. `前端已进入治理阶段`
   - 主包 `5.25 MB`
   - 路由还是全量静态导入
   - 还有 HMR warning 与 `Tooltip overlayInnerStyle` 弃用警告
5. `执行重心仍然 editor-first`
   - 最近 24 小时几乎都在做 `agent-flow`
   - `05/06B` 没有形成新闭环

### 当前健康判断

- 执行效率：`好`
- 代码结构收敛：`中上`
- 产品真值同步：`差`
- 官方门禁可信度：`中下`
- 对外价值推进：`弱`

### AI 时代下，当前进度怎么评估

- 不能再按“模块完成百分比”看
- 应该看：
  - 已验证垂直切片数量
  - 和北极星的对齐度
  - 官方门禁是否可信
  - 距离最小外部价值证明还差多少
- 按这个口径：
  - `03` 和 `04` 推进很快
  - 但对外主线还没有被拉回 publish/runtime

### 记忆清理建议

- `project-memory` 现在有 `65` 条，`tool-memory` 有 `78` 条，噪声已经开始上升
- 建议先合并：
  - `03` 的 `plan-stage / future-hooks` 两条记忆，改成一条 `module-03-current-state`
  - 最近 `04` 的多条同主题记忆，改成一条 `module-04-current-state`
  - `vite 3100 端口` 与 `style-boundary dev-up` 的相邻工具记忆，改成两条更稳定的前置条件记忆
- `feedback-memory` 当前不多，不建议动

## 2. 可能方向

### 方向 A：先把当前基线写对

- 回写模块总览和 `03/04/05/06B README`

### 方向 B：先收口 `node detail` 的中间态

- 执行 `agentflow-node-detail-panel-revision`，但只收真值，不扩功能

### 方向 C：先修验证链

- `verify-backend.js` 回绿
- `style-boundary` 形成可重复 PASS
- 清掉前端 warning / deprecation 噪声

### 方向 D：下一条功能切片直接补最小 `05/06B`

- 做一条最小外部价值证明

### 方向 E：再做前端性能治理

- 路由懒加载
- chunk 切分

## 3. 不同方向的风险和收益

### 方向 A：写对当前基线

- 收益：以后所有讨论都会回到统一事实层
- 风险：短期没有新功能观感

### 方向 B：收口 `04`

- 收益：避免继续在已知中间态上叠功能
- 风险：如果做过头，会继续拖在 editor 视角

### 方向 C：修门禁

- 收益：完成标准重新可信
- 风险：治理投入对外不明显

### 方向 D：补最小 `05/06B`

- 收益：最快把项目拉回 publish-first
- 风险：如果不先修真值和门禁，会把旧债带进新模块

### 方向 E：性能治理

- 收益：在后续继续加模块前先控住主包
- 风险：优先级不如 `A/B/C/D` 直接

## 4. 对此你建议是什么？

建议顺序：`A + B + C -> D -> E`

### 我建议现在先做

1. 把模块总览和 `03/04/05/06B` 当前基线写对。
2. 执行 `node detail panel revision`，只做结构收口，不再顺手加功能。
3. 让 `verify-backend.js` 和 `style-boundary` 至少各有一条稳定可复现的通过路径。

### 我建议紧接着做

1. 下一条功能切片直接补最小 `05/06B` 外部价值证明。
2. 不要再默认继续做 editor 小功能。

### 我建议随后做

1. 做前端路由拆包和 chunk 治理。
2. 清理 `.memory/project-memory` 和 `.memory/tool-memory` 的同主题碎片。

### 当前不建议优先做

1. 继续在当前 `agent-flow` 中间态上叠功能。
2. 把“局部测试绿”直接当成“官方门禁绿”。
3. 继续让文档、计划和代码状态各说各话。
