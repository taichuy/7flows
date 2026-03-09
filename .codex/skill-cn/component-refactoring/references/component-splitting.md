# 组件拆分模式

本文档提供 7Flows 前端组件的拆分策略，目标是为未来的工作流编辑器建立清晰的职责边界。

## 何时拆分

当出现以下任一情况时优先拆分：

1. 一个组件同时承担画布展示、配置编辑和调试展示
2. 一个文件有多个明显 UI 区块
3. 有多个模态框、drawer 或 tab 内容堆在一起
4. 节点组件内部直接写大表单
5. 页面级组件既拉数据又做大量视图拼装

## 拆分策略

### 策略 1：按界面区块拆分

适用于页面骨架，例如：

```text
editor-page/
  index.tsx
  canvas-shell.tsx
  inspector-panel.tsx
  debug-panel.tsx
  publish-panel.tsx
```

### 策略 2：按节点职责拆分

适用于节点系统：

```text
nodes/<node-type>/
  node.tsx
  panel.tsx
  use-node-config.ts
  types.ts
```

- `node.tsx` 只负责画布上的节点卡片
- `panel.tsx` 负责配置
- `use-node-config.ts` 负责派生逻辑和字段行为

### 策略 3：按模态或弹层拆分

若一个组件管理多个 dialog/drawer：

- 提取 `activePanel` / `activeModal` 状态
- 将每个弹层内容放到独立组件
- 父组件只保留打开、关闭和成功回调

### 策略 4：按复用 section 拆分

对于节点配置和发布配置，适合提取：

- `ModelSection`
- `ToolsSection`
- `SandboxSection`
- `SchemaSection`
- `RetryPolicySection`
- `ProtocolMappingSection`

## Props 设计原则

- 只传最小必要字段
- 回调语义清晰，例如 `onProtocolChange`
- 复杂对象优先在父层整理后再传入

## 常见误区

- 只拆文件名，不拆职责
- 为一次性逻辑过度抽象通用组件
- 把状态放散到过多小组件，导致回流复杂
- 让节点卡片和右侧 panel 各自维护一套配置状态
