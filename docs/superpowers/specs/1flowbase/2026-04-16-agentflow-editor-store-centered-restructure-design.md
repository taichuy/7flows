# 1Flowbase agentFlow Editor Store-Centered 重构设计稿

日期：2026-04-16  
状态：已完成初稿，待用户审阅

关联文档：
- [2026-04-15-agentflow-editor-design.md](./2026-04-15-agentflow-editor-design.md)
- [modules/04-chatflow-studio/README.md](./modules/04-chatflow-studio/README.md)
- [2026-04-10-orchestration-design-draft.md](./2026-04-10-orchestration-design-draft.md)
- `../dify/web/app/components/workflow/index.tsx`
- `../dify/web/app/components/workflow/hooks/use-nodes-interactions.ts`
- `../dify/web/app/components/workflow/hooks/use-workflow.ts`
- `../dify/web/app/components/workflow/custom-edge.tsx`

## 1. 文档目标

本文档不再重新讨论第一版 editor 的产品范围，而是解决 `web/app/src/features/agent-flow` 当前前端实现边界分散的问题。

本稿要明确：

- 为什么当前 `agent-flow` editor 需要从 shell-centric 改为 store-centric
- 参考 Dify 后，1Flowbase 应该收口成什么样的前端架构
- `editor / nodes / inspector / hooks / document` 的目标目录边界
- document 真值、UI 运行态、interaction scratch state 分别放在哪里
- 后续要补齐的 Dify 式交互能力应挂到哪些层
- 如何在不推翻当前页面产品决策和 API 合同的前提下完成迁移

## 2. 继承的既有产品决策

本稿默认继承 [2026-04-15-agentflow-editor-design.md](./2026-04-15-agentflow-editor-design.md) 中已经确认的产品结论，不在本轮推翻：

- 编排页仍挂在 `03` 应用壳层内
- editor 顶部 overlay、右侧 Inspector、Issues 抽屉、历史抽屉继续保留
- 第一版节点范围、默认三节点空态、容器子画布、移动端降级策略保持不变
- `30` 秒自动保存、只让逻辑变更进入历史、历史保留 `30` 条的业务规则保持不变
- 后端仍以 `Draft + FlowVersion` 持久化 `Authoring Document`
- document schema 继续以 `@1flowbase/flow-schema` 为唯一真值，不引入第二套编辑器专用持久化格式

本轮变化只发生在前端实现架构，不改变以上产品面决策。

## 3. 当前实现存在的问题

当前代码已经能工作，但属于第一版可用实现，还没有形成可持续扩展的 editor 内核。

### 3.1 Shell 持有过多编辑器职责

[AgentFlowEditorShell.tsx](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx) 同时承担：

- 草稿文档状态
- 最近已保存快照
- autosave 触发
- restore version
- container path
- node selection
- issue 定位
- inspector section 聚焦
- drawer 开关

结果：

- editor 页面壳层和 editor 运行时状态机耦在一起
- 任何一个交互扩展，最终都要回到 `Shell` 再穿透 props
- 后续补齐 Dify 式交互时，`Shell` 会继续膨胀

### 3.2 Canvas 组件直接承担 graph 写操作

[AgentFlowCanvas.tsx](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx) 里直接做：

- node position apply
- viewport apply
- edge reconnect
- 插入节点
- picker state

结果：

- 画布组件既是视图层，又是 graph command 执行层
- `@xyflow/react` 事件和 document 变换逻辑混写
- 后续接入拖线校验、边中插入、批量选择命令时会快速失控

### 3.3 node-registry 同时承担 adapter、view model 和交互桥

[node-registry.tsx](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/nodes/node-registry.tsx) 目前同时做：

- `FlowAuthoringDocument -> xyflow nodes/edges` 映射
- custom node / custom edge 注册
- 节点卡片 data 协议定义
- edge add 按钮行为转发
- 用 `window.dispatchEvent('agent-flow-insert-node')` 作为交互桥

结果：

- adapter 层和交互层没有分开
- 使用全局事件桥而不是稳定 store / hook 边界
- 组件树内交互关系不透明，后续维护成本高

