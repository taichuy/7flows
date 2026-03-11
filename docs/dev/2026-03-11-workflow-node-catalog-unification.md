# Workflow 节点目录统一与 Starter / Palette 收敛

## 背景

2026-03-11 早上的上一条 Git 提交 `feat: add workflow creation starter wizard` 已经把“应用新建编排”的入口补了出来：

- 新增 `/workflows/new`
- 新增 starter template 创建向导
- 创建后直接进入 editor

这条提交和当前主业务优先级是衔接的，但只完成了入口层的一半。继续检查代码后发现，前端内部已经出现一条新的小裂缝：

- `web/lib/workflow-starters.ts` 单独维护 starter 里的节点定义
- `web/lib/workflow-editor.ts` 单独维护 editor palette 的节点定义

两边都在描述同一批节点能力，却分别维护：

- 节点类型
- 默认名称
- 默认位置
- 描述文案

如果继续在这两套静态常量上迭代，后续只要补：

- 节点库
- 生态分类
- 节点插件化
- workspace 级 starter template

就会反复出现“改 starter 忘记改 palette”或“UI 和设计态各长一套模型”的问题。

## 目标

本轮优先解决 `runtime-foundation` 里已经明确的 P0 问题之一：

1. 把 starter template、节点默认信息和 editor palette 收敛到同一份节点能力目录
2. 让“应用新建编排”和“编排节点能力”开始共享同一条能力描述边界
3. 先做到前端内部的统一收口，再为后续 plugin registry / 节点插件化留出稳定落点

本轮不尝试直接完成：

- 动态节点插件注册
- workspace 级 starter/template 管理
- 后端节点注册中心

## 实现

### 1. 新增统一 node catalog

新增：

- `web/lib/workflow-node-catalog.ts`

当前目录统一描述了：

- `trigger` / `llm_agent` / `tool` / `mcp_query` / `condition` / `router` / `output`
- 节点标签、描述、业务主线归属、生态标签
- palette 是否可创建
- 默认画布位置
- 默认名称与默认 config

这让 starter 和 palette 不再分别维护同一组节点元数据。

### 2. Starter 改为基于 node catalog 生成

更新：

- `web/lib/workflow-starters.ts`

现在 starter template 不再手写“节点怎么长”，而是：

- 先声明 starter blueprint
- blueprint 只描述“有哪些节点、怎么连、哪些节点有定制 config”
- 节点实体统一通过 `buildCatalogNodeDefinition()` 生成

同时 starter 卡片与摘要面板会展示 starter 内包含的节点标签，强化“这是从统一节点目录拼出来的 workflow 草稿”这件事。

### 3. Editor palette 改为直接消费统一目录

更新：

- `web/lib/workflow-editor.ts`
- `web/components/workflow-editor-workbench.tsx`

当前 editor palette 已直接从 node catalog 读取：

- 可创建节点列表
- 节点默认名称
- 默认位置
- 描述文案
- 业务主线与生态标签

这样创建向导和编辑器终于开始共享同一个“节点能力入口”。

### 4. 当前边界被重新拉清

这轮没有把“统一目录”误写成“动态插件系统已完成”。

当前事实是：

- 已统一到前端静态 node catalog
- 还没有接入后端 plugin registry
- 还没有做 workspace 级模板治理
- 还没有形成真正动态的节点插件注册链路

也就是说，这次是先把前端内部模型裂缝补上，而不是假装“一切皆插件”已经落地。

## 架构判断

### 1. 上一次 Git 提交是否衔接

是衔接的。

上一条提交把“新建 workflow”入口补出来了，本轮则把这个入口和 editor 节点入口接到了同一份节点目录上。两轮合起来，才算真正开始落 P0 主线，而不是只补了一个页面。

### 2. 基础框架是否设计好

当前可以判断为“已经具备继续推进主业务的基础框架”，但还不是最终形态。

已经比较稳的部分：

- 后端 `workflow definition` 校验与版本快照
- `runs / node_runs / run_events` 作为统一运行态事实
- editor 保存链路直接回写 definition
- recent runs / trace overlay 不另起事实协议

仍需继续盯住的部分：

- `api/app/services/runtime.py` 后续仍有拆层压力
- node catalog 目前是前端静态目录，尚未和动态插件/模板系统合流

### 3. 架构是否解耦分离

当前整体是解耦方向正确、但仍需继续收口的状态。

正向信号：

- workflow 创建页、starter 定义、editor 画布仍然是独立落点
- starter 与 palette 现在开始共享统一目录，而不是继续双写
- 运行态追溯仍然以后端事实模型为准，没有让前端 UI 成为事实来源

仍有待继续收敛的点：

- node catalog 和 tool catalog 还是两层不同来源：前者是前端静态目录，后者是后端持久化目录
- 动态节点插件如何进入目录，当前还没有正式协议

### 4. 主业务是否可以持续推进

可以，而且这轮之后比上一轮更稳。

当前已经形成的连续路径：

1. 进入 `/workflows/new`
2. 选择 starter template
3. 创建 workflow 草稿
4. 进入 editor
5. 从统一 node catalog 继续加节点
6. 保存回 workflow version
7. 通过 recent runs / trace overlay 查看运行态

这意味着“应用新建编排”已经不只是一个新页面，而是和“编排节点能力”共享了同一条演进路径。

## 影响范围

- `web/lib/workflow-node-catalog.ts`
- `web/lib/workflow-starters.ts`
- `web/lib/workflow-editor.ts`
- `web/components/workflow-create-wizard.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/app/globals.css`
- `docs/dev/runtime-foundation.md`

## 验证

已执行：

```powershell
cd web
pnpm lint
pnpm build
```

结果：

- `pnpm lint` 通过
- `pnpm build` 通过

本轮未修改后端源码，因此没有新增后端测试执行。

## 当前边界

- node catalog 当前仍是前端静态目录，不是动态节点注册中心
- starter template 当前仍是仓库内置定义，不是 workspace 级模板系统
- `llm_agent` / `output` / edge `mapping[]` 等高频配置仍待继续结构化
- tool catalog 与 node catalog 还没有形成统一的“节点能力来源分层”

## 下一步

1. 优先把统一 node catalog 继续推进到“静态 native node + 动态 plugin node”的分层模型，让节点库和工具目录有一致的生态入口。
2. 继续补高频节点的结构化配置，优先 `llm_agent`、`output`、edge `mapping[]` 和 join 策略。
3. 在节点入口模型稳定后，再继续推进 Dify compat adapter 的动态接入和更完整的 API 发布链路。
