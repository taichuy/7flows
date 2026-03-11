# Runtime Foundation

## 目标

这次实现的目标不是一次性做完整工作流平台，而是把最关键、最容易成为后续瓶颈的基础设施先落稳：

- 迁移体系替代 `create_all`
- 运行态表结构落地
- 最小可用的工作流执行闭环
- Docker 启动前自动迁移

## 已落地能力

### 1. Alembic 迁移体系

后端已经引入 Alembic，主链路不再依赖应用启动时的 `Base.metadata.create_all()`。

当前文件：

- `api/alembic.ini`
- `api/migrations/env.py`
- `api/migrations/versions/20260309_0001_initial_runtime.py`

当前迁移会创建以下表：

- `workflows`
- `runs`
- `node_runs`
- `run_events`

### 2. Docker 自动迁移

`api` 镜像已增加启动脚本：

- `api/docker/entrypoint.sh`

当环境变量 `SEVENFLOWS_MIGRATION_ENABLED=true` 时，容器启动前会自动执行：

```bash
uv run alembic upgrade head
```

当前约定：

- `api` 服务默认自动迁移
- `worker` 服务默认不自动迁移

这样可以避免多个容器并发升级同一份数据库。

### 3. 运行态模型

当前运行态闭环的核心表如下：

#### `runs`

记录一次工作流执行实例：

- 状态
- 输入
- 输出
- 错误信息
- 起止时间

#### `node_runs`

记录每个节点的一次执行：

- 节点 ID / 名称 / 类型
- 输入输出
- 执行状态
- 错误信息
- 起止时间

#### `run_events`

记录统一事件流，用于后续调试面板、回放和流式输出复用。

当前已记录的事件类型包括：

- `run.started`
- `node.started`
- `node.skipped`
- `node.retrying`
- `node.output.completed`
- `node.context.read`
- `node.join.ready`
- `node.join.unmet`
- `node.failed`
- `run.completed`
- `run.failed`

### 4. 工作流定义校验与版本快照

编排 API 已经补上“最小但真实可用”的设计态约束，避免工作流定义继续以裸 JSON 直接进入运行时。

当前已落地：

- 创建/更新工作流时执行结构校验，至少覆盖：
  - 必须且仅允许一个 `trigger` 节点
  - 至少存在一个 `output` 节点
  - 节点 ID / 连线 ID 唯一
  - 连线引用的源节点和目标节点必须存在
- 设计态约束已继续补强到：
  - `variables` / `publish` 唯一性
  - `tool` 绑定一致性
  - MCP artifact 授权前置校验
  - branch/router 出边条件边界
- 边定义会补齐默认 `channel=control`
- 每次定义变更都会自动创建不可变版本快照
- `runs` 会记录执行时绑定的 `workflow_version`

当前相关文件：

- `api/app/schemas/workflow.py`
- `api/app/services/workflow_definitions.py`
- `api/app/api/routes/workflows.py`
- `api/migrations/versions/20260309_0002_workflow_versioning.py`

当前最小版本管理策略：

- 工作流初始版本为 `0.1.0`
- 仅当 `definition` 发生变更时自动递增 patch 版本，例如 `0.1.0 -> 0.1.1`
- 纯名称修改不会创建新版本
- `workflow_versions` 用于保存不可变快照，供后续运行追溯、发布绑定和缓存失效复用

### 5. 最小工作流执行器

当前执行器位置：

- `api/app/services/runtime.py`

当前实现的是一个 MVP 级执行器，目标是先把“状态、事件、执行记录”打通，而不是完整支持全部节点语义。

当前特性：

- 基于 `nodes + edges` 做拓扑排序
- 检测循环并拒绝执行
- 支持 `trigger`
- 支持 `output`
- 支持基于激活边的条件分支 / 失败分支
- 支持节点级重试策略与退避参数
- 支持节点授权上下文注入与 `mcp_query.authorized_context`
- 支持 `condition` / `router` 通过最小规则选择器按输入命中分支
- 支持 `condition` / `router` 通过安全表达式 `config.expression` 决定分支
- 支持边通过 `conditionExpression` 做安全布尔门控
- 支持节点通过 `runtimePolicy.join` 显式声明多上游 join 约束
- 支持边通过 `mapping[]` 注入字段级输入，并通过 `join.mergeStrategy` 显式解决冲突
- 其他节点默认走统一占位执行逻辑
- 支持通过 `config.mock_output` 为节点声明稳定输出

