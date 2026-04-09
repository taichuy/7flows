# 结构化变量文本编辑器设计

## 1. 背景

当前 7Flows 的 `endNode` 已经具备 `replyDocument + replyReferences + replyTemplate` 三层结构化模型，后端渲染与 schema 校验也已兼容新旧模板语法；真正不达预期的是前端交互层。

当前 `WorkflowVariableTextEditor` 仍然偏“slot 表单 + 下方整块变量面板”：

- 输入 `/` 后会在文本域下方展开大块变量面板，而不是在光标附近弹出小窗。
- 变量插入后会被渲染成独立大块区域，而不是像 Dify 那样和文字在同一条文本流里混排。
- 右上角没有单独的“变量”入口，用户只能靠 `/` 触发。
- 当前编辑器还暴露 alias 编辑、复制机器别名等偏工程化动作，主交互不够清晰。

用户这轮要的不是继续补现有大面板，而是把通用 `WorkflowVariableTextEditor` 直接重做成接近 Dify 的模式：**单一可增高文本域 + 变量内联 token + `/` 小型浮窗 + 右上角变量按钮**。`endNode` 只是第一处接线场景，交互模型本身要作为后续其它文本变量场景的通用基类。

## 2. 目标与非目标

### 2.1 目标

- 提供一个通用的文本变量编辑器组件 `WorkflowVariableTextEditor`。
- 编辑器主体仍然是单一文本域，并支持随内容自动增高。
- 变量在文本域里以内联 token 形式与文字混排，而不是作为下方大块子表单展示。
- 在编辑器里输入 `/` 时，于当前光标附近弹出接近 Dify 的小型变量选择浮窗。
- 在编辑器右上角提供“变量”按钮，并与 `/` 共用同一套浮窗与插入逻辑。
- 变量选择后插入到当前光标位置，而不是固定追加到末尾。
- `endNode` 的直接回复配置继续以结构化 document 作为主事实，不回退成纯字符串。
- 继续兼容现有 `config.replyTemplate`，避免已有 workflow 被打坏。

### 2.2 非目标

- 本轮不接入 LLM prompt、Monaco、PromptEditor 或其它文本场景。
- 本轮不做全局变量重命名联动。
- 本轮不在编辑器主交互里暴露 alias 改名、复制机器别名或其它工程化辅助动作。
- 本轮不做源路径自动迁移；例如节点 id、上游输出字段名变化后，不自动重写 selector。
- 本轮不做富文本工具栏、复杂排版或多行块级格式。
- 本轮不重构结构化 selector 字段（例如 branch selector、tool binding selector）的交互模型。

## 3. 方案概览

本轮拆成两个明确层次：

1. `WorkflowVariableTextEditor`
   - 保留通用文本变量组件定位，但交互层整体重做。
   - 负责单一文本域、光标、内联 token、`/` 浮窗、右上角变量按钮、变量插入/删除。
   - 不带任何 `endNode` 业务语义。

2. `endNode reply document`
   - `endNode` 继续复用现有结构化内容模型。
   - `replyDocument + replyReferences` 仍是主事实源。
   - `replyTemplate` 继续只做兼容派生，不因为 UI 重做而改变。

换句话说，这轮不是再动后端或数据模型，而是把已经落地的结构化模型换上一套真正可用的 Dify 式编辑交互。

## 4. 数据模型

### 4.1 现有结构化字段

`endNode` 新增：

```ts
type WorkflowVariableTextDocument = {
  version: 1;
  segments: Array<
    | { type: "text"; text: string }
    | { type: "variable"; refId: string }
  >;
};

type WorkflowVariableReference = {
  refId: string;
  alias: string;
  ownerNodeId: string;
  selector: string[];
};
```

对应配置字段：

```ts
config.replyDocument?: WorkflowVariableTextDocument
config.replyReferences?: WorkflowVariableReference[]
config.replyTemplate?: string
config.responseKey?: string
```

### 4.2 事实源与派生关系

- `replyDocument + replyReferences` 一起构成前端编辑主事实源。
- `replyTemplate` 是从 `replyDocument + replyReferences` 派生出来的字符串，固定输出为 `{{#ownerNodeId.alias#}}`。
- `responseKey` 维持现状。

### 4.3 兼容策略

加载 `endNode` 配置时：

