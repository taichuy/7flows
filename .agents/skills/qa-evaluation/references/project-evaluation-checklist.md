# Project Evaluation Checklist

## Context First

- 阅读 `.memory/AGENTS.md`
- 阅读 `.memory/user-memory.md`
- 阅读项目记忆和反馈记忆中与当前项目相关的内容
- 阅读与评估范围直接相关的 spec、模块 README、设计稿和近期 QA 记录
- 如果评估范围命中后端，优先对齐最近的后端项目记忆，例如接口内核、插件边界、质量规范和实施计划阶段记忆

如果项目记忆或反馈记忆为空，应在报告里明确说明上下文缺口。

## Coverage Matrix

| 维度 | 要检查什么 | 典型证据 |
| --- | --- | --- |
| UI 一致性 | 壳层、画布、详情层、状态表达是否仍属于同一产品系统 | 截图、页面行为、视觉对照 |
| 页面与流程逻辑 | 页面边界、入口设计、主路径、下钻模型是否成立 | 手动流程、结构对照、页面行为 |
| 响应式与降级 | 小屏策略是否诚实，是否按优先级重排而不是硬堆桌面结构 | 小屏截图、响应式断点验证 |
| API 契约 | 请求输入是否清楚、短、平、单动作，调用方是否仍成立 | 接口定义、调用样例、日志 |
| 状态与数据一致性 | 状态集合、流转、展示和存储是否一致 | 状态字段、页面结果、日志、数据库样例 |
| 架构边界 | 核心规则、适配层、状态入口、插件边界是否被污染 | 代码结构、写路径、接口边界 |
| 后端三平面 | `public / control / runtime` 是否仍分离，接口和资源是否按正确平面归属 | 路由结构、service 调用链、OpenAPI |
| Resource Kernel / Dynamic Modeling | `resource kernel` 是否仍由宿主托管，`dynamic modeling` 是否仍是元数据系统而不是 runtime 数据本身 | registry、descriptor、模型发布流程、runtime engine |
| 插件消费分类 | `host-extension / runtime extension / capability plugin` 是否仍按各自注册权、绑定方式和消费方式工作 | plugin-framework、runtime-core、分配/绑定逻辑、provider/node/datasource/publish 配置 |
| 工程质量门禁 | `route / service / repository / domain / mapper` 是否仍分层，`storage-pg` 是否保持 repository / mapper 拆分，验证命令和测试目录规则是否被执行 | 代码结构、storage-pg 目录、测试文件、验证脚本、命令输出 |
| 测试缺口 | 当前项目最关键的行为是否缺少自动化或手动验证覆盖 | 测试文件、命令结果、缺口清单 |

## Output Rules

- 默认只出评估和报告，不直接进入修复
- Findings 按严重度从高到低排序
- 不要把“代码看起来合理”当成通过证据
- 不能验证的项要单独列入 `未覆盖项 / 风险`
- 命中后端评估时，如果没有核对最新 `.memory/project-memory`，应在报告中明确说明结论可能存在旧口径偏差

## Escalation

- 前端结构问题联动 `frontend-logic-design`
- 前端实现一致性问题联动 `frontend-development`
- 后端契约、状态和边界问题联动 `backend-development`
