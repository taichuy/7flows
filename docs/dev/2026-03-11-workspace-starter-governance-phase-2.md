# Workspace Starter Governance Phase 2

## 背景

上一轮 `workspace starter governance` 已经补齐了独立治理页、列表筛选、详情查看和元数据更新，但 `runtime-foundation` 里仍明确留着第二阶段缺口：

1. 模板还没有归档和谨慎删除能力。
2. 治理页还看不到模板与来源 workflow 的同步状态。
3. 从治理页回到创建页时，不能带着当前 starter 深链回填。

这些问题会让 workspace starter 仍然停留在“可维护但不够闭环”的状态，影响 `应用新建编排` 这条主业务线继续收口。

## 目标

本轮继续沿着 P0 第二阶段推进，但只做能直接提升业务闭环的部分：

1. 给 workspace starter 增加归档 / 恢复 / 谨慎删除能力。
2. 在治理页补来源 workflow 漂移摘要，复用现有 workflow API 作为事实来源。
3. 支持从治理页带着当前 starter 回到创建页，并在创建页自动选中。

本轮不做：

- 字段级或节点级结构化 diff
- 模板治理审批流
- 模板历史审计面板
- starter / node catalog / tool registry 的统一后端 contract

## 实现

### 1. 后端补齐归档与删除治理

更新：

- `api/app/models/workspace_starter.py`
- `api/app/schemas/workspace_starter.py`
- `api/app/services/workspace_starter_templates.py`
- `api/app/api/routes/workspace_starters.py`
- `api/migrations/versions/20260311_0005_workspace_starter_archive.py`
- `api/tests/test_workspace_starter_routes.py`

新增能力：

- `workspace_starter_templates` 新增 `archived_at`
- `GET /api/workspace-starters`
  - 支持 `include_archived`
  - 支持 `archived_only`
- `POST /api/workspace-starters/{template_id}/archive`
- `POST /api/workspace-starters/{template_id}/restore`
- `DELETE /api/workspace-starters/{template_id}`
  - 默认要求先归档再删除，避免团队模板资产被误删

这里仍然保持 `workflow definition` 作为模板事实内容，没有为模板治理引入第二套 DSL。

### 2. 前端治理页补齐状态过滤与来源漂移摘要

更新：

- `web/app/workspace-starters/page.tsx`
- `web/components/workspace-starter-library.tsx`
- `web/lib/get-workspace-starters.ts`
- `web/lib/workspace-starter-source-status.ts`

新增治理能力：

- 活跃 / 归档 / 全部状态过滤
- 模板归档、恢复、删除操作
- 来源 workflow 漂移摘要
  - 复用 `/api/workflows/{workflow_id}`
  - 展示模板版本、来源版本、节点/连线数量变化
  - 明确区分 `已同步 / 已漂移 / 来源不可用 / 无来源 workflow`

这样治理页开始承担“模板资产状态摘要”和“来源追踪入口”，但机器事实仍然来自原始 workflow API，而不是前端自己制造第二套追溯源。

### 3. 创建页支持 starter 深链回填

更新：

- `web/app/workflows/new/page.tsx`
- `web/components/workflow-create-wizard.tsx`

新增能力：

- 创建页读取 `starter` 查询参数
- 如果该 starter 在当前可用模板中存在，则自动选中
- 治理页可直接跳回：
  - `/workflows/new?starter=<template_id>`

当前约束：

- 创建页默认只消费活跃模板
- 归档模板仍保留在治理页里，不再作为默认新建入口

## 影响范围

后端：

- workspace starter 持久化模型
- workspace starter 路由与服务
- workspace starter 相关测试
- Alembic 迁移链路

前端：

- workspace starter 治理页
- workflow 创建页
- starter 读取与来源状态辅助逻辑

文档：

- `docs/dev/runtime-foundation.md`
- `docs/dev/user-preferences.md`
- 本文档

## 验证

已执行：

```powershell
cd api
.\.venv\Scripts\python.exe -m pytest tests/test_workspace_starter_routes.py
```

结果：

- `workspace starter` 路由测试 5 项全部通过

已执行：

```powershell
cd web
pnpm lint
pnpm build
```

结果：

- `pnpm lint` 通过
- `pnpm build` 通过

补充说明：

- 当前终端全局没有 `uv` 和 `python` 命令，但 `api/.venv` 内的 Python 与 pytest 可正常执行测试。

## 结论

这轮完成后，workspace starter 已从“可治理”进一步推进到“可归档、可追来源、可带回创建入口”的状态，和上一条提交形成直接衔接。

这说明：

1. 上一次 Git 提交 `feat: add workspace starter governance` 需要衔接，而且本轮已经完成这条 P0 续接。
2. 当前基础框架不是没写好，而是已经足以继续沿主业务推进完整度。
3. 当前架构仍保持 `workflow / starter / run / source API` 分层，没有为治理页单独造事实来源。
4. 代码体量上，`workspace-starter-library.tsx` 增长到约 784 行，但仍远低于前端 2000 行阈值，暂不是最紧迫的拆分点。

## 下一步

### P0

1. 把 `node catalog / starter template / tool registry` 推进到共享后端 contract，避免来源语义继续主要停留在前端。
2. 给 workspace starter 治理补第三阶段能力：来源 refresh / rebase、治理历史、批量操作。

### P1

1. 继续结构化高频节点配置，优先 `llm_agent`、`output`、edge `mapping[]` 和 join 策略。
2. 拆 `web/components/workflow-editor-workbench.tsx`，把 run overlay、保存链路和画布壳层拆开。

### P2

1. 进入 Dify 插件兼容主线，把外部插件先压成受约束 `7Flows IR` 再接目录与绑定。
2. 在四条主业务线都更完整后，再联系用户进行人工全链路完整测试。
