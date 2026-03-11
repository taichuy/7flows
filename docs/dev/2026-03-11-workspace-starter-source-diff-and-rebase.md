# 2026-03-11 Workspace Starter 治理补强：Source Diff 与 Rebase

## 背景

用户这轮先要求重新阅读仓库协作规则、用户偏好、产品设计、技术补充和 `runtime-foundation`，再判断几件事：

- 上一次 Git 提交做了什么，当前是否需要衔接
- 基础框架是否已经足够支撑主业务继续推进
- 当前架构是否已经开始解耦分层
- 是否存在需要继续盯住的长文件
- 当前项目是否还能继续围绕主业务提升完整度

结合仓库现状后，最清晰的结论是：

1. 上一次提交 `feat: add workspace starter governance history` 已经把 `workspace starter` 推到“可刷新、可追溯”的团队治理阶段，这一轮应直接衔接，而不是另起新主线。
2. 当前基础框架已经足够继续服务主业务，尤其是“应用新建编排”这条主线已经形成 `创建页 -> editor -> starter 治理 -> 创建页复用` 的连续链路。
3. `workspace starter` 当前最大的缺口不再是“能不能保存”，而是“源 workflow 演进后，团队如何判断 drift、如何安全同步、如何留下治理事实”。

## 目标

本轮只做 P0 里最该补的一层治理能力：

1. 给 `workspace starter` 增加机器可读的 source diff
2. 补一个明确语义的 `rebase` 动作，而不是继续靠人工肉眼比对后手改
3. 把治理页从“能看 source status”推进到“能看 diff、能执行 rebase、能看历史”
4. 顺手补齐一个现有边界问题：`PUT /api/workspace-starters/{template_id}` 现在按 `workspace_id` 读取模板，避免跨 workspace 更新记录

## 实现与决策

### 1. 后端新增 source diff contract

新增：

- `WorkspaceStarterSourceDiff`
- `WorkspaceStarterSourceDiffSummary`
- `WorkspaceStarterSourceDiffEntry`

同时新增接口：

- `GET /api/workspace-starters/{template_id}/source-diff`

当前 diff 输出关注的是治理决策真正需要的信息，而不是大而全的深度对象比对：

- source workflow 名称 / 版本
- starter 当前记录的 source version
- `default_workflow_name` 是否与 source workflow 已漂移
- node / edge 两层的 added / removed / changed 汇总
- 可直接用于 rebase 的 `rebase_fields`

这样前端和 AI 都能读取同一份后端事实，而不是各自再写一套 drift 推断逻辑。

### 2. 引入明确语义的 rebase 动作

新增接口：

- `POST /api/workspace-starters/{template_id}/rebase`

本轮把 `rebase` 收敛为“同步 source-derived 字段”，而不是模糊地覆盖所有治理元数据。当前同步范围是：

- `definition`
- `created_from_workflow_version`
- `default_workflow_name`

刻意不让 `rebase` 覆盖这些治理态字段：

- `name`
- `description`
- `workflow_focus`
- `recommended_next_step`
- `tags`

原因是这些字段更多体现团队治理和模板运营，不应被源 workflow 的一次变化直接覆盖。

### 3. 治理历史继续作为设计态事实，不混进运行态事件流

历史动作新增：

- `rebased`

同时 `rebase` 历史 payload 会记录：

- `source_workflow_id`
- `source_workflow_version`
- `changed`
- `rebase_fields`
- `node_changes`
- `edge_changes`

这继续保持既有边界：

- `run_events` 负责运行态事实
- `workspace_starter_history` 负责设计态资产治理事实

不把“模板治理”错误地塞进 runtime trace。

### 4. 前端治理页补上 diff 与 rebase 面板

新增：

- `web/components/workspace-starter-library/source-diff-panel.tsx`
- `getWorkspaceStarterSourceDiff()`

治理页现在会：

- 读取 source diff
- 展示 node / edge 层面的 drift 汇总
- 展示推荐同步的 `rebase_fields`
- 在需要时执行 `rebase`
- 在刷新与 rebase 后同步刷新 diff 和 history

这样治理页就不只是“看 source status”，而是开始具备真正的团队同步动作。

## 影响范围

后端：

- `api/app/api/routes/workspace_starters.py`
- `api/app/schemas/workspace_starter.py`
- `api/app/services/workspace_starter_templates.py`
- `api/tests/test_workspace_starter_routes.py`

前端：

- `web/lib/get-workspace-starters.ts`
- `web/components/workspace-starter-library.tsx`
- `web/components/workspace-starter-library/history-panel.tsx`
- `web/components/workspace-starter-library/source-diff-panel.tsx`

文档：

- `docs/dev/runtime-foundation.md`
- `docs/dev/2026-03-11-workspace-starter-source-diff-and-rebase.md`

## 验证

已执行：

```powershell
api\.venv\Scripts\python.exe -m pytest api\tests\test_workspace_starter_routes.py
api\.venv\Scripts\python.exe -m ruff check api\app\api\routes\workspace_starters.py api\app\schemas\workspace_starter.py api\app\services\workspace_starter_templates.py api\tests\test_workspace_starter_routes.py
cd web
pnpm exec tsc --noEmit
pnpm lint
```

结果：

- workspace starter 路由测试通过，覆盖 `source-diff` 和 `rebase`
- 后端本轮涉及文件 Ruff 通过
- 前端 TypeScript 检查通过
- 前端 lint 通过

## 当前结论

- 上一次 Git 提交是需要直接衔接的，而且这轮已经顺着它继续推进
- 基础框架已经足够继续支撑主业务推进，不需要再为了“底座未完工”暂停业务闭环
- 架构在这条链路上继续朝解耦方向演进：
  - source diff 作为后端 contract
  - rebase 作为治理动作
  - history 作为设计态事实
  - 前端只负责展示与触发
- 当前最需要继续盯住的长文件仍然是：
  - `api/app/services/runtime.py`，已超过后端 1500 行偏好阈值
  - `web/components/workspace-starter-library.tsx`，虽然未超阈值，但仍是治理页的最大单文件

## 下一步

1. P0：继续补 `workspace starter` 的批量治理、字段级 diff 和更明确的 drift 决策提示。
2. P0：把 `workflow library snapshot` 继续推进到 `plugin-backed node source` 和统一 node/tool source contract。
3. P1：回到“编排节点能力”主线，继续结构化 `edge mapping[]`、`runtimePolicy.join` 和更细的 schema 编辑。
