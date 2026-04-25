# Agent Flow Debug Console 设计稿

日期：2026-04-25
状态：已确认方向，待进入分阶段实现

关联文档：
- [05 运行时编排与调试](docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md)
- [1flowbase agentFlow Node Detail 第一版设计稿](docs/superpowers/specs/history/2026-04-16-agentflow-node-detail-design.md)
- [Dify Debug And Preview](</home/taichu/git/dify/web/app/components/workflow/panel/debug-and-preview/index.tsx>)
- [Dify useChat](</home/taichu/git/dify/web/app/components/workflow/panel/debug-and-preview/hooks.ts>)
- [Dify Workflow Process](</home/taichu/git/dify/web/app/components/base/chat/chat/answer/workflow-process.tsx>)
- [Dify Tracing Panel](</home/taichu/git/dify/web/app/components/workflow/run/tracing-panel.tsx>)

## 1. 文档目标

本文档用于收口 `agent-flow` 的整流调试入口设计，明确：

1. 为什么 1flowbase 需要独立的 `Agent Flow Debug Console`，而不是继续扩写节点 `Inspector`。
2. 它与当前 `Node Last Run`、`Application Logs` 的职责边界。
3. 第一阶段能落到什么程度，哪些能力必须放到后续阶段。
4. 前端状态机、右侧布局和运行时合同的落点。

## 2. 现状事实

当前仓库里已经具备几块基础能力，但它们还没有形成一个整流调试闭环：

1. [AgentFlowOverlay](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx) 已有“调试整流”入口。
2. [AgentFlowCanvasFrame](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx) 当前只是直接调用 `startFlowDebugRun`，成功后只做 runtime query invalidation。
3. [runtime.ts](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/api/runtime.ts) 已支持：
   - `startNodeDebugPreview`
   - `startFlowDebugRun`
   - `fetchNodeLastRun`
4. [NodeLastRunTab](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx) 已经是节点级运行历史查看面板。
5. `Application Logs` 已支持 `Run Detail`、`resume_flow_run` 和 `complete_callback_task`，但入口仍在日志页抽屉，不在编排页内闭环。
6. 后端当前没有真正的 `cancel / stop flow run` 写接口，也没有面向编排页的 `flow debug run` 流式事件订阅接口。

这意味着：

1. 当前整流调试只有“发起一次运行”。
2. 缺少会话、输入复用、结果对话、变量检查和 trace 入口。
3. `停止运行` 如果只做前端 `AbortController`，只能中断浏览器请求，不能停止后端运行，属于假能力，不能直接交付。

## 3. 交互架构快审

- 首屏主任务：用户在画布中编辑流程，并立即验证整条流程是否按预期执行。
- `L0` 概览：编排页仍以 `Canvas + Overlay` 为主，不把运行日志列表塞回主画布。
- `L1` 聚焦：节点详情继续固定为 `Inspector`，节点历史继续由 `Node Last Run` 承接。
- `L2` 管理：全量历史运行、筛选、回溯，继续由 `Application Logs` 承接。
- `L3` 执行：整流试跑、输入上下文、对话结果、trace 和变量检查，统一收口到 `Debug Console`。
- 一致性规则：`Debug Console` 不是第三种对象详情容器，不替代 `Inspector / Drawer`；它是编排页级运行工作台。

明确建议：

1. `Debug Console` 做成编排页右侧独立停靠面板。
2. `Inspector` 保持节点 L1 详情。
3. `Application Logs` 保持历史 run 管理和审计。

## 4. 产品判断

### 4.1 不叫 Chat Panel，叫 Debug Console

原因不是命名偏好，而是职责边界：

1. 它不只是聊天输入框。
2. 它同时承载运行前输入、运行态、trace、变量、结果和调试动作。
3. 它服务的是“调试整条流程”，不是“消费最终应用”。

所以统一命名为：

- 中文：`调试控制台`
- 英文：`Agent Flow Debug Console`

### 4.2 它和 Node Last Run 是互补，不是替代

`Node Last Run` 继续回答：

1. 这个节点上一次怎么跑的。
2. 节点输入、节点输出、节点 metadata 是什么。

`Debug Console` 回答：

1. 这次整流从什么输入开始。
2. 整条流程现在跑到哪里。
3. 对话结果是什么。
4. 各节点 trace 和变量快照是什么。

边界结论：

1. 节点问题先看 `Node Last Run`。
2. 整流问题先看 `Debug Console`。
3. 需要审计历史时去 `Application Logs`。

## 5. 信息架构

### 5.1 布局

推荐桌面端布局固定为：

```text
┌──────────────────────────────────────────────┬──────────────────────┬──────────────────────┐
│ Agent Flow Canvas                             │ Node Detail Inspector │ Debug Console         │
│                                                │                      │                      │
│  [Start] ── [LLM] ── [Tool] ── [Answer]        │ Config / Last Run    │ Run Context          │
│                                                │                      │ Conversation         │
│                                                │                      │ Trace / Variables    │
└──────────────────────────────────────────────┴──────────────────────┴──────────────────────┘
```

