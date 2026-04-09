# 结构化变量文本编辑器设计

## 1. 背景

当前 7Flows 的“直接回复”节点仍以 `config.replyTemplate` 字符串作为主事实源。虽然已经把变量 token 语法切到 Dify 风格 `{{#path#}}`，但前端编辑体验仍是普通 `textarea + 文本插入`：

- 输入 `/` 不会弹变量选择器。
- 变量仍以普通文本存在，前端无法稳定区分“文本内容”和“变量引用”。
- 后续若把相同能力扩到 prompt、说明类字段或其它文本节点，当前实现很难复用。

用户目标不是只补一个快捷键，而是先围绕“文本中的变量引用”建立一个统一基类。第一阶段落点只放在 `endNode` 的“直接回复”配置，但组件边界必须能支撑后续复用。

## 2. 目标与非目标

### 2.1 目标

- 提供一个通用的文本变量编辑器组件 `WorkflowVariableTextEditor`。
- 在编辑器里输入 `/` 时，弹出接近 Dify 的变量选择器。
- 变量选择器支持搜索、分层展开、路径预览、复制 `{{#path#}}`、点击插入。
- `endNode` 的直接回复配置不再以纯字符串作为主事实，而是以结构化 document 作为主事实。
- 继续兼容现有 `config.replyTemplate`，避免已有 workflow 被打坏。

### 2.2 非目标

- 本轮不接入 LLM prompt、Monaco、PromptEditor 或其它文本场景。
- 本轮不做 alias 变量名体系，不做 `{{ answer }}` 这类编辑器层变量映射。
- 本轮不做全局变量重命名联动。
- 本轮不做富文本工具栏、复杂排版或多行块级格式。
- 本轮不重构结构化 selector 字段（例如 branch selector、tool binding selector）的交互模型。

## 3. 方案概览

本轮拆成两个明确层次：

1. `WorkflowVariableTextEditor`
   - 通用文本变量组件。
   - 负责文本编辑、`/` 触发、变量面板、插入变量 segment、复制 token。
   - 不带任何 `endNode` 业务语义。

2. `endNode reply document`
   - `endNode` 自己的结构化内容模型。
   - 直接回复内容以 document 作为主事实源。
   - `replyTemplate` 退化为派生字符串与兼容层。

这样后续其它节点若要复用文本变量能力，只需要接 `WorkflowVariableTextEditor`，而不是复制 `endNode` 的数据模型。

## 4. 数据模型

### 4.1 新增结构化字段

`endNode` 新增：

```ts
type WorkflowVariableTextDocument = {
  version: 1;
  segments: Array<
    | { type: "text"; text: string }
    | { type: "variable"; selector: string[] }
  >;
};
```

对应配置字段：

```ts
config.replyDocument?: WorkflowVariableTextDocument
config.replyTemplate?: string
config.responseKey?: string
```

### 4.2 事实源与派生关系

- `replyDocument` 是前端编辑主事实源。
- `replyTemplate` 是从 `replyDocument` 派生出来的字符串，固定输出为 `{{#path#}}`。
- `responseKey` 维持现状。

### 4.3 兼容策略

加载 `endNode` 配置时：

1. 若存在合法 `replyDocument`，优先使用它。
2. 若没有 `replyDocument`，但存在 `replyTemplate`，则前端将其 parse 成 `replyDocument`。
3. 解析时同时兼容：
   - 新语法：`{{#accumulated.agent.answer#}}`
   - 旧语法：`{{ accumulated.agent.answer }}`

保存 `endNode` 配置时：

1. 以 `replyDocument` 为源。
2. 同步派生并写回 `replyTemplate`。
3. 生成的 `replyTemplate` 一律规范化为 `{{#path#}}` 风格。

## 5. 通用组件边界

### 5.1 `WorkflowVariableTextEditor`

职责：

- 渲染结构化 document。
- 管理光标、选择范围和 segment 编辑状态。
- 处理 `/` 触发变量选择器。
- 接收可引用变量树，支持搜索、分层展开、路径预览、复制 token、点击插入。
- 输出更新后的 document。

不负责：