1. 若存在合法 `replyDocument + replyReferences`，优先使用它们。
2. 若没有结构化字段，但存在 `replyTemplate`，则前端将其 parse 成 `replyDocument + replyReferences`。
3. 解析时同时兼容：
   - 新语法：`{{#accumulated.agent.answer#}}`
   - 旧语法：`{{ accumulated.agent.answer }}`

保存 `endNode` 配置时：

1. 以 `replyDocument + replyReferences` 为源。
2. 同步派生并写回 `replyTemplate`。
3. 生成的 `replyTemplate` 一律规范化为 `{{#ownerNodeId.alias#}}` 风格。

### 4.4 alias 规则

- alias 的作用域限制在当前节点内，不做 workflow 级共享 alias。
- 用户看到的显示名是 `[当前节点标题] alias`。
- 机器别名固定为 `ownerNodeId.alias`。
- 新插入变量时，默认 alias 使用当前节点可消费变量名：
  - 若是当前节点已有映射字段，优先用映射字段名。
  - 否则退回 selector 末段。
- 若 alias 冲突，则自动补数字后缀。
- alias 在本轮仍然存在，但只作为结构化模型内部机器名与兼容层桥接，不再作为编辑器主交互的一部分直接暴露给用户。

示例：

- 节点标题为 `直接回复`
- 节点 id 为 `endNode_ab12cd34`
- 当前节点变量名为 `text`
- 用户显示名为 `[直接回复] text`
- 机器别名为 `endNode_ab12cd34.text`

### 4.5 显示名与机器名

- 显示名只用于编排界面展示，不参与 runtime 解析。
- 机器别名只用于复制、兼容 token 派生与解析桥接。
- runtime 真正取值仍然依赖 `selector`。
- 因此变量引用存在三层：
  - `refId`：当前节点内稳定联动键
  - `ownerNodeId.alias`：机器别名
  - `selector`：真实取值路径

## 5. 通用组件边界

### 5.1 `WorkflowVariableTextEditor`

职责：

- 渲染单一文本域与其对应的内联 token 投影。
- 管理光标、选区、textarea 自动增高和 token 原子删除。
- 处理 `/` 触发的小型变量浮窗。
- 处理右上角“变量”按钮触发的同一浮窗。
- 接收可引用变量列表，支持搜索、分组、类型提示与点击插入。
- 把“用户眼中的连续文本编辑”映射回 `document + references`。
- 输出更新后的 document 与 references。

不负责：

- 直接读写 `endNode` 配置。
- 推导 runtime 输入。
- 定义某个节点可引用哪些业务字段。
- 暴露 alias 编辑、复制机器别名或其它非主链高级动作。

建议 props：

```ts
type WorkflowVariableTextEditorProps = {
  value: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
  ownerNodeId: string;
  ownerLabel: string;
  variables: WorkflowVariableReferenceGroup[];
  placeholder?: string;
  onChange: (next: {
    document: WorkflowVariableTextDocument;
    references: WorkflowVariableReference[];
  }) => void;
};
```

### 5.2 变量选择器数据

变量选择器输入不直接传“文案按钮列表”，而是传结构化变量树，便于后续复用：

```ts
type WorkflowVariableReferenceItem = {
  key: string;
  label: string;
  selector: string[];
  token: string;
  previewPath: string;
  valueTypeLabel?: string;
};

type WorkflowVariableReferenceGroup = {
  key: string;
  label: string;
  items: WorkflowVariableReferenceItem[];
};
```

`token` 固定使用 `{{#ownerNodeId.alias#}}`。

`previewPath` 用来展示真实 selector 路径，便于排障与核对来源；`valueTypeLabel` 用来在小型浮窗里展示类似 Dify 的 `String / Number / Object / Array[File]` 类型提示。

## 6. 交互设计

### 6.1 编辑器行为

- 主体是单一 textarea，支持自动增高。
- 文本域上层覆盖一层只读渲染视图，用于把变量显示成内联 token；用户感知仍然是“在一个文本域里编辑”。
- 变量内容以内联 token/chip 渲染，并显示 `[当前节点标题] alias`。
- 用户在文本中输入 `/` 时，打开变量选择器浮窗。
- 用户点击右上角“变量”按钮时，也打开同一个变量选择器浮窗。
- 两种入口都把变量插入到当前光标位置。
- 用户按 `Backspace/Delete` 命中变量时，应按整枚 token 删除。
- token 默认只读，不在编辑器里直接暴露 alias 改名输入框。

