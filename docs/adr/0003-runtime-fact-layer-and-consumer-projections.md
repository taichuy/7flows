# ADR-0003：运行基础事实层与统一消费投影

- 状态：Accepted
- 日期：2026-03-20

## 背景

7Flows 现在同时服务三类场景：人、人 + AI 协作、AI 自治。随着运行时、发布接口、MCP 和前端诊断入口持续扩张，如果不提前固定“哪一层是真相、哪一层只是投影”，很容易出现以下漂移：

1. UI 为了方便展示，缓存或拼出一套只对页面成立的运行状态。
2. 发布接口为了兼容协议，长期持有一套脱离 runtime 主链的 detail / status 语义。
3. MCP 或 AI 自治入口为了读取方便，直接绕过统一授权和共享投影，形成旁路观察链。

一旦这三种入口各自维护状态，人类看到的结果、AI 读取到的结果和协议接口返回的结果就会开始分叉。

## 决策

1. `runs`、`node_runs`、`run_events`、`run_artifacts` 构成 7Flows 的运行基础事实层。
2. `runs` 承担 workflow 级状态、入口来源、版本绑定、checkpoint 与最终结果摘要。
3. `node_runs` 承担节点级状态、phase、waiting reason、execution class、重试与节点输出摘要。
4. `run_events` 承担 append-only timeline、streaming 和关键状态变迁，不承载大体量原始载荷。
5. `run_artifacts` 承担文件、tool raw output、AI prompt/response 快照、大 JSON / 长文本与证据引用，不承载主状态裁决。
6. `tool_call_records`、`ai_call_records` 等侧边事实继续通过 `run_id / node_run_id` 挂回同一条主事实链。
7. `run_snapshot`、execution view、evidence view、`authorized_context`、published invocation detail 等都定义为共享投影，只能从运行基础事实层派生。
8. MCP、发布接口和 UI 都只能消费事实层及其共享投影，不能各自维护第二套运行真相。

## 后果

- 人类界面、人 + AI 协作入口和 AI 自治入口将基于同一事实链观察与消费运行结果。
- 协议适配、前端交互和 operator 体验可以继续演进，但它们的差异主要落在投影层，而不是落在新建事实层。
- 后续如果出现新的消费入口，默认先考虑复用共享投影或新增共享投影，而不是另起一套状态存储。
- 有利于开发，统一事实，那么理论上来说人看到数据和ai看到数据，正在开发中代码编写单元测试均均属于数据一致，有利于维护项目开发中和运行中数据和状态一致性

## 后续动作

- 继续把 `run_snapshot`、execution view、evidence view、published invocation detail 与 `authorized_context` 的共享字段往统一 serializer / builder 收口。
- 审查新增的 UI / API / MCP 入口时，默认检查它是否仍然消费同一事实层。
- 如未来新增更多 runtime facts 或 sidecar facts，继续通过 `run_id / node_run_id` 挂回主链，不引入旁路真相。
