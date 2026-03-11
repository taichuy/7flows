# Workspace Starter 批量治理与字段级 Diff

## 背景

上一轮已经把 workspace starter 治理推进到 `history / refresh / source diff / rebase`，但仍然存在两个直接影响团队复用的问题：

- 治理动作仍然停留在单模板粒度，团队需要重复执行 archive / restore / refresh / rebase。
- `source diff` 只能告诉用户“某个节点或连线变了”，还不能直接指出变化落在哪些字段，drift 决策成本偏高。

这两个缺口都直接落在当前 `P0 应用新建编排` 主线，不适合继续往后拖。

## 目标

- 为 workspace starter library 增加基于当前筛选结果的批量治理能力。
- 把 source diff 从“条目级变化”细化到“字段级变化”。
- 保持治理事实继续沉淀到 `workspace_starter_history`，不引入第二套旁路记录。

## 实现

### 1. 后端批量治理接口

新增 `POST /api/workspace-starters/bulk`，支持对一组模板执行：

- `archive`
- `restore`
- `refresh`
- `rebase`

接口会返回：

- 请求范围
- 实际更新数量
- 跳过数量
- 已更新模板列表
- 跳过原因列表

跳过原因当前覆盖：

- 模板不存在
- 已归档 / 未归档
- 没有 source workflow
- source workflow 已缺失

每个成功处理的模板仍会写入 `workspace_starter_history`，并在 payload 中带上 `bulk: true`，方便后续区分批量治理与单条治理。

### 2. 字段级来源 Diff

`WorkspaceStarterSourceDiffEntry` 现在会带上 `changed_fields`：

- 节点变化可定位到 `config.prompt`、`runtimePolicy.*` 等字段路径
- 连线变化可定位到 `targetNodeId`、`mapping[0].targetField` 等字段路径

当前实现策略：

- 对新增 / 删除项继续保留条目级提示
- 对同 ID 但内容变化的项递归比较 dict / list，输出最小字段路径
- 不为前端额外拼接一套漂移判断逻辑，仍由后端统一产出 diff 事实

### 3. 前端治理页接入

workspace starter library 已新增一块 `Bulk governance` 区域：

- 先通过业务主线、归档状态和搜索词收敛当前结果集
- 再直接对当前筛选结果批量 archive / restore / refresh / rebase
- UI 会显示当前结果集在四类动作下的可操作数量

同时 `Source drift detail` 面板已新增：

- 每个 changed node / edge 的 `changed_fields`
- 基于 definition drift / workflow name drift 的更明确 rebase 决策提示

## 影响范围

- `api/app/api/routes/workspace_starters.py`
- `api/app/schemas/workspace_starter.py`
- `api/app/services/workspace_starter_templates.py`
- `api/tests/test_workspace_starter_routes.py`
- `web/components/workspace-starter-library.tsx`
- `web/components/workspace-starter-library/source-diff-panel.tsx`
- `web/lib/get-workspace-starters.ts`

## 验证

- 后端：`api/.venv/Scripts/python.exe -m pytest tests/test_workspace_starter_routes.py`
- 前端：`pnpm exec tsc --noEmit`
- 前端：`pnpm lint`

验证结果：

- workspace starter 路由测试 `10/10` 通过
- 前端 TypeScript 类型检查通过
- 前端 ESLint 通过

## 当前结论

- workspace starter 治理已经从“单模板可操作”推进到“可按结果集批量治理”。
- source drift 已经不再只是粗粒度状态提示，而是能直接指出 changed entry 的字段路径。
- 这条能力链路仍然围绕统一 starter 事实模型和治理历史演进，没有把团队治理逻辑塞回 editor 或前端本地状态。

## 下一步

1. 继续补 workspace starter 的批量删除、批量归档前风险提示和更细的跳过原因聚合，让团队级治理闭环更完整。
2. 继续把 shared `workflow library snapshot` 推进到 plugin-backed node source / tool source contract，避免主业务入口再次回退到前端常量拼装。
3. 评估是否把 workspace starter library 继续拆出更稳定的 section 组件，防止治理页后续再次长回单文件堆叠。
