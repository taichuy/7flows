# 文档计划审计待讨论

更新时间：`2026-04-17 06:14 CST`

这轮待讨论重点变了：

- 不是“项目有没有继续开发”，而是“代码推进速度已经快过模块文档、QA 门禁和记忆系统的同步速度”

## 1. 现状

- 最近 `24` 小时共有 `31` 次提交
  - `docs`: `13`
  - `feat + feat(web)`: `9`
  - `refactor`: `5`
  - `fix + fix(css)`: `3`
  - `test`: `1`
- 当前真实落地：
  - 应用列表、标签、编辑已在
  - `/applications/:id/orchestration` 已有 editor、draft 保存、版本恢复、node detail
  - 后端 `applications` 和 `application_orchestration` 路由及测试都在
- 当前更准确的阶段判断：
  - `03`：宿主基线已落地
  - `04`：authoring 基线已落地
  - `05`：运行态未闭环
  - `06B`：发布态未闭环

这轮新增暴露的 4 个更关键问题：

1. 模块真值层已经过时
   - `03` README 仍写“还没有 Application 列表、创建、详情和四分区路由”
   - 但当前代码和测试已经有了
2. 进度很容易被高估
   - 只有 `orchestration` 是真实能力
   - `api / logs / monitoring` 仍是 `planned` 状态页
3. QA 门禁不够稳
   - `pnpm --dir web lint/test/build` 都通过
   - `cargo check` 和近期后端路由测试也通过
   - 但统一 `verify-backend` 还卡在 `rustfmt`
   - `style-boundary` 脚本在当前环境下不能稳定自举
4. 文档和记忆已经开始拖慢检索
   - `project-memory`: `65`
   - `tool-memory`: `79`
   - 多个目录和计划文档已经超过仓库约束

当前判断：

- 内部开发速度：`好`
- 产品真值表达：`差`
- 工程完成定义：`偏黄`
- AI 检索效率：`中下`

## 2. 可能方向

### 方向 A：先把模块真值层说对

- 更新 `03` README
- 明确 `03/04/05/06B` 当前真实状态

### 方向 B：下一条主切片直接转 `05/06B`

- 不再继续深挖 `04` 的 authoring 小专题
- 直接补最小运行 / 发布闭环

### 方向 C：先把 QA 门禁拉回可信

- 收 `rustfmt`
- 让 `style-boundary` 能复用现有 frontend host
- 收 `Tooltip` 弃用和 fast refresh warning

### 方向 D：做资料与记忆减噪

- 超长 plan 归档
- 超限目录收纳
- 合并阶段性 project-memory
- 清理已陈旧的 tool-memory

## 3. 不同方向的风险和收益

### 方向 A

- 收益：后续判断会更准
- 风险：短期新增功能不多

### 方向 B

- 收益：最快回到 P1 主目标
- 风险：会更快暴露底层欠账

### 方向 C

- 收益：完成定义更硬，后续少争议
- 风险：容易变成治理专题

### 方向 D

- 收益：对 AI 长期效率帮助最大
- 风险：如果不同时修真值层，只移动文件意义有限

## 4. 对此你建议是什么？

建议顺序：`A -> B -> C-lite -> D`

我建议先做：

1. 先修真值层
   - 把 `03` README 改成当前代码事实
2. 把 `04` 暂时视作“够用基线”
   - 下一条主切片转 `05/06B`
3. 做一轮轻治理
   - `rustfmt`
   - `style-boundary` 入口
   - `Tooltip` 弃用
4. 再做记忆与文档减噪

建议优先清理或合并的记忆：

1. `03` 相关 project-memory
   - `2026-04-15-module-03-application-shell-plan-stage.md`
   - `2026-04-15-module-03-application-shell-needs-future-hooks.md`
2. editor 重构相关 project-memory
   - `2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
   - `2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
3. node detail 相关 project-memory
   - `2026-04-16-agentflow-node-detail-design-direction.md`
   - `2026-04-16-agentflow-node-detail-plan-stage.md`
4. 已与当前结果冲突的 tool-memory
   - `vitest/2026-04-15-web-test-blocked-by-existing-me-page-timeout.md`
5. `3100` 本地验收链路相关 tool-memory
   - `vite/...3100...`
   - `node/2026-04-17-dev-up-ensure-timeout-use-pty-vite-for-browser-check.md`
   - `bash/2026-04-14-style-boundary-dev-up-needs-escalation-for-port-3100.md`

一句话总结：

现在的问题不是“开发慢”，而是“`03/04` 的实现已经快过文档、QA 和记忆系统的同步速度”。当前最优先的不是继续补 editor 小功能，而是先把真值层收正，再补最小 `05/06B` 主链。