### 3.4 Inspector 直接做 document mutation

[NodeInspector.tsx](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx) 直接持有：

- field read
- field write
- binding editor 分发
- selected node definition 选择
- section open state

结果：

- Inspector UI 和 node editing command 耦在一起
- 后续如果节点面板需要支持更多操作，例如删除分支、切换 handle、联动 edge 结构，`Inspector` 会变成第二个编辑器内核

### 3.5 document factory 与 graph transforms 混放

[default-agent-flow-document.ts](/home/taichu/git/1flowbase/web/app/src/features/agent-flow/lib/default-agent-flow-document.ts) 同时放了：

- 默认文档工厂
- 节点工厂
- id 生成
- 插入算法

结果：

- “初始化默认文档”和“日常编辑命令”没有分层
- 后续新增 `connect / reconnect / delete / duplicate / edge insert / container copy` 时，这个文件会迅速失控

## 4. 已选方案

本轮采用用户确认的方案：`Dify 式 store / interaction hooks 中心化重构`。

### 4.1 为什么选这个方案

相比“只做 UI 分层”，该方案能真正解决 graph mutation 分散的问题。  
相比“完整照搬 Dify 的实现细节”，该方案保留 1Flowbase 现有 document schema、页面骨架和 API 合同，不会把当前 feature 强行改造成半套 Dify。

### 4.2 方案本质

把 editor 前端重构成 4 层稳定边界：

1. `editor store`
2. `document transforms`
3. `interaction hooks`
4. `UI adapters + presentational components`

其中：

- store 保存 editor 运行态和当前 working document
- transforms 只负责纯 document 变换
- hooks 负责把 UI 事件翻译成 command
- components 只做渲染和事件触发

## 5. 非目标

本稿不引入以下能力：

- 新的后端 editor API
- 新的 document schema
- 运行时 trace、Node Run、完整 debug 面板
- 多人协同冲突处理
- 为了重构而重构应用壳层
- 在第一轮就把所有节点 UI 全量重做一遍

## 6. 设计原则

### 6.1 `FlowAuthoringDocument` 仍是唯一编辑真值

不新增第二套“画布内部状态文档”。  
当前文档结构已经足以表达 graph、editor viewport、container scope 和 binding 真值，重构只改变前端如何组织对它的读写。

### 6.2 所有 graph 改动都必须是显式 command

后续所有会修改 document 的操作都必须落到可命名的 transform：

- `insertNodeAfterNode`
- `insertNodeOnEdge`
- `connectNodes`
- `reconnectEdge`
- `updateNodeField`
- `deleteSelection`
- `duplicateSelection`
- `moveNodes`
- `setViewport`

不再允许组件在 render 文件里临时拼 document。

### 6.3 组件不直接决定交互规则

组件可以发出“用户点了什么、拖了什么、选了什么”，但不能决定：

- 该不该连
- 怎么插边
- 连线是否合法
- 哪些节点需要整体右移
- layout 变更还是逻辑变更

这些都必须收口在 interaction hooks 或 transforms。

### 6.4 UI 运行态与 document 真值分离

`selectedNodeId`、`pickerOpen`、`issuesOpen`、`activeContainerPath` 这类状态不是 document 真值，必须从 document 层抽离到 editor store。

### 6.5 继续沿用 feature-local 边界

本轮不把 editor store 升到全局 app store。  
`agent-flow` 仍保持 feature 内自洽，避免污染应用级状态层。

## 7. 目标架构

### 7.1 总体分层

目标结构如下：

```text
page / shell
  -> editor store provider
    -> interaction hooks
      -> document transforms
        -> flow-schema document
    -> canvas adapters
      -> xyflow nodes / edges / custom edge / custom connection line
    -> inspector / overlay / drawers
```

### 7.2 每层职责

#### A. `editor store`

负责保存 editor 运行时所有状态，包括 working document 和 UI 态。

#### B. `document transforms`

负责纯函数式 graph/document 变换，不依赖 React，不依赖 DOM，不依赖 store。

#### C. `interaction hooks`

负责把 `xyflow` 事件、overlay 操作、inspector 操作翻译成 store action + transform 调用。

