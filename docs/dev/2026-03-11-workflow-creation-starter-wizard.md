# Workflow 新建向导与 Starter Template

## 背景

2026-03-11 早上的上一条 Git 提交只完成了“优先级与主业务线对齐”：

- 明确后续开发不能继续只围绕底座能力单线深入
- 把主线重排为：
  - 应用新建编排
  - 编排节点能力
  - Dify 插件兼容
  - API 调用开放

但代码层当时还没有真正衔接这条新优先级。项目虽然已经有：

- workflow 设计态 CRUD
- 最小 editor 画布
- recent run overlay

却仍然缺少“从创建一个应用开始进入编排”的入口，首页还停留在“请先通过 API 创建草稿”的状态。这会让主业务入口与当前优先级产生明显断层。

## 目标

本轮先补齐 P0 第一项的最小闭环，而不是继续扩散到更多基础抽象：

1. 提供真实可用的 workflow 新建入口
2. 提供 starter template，让用户不是从空白 API 请求开始
3. 创建成功后直接进入 editor，和现有版本链路衔接
4. 保持创建逻辑、starter 定义和 editor 本体解耦，避免再次把首页堆成临时控制台

## 实现

### 1. 新增独立新建路由

新增：

- `web/app/workflows/new/page.tsx`

职责：

- 并行读取现有 workflow 列表与插件工具目录数量
- 把这些上下文传给创建向导组件
- 不把创建逻辑塞回首页或 editor 页面

### 2. 把 starter 定义独立为单独 lib

新增：

- `web/lib/workflow-starters.ts`

当前内置 3 个 starter：

- `blank`
  - 最小可运行 `trigger -> output`
- `agent`
  - `trigger -> llm_agent -> output`
- `tooling`
  - `trigger -> tool -> output`

这样做的目的不是把 starter 模板做复杂，而是先把“创建应用”这件事从纯 UI 行为提升为可扩展的显式定义层。后续如果要接：

- 插件化节点库
- 生态分类 starter
- workspace 级模板
- 发布场景模板

都可以继续沿着这层扩展，而不用再从组件里反向抠逻辑。

### 3. 新增独立创建向导组件

新增：

- `web/components/workflow-create-wizard.tsx`

当前支持：

- 选择 starter template
- 输入 workflow 名称
- 调用 `POST /api/workflows`
- 创建成功后直接跳转到 `/workflows/{workflowId}`
- 展示已有 workflow 草稿，便于继续编辑

这里有意保持“最小向导”边界：

- 不引入多步 wizard 状态机
- 不假装已有完整应用元数据系统
- 不做复杂表单 schema

目标是先打通“创建 -> 进入编排”的主业务入口。

### 4. 首页与 editor 收口到同一入口

更新：

- `web/app/page.tsx`
- `web/components/workflow-editor-workbench.tsx`

现在：

- 首页 editor 卡片提供“新建 workflow”入口
- 空状态不再要求用户先手工调 API
- editor 页也可直接跳回新建向导

这样首页、创建页、编辑页之间终于形成了更连贯的导航闭环。

## 架构观察

这轮顺手复核了当前实现衔接与分层状态，结论如下：

### 1. 与上一条 Git 提交的衔接

已衔接，但上一条提交本身只完成了一半：

- 文档层已把优先级切到主业务
- 本轮才把第一条 P0 真正落到代码

因此这次开发本质上是在把“优先级声明”转成“可操作入口”。

### 2. 基础框架是否已设计好

当前可以认为“足够支撑继续推进”，但还不是稳定终局：

- 后端设计态 CRUD、版本快照、运行态追溯、最小执行器都已形成基础骨架
- 前端已有 editor、inspector、run overlay、tool catalog 接入
- 已经具备继续推进四条主业务线的最低支撑面

不足在于：

- `api/app/services/runtime.py` 体量已接近偏好阈值，MVP 阶段还能承载，但后续若继续叠加 loop / 发布 / compat 生命周期，必须继续拆层
- editor 的节点创建入口还不是“插件化节点库”，目前只是内置 palette + starter

### 3. 架构之间是否解耦分离

当前整体方向是对的，且比前几轮更清晰：

- workflow 创建页、starter 定义、editor 画布已拆成三个落点
- editor 与 run overlay 之间保持了独立组件边界
- 运行态事实仍然复用 `runs` / `node_runs` / `run_events`，没有为前端再造协议

仍需继续警惕的地方：

- runtime service 继续膨胀的风险
- 节点库与 starter 还未统一收敛到“插件化能力描述”这一层

### 4. 主业务是否可以持续推进

可以，并且这轮后比之前更适合持续推进。

当前已经具备的连续路径：

1. 新建 workflow 草稿
2. 进入 editor
3. 配置节点与连线
4. 保存回 workflow version
5. 通过 recent runs / trace overlay 回看执行结果

这意味着“应用新建编排”这条主线已经不再停留在文档和优先级列表里，而是开始真正可走通。

## 影响范围

- `web/app/workflows/new/page.tsx`
- `web/components/workflow-create-wizard.tsx`
- `web/lib/workflow-starters.ts`
- `web/app/page.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/app/globals.css`
- `docs/dev/runtime-foundation.md`

## 验证

### 前端

已执行：

```powershell
cd web
pnpm lint
pnpm build
```

结果：

- `pnpm lint` 通过
- `pnpm build` 通过
- 新增路由 `/workflows/new`

### 后端

本轮没有修改后端源码。

尝试执行：

```powershell
cd api
uv run pytest tests/test_workflow_routes.py
python -m pytest tests/test_workflow_routes.py
py -m pytest tests/test_workflow_routes.py
```

结果：

- 当前环境不存在 `uv` 命令
- `python` 命令不可用
- `py` 可用，但当前解释器环境未安装 `pytest`

因此本轮未能在本机完成后端自动化测试，只能确认前端构建链路通过。

## 当前边界

- starter template 仍然是内置静态定义，还不是 workspace 级可管理模板系统
- starter 与 editor palette 还没有统一为“插件化节点能力描述”
- 新建向导目前只覆盖最小草稿创建，不包含发布配置、凭证、权限和节点 schema 初始化
- 后端运行时拆层仍需要继续推进，避免 `runtime.py` 后续越堆越重

## 下一步

1. 优先把 starter template、节点 palette、工具目录继续收敛到插件化心智，明确“一切皆插件”的前端交互与后端描述边界。
2. 继续围绕编排节点能力补 `llm_agent`、`output`、edge `mapping[]`、join 策略和输入输出配置的结构化表单。
3. 在主业务入口已打通后，再把更多运行态调试能力贴近画布节点体验，而不是重新回到独立控制台思路。