### 6.2 变量选择器行为

第一版要接近 Dify，但不引入额外富文本框架：

- 支持关键字搜索。
- 支持小型浮窗显示，不再占用正文下方整块布局。
- 支持分组显示，但默认以紧凑列表平铺，不做现在这种大块展开式交互。
- 每个变量项显示：
  - 变量名
  - 类型提示
  - 淡化路径预览
- 点击变量项会把 selector 插入 document。
- 插入时自动创建或复用一个 `refId` 绑定。
- 插入成功后自动关闭浮窗。
- `Esc` 或点击外部关闭浮窗。

### 6.3 第一版分组

先收口为这些组：

- 上游节点
- 用户输入
- 当前节点字段

这几个分组都由 `endNode` 场景自己组装，再传给通用组件；第一版不再额外做“常用快捷项”“复制机器别名”等附加区。

## 7. `endNode` 接入策略

### 7.1 前端

`OutputNodeConfigForm` 改成：

- 把当前 `config.replyDocument` / `config.replyReferences` / `config.replyTemplate` 归一化成结构化模型。
- 把候选变量树传给 `WorkflowVariableTextEditor`。
- 额外传入右上角“变量”按钮所需的 editor toolbar 入口。
- 在 `onChange` 时同时更新：
  - `replyDocument`
  - `replyReferences`
  - 派生后的 `replyTemplate`

### 7.2 后端

runtime 继续保持兼容：

1. 如果 `config.replyDocument + config.replyReferences` 存在，则优先把结构化模型渲染成最终字符串。
2. 否则回退到 `config.replyTemplate`。
3. `replyTemplate` 解析继续兼容三种输入：
   - alias token：`{{#ownerNodeId.alias#}}`
   - selector token：`{{#accumulated.agent.answer#}}`
   - 旧语法：`{{ accumulated.agent.answer }}`

这样前端保存后的新 workflow 可以直接走结构化数据，而旧 workflow 无需迁移脚本也能继续运行。

## 8. 迁移与兼容

本轮不做批量迁移任务。

兼容原则：

- 旧 definition 允许只含 `replyTemplate`。
- 新 definition 保存后会同时带 `replyDocument + replyReferences + replyTemplate`。
- API 校验层允许 `endNode` 多出 `replyDocument` 与 `replyReferences` 字段。
- 运行时读取结构化模型时，不依赖 `replyTemplate` 一定存在。

## 9. 验证

前端至少补这些测试：

- `replyTemplate` 新旧语法都能 parse 成 `replyDocument + replyReferences`
- `replyDocument + replyReferences` 能稳定派生成 `{{#ownerNodeId.alias#}}`
- 输入 `/` 会在当前光标附近打开小型变量浮窗
- 右上角“变量”按钮会打开同一个变量浮窗
- 选择变量后会插入到当前光标位置
- 变量以内联 token 渲染，而不是在文本域下方出现整块变量面板
- 删除时变量按整枚 token 删除
- alias 自动生成后，兼容 token 仍遵循 `ownerNodeId.alias`
- 编排显示名稳定展示为 `[当前节点标题] alias`
- `OutputNodeConfigForm` 保存时会同时写回 `replyDocument + replyReferences + replyTemplate`

后端本轮无新增行为变更，继续依赖既有结构化 reply 渲染与兼容测试，不再把后端改造作为本轮目标。

验证命令范围：

- `corepack pnpm --dir web exec vitest run ...`
- `corepack pnpm --dir web lint`
- `api/.venv/bin/pytest ...`
- `git diff --check`

`web` 全量 `tsc --noEmit` 继续作为附加检查；若仍命中仓库既有失败，需要在最终汇报里单独说明，不把它误报成这轮新问题。

## 10. 推荐落地顺序

1. 先保留现有 document/reference parse/serialize 测试作为数据层护栏
2. 再补新的 `WorkflowVariableTextEditor` 交互测试，先锁住 textarea + inline token + popup 模型
3. 再调整 `OutputNodeConfigForm` 的工具栏入口和接线
4. 最后只做前端侧回归；后端结构化模型本轮不再重构

这个顺序能保证：交互层即便整体重做，也仍然站在已经稳定的结构化 document/references 模型上，不会把 `endNode` 运行链重新打坏。
