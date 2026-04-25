# Agent Flow Templated Text Lexical Variable Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Agent Flow 的模板文本输入从普通 `textarea` 升级为支持 slash/typeahead 和正文 inline 变量块的编辑器，同时保持底层仍存储 `{{node.output}}` 字符串协议。

**Architecture:** 在 `features/agent-flow/components/bindings` 下新增一个轻量 `Lexical` 模板编辑器，负责字符串与 inline 变量节点之间的双向转换。现有 schema、binding 和运行时解析继续消费字符串，避免改动协议层与调试链路。

**Tech Stack:** React 19、Ant Design 5、Lexical 0.43、Vitest、Testing Library

---

### Task 1: 锁定编辑器替换边界

**Files:**
- Modify: `web/app/src/features/agent-flow/components/bindings/TemplatedTextField.tsx`
- Modify: `web/app/src/features/agent-flow/lib/template-binding.ts`
- Reference: `web/app/src/features/agent-flow/schema/agent-flow-field-renderers.tsx`
- Reference: `web/app/src/features/agent-flow/api/runtime.ts`

- [x] **Step 1: 确认边界**

只替换 `TemplatedTextField` 的编辑体验，不修改 `templated_text` 的保存结构，也不修改运行时对 `{{node.output}}` 的解析。

- [x] **Step 2: 记录新旧职责**

`TemplatedTextField` 负责 toolbar、提示、引用变量编辑体验；新增的 Lexical 组件负责：

```ts
// 输入层：slash/typeahead 触发变量选择
// 显示层：正文中渲染 inline variable chip
// 存储层：导出仍然是 {{node.output}} 字符串
```

- [x] **Step 3: 保持现有调用方不变**

保留 `TemplatedTextField` 现有 props：

```ts
interface TemplatedTextFieldProps {
  ariaLabel: string;
  options?: FlowSelectorOption[];
  value: string;
  onChange: (value: string) => void;
}
```

### Task 2: 先写失败测试

**Files:**
- Modify: `web/app/src/features/agent-flow/_tests/templated-text-field.test.tsx`

- [x] **Step 1: 新增“正文展示 inline 变量块”失败测试**

```tsx
test('renders referenced variables inline inside the editor from stored template text', async () => {
  render(
    <TemplatedTextField
      ariaLabel="User Prompt"
      options={[startQueryOption]}
      value="请基于 {{node-start.query}} 总结"
      onChange={vi.fn()}
    />
  )

  expect(screen.getByText('请基于')).toBeInTheDocument()
  expect(screen.getByText('总结')).toBeInTheDocument()
  expect(screen.getAllByText('Start / 用户输入').length).toBeGreaterThan(0)
  expect(screen.queryByDisplayValue('请基于 {{node-start.query}} 总结')).not.toBeInTheDocument()
})
```

- [x] **Step 2: 新增“输入触发字符出现变量选择”失败测试**

```tsx
test('opens variable suggestions when typing trigger characters in the editor', async () => {
  render(<TemplatedTextHarness />)

  const editor = screen.getByLabelText('User Prompt')
  fireEvent.focus(editor)
  fireEvent.input(editor, { data: '{', inputType: 'insertText' })

  expect(await screen.findByRole('option', { name: 'Start / 用户输入' })).toBeInTheDocument()
})
```

- [x] **Step 3: 新增“从建议中选择后写回字符串协议”失败测试**

```tsx
test('inserts selected variables and preserves stored template syntax', async () => {
  render(<TemplatedTextHarness />)

  const editor = screen.getByLabelText('User Prompt')
  fireEvent.focus(editor)
  fireEvent.input(editor, { data: '/', inputType: 'insertText' })
  fireEvent.click(await screen.findByRole('option', { name: 'Start / 用户输入' }))

  await waitFor(() => {
    expect(screen.getByText('Start / 用户输入')).toBeInTheDocument()
  })

  expect(editor).toHaveTextContent('请基于 Start / 用户输入')
  expect(screen.getByTestId('templated-text-value')).toHaveTextContent('{{node-start.query}}')
})
```

- [x] **Step 4: 跑单测确认失败**

Run:

```bash
../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/agent-flow/_tests/templated-text-field.test.tsx
```

Expected: 至少一个新增断言失败，失败原因是当前实现仍是 `textarea`，没有 inline chip 或 trigger 菜单。

