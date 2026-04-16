# 文档计划审计待讨论

更新时间：`2026-04-17 05:06 CST`

这轮待讨论重点不再是“有没有继续开发”，而是：

- 代码确实继续往前走了
- 但入口诚实度、模块真值层、审计文档和记忆检索效率开始落后于开发速度

## 1. 现状

- 最近 `24` 小时共有 `32` 次提交，AI 节奏下开发速度依然很快
- 其中 `docs: refresh document plan audit` 就有 `8` 次，说明同主题审计已经进入高频重写
- 当前真实落地能力：
  - `HomePage` 已切到 `ApplicationListPage`
  - 应用列表已支持标签和编辑
  - `/applications/:id/orchestration` 已有 editor、draft 保存、版本恢复、node detail
  - 后端已有 `applications` 与 orchestration `get/save/restore`
- 但这轮新增暴露出 4 个更实的问题：

1. `发布配置` 按钮是启用态空操作
   - `AgentFlowCanvasFrame` 里实际是 `onOpenPublish={() => undefined}`
   - `publish-gateway` 也还是空壳
2. `api/logs/monitoring` 还是状态说明页
   - `ApplicationSectionState` 里直接写着 `06B 再落地`、`05 会接进这里`
3. 工程门禁还是黄灯
   - `vitest` 关键路径 `20` 条通过
   - `build` 通过，但主包 `5,268.92 kB`
   - `eslint` 还有 `1` 个 warning
   - `cargo fmt --all --check` 失败
4. 记忆和计划越来越偏向 `agent-flow` 细节
   - `.memory/project-memory` 已有 `65` 条
   - 最近最活跃的 project-memory 基本都在 `agent-flow`

当前判断：

- 内部开发速度：`好`
- 外部交付闭环：`一般`
- UI / 文档诚实度：`中下`
- AI 检索效率：`中下`

## 2. 可能方向

### 方向 A：先收口假入口和真值层

- 隐藏或降级 `发布配置`
- 把 `api/logs/monitoring` 明确写成“能力状态页”
- 补一份当前 `03/04/05/06B` 真实状态总览

### 方向 B：下一条主切片直接转 `05/06B`

- 不再继续深挖 editor 新专题
- 直接补最小发布 / 运行闭环

### 方向 C：给审计、计划、记忆减噪

- 同主题审计改成增量更新
- 超长 plan 归档到 `history/`
- 把 design / plan / implemented 三连记忆合并

### 方向 D：做一轮轻量黄灯治理

- 收 `fmt`
- 收 `provider.tsx` warning
- 收 `Tooltip` 弃用
- 处理 `React Flow` 测试宿主噪声
- 做基础 chunk 拆分

## 3. 不同方向的风险和收益

### 方向 A

- 收益：后续判断会更准，避免继续把未完成能力说成已完成
- 风险：短期不会新增很多“看得见的新功能”

### 方向 B

- 收益：最快回到 P1 真正要证明的价值
- 风险：需要压住继续做 editor 细节优化的惯性

### 方向 C

- 收益：对 AI 长期效率帮助最大
- 风险：如果只搬文件不改真值表达，效果有限

### 方向 D

- 收益：完成定义更硬，后面少解释黄灯
- 风险：容易变成单独治理专题

## 4. 对此你建议是什么？

建议顺序：`A -> B -> C -> D-lite`

我建议先做：

1. 收掉假闭环入口：
   - `发布配置` 不要再以启用态空操作出现
2. 统一当前产品真值：
   - `03`：壳层与 capability snapshot 已落地
   - `04`：editor authoring 基线已落地
   - `05`：运行态未闭环
   - `06B`：发布态未闭环
3. 下一条主切片直接补最小发布 / 运行闭环

我建议优先清理和合并的记忆：

1. `03` 相关：
   - `2026-04-15-module-03-application-shell-plan-stage.md`
   - `2026-04-15-module-03-application-shell-needs-future-hooks.md`
2. editor 重构相关：
   - `2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
   - `2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
3. node detail 相关：
   - `2026-04-16-agentflow-node-detail-design-direction.md`
   - `2026-04-16-agentflow-node-detail-plan-stage.md`
4. `vite` 端口类 tool-memory
5. `vitest` 聚焦运行 / timeout 类 tool-memory

一句话总结：

现在不是“做得慢”，而是“内部 authoring 很快，但发布 / 运行主线仍偏前置，而且入口、文档、记忆已经开始把它包装得比实际更完整”。当前最优先的不是继续做 editor 小功能，而是先把真值层说对，再补最小 `05/06B`。