- 直接读写 `endNode` 配置。
- 推导 runtime 输入。
- 定义某个节点可引用哪些业务字段。

建议 props：

```ts
type WorkflowVariableTextEditorProps = {
  value: WorkflowVariableTextDocument;
  variables: WorkflowVariableReferenceGroup[];
  placeholder?: string;
  onChange: (next: WorkflowVariableTextDocument) => void;
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
  children?: WorkflowVariableReferenceItem[];
};

type WorkflowVariableReferenceGroup = {
  key: string;
  label: string;
  items: WorkflowVariableReferenceItem[];
};
```

`token` 固定使用 `{{#path#}}`。

## 6. 交互设计

### 6.1 编辑器行为

- 文本内容以 text segment 渲染。
- 变量内容以独立 token/chip 渲染。
- 用户在文本中输入 `/` 时，打开变量选择器。
- 用户点击某个变量项后，在当前光标位置插入 variable segment。
- 用户点击变量 chip 可删除；第一版不做 inline rename。

### 6.2 变量选择器行为

第一版要接近 Dify，但不引入额外富文本框架：

- 支持关键字搜索。
- 支持分组显示。
- 支持树形展开。
- 每个叶子变量显示完整路径预览。
- 每个叶子变量都能“复制 token”。
- 点击变量名会把 selector 插入 document。

### 6.3 第一版分组

先收口为这些组：

- 当前节点映射字段
- `trigger_input`
- `accumulated`
- 上游节点
- 常用快捷项

这几个分组都由 `endNode` 场景自己组装，再传给通用组件。

## 7. `endNode` 接入策略

### 7.1 前端

`OutputNodeConfigForm` 改成：

- 把当前 `config.replyDocument` / `config.replyTemplate` 归一化成 document。
- 把候选变量树传给 `WorkflowVariableTextEditor`。
- 在 `onChange` 时同时更新：
  - `replyDocument`
  - 派生后的 `replyTemplate`

### 7.2 后端

runtime 继续保持兼容：

1. 如果 `config.replyDocument` 存在，则优先把 document 渲染成最终字符串。
2. 否则回退到 `config.replyTemplate`。
3. `replyTemplate` 解析继续兼容新旧 token 语法。

这样前端保存后的新 workflow 可以直接走结构化数据，而旧 workflow 无需迁移脚本也能继续运行。

## 8. 迁移与兼容

本轮不做批量迁移任务。

兼容原则：

- 旧 definition 允许只含 `replyTemplate`。
- 新 definition 保存后会同时带 `replyDocument + replyTemplate`。
- API 校验层允许 `endNode` 多出 `replyDocument` 字段。
- 运行时读取 `replyDocument` 时，不依赖 `replyTemplate` 一定存在。

## 9. 验证

前端至少补这些测试：

- `replyTemplate` 新旧语法都能 parse 成 `replyDocument`
- `replyDocument` 能稳定派生成 `{{#path#}}`
- 输入 `/` 会打开变量选择器
- 搜索、展开、插入、复制 token 行为正常
- `OutputNodeConfigForm` 保存时会同时写回 `replyDocument + replyTemplate`

后端至少补这些测试：

- `replyDocument` 能正确渲染变量输出
- 没有 `replyDocument` 时继续兼容 `replyTemplate`
- `replyTemplate` 新旧两种 token 都可渲染

验证命令范围：

- `corepack pnpm --dir web exec vitest run ...`
- `corepack pnpm --dir web lint`
- `api/.venv/bin/pytest ...`
- `git diff --check`

`web` 全量 `tsc --noEmit` 继续作为附加检查；若仍命中仓库既有失败，需要在最终汇报里单独说明，不把它误报成这轮新问题。

## 10. 推荐落地顺序

1. 先补 document parse/serialize 的单测
2. 再补 `WorkflowVariableTextEditor` 的交互测试
3. 再改 `OutputNodeConfigForm`
4. 最后补后端 `replyDocument` 渲染与兼容测试

这个顺序能保证：即便编辑器交互还在调整，结构化模型和兼容层已经先被测试钉住，不会把 `endNode` 运行链打坏。