这让我们可以先验证：

- 工作流是否能跑通
- 运行态是否能完整落库
- 调试与观测数据是否可复用

### 6. 运行 API

当前新增接口：

- `POST /api/workflows/{workflow_id}/runs`
- `GET /api/workflows/{workflow_id}/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`
- `GET /api/runs/{run_id}/trace/export`
- `GET /api/workflow-library`

用途：

- 触发一次最小工作流执行
- 为 workflow editor 提供 workflow 级 recent runs 摘要入口
- 查询执行详情
- 查询事件流
- 为 AI / 自动化 提供带过滤条件的 run trace 检索
- 为创建页和 editor 提供共享的 workflow library snapshot，统一暴露 builtin/workspace starters、node catalog、tool lanes 和 tools
- `GET /api/workflows/{workflow_id}/runs` 当前会聚合返回 run 状态、版本、`node_run_count`、`event_count` 和 `last_event_at`，供 editor 选择最近执行上下文，而不是继续依赖首页摘要拼装
- `GET /api/runs/{run_id}` 当前已支持 `include_events=false` 的摘要模式，供 run 诊断页等人类界面减少与 `/trace` 的重复数据搬运
- 当前 trace 过滤已支持 `event_type`、`node_run_id`、时间范围、`payload_key`、事件游标和顺序控制
- 当前 trace 还补充了回放 / 导出元信息，例如 trace / returned 时间边界、事件顺序、`replay_offset_ms` 以及 opaque `cursor`
- `GET /api/runs/{run_id}/trace/export` 当前支持 `json` 与 `jsonl`，导出会复用相同过滤条件，便于离线分析与后续 replay 包演进

系统诊断相关接口：

- `GET /api/system/overview`
- `GET /api/system/runtime-activity`

用途：

- 提供系统首页和监控入口需要的聚合摘要
- 暴露近期运行态信号，但不承担完整取证日志出口

### 7. 运行态追溯分层

当前仓库已明确把“给人看的诊断面板”和“给 AI / 自动化 看的原始追溯”拆成两层，再加上一层开发过程留痕：

#### L1 人类诊断层

面向：

- 首页系统诊断
- run 诊断面板
- 后续调试工作台

当前接口：

- `GET /api/system/overview`
- `GET /api/system/runtime-activity`
- `GET /api/runs/{run_id}`（供 run 详情页直接展示）

边界：

- 默认展示摘要、统计、预览和跳转入口
- 允许为了可读性做聚合、排序、裁剪和视觉组织
- 不能把 UI 面板本身当成 AI 排障或审计的唯一事实来源

#### L2 机器追溯层

面向：

- AI 开发辅助
- 自动化排障
- 回放与后续机器消费能力

当前接口：

- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`

当前事实载体：

- `runs`
- `node_runs`
- `run_events`

边界：

- 保留原始运行态事实，不按首页展示需求做摘要化截断
- AI / 自动化应优先读取这些接口或底层运行态对象，而不是抓取前端页面文本
- `GET /api/runs/{run_id}/events` 继续保留原始事件列表语义
- `GET /api/runs/{run_id}/trace` 负责提供按 `event_type`、`node_run_id`、时间范围、`payload_key`、事件游标和顺序过滤的机器检索能力
- `GET /api/runs/{run_id}/trace` 还会补充回放 / 导出所需的派生元信息，但事实来源仍然是同一批 `run_events`
- 若后续机器侧需要更强查询能力，应继续围绕 `run_events` 扩展，而不是继续往首页塞隐藏日志

#### L3 开发留痕层

面向：

- 为什么改
- 改了什么
- 如何验证
- 后续如何接着做

当前载体：

- `docs/dev/`
- 测试与验证结果
- Git 提交历史

边界：

- 这一层记录的是开发过程，不替代运行态日志
- 当 AI 需要追溯“为什么这样实现”时，优先看 `docs/dev/` 和提交，而不是从运行面板反推设计意图

工作流设计态新增接口：

- `POST /api/workflows`
- `PUT /api/workflows/{workflow_id}`
- `GET /api/workflows/{workflow_id}`
- `GET /api/workflows/{workflow_id}/versions`

### 8. 前端最小 workflow 编辑器骨架

当前前端已经不再只是系统诊断与 run 诊断工作台，也补上了最小可用的 workflow 编辑器入口：

- 新增独立新建路由：
  - `GET /workflows/new`（Next.js 页面路由）
- 新增独立编辑路由：
  - `GET /workflows/{workflow_id}`（Next.js 页面路由）
- 引入 `xyflow` 作为画布基础：
  - 当前已提供 starter template 新建向导，创建成功后会直接进入 editor
  - 当前已新增统一 `workflow node catalog`，把 starter template、节点默认名称/位置和 editor palette 收敛到同一份节点能力描述
  - 当前已新增 `workflow business tracks` 与 `starter library` 元数据：
    - 创建页会按 `应用新建编排` / `编排节点能力` / `Dify 插件兼容` / `API 调用开放` 四条主业务线筛选 starter
    - starter template 会显式标注优先级、主线焦点、来源生态和推荐下一步
    - 当前已补充 `Response Draft`，让“API 调用开放”不再完全停留在文档层
- 当前已新增共享 `workflow source model`，把 starter template / node catalog / tool registry 的来源信息收成同一套描述：
    - starter library 会显式区分 `builtin / workspace / ecosystem(planned)` 三类模板来源 lane
    - node palette 会显式标注 `native node catalog` 来源
    - editor palette 会汇总 tool registry 的 `native / compat:*` 工具来源 lane
    - 当前这些来源语义已经从前端本地常量推进到后端共享 snapshot `GET /api/workflow-library`
  - 当前已新增 workspace starter 的真实数据源与最小治理入口：
    - 后端新增 `workspace_starter_templates` 持久化表和 `/api/workspace-starters` 读写接口
    - 创建页当前会优先读取 `/api/workflow-library`，由后端统一带回 builtin/workspace starters 与来源 lane
    - `/api/workspace-starters` 已支持按 `business_track` / `search` 做列表筛选，并支持读取单个模板详情
    - editor 目前已支持把当前 workflow 保存为 workspace starter，回到创建页即可复用
    - 当前已新增独立治理页 `GET /workspace-starters`：
      - 支持模板列表、业务主线筛选、关键字筛选、详情查看和 metadata 更新
      - 支持从治理页跳回源 workflow，形成 editor -> starter library -> editor 的往返链路
    - 当前已补齐 workspace starter 第二阶段治理：
      - `/api/workspace-starters` 已支持 `include_archived` / `archived_only`
      - 已新增 archive / restore / delete 接口，且删除默认要求先归档
      - 治理页已支持 active / archived / all 状态筛选
      - 治理页已支持归档、恢复、删除操作
      - 治理页会复用 `/api/workflows/{workflow_id}` 展示来源 workflow 漂移摘要
      - 创建页已支持通过 `starter` 查询参数回填选中的 workspace starter
    - 当前已开始进入 workspace starter 第三阶段治理：
      - 后端已新增 `workspace_starter_history`，把 create / update / archive / restore / refresh 变成可追溯治理事实
      - `/api/workspace-starters/{template_id}/history` 已支持读取模板治理历史
      - `/api/workspace-starters/{template_id}/refresh` 已支持从源 workflow 刷新模板 definition 快照
      - `/api/workspace-starters/{template_id}/source-diff` 已支持返回机器可读的 source drift diff
      - `/api/workspace-starters/{template_id}/rebase` 已支持把 source-derived 字段同步回 starter（definition / source version / default workflow name）
      - 治理页已支持执行来源刷新、查看独立历史面板、查看 source diff，并在需要时执行 rebase
      - 当前已继续补上结果集批量治理：
        - `/api/workspace-starters/bulk` 已支持按当前筛选结果批量 archive / restore / refresh / rebase
        - 批量治理会继续复用 `workspace_starter_history`，并通过 `payload.bulk=true` 标识批量上下文
      - 当前 source diff 已细化到字段级：
        - changed node / edge 会返回 `changed_fields`
        - 治理页会基于 definition drift / workflow name drift 提示 refresh 与 rebase 的决策差异
  - 当前创建页已把 starter 浏览逻辑拆到独立组件，避免 `/workflows/new` 再次长成页面级杂糅入口
  - 当前已支持把 workflow definition 映射为画布节点与连线
  - 当前已支持新增 `llm_agent` / `tool` / `mcp_query` / `condition` / `router` / `output`
  - 当前已支持编辑节点名称、基础 `config`、基础 `runtimePolicy`
  - 当前已支持编辑 edge 的 `channel` / `condition` / `conditionExpression`
  - 当前已支持保存回 `PUT /api/workflows/{workflow_id}`，继续复用版本快照递增
  - 当前 workflow 页面会优先读取 `/api/workflow-library`，把 node catalog、tool lanes 和 tool catalog 一并带入 editor
  - 当前 workflow 页面会并行读取 `/api/workflows/{workflow_id}/runs`，把 recent runs 直接带入 editor runtime overlay
  - 当前 `llm_agent` / `tool` / `mcp_query` / `condition` / `router` / `output` 节点已开始进入结构化配置表单，并保留高级 JSON 兜底：
    - `llm_agent`
      - 可编辑 `provider` / `modelId` / `temperature`
      - 可编辑 `systemPrompt` / `prompt`
      - 可显式切换 `toolsEnabled` / `mcpEnabled` / `sandboxEnabled`
      - 可声明可读上游上下文授权
    - `tool`
      - 可直接绑定持久化 compat / native 工具目录项
      - 可编辑 `adapterId` / `timeoutMs`
      - 可基于 `input_schema` 渲染简单输入字段（`string` / `number` / `boolean` / `enum`）
    - `mcp_query`
      - 可编辑 `authorized_context` 的 readable nodes、extra artifact grants、query sources、query artifact types
    - `condition` / `router`
      - 可在 selector rules / expression / fixed branch 三种模式间切换
    - `output`
      - 可编辑 `format` / `responseKey` / `contentType`
      - 可补充 response notes 和 `includeRunMetadata`
  - 当前 inspector 已从画布壳层中拆出独立组件，降低 editor 主组件耦合
  - 当前 editor 已支持把选中 run 的 `node_runs` / `trace` 摘要接回画布：
    - 画布节点会叠加执行状态、最近事件、耗时和错误摘要
    - 左侧新增 runtime overlay panel，可选择 recent run、查看 node timeline、trace preview，并跳转到 run diagnostics / trace export
    - 当前 overlay 仍复用现有 `/api/runs/{run_id}` 与 `/trace`，没有另起前端专用 runtime 协议
  - 当前 editor 两个核心大组件已按职责拆出子模块：
    - `workflow-node-config-form.tsx` 当前只保留节点类型分发；各节点结构化表单、授权区块和 schema 工具已拆到子目录
    - `workflow-editor-workbench.tsx` 当前主要保留状态编排；hero / sidebar / canvas / run overlay helper / canvas node 已拆到子目录

当前相关文件：

- `api/app/api/routes/workflow_library.py`
- `api/app/schemas/workflow_library.py`
- `api/app/services/workflow_library.py`
- `web/app/workflows/new/page.tsx`
- `web/app/workflows/[workflowId]/page.tsx`
- `web/app/workspace-starters/page.tsx`
- `web/lib/get-workflow-library.ts`
- `web/components/workflow-create-wizard.tsx`
- `web/components/workflow-starter-browser.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/*`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-run-overlay-panel.tsx`
- `web/components/workspace-starter-library.tsx`
- `web/components/workspace-starter-library/*`
- `web/components/workflow-node-config-form.tsx`
- `web/components/workflow-node-config-form/*`
- `web/lib/get-workflow-runs.ts`
- `web/lib/get-workspace-starters.ts`
- `web/lib/workspace-starter-payload.ts`
- `web/lib/workflow-business-tracks.ts`
- `web/lib/workflow-node-catalog.ts`
- `web/lib/workflow-editor.ts`
- `web/lib/workflow-source-model.ts`
- `web/lib/workflow-starters.ts`

当前边界：

- 仍然是“最小骨架”，不是完整节点配置系统
- workspace starter 已补齐归档 / 删除、来源漂移摘要、来源 refresh、治理历史、source diff、字段级 changed fields、rebase、批量 archive / restore / refresh / rebase 和创建页深链回填，但批量删除、字段级决策规则进一步收敛仍未补齐
- ecosystem 模板仍然只是规划态，还没有真实数据源
- 统一 node catalog / starter / tool lanes 已进入共享后端 contract，但尚未和未来节点插件注册中心、plugin-backed node source 和 ecosystem starter 打通
- `runtimePolicy` / edge `mapping[]` / 更细的节点输入输出 schema 仍未结构化
- `tool` 的复杂对象 / 数组 schema 字段仍需要通过高级 JSON 编辑
- 已经支持 recent run 的静态附着与节点高亮，但还没有做到 editor 内逐事件回放、过滤翻页和实时流式联动
- 前端测试基线仍未建立

### 当前架构与体量判断

- 上一次 Git 提交 `feat: add workspace starter governance history` 与本轮实现是直接衔接的：
  - 上一次先把 workspace starter 推进到“可刷新、可追溯”的治理阶段
  - 本轮继续顺着这条线，把治理能力补到“可比较差异、可执行 rebase”，避免来源演进继续停留在人工比对和口头同步
- 再往前一轮提交 `refactor: split workflow editor forms and workbench` 仍然是这条链路的重要前置：
  - editor 主体和配置表单先拆开，才让后续 starter 治理能力可以继续旁路演进，而不是重新堆回画布壳层
- 当前基础框架已经足够继续推进主业务完整度：
  - 新建应用 -> shared workflow library -> starter -> editor -> 保存版本 -> workspace starter 治理 -> 创建页复用 -> recent runs overlay 这条链路已连续
  - workspace starter 现在已经具备 active / archived 治理、来源漂移摘要、来源 refresh、治理历史、source diff、rebase 和创建页深链回填
  - 但 `plugin-backed node source`、`publish config` 和 starter 来源 batch governance / 更细 diff 仍未接上
- 当前架构方向整体是解耦的，但还没完全拆开：
  - `workflow business tracks`、`workflow library snapshot`、`workspace starter API`、`workspace starter governance page` 已开始分层
  - 创建页和 editor 现在已经优先消费同一份后端 snapshot，而不是各自靠前端常量拼装 starter / node / tool lane
  - editor 内部也已从“单文件混排 UI + 状态 + 运行态附着”转成“顶层状态编排 + UI 子模块”
  - workspace starter 治理态也已经从模板记录扩展到“模板 + 历史事件”，没有继续把设计态资产治理塞进运行态事实表
  - 但 `plugin-backed node source`、节点插件注册中心和 ecosystem starter 仍未进入这份 contract
- 当前需要显式盯住的长文件：
  - `api/app/services/runtime.py` 当前约 1520 行，已经超过后端 1500 行偏好阈值；后续应优先拆执行规划、事件写入、节点执行策略，避免运行时继续单点膨胀
  - `web/components/workspace-starter-library.tsx` 当前约 1003 行，虽然仍低于前端 2000 行偏好阈值，但仍是治理页的最大单文件；本轮已继续拆出 source diff 面板，后续若再补 batch / bulk actions，建议继续抽离筛选栏和详情表单
  - `web/components/workflow-node-config-form/shared.ts` 约 368 行，当前是前端节点配置的共享工具汇聚点，后续若继续长出更多 schema / mapping 工具，需要及时再拆
  - `web/components/workflow-editor-workbench.tsx` 当前约 581 行，主文件已明显收缩，但若后续继续增加保存流程和 run overlay 状态，仍需继续盯住

## 推荐开发命令

### 本地源码模式

```powershell
cd api
Copy-Item .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Worker:

```powershell
uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```

### Docker 全栈模式

```powershell
cd docker
Copy-Item .env.example .env
docker compose up -d --build
```

## 当前边界

这次实现故意没有往下做太深，避免把运行时和插件系统搅在一起。

但从当前阶段开始，基础能力不应再长期脱离主业务单独深化。后续优先级需要始终围绕以下四条主业务线展开，并由基础设施为它们提供支撑：

- 应用新建编排
- 编排节点能力
- Dify 插件兼容
- API 调用开放

当前还没有实现：

- 通用表达式引擎驱动的 DAG 条件语义
- Loop 节点执行
- 外部 MCP Provider 接入
- 完整插件兼容代理生命周期
- 流式响应映射
- 回放调试面板
- 更完整的节点结构化配置抽屉
- editor 内逐事件回放、trace 过滤和实时调试联动
- 节点目录与插件注册中心打通后的动态 starter / 节点库模型
- workspace starter 的批量治理、字段级来源 diff 和更清晰的 drift 决策提示
- 前端 editor 测试基线

## 下一步建议

每轮开发结束后，这里的“下一步建议”都应同步刷新为按优先级排序的可执行计划。当前建议顺序如下：

### P0 当前最高优先级

1. 继续完善 workspace starter 治理第三阶段：在已落地批量 archive / restore / refresh / rebase、字段级来源 diff 和 drift 决策提示的基础上，补批量删除、风险提示和更清晰的跳过原因聚合，让 starter library 从“可治理”继续走向“团队级资产”。
2. 把新的 `workflow library snapshot` 继续推进到 `plugin-backed node source` 和统一 node/tool source contract：明确哪些能力来自 native node、plugin registry、compat adapter 和未来节点插件注册中心。

原因：

- `workflow library` 的共享后端 contract 已经落地，P0 的缺口自然转到“团队级治理能力补完”和“把更多真实来源接进同一份 contract”。
- workspace starter 当前已经不是单纯可保存，而是团队资产入口；批量治理、字段级 source diff 和 drift 决策提示已经补上，但如果缺少批量删除、风险提示和更清晰的批量反馈，多人复用时仍会继续堆积治理成本。
- 如果 `plugin-backed node source` 继续留在 contract 外，后续节点、插件兼容和开放调用仍会在入口层反复返工。

### P1 次高优先级

1. 围绕“编排节点”补强高频节点能力：优先继续结构化 edge `mapping[]`、`runtimePolicy.join`、节点输入输出 schema 和更细的 `tool` schema 编辑。
2. 把运行态调试继续接回节点体验，但以服务主业务编排为前提推进，例如节点状态高亮、trace 筛选、回放入口继续贴近画布。
3. 继续盯住 editor 新拆出来的共享层，避免 `workflow-node-config-form/shared.ts` 与 `workflow-editor-workbench.tsx` 再次回到单点堆叠。

原因：

- 节点能力是编排产品最直接的业务承载面，当前 edge mapping、join 和 schema 仍大量停留在高级 JSON，离真实可用还有距离。
- 运行态可调试仍重要，但应作为节点编排体验的一部分推进，而不是再次独立成为唯一主线。
- 虽然这轮已经把 editor 主组件和节点配置表单拆开，但共享层仍需继续控体量，避免拆分后很快重新长回去。

### P2 中优先级

1. 进入 “Dify 插件兼容” 主线：先补清晰的 compat adapter 边界、插件发现/安装/调用最小链路，以及外部插件到受约束 `7Flows IR` 的归一化入口。
2. 让插件化设计同时落到前后端：前端节点库按生态/能力分类展示，后端运行时与注册中心维持 `native / compat:*` 分层，不让外部协议直接渗透。

原因：

- 这是平台区别于单纯 workflow 编辑器的重要业务线，但必须建立在前两步的“创建/节点”体验之上。
- 用户已经明确要求“外部插件先压成受约束 IR”，因此兼容要做，但不能绕过架构边界。

### P3 后续优先级

1. 进入 “API 调用开放” 主线：补发布配置、workflow 绑定、原生 API 以及 OpenAI / Anthropic 风格开放接口。
2. 在上面四条主业务线站稳后，再继续推进 Loop、流式协议映射、更完整的 compat adapter 生命周期、测试基线和更严格的 IR/version 治理。
3. 当项目达到“主要功能完整、流程与数据流转稳定、界面能力基本可用”的阶段后，主动联系用户进行一次人工全链路完整测试。

原因：

- API 开放是 7Flows 从“内部编排工具”走向“可被调用能力层”的关键业务能力，但要建立在应用创建、节点组织和插件兼容已有基础之上。
- 更深的底座能力仍然重要，但后续应以服务主业务交付为节奏，而不是单独拉出一条长期基础设施主线。
- 人工全链路测试是面向整体完整度的阶段性验收动作，应放在功能闭环较完整后统一触发，而不是过早要求用户反复手测。
