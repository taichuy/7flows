# 前端测试 Mock 指南

## 原则

只 mock 真正必要的外部依赖：

- 网络请求
- `next/navigation`
- 浏览器 API
- 时间与定时器

不要默认假设仓库已经有：

- 全局 Zustand mock
- 全局 i18n mock
- `web/vitest.setup.ts`
- `web/__mocks__/`

这些只有在本次任务显式引入时才能使用。

## 推荐 mock 对象

### API / 数据获取

- `fetch`
- `getSystemOverview` 之类的数据获取函数
- 未来的 editor service/client

### 路由

按需 mock `next/navigation`：

```ts
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
```

### 定时器

涉及 debounce、轮询、延迟提示时使用：

```ts
vi.useFakeTimers()
vi.advanceTimersByTime(300)
vi.useRealTimers()
```

## 不要过度 mock

- 简单展示组件优先真实渲染
- 不要为了省事把被测组件的兄弟组件全 mock 掉
- 不要让 mock 行为偏离真实条件逻辑

## 状态隔离

每个测试前至少执行：

```ts
beforeEach(() => {
  vi.clearAllMocks()
})
```

如果有共享 mock 状态，也要同步重置。
