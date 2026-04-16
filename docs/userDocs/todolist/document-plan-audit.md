# 文档计划审计待讨论

更新时间：`2026-04-16 09:01 CST`

说明：本轮继续沿用同主题，只保留当前时点最值得讨论的新结论，不重复上一版已经讲清的旧判断。

## 1. 现状

- 最近 `24` 小时共有 `47` 次提交，触达 `185` 个文件。
- 当前真实开发状态已经变成：
  - `03 Application 宿主基线已落地`
  - `04 agentFlow authoring baseline 已落地`
  - `05/06B` 仍没有最小价值闭环
- 本轮新验证结果：
  - `pnpm --dir web lint`：通过，但 `node-registry.tsx` 还有 `4` 条 warning
  - `pnpm --dir web test`：通过，`30` 个测试文件、`89` 个测试
  - `pnpm --dir web/app build`：通过，但主包已经到 `5.19 MB`
  - `node scripts/node/verify-backend.js`：失败，卡在 `rustfmt --check`
  - 三条定向 Rust 测试全部通过
  - `style-boundary` 运行时检查未跑通：`dev-up` 启动前端时命中 `listen EPERM 3100`
- 当前工作树干净，说明本轮收尾稳定性比上一版更好。

### 本轮新增或升级的问题

1. `模块状态真值层已经互相打架`
   - 根 `modules/README` 还把 `03` 写成待开发、`04/05` 写成未来设计
   - `03 README` 还写着当前没有应用列表、详情和四分区路由
   - `04 README` 又写成已完成，`05 README` 写成已确认
   - 本质问题不是文档落后，而是“设计状态、实现状态、验证状态”被混在一个状态词里

2. `计划文档已经过重且角色混乱`
   - 两份主 plan 分别 `2335` 行和 `2188` 行
   - 最近 `24` 小时各自都被改了 `8` 次
   - 计划文档已经不只是计划，而是在兼任执行日志、QA 记录和设计补丁

3. `04 已经可用，但 editor 内核还没有切到今天已确认的 store-centered 方向`
   - `Shell` 仍同时持有文档、保存、restore、selection、drawer、viewport 等状态
   - `node-registry.tsx` 还在用 `window.dispatchEvent('agent-flow-insert-node')`
   - autosave 还在对整份 document 做 `JSON.stringify` 差异判断

4. `统一门禁仍然不是同一真相层`
   - 前端 lint/test/build 全绿
   - 后端定向测试全绿
   - 官方后端入口仍红
   - 运行时 UI 门禁这轮也没补上

5. `产品方向没错，但阶段口径仍然比真实价值闭环更超前`
   - 当前重心还是 `Application + agentFlow authoring`
   - `05/06B` 还没有最小对外交付证明
   - 现在更像“宿主 + 编辑器基线稳定化”，还不是“P1 平台闭环收尾”

6. `长期技术压力已经开始可量化`
   - 主包 `5.19 MB`
   - `vite build` 已提示大 chunk
   - 部分目录和文档已开始接近或超过本地规则

## 2. 可能方向

### 方向 A：先重建状态真值层

- 把模块状态拆成：
  - `设计状态`
  - `实现状态`
  - `验证状态`

### 方向 B：先给 plan 文档减重并分工

- 拆开：
  - `正式计划`
  - `执行日志`
  - `QA delta`

### 方向 C：先完成 `agentFlow` store-centered 第一阶段重构

- 收口：
  - `editor store`
  - `document transforms`
  - `interaction hooks`

### 方向 D：先修统一门禁

- 修 `verify-backend.js`
- 给 `style-boundary` 一条可重复执行路径

### 方向 E：先补最小 `05/06B` 价值证明

- `API Key` 壳层
- `Run List / Run Detail`
- `Publish Endpoint` 最小对象

### 方向 F：再做包体和目录治理

- 路由级 code splitting
- 收纳超重目录与历史文档

## 3. 不同方向的风险和收益

### 方向 A：先重建状态真值层

- 收益：后续所有“做到哪、先干什么、现在算不算通过”的讨论会回到同一事实层
- 风险：短期没有直接可见的新功能

### 方向 B：先给 plan 文档减重

- 收益：计划文档重新变回高可执行入口，用户和 AI 都更容易读出“这轮新增了什么”
- 风险：需要一次性做文档拆分与迁移

### 方向 C：先做 store-centered 重构

- 收益：把 `04` 从“能跑”升级成“能持续扩展”
- 风险：短期主要是结构收益，不一定立刻新增明显功能

### 方向 D：先修统一门禁

- 收益：收尾标准重新清楚，QA 结论更可信
- 风险：是治理投入，不会直接带来新截图

### 方向 E：先补 `05/06B`

- 收益：最快证明项目不是在偏成纯 editor
- 风险：如果 A/B/C/D 不先做，旧问题会一起带进新模块

### 方向 F：再做包体与目录治理

- 收益：提早控制性能债和结构债
- 风险：对当前最紧迫的阶段判断帮助有限

## 4. 对此你建议是什么？

建议顺序：`先 A + B，再 C，再 D，再 E，最后 F`

### 我建议现在先做

1. 重写 `modules/README` 与 `03/04/05/06B README` 的状态语义
2. 把两份超长 plan 正式拆成 `plan / execution-log / qa-delta`
3. 直接推进 `agentFlow` store-centered 第一阶段重构
4. 让 `verify-backend.js` 回绿，并明确 `style-boundary` 在当前环境怎么跑

### 我建议随后做

1. 补最小 `05/06B` 价值证明
2. 再开始包体和目录治理

### 当前不建议优先做

1. 继续只追 editor 细节功能
2. 继续让 plan 文档无限增长
3. 继续接受“局部测试绿、官方门禁红、运行时 UI 未验”作为默认收尾