### Task 3: 实现轻量 Lexical 模板编辑器

**Files:**
- Create: `web/app/src/features/agent-flow/components/bindings/template-editor/TemplateVariableNode.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/template-editor/TemplateVariableChip.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/template-editor/template-editor-utils.ts`
- Create: `web/app/src/features/agent-flow/components/bindings/template-editor/TemplateVariableReplacementPlugin.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/template-editor/TemplateVariableTypeaheadPlugin.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/template-editor/LexicalTemplatedTextEditor.tsx`
- Modify: `web/app/src/features/agent-flow/components/bindings/TemplatedTextField.tsx`
- Modify: `web/app/src/features/agent-flow/lib/template-binding.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/styles/inspector.css`

- [x] **Step 1: 提取模板 token 读写工具**

在 `template-binding.ts` 增补面向多段文本编辑器的工具，至少提供：

```ts
export const TEMPLATE_SELECTOR_REGEX =
  /{{\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\s*}}/g;

export function getTemplateSelectorTokenRange(/* ... */) {}
export function isTemplateSelectorToken(value: string) {}
```

保持现有 `createTemplateSelectorToken` / `parseTemplateSelectorTokens` 不变语义。

- [x] **Step 2: 实现 inline 变量节点**

`TemplateVariableNode` 需要：

```tsx
export class TemplateVariableNode extends DecoratorNode<React.JSX.Element> {
  getTextContent(): string {
    return createTemplateSelectorToken(this.getSelector())
  }
}
```

`TemplateVariableChip` 负责展示 `Start / 用户输入` 这类 label，并提供选中态样式。

- [x] **Step 3: 实现字符串 <-> 节点转换**

`TemplateVariableReplacementPlugin` 监听普通文本节点，把匹配 `{{node.output}}` 的片段替换成 `TemplateVariableNode`。

```tsx
const TOKEN_REGEX = /{{\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\s*}}/g
```

初始化和外部 value 更新时，`LexicalTemplatedTextEditor` 都通过 `textToEditorState` 进入编辑器。

- [x] **Step 4: 实现 slash/typeahead 变量菜单**

`TemplateVariableTypeaheadPlugin` 同时支持：

```ts
triggerString = '/'
triggerString = '{'
```

选择某个变量后：

```ts
editor.dispatchCommand(INSERT_TEMPLATE_VARIABLE_COMMAND, option.value)
```

并移除当前 trigger 文本片段。

- [x] **Step 5: 替换 TemplatedTextField 主体**

将 `Input.TextArea` 替换为 `LexicalTemplatedTextEditor`，保留：

```tsx
<Button type="text" size="small">插入变量</Button>
<Typography.Text>支持在文本中混写上游字段引用</Typography.Text>
```

按钮行为继续复用当前 `Dropdown + menu.items` 入口，但插入链路统一改为调用 Lexical editor API。

- [x] **Step 6: 补充样式**

在 `inspector.css` 新增 editor 容器、contenteditable、inline chip、typeahead 列表样式，延续当前 `agent-flow-templated-text-field__*` 命名空间。

### Task 4: 回到测试变绿并补回归

**Files:**
- Modify: `web/app/src/features/agent-flow/_tests/templated-text-field.test.tsx`

- [x] **Step 1: 跑目标测试确认通过**

Run:

```bash
../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/agent-flow/_tests/templated-text-field.test.tsx
```

Expected: PASS

- [x] **Step 2: 跑受影响的 schema 渲染测试**

Run:

```bash
../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected: PASS

- [x] **Step 3: 必要时补一个 value 同步回归断言**

若实现中增加受控同步逻辑，再补一个“外部 value 更新后 editor 正确重建 inline chip”的测试。

### Task 5: 收尾

**Files:**
- Modify: `docs/superpowers/plans/2026-04-25-agent-flow-templated-text-lexical-variable-editor.md`

- [x] **Step 1: 更新计划勾选状态**

执行过程中按任务实际完成情况更新 checkbox。

- [x] **Step 2: 提交代码**

```bash
git add docs/superpowers/plans/2026-04-25-agent-flow-templated-text-lexical-variable-editor.md web/app/src/features/agent-flow
git commit -m "feat: upgrade templated text variable editor"
```