#### D. `adapters`

负责把 `FlowAuthoringDocument` 映射成 `@xyflow/react` 所需的 nodes / edges / custom data。

#### E. `presentational components`

只负责渲染，不直接改 document。

## 8. 目标目录边界

建议将 `web/app/src/features/agent-flow` 收口为以下结构：

```text
agent-flow/
  api/
    orchestration.ts
  pages/
    AgentFlowEditorPage.tsx
  store/
    editor/
      provider.tsx
      index.ts
      selectors.ts
      slices/
        document-slice.ts
        selection-slice.ts
        viewport-slice.ts
        panel-slice.ts
        interaction-slice.ts
        sync-slice.ts
  hooks/
    interactions/
      use-canvas-interactions.ts
      use-node-interactions.ts
      use-edge-interactions.ts
      use-selection-interactions.ts
      use-inspector-interactions.ts
      use-container-navigation.ts
      use-draft-sync.ts
      use-editor-shortcuts.ts
  lib/
    document/
      default-document.ts
      node-factory.ts
      edge-factory.ts
      change-kind.ts
      selectors.ts
      validate-document.ts
      selector-options.ts
      transforms/
        node.ts
        edge.ts
        selection.ts
        container.ts
        viewport.ts
    adapters/
      to-canvas-nodes.ts
      to-canvas-edges.ts
  components/
    editor/
      AgentFlowEditorShell.tsx
      AgentFlowOverlay.tsx
      AgentFlowCanvasFrame.tsx
      agent-flow-editor.css
    canvas/
      AgentFlowCanvas.tsx
      custom-edge.tsx
      custom-connection-line.tsx
      node-types.tsx
      AgentFlowNodeCard.tsx
      CanvasHandle.tsx
      EdgeInsertButton.tsx
    inspector/
      NodeInspector.tsx
      fields/
        SelectorField.tsx
        TemplatedTextField.tsx
        NamedBindingsField.tsx
        ConditionGroupField.tsx
        StateWriteField.tsx
    issues/
      IssuesDrawer.tsx
    history/
      VersionHistoryDrawer.tsx
```

## 9. Editor Store 设计

### 9.1 Store 类型

采用 feature-local `zustand` store，做成 `AgentFlowEditorStoreProvider`，只在 editor 页面内生效。

### 9.2 Store 中必须保存的状态

#### A. document slice

- `workingDocument`
- `lastSavedDocument`
- `serverDraftMeta`
  - `draftId`
  - `draftVersion`
  - `updatedAt`
- `pendingChangeKind`
- `pendingSummary`

职责：

- 当前编辑中的 document 真值统一放这里
- 后续所有 UI 读取 document 都从这里取，不再层层 props 传递

#### B. selection slice

- `selectedNodeId`
- `selectedEdgeId`
- `selectedNodeIds`
- `selectionMode`
- `focusedFieldKey`
- `openInspectorSectionKey`

职责：

- 支撑单选、多选、Issue 定位、Inspector 聚焦

#### C. viewport slice

- `viewport`
- `controlMode`
  - `pointer`
  - `hand`
- `isFittingView`

职责：

- 统一收口画布视口和控制模式

#### D. panel slice

- `issuesOpen`
- `historyOpen`
- `publishConfigOpen`
- `nodePickerState`
  - `anchorNodeId`
  - `anchorEdgeId`
  - `open`

职责：

- 统一 overlay / drawer / picker 开关

#### E. interaction slice

- `activeContainerPath`
- `connectingPayload`
  - `sourceNodeId`
  - `sourceHandleId`
  - `sourceNodeType`
- `hoveredNodeId`
- `hoveredEdgeId`
- `highlightedIssueId`

职责：

- 对标 Dify 的 interaction scratch state，用于拖线、悬浮、进入容器、Issue 跳转

#### F. sync slice

- `autosaveStatus`
  - `idle`
  - `saving`
  - `saved`
  - `error`
- `isRestoringVersion`
- `isDirty`
- `lastChangeKind`
- `lastChangeSummary`

职责：

- 把 autosave / restore / dirty 状态从 shell 中抽出来

### 9.3 Store 不负责的事情

