# 1flowbase 模块讨论目录

日期：2026-04-10
状态：进行中

## 当前规则

- 先整理功能清单，再按模块逐项讨论。
- 根 `README` 统一记录当前模块序列的总览状态。
- 每个子模块在各自目录的 `README.md` 中沉淀已确认结论与待讨论项。
- 模块设计讨论内容统一以本目录及子模块 `README.md` 为主，`.memory` 仅保留运行摘要、历史记忆和用户偏好。
- 后续模块推进以代码事实为主，不再把 `2026-04-10` 首轮模块讨论稿统一视为当前实现真相。
- 当前建议开发顺序：`01/02` 基础能力 -> `03` Flow 前置容器 -> `04` Flow Studio -> `07` 数据建模与 Runtime CRUD -> `05` 运行时 -> `06B` 发布网关 -> `08` 插件体系。
- `06A` 内部 API 文档已形成独立后台专题，继续沿设置区与 OpenAPI 文档链路迭代。
- 本文件是模块讨论总览入口。

## 已整理讨论来源

- [2026-04-10-product-design.md](../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../2026-04-10-p1-architecture.md)
- [2026-04-10-orchestration-design-draft.md](../2026-04-10-orchestration-design-draft.md)

## 当前总体进度

- 模块拆分：已完成
- 子模块目录初始化：已完成首轮
- 已讨论文档回填：已完成首轮，但需要按代码事实重排状态
- 细化讨论：进行中
- 当前重点：重写 `03`、拆分 `06`、改名并重写 `07`、按“规则已确认 / 能力未完备”口径重写 `08`

## 当前模块状态语义

| 状态 | 含义 |
| --- | --- |
| `已实现基线` | 当前已有代码与页面 / API / 数据结构落地，可作为后续实现和讨论的当前事实入口 |
| `部分实现 / 口径漂移` | 早期讨论结论仍有价值，但模块名、边界或实现范围已被后续治理改写 |
| `已确认待开发` | 模块边界已收敛，后续会按该模块推进开发，但当前尚无对应完整实现 |
| `规则已确认，能力未完备` | 约束、边界与信任模型已明确，代码里只有基础骨架或部分约束，没有完整产品能力 |
| `未来设计` | 当前仍是未来能力设计，不应被当作已落地实现或当前代码真相 |

## 当前模块总览状态

| 模块 | 状态 | 完成情况 | 详情 |
| --- | --- | --- | --- |
| 01 用户登录与团队接入 | `已实现基线` | 登录、会话、个人资料、工作空间配置与工作空间切换已落地；后续应统一沿 `workspace` 语义继续扩展 | [README](./01-user-auth-and-team/README.md) |
| 02 权限与资源授权 | `部分实现 / 口径漂移` | 权限目录、默认角色与资源动作模型已经存在，但当前前后端实际消费面仍明显小于最早期全量资源清单 | [README](./02-access-control/README.md) |
| 03 Flow 前置容器模块 | `已确认待开发` | Application 将作为 Flow 的一等宿主容器；本模块只保留工作台应用列表/创建/选择、应用根路由、概览页与进入编排主入口 | [README](./03-workspace-and-application/README.md) |
| 04 agentFlow 编排与版本管理 | `未来设计` | Flow Studio、图结构、变量绑定、Draft / Version / Publish 分层仍以设计结论为主，尚未形成当前代码实现 | [README](./04-chatflow-studio/README.md) |
| 05 运行时编排与调试 | `未来设计` | `Flow Run / Node Run / checkpoint / callback` 等编排运行时仍未形成实现闭环，当前 `runtime-core` 主要承载动态模型 CRUD runtime | [README](./05-runtime-orchestration/README.md) |
| 06A 内部 API 文档 | `已实现基线` | 设置区内部 API 文档已切换为受权限保护的 catalog + 单接口按需详情链路，继续沿最新设计稿演进 | [README](./06a-internal-api-docs/README.md) |
| 06B 发布网关 | `未来设计` | 发布协议、对外兼容接口、`Publish Endpoint` 与线上流量切换仍是未来实现专题 | [README](./06b-publish-gateway/README.md) |
| 07 数据建模、作用域与 Runtime CRUD | `已实现基线` | 后台数据建模定义、`workspace/system` 作用域、物理表实时生效、runtime CRUD 与 metadata 健康治理已形成当前实现主线 | [README](./07-state-and-memory/README.md) |
| 08 插件体系 | `规则已确认，能力未完备` | 来源分级、消费边界、`runtime extension / capability plugin` 规则与 `plugin-runner` 宿主骨架已明确，但安装、注册、清单和 RPC 生命周期尚未闭环 | [README](./08-plugin-framework/README.md) |
