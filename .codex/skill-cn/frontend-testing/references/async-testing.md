# 异步测试指南

## 常见异步场景

7Flows 前端最常见的异步测试对象包括：

- 页面级数据获取
- 保存配置后的反馈
- 调试面板加载运行记录
- 发布配置提交
- debounce 或延迟提示

## 基本模式

### 等待异步结果

```ts
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument()
})
```

### 优先使用 `findBy*`

```ts
const heading = await screen.findByRole('heading')
expect(heading).toBeInTheDocument()
```

### 用户交互是异步的

```ts
const user = userEvent.setup()
await user.click(screen.getByRole('button'))
```

## 定时器场景

对 debounce、轮询或延迟反馈使用 fake timers：

```ts
vi.useFakeTimers()
// trigger
vi.advanceTimersByTime(300)
vi.useRealTimers()
```

## 常见错误

- 忘记 `await`
- 一个 `waitFor` 里塞太多断言
- 开启 fake timers 后不恢复
- 在真实 promise 与 fake timers 间混乱切换

## 7Flows 关注点

对于异步 UI，优先测这些状态切换：

- `loading -> success`
- `loading -> empty`
- `loading -> failed`
- `submitting -> disabled -> settled`