store 不直接做以下逻辑：

- 复杂 graph 变换
- 字段 schema 渲染
- API 请求拼装
- xyflow nodes/edges 转换

这些分别归 transforms、inspector schema、sync hook、adapter 负责。

## 10. Document Transforms 设计

### 10.1 目标

所有对 `FlowAuthoringDocument` 的变更都必须变成纯函数。

函数签名统一采用：

```ts
function transform(
  document: FlowAuthoringDocument,
  payload: Payload
): FlowAuthoringDocument
```

### 10.2 需要拆出的 transform

#### Node transforms

- `createNodeDocument`
- `insertNodeAfterNode`
- `insertNodeBeforeNode`
- `insertNodeOnEdge`
- `deleteNodeById`
- `duplicateNodes`
- `moveNodes`
- `updateNodeField`
- `renameNodeAlias`

#### Edge transforms

- `connectNodes`
- `reconnectEdge`
- `deleteEdgeById`
- `replaceEdgeWithNode`
- `validateConnection`

#### Container transforms

- `getContainerChildren`
- `getContainerPathForNode`
- `getActiveContainerDocumentView`
- `ensureNodeBelongsToContainer`

#### Viewport transforms

- `setViewport`
- `fitViewportSnapshot`

#### Change classification

- `classifyDocumentChange`
  - `layout`
  - `logical`

### 10.3 与当前实现的关键变化

当前 `insertNodeAfter` 只支持“从节点后插入”。  
重构后要补成 3 类显式 command：

1. 从节点后插入
2. 从目标前插入
3. 从 edge 中点插入

其中第 `3` 类是向 Dify 靠拢最关键的能力，因为这会决定 custom edge 是否只是装饰，还是 editor 的一等交互入口。

## 11. Interaction Hooks 设计

### 11.1 目标

interaction hooks 是本次重构的核心。  
它们负责把：

- `xyflow` 事件
- 节点卡片按钮
- edge 中点按钮
- Inspector 字段编辑
- Overlay / Drawer 操作

统一翻译成：

- store action
- document transform
- sync scheduling

### 11.2 需要的 hooks

#### `useCanvasInteractions`

负责：

- pane click
- viewport change
- fit view
- control mode 切换
- node picker 打开关闭

#### `useNodeInteractions`

负责：

- node click
- node drag start / drag / stop
- node add from handle
- node duplicate
- node delete
- node enter container

#### `useEdgeInteractions`

负责：

- edge hover
- edge reconnect
- edge insert button
- drag line connect
- invalid connect 拦截

#### `useSelectionInteractions`

负责：

- 单选
- 框选
- 多选
- clear selection

#### `useInspectorInteractions`

负责：

- update node field
- focus specific field from issue
- open specific section
- close inspector

#### `useContainerNavigation`

负责：

- 进入容器
- 返回根画布
- breadcrumb path
- Issue 跳转时自动进入正确容器层级

#### `useDraftSync`

负责：

- 自动保存节流
- 手动保存
- restore version
- hash / updatedAt 刷新
- 保存失败回滚或 refresh

#### `useEditorShortcuts`

负责：

- delete
- duplicate
- copy / paste
- undo / redo
- fit view

### 11.3 hooks 的原则

hooks 可以读 store，也可以调 transforms，但不应该直接拼 JSX，不应该依赖具体 UI 组件结构。

## 12. Canvas / Node / Edge 设计

### 12.1 `AgentFlowCanvas` 的目标职责

重构后的 `AgentFlowCanvas` 只做三件事：

1. 读取 adapter 输出的 nodes / edges
2. 绑定 `@xyflow/react` 回调到 interaction hooks
3. 渲染 background、controls、minimap、custom node / custom edge

它不再直接：

- 改 document
- 管 pickerNodeId
- 处理全局自定义事件
- 处理 autosave

### 12.2 custom node

节点卡片继续保留，但要从“带 command 的节点组件”改成“只发 action 的 presentational node”。

节点数据协议建议只保留：

- `nodeId`
- `nodeType`
- `alias`
- `description`
- `selected`
- `issueCount`
- `canEnterContainer`
- `showTargetHandle`
- `showSourceHandle`
- `isContainer`