规则：

1. `Canvas` 永远是主区域。
2. `Node Detail Inspector` 保持靠近画布，维持现有编辑心智。
3. `Debug Console` 固定在最右侧，作为全局运行工作台。
4. 两个面板都参与布局，不做覆盖式浮层。
5. 两个面板都支持独立拖宽；当两者同时打开时，`Debug Console` 最大宽度应自动收缩，避免压穿画布最小宽度。

### 5.2 面板顶部动作

第一版顶部动作保留：

1. `重新运行`
2. `清空会话`
3. `关闭`

预留但不在第一阶段交付：

1. `停止运行`

原因：

1. 当前后端没有真正的 cancel contract。
2. 纯前端停止只是中断请求，不会停止服务端 flow run。

因此第一阶段不做假 stop。第二阶段再接真实停止。

### 5.3 Tabs

固定三栏：

1. `Conversation`
2. `Trace`
3. `Variables`

不做 modal 弹窗变量查看；变量检查始终留在当前上下文。

## 6. 第一阶段范围

第一阶段目标是把“整流调试入口”做出来，而不是一次把 Dify 全部能力搬完。

### 6.1 第一阶段必须有

1. 打开 / 关闭 `Debug Console`
2. 右侧独立可拖宽面板
3. `Run Context` 面板
4. `Conversation` tab
5. `Trace` tab
6. `Variables` tab
7. 发送输入触发整流运行
8. `重新运行`
9. `清空会话`
10. 运行完成后刷新节点 `Last Run`
11. 点击 trace item 定位画布节点
12. 点击画布节点时按节点过滤 trace

### 6.2 第一阶段明确不做

1. 语音输入
2. 文件上传
3. suggested questions
4. sibling message branch
5. 点赞、标注
6. human input form 内嵌提交
7. callback 响应表单内嵌提交
8. 真正的 stop / cancel
9. 实时流式 trace

### 6.3 第一阶段的能力边界

第一阶段只承诺：

1. 发起整流运行
2. 展示一次运行的最终快照，或等待态快照
3. 在编排页内统一查看消息、trace 和变量

第一阶段不承诺 Dify 那种边跑边刷节点过程。那部分必须进入第二阶段。

## 7. Run Context 设计

`Run Context` 是第一块，不叫“开始节点变量表单”，因为它不只是一组输入框。

```text
Run Context
────────────────────────
Inputs
  query            [________________]
  language         [中文 v]
  enable_search    [x]

Session
  Last inputs      来自上一次调试
  Run mode         draft
  Draft            draft-1
```

它包含四层信息：

1. `Inputs`
   - 从 `Start` 节点输出定义派生
   - 第一阶段只渲染现有可表达类型：`string / number / boolean / array / json`
2. `Session`
   - 上次输入是否复用
   - 当前本地会话 id
3. `Environment`
   - 当前固定显示 `draft`
   - 预留 `published / local debug`
4. `Run Metadata`
   - 当前应用 id
   - 当前 draft id

状态规则：

1. 第一次打开时自动读取本地上次输入。
2. 发送成功后保存本次输入，作为下次默认值。
3. 第一阶段开始运行后不强制自动折叠；保留用户自己控制展开/收起，避免隐藏关键上下文。

## 8. Conversation 设计

### 8.1 消息模型

第一阶段的 `Conversation` 不是多轮真正会话协议，而是“本次调试的消息时间线”。

固定只支持三类消息：

1. `user`
2. `assistant`
3. `system`

`assistant` 消息块包含：

1. 当前运行摘要
2. 精简 trace summary
3. 最终输出内容
4. 操作条：`复制输出`、`查看 Trace`、`查看 Raw Output`

### 8.2 发送与输入

交互固定为：

1. `Enter` 发送
2. `Shift + Enter` 换行
3. 处理中文输入法 composing，避免误发送

### 8.3 输出提取规则

第一阶段 `assistant` 主输出按以下优先级提取：

1. `flow_run.output_payload.answer`
2. 最后一个 `node_type = answer` 的 `node_run.output_payload.answer`
3. `flow_run.output_payload`
4. 如果以上都没有，则显示“本次运行没有生成可展示的最终输出”

原因：

1. 当前 runtime detail 已经稳定返回 `flow_run`、`node_runs`、`events`。
2. 第一阶段先复用现有合同，不引入额外后端字段。

## 9. Trace 设计

### 9.1 第一阶段 Trace 结构

第一阶段只做线性列表，不做 Dify 那种复杂树和 parallel group。

```text
Trace
────────────────────────
✓ Start
  duration: 12ms

✓ LLM
  duration: 1.4s
  status: succeeded

! Human Input
  status: waiting_human
```

每个条目最少展示：

1. 节点别名
2. 节点类型
3. 状态
4. 开始时间 / 结束时间
5. duration
6. 是否有 error

可展开内容：

1. input payload
2. output payload
3. metrics payload
4. error payload

