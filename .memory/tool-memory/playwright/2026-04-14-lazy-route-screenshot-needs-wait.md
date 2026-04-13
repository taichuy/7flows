---
memory_type: tool
topic: Playwright 截 lazy route 页面时需要等待业务选择器
summary: 当前 `tmp/demo` 使用路由懒加载；直接执行 `playwright screenshot` 会把 `正在加载页面模块...` 占位态截进去。已验证的稳定方式是对业务页面加 `--wait-for-selector`，必要时再补 `--wait-for-timeout`。
keywords:
  - playwright
  - screenshot
  - lazy route
  - wait-for-selector
  - tmp/demo
match_when:
  - 使用 Playwright CLI 给 `tmp/demo` 页面截图
  - 截图中只出现 `正在加载页面模块...`
  - Vite 页面使用 lazy route / Suspense
created_at: 2026-04-14 06
updated_at: 2026-04-14 06
last_verified_at: 2026-04-14 06
decision_policy: reference_on_failure
scope:
  - playwright
  - tmp/demo/app
  - lazy route screenshot
---

# Playwright 截 lazy route 页面时需要等待业务选择器

## 时间

`2026-04-14 06`

## 失败现象

直接执行：

```bash
playwright screenshot --browser chromium --channel chrome http://127.0.0.1:3200/ ...
```

或：

```bash
playwright screenshot --browser chromium --channel chrome http://127.0.0.1:3200/studio ...
```

截图会停留在：

```text
正在加载页面模块...
```

## 为什么会失败

- `tmp/demo` 的页面由 lazy route + `Suspense` 驱动。
- Playwright CLI 默认在页面初始可截图时就落盘，不会自动等待业务内容替换掉加载占位。

## 已验证解法

- 对目标页面补业务选择器等待：

```bash
playwright screenshot --wait-for-selector "text=应用列表" --wait-for-timeout 1500 ...
playwright screenshot --wait-for-selector "text=执行链路" --wait-for-timeout 1500 ...
```

- selector 应直接对应页面真正渲染后的业务节点，而不是通用容器。

## 后续避免建议

- 给 `tmp/demo` 抓图时，默认先判断页面是否有 lazy route。
- 如果有，就不要直接裸跑 `playwright screenshot`，先补 `--wait-for-selector`。
- 选择器优先选页面核心标题或主区块标题，避免等待到一个过早出现的外层容器。
