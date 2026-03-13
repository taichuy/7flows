# Hook 提取模式

本文档提供 7Flows 前端中提取自定义 Hook 的实用规则。

## 何时提取 Hook

当你发现以下情况时优先提取：

1. 多个 `useState` 总是一起变化
2. 存在复杂的 `useEffect` 或订阅逻辑
3. 有明显的派生逻辑，例如 schema 转换、授权范围计算、状态徽标推导
4. 同类逻辑会在多个节点或多个 panel 中复用

## 推荐提取对象

- 节点配置派生逻辑：`use-node-config`
- 发布协议字段逻辑：`use-published-endpoint-form`
- 调试事件过滤：`use-run-events`
- 节点权限可见性：`use-authorized-context`
- 表单默认值和字段显隐：`use-xxx-fields`

## 提取流程

### 步骤 1：识别一个“状态团”

例如：

- 节点类型
- 当前能力开关
- 可见字段
- 校验错误

这些总是一起变化时，就适合进同一个 hook。

### 步骤 2：把派生与副作用一起搬走

不要只把 `useState` 提走，却把相关 `useEffect` 和校验逻辑留在组件里。

### 步骤 3：保持返回值面向消费方

返回内容优先是：

- 当前状态
- 派生布尔值
- 明确的事件方法

而不是把内部实现细节全部暴露出去。

## 命名建议

- `use-node-config`
- `use-debug-panel-state`
- `use-publish-form`
- `use-workflow-summary`

文件名使用 kebab-case，靠近消费组件放置。

## 不要提取的情况

- 只有一两个局部状态
- 纯展示组件的小交互
- 一次性逻辑，没有复用和降复杂收益

## 验证

提取后至少运行：

```bash
pnpm lint
pnpm exec tsc --noEmit
```
