# 复杂度降低模式

本文档提供 7Flows 前端组件的降复杂度模式，重点面向未来的画布编辑器、节点组件、调试面板和发布配置界面。

## 判断复杂度的实用信号

当前仓库没有 `pnpm analyze-component`，因此优先用这些信号判断是否需要重构：

- 组件同时处理画布渲染、表单状态、网络请求和调试展示
- JSX 中有 3 层以上条件嵌套
- 一个文件同时出现多个模态框、tab、section 和大量事件处理
- `useState` / `useEffect` 成组出现且互相影响
- 节点配置逻辑与节点视觉逻辑混在同一个组件中

## 模式 1：查找表替代条件分支

```ts
const statusToneMap = {
  pending: 'neutral',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
} as const
```

- 适用于节点状态、发布协议类型、能力开关等枚举分支
- 比连续 `if/else` 或嵌套三元更易维护

## 模式 2：提前返回扁平化流程

```ts
const canPublish = () => {
  if (!hasWorkflow) return false
  if (!hasOutputNode) return false
  if (hasInvalidSchema) return false
  return true
}
```

- 适用于保存、发布、调试、切换节点类型等流程
- 优先消除深层嵌套

## 模式 3：把派生逻辑从 JSX 中移走

适合抽出：

- 节点状态徽标文案
- 发布协议字段显隐
- schema 转换
- 授权来源列表
- 调试事件过滤结果

不要在 JSX 中内联大段映射、排序、过滤和状态推导。

## 模式 4：按“视图职责”而不是“标签页”拆分

优先拆这些职责边界：

- 画布壳层
- 节点卡片
- 节点配置 panel
- 调试 timeline
- payload 预览
- 发布协议 section

而不是只因为界面上有 tab 就机械拆文件。

## 模式 5：把事件处理分层

将事件处理拆成：

- 纯 UI 事件入口
- 业务规则判定
- 状态更新或提交动作

这样比在 `onClick` / `onChange` 中直接写几十行逻辑更稳定。