### 9.2 联动画布

交互固定：

1. 点击 trace item，画布定位到对应节点。
2. 如果节点详情未打开，不强制打开节点 `Inspector`。
3. 如果用户已选中某个节点，`Trace` tab 顶部显示过滤状态，只展示该节点相关 run 和事件。

## 10. Variables 设计

变量按作用域分组，不展示成一张平 JSON。

```text
Variables
────────────────────────
Input Variables
  node-start.query        "请总结退款政策"

Node Outputs
  node-llm.text           "……"

Conversation / Session
  flow_run.status         "succeeded"
  checkpoint.count        0

Environment
  run_mode                "debug_flow_run"
  draft_id                "draft-1"
```

第一阶段的变量来源：

1. `flow_run.input_payload`
2. `flow_run.output_payload`
3. `node_runs[*].output_payload`
4. `checkpoints[*].variable_snapshot`
5. 运行元数据

## 11. 前端状态机

新增独立 hook：

```text
web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts
```

职责固定为：

1. 管理当前调试面板是否有活跃 session
2. 管理本地消息时间线
3. 管理当前 `flowRunId`
4. 管理 `idle / submitting / succeeded / failed / waiting_human / waiting_callback`
5. 管理 `Run Context` 表单值及本地复用
6. 把 `ApplicationRunDetail` 映射为：
   - conversation message
   - trace view model
   - variables view model
7. 运行完成后 invalidation 相关 runtime queries

第一阶段不把这套状态塞进 `AgentFlowCanvasFrame` 组件本体，也不塞回 `panel-slice` 全局 store。

理由：

1. `panel-slice` 只负责编辑器壳层真值。
2. 调试会话属于 feature 级组合状态，更适合留在 hook 内部。

`panel-slice` 只新增壳层状态：

1. `debugConsoleOpen`
2. `debugConsoleWidth`
3. `debugConsoleActiveTab`

## 12. 运行时合同判断

### 12.1 第一阶段直接复用现有后端

当前后端已经能返回：

1. `flow_run`
2. `node_runs`
3. `checkpoints`
4. `callback_tasks`
5. `events`

所以第一阶段不需要新后端接口，也不需要先改数据库。

### 12.2 第二阶段必须新增的合同

如果要交付下面两个能力，就必须改后端：

1. `停止运行`
2. 实时 trace / 运行中节点状态

原因：

1. 当前 `start_flow_debug_run` 是同步返回 detail，不是先返回 run id 再异步推进。
2. 当前没有 `cancel flow run` 写接口。
3. 前端无法只靠 `AbortController` 真正停止服务端执行。

因此第二阶段的目标应是：

1. `start_flow_debug_run` 改为快速返回 `running` 状态和 `run_id`
2. 前端轮询 `get run detail`
3. 新增 `cancel flow run`
4. 运行时执行器支持取消检查点

## 13. 文件落点

推荐新增目录：

```text
web/app/src/features/agent-flow/components/debug-console/
  AgentFlowDebugConsole.tsx
  DebugConsoleHeader.tsx
  DebugConsoleTabs.tsx
  RunContextPanel.tsx
  conversation/
    DebugConversationPane.tsx
    DebugComposer.tsx
    DebugAssistantMessage.tsx
    DebugTraceSummary.tsx
  trace/
    DebugTracePane.tsx
    DebugTraceList.tsx
  variables/
    DebugVariablesPane.tsx

web/app/src/features/agent-flow/hooks/runtime/
  useAgentFlowDebugSession.ts

web/app/src/features/agent-flow/lib/debug-console/
  run-detail-mapper.ts
  variable-groups.ts
  trace-filters.ts
```

规则：

1. UI 组件留在 `components/debug-console`
2. 会话逻辑留在 `hooks/runtime`
3. 纯 mapper / view model 留在 `lib/debug-console`
4. 不把 `Application Logs` 的 UI 组件反向搬进 `agent-flow`

## 14. 分阶段路线

### 阶段一：Console Foundation

目标：

1. 把右侧 `Debug Console` 打开。
2. 把 `Run Context / Conversation / Trace / Variables` 跑通。
3. 用现有 runtime detail 生成调试结果快照。

### 阶段二：Live Runtime

目标：

1. 真正支持 `停止运行`
2. 整流运行异步化
3. 轮询或流式刷新 trace
4. 节点 running 状态实时同步画布

### 阶段三：Advanced Debug

目标：

1. human input form 内嵌提交
2. callback 回填内嵌提交
3. suggested questions
4. 文件上传
5. 更复杂的 parallel / loop / retry trace

## 15. 结论

这轮设计的核心不是抄 Dify 的聊天外壳，而是吸收它的产品闭环：

1. 整流运行要有固定入口。
2. 输入、结果、trace、变量必须在一个上下文里闭环。
3. `Node Last Run` 和 `Debug Console` 分工明确。
4. 第一阶段先用现有后端把快照式调试工作台落稳。
5. 第二阶段再把真实 stop 和 live trace 接进来。