按钮行为全部来自 hook 组装后的 callbacks。

### 12.3 custom edge

重构后 custom edge 需要成为 editor 的一等交互层，而不只是连线装饰。

至少包含：

- path render
- hover state
- 中点插入按钮
- selected / dimmed / invalid 样式

从当前实现升级的关键点：

- 不再用 `window.dispatchEvent`
- edge 插入按钮直接调用 `useEdgeInteractions`
- 后续可平滑扩展成 Dify 式 hover reveal / running state / temp connection feedback

### 12.4 custom connection line

当前 1Flowbase 还没有独立 custom connection line。  
重构后应补上，用于：

- 拖线时的可视反馈
- 统一 source/target handle 视觉语言
- 后续 invalid connect 或 branch handle 提示

## 13. Inspector 设计

### 13.1 Inspector 的目标边界

Inspector 只负责：

- 根据 `selectedNodeId` 选择 node definition
- 渲染 section 和 field editor
- 把字段编辑事件交给 `useInspectorInteractions`

Inspector 不再直接持有 document mutation 逻辑。

### 13.2 Schema 与渲染继续解耦

当前 `nodeDefinitions.tsx` 已经开始扮演 schema 角色，这个方向保留，但要继续收口：

- `nodeDefinitions` 只声明字段结构
- `NodeInspector` 只解释 schema 并渲染
- 字段写入逻辑全部走 interaction hook + transform

### 13.3 Binding Editor 家族继续保留

以下 editor family 继续保留，不在本轮重写交互模型：

- `SelectorField`
- `TemplatedTextField`
- `NamedBindingsField`
- `ConditionGroupField`
- `StateWriteField`

但它们的输出不再直接让 `NodeInspector` 拼 document，而是统一发给 inspector interaction hook。

## 14. Draft Sync / History / Issues 设计

### 14.1 autosave

`useEditorAutosave` 要改造成 `useDraftSync` 的内部能力，而不是 shell 单独持有的 hook。

原因：

- autosave 是否 dirty，取决于 store 中的 `workingDocument` vs `lastSavedDocument`
- 保存后更新 `draft meta`、`autosave status`、`change kind`
- restore 时需要暂停 autosave

### 14.2 history

版本历史仍由服务端提供，但前端要补一层 editor 内核语义：

- `layout` 变更只更新 draft，不增长历史语义
- `logical` 变更才参与版本说明
- restore 成功后：
  - 替换 `workingDocument`
  - 替换 `lastSavedDocument`
  - 清空 selection / connecting / picker / issue focus scratch state

### 14.3 issues

`validateDocument` 继续保留为纯 document 校验函数。  
但 Issues 跳转动作改为 editor 内核命令：

- 打开对应容器
- 选中节点
- 展开对应 section
- 聚焦对应字段

不再让 `Shell` 自己拼这些逻辑。

## 15. 与 Dify 的对齐方式

本方案不照搬 Dify 的所有实现细节，但有三个明确对齐点：

### 15.1 对齐 Dify 的组织方式

参考 Dify：

- `index.tsx` 负责挂 `ReactFlow` 和整体事件入口
- `use-nodes-interactions.ts` / `use-workflow.ts` 负责图交互规则
- `custom-edge.tsx` 负责 edge 中点插入和运行态视觉

1Flowbase 对齐成：

- `AgentFlowCanvas` 负责入口
- `hooks/interactions/*` 负责规则
- `components/canvas/custom-edge.tsx` 负责 edge UI 和插入入口

### 15.2 不对齐 Dify 的部分

不直接复制：

- Dify 的全部 workflow store 结构
- 运行态高亮、Node Run、调试台
- 复杂 iteration / loop 运行状态细节
- 过多 `_temp` / `_hovering` 字段灌入持久化数据

1Flowbase 仍以更轻的 feature-local store 为主。

### 15.3 关键结果

重构后，1Flowbase 会在“实现边界”上接近 Dify，而不是在“全部功能”和“全部状态量级”上强行追齐。

## 16. 迁移顺序

### 阶段 1：先引入 store 和 transform，不改 UI 外观

- 新建 feature-local editor store
- 拆出 document transforms
- 把 `Shell` 中的核心运行态先迁入 store
- 现有组件只改数据来源，不改视觉

目标：

- 在不动外观的前提下，把 document 真值和 UI 运行态集中起来

### 阶段 2：迁移 Canvas 交互

- 去掉 `AgentFlowCanvas` 里的 document mutation
- 去掉 `window.dispatchEvent`
- 把 node add / edge reconnect / viewport / selection 收口到 hooks

目标：

- 让 canvas 变成真正的 adapter + event binding 层

### 阶段 3：迁移 Inspector 交互

- 把字段写入逻辑从 `NodeInspector` 拆出去
- 用 inspector interactions + transforms 收口

目标：

- 让 Inspector 成为 schema-driven UI，而不是第二个编辑器内核

### 阶段 4：补齐 Dify 式 edge / handle 交互

- custom connection line
- handle-based add/connect
- edge middle insert
- invalid connect 校验

目标：

- 把 1Flowbase 从“能编辑节点”升级为“有完整画布交互内核”

### 阶段 5：清理旧路径

- 删除旧 props 透传
- 删除全局事件桥
- 删除 shell 中重复状态
- 删除 canvas 中直接 mutation helper

目标：

- feature 最终只保留一条稳定的数据流

## 17. 测试策略

### 17.1 单元测试

所有 document transforms 必须各自有纯函数测试：

- node insert
- edge reconnect
- invalid connect
- container navigation
- layout vs logical classify

### 17.2 store / hook 测试

为 editor store 和 interaction hooks 增加独立测试：

- selection
- issue focus
- restore cleanup
- autosave dirty detection

### 17.3 组件集成测试

保留并扩展现有：

- `agent-flow-canvas.test.tsx`
- `agent-flow-canvas-interactions.test.tsx`
- `node-inspector.test.tsx`
- `validate-document.test.ts`

重点验证：

- 节点选择
- edge 中点插入
- reconnect
- 进入容器与返回
- issue 点击后的 container + inspector 联动

### 17.4 不依赖后端验证的内容

以下行为应优先在前端测试中完成，不依赖 API：

- graph transforms
- change kind classification
- selector 可见性
- issue focus
- edge insert and reconnect semantics

## 18. 风险与控制

### 18.1 风险一：一次性重构面过大

控制方式：

- 按迁移阶段推进
- 阶段 1 只搬状态，不换 UI

### 18.2 风险二：store 过度膨胀

控制方式：

- 只把 editor feature-local 状态放进去
- document transform 仍保持纯函数，不把 graph 规则写进 store reducer

### 18.3 风险三：当前测试失效过多

控制方式：

- 先补 transform 测试，再迁组件
- 用 adapter 稳定 `toCanvasNodes / toCanvasEdges` 输出，减少 UI 回归面

## 19. 成功标准

重构完成后，应满足以下标准：

1. `AgentFlowEditorShell` 不再直接持有大部分 editor 运行态，只负责 provider 和页面组装。
2. `AgentFlowCanvas` 不再直接修改 document，也不再依赖全局事件桥。
3. `NodeInspector` 不再直接构造 document mutation，只负责 schema 渲染。
4. 所有 graph 改动都能在 `document transforms` 中找到对应纯函数。
5. `layout` 与 `logical` 变化分类只存在一套真规则。
6. 后续要补 `handle connect / edge insert / container child canvas / undo redo` 时，都能找到明确挂点，而不是再回到 `Shell` 和 `Canvas` 里拼逻辑。

## 20. 明确建议

建议按本稿推进，不再继续沿用当前“Shell + Canvas + Inspector 分别改 document”的方式迭代。

原因不是当前实现不能工作，而是它已经到达第一版结构上限：

- 再往里叠 Dify 式连线和边中插入，当前结构会明显失控
- 现在重构，改动面仍主要集中在 `agent-flow` feature 内
- 再晚一轮，后续每补一个交互都会把未来重构成本继续抬高

这次应该把 editor 先做成一套稳定内核，再继续叠节点能力和画布交互。
