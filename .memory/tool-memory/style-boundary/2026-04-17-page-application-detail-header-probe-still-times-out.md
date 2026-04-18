---
memory_type: tool
topic: style-boundary 的 page.application-detail 当前仍会卡在 app-shell-header 可见性探针
summary: 从仓库根执行 `node scripts/node/check-style-boundary.js page page.application-detail` 时，当前仍会在 `.app-shell-header` 的 `locator.waitFor(... visible)` 上超时。`page.home` 同次执行可通过，说明这更像 `page.application-detail` 场景链路本身的不稳定，而不是本次 schema card/overlay 改动直接导致的样式断言失败。
keywords:
  - style-boundary
  - page.application-detail
  - app-shell-header
  - timeout
  - locator.waitFor
match_when:
  - 运行 `node scripts/node/check-style-boundary.js page page.application-detail`
  - 报 `.app-shell-header` 可见性等待超时
  - `page.home` 同环境可以通过
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: reference_on_failure
scope:
  - style-boundary
  - scripts/node/check-style-boundary.js
  - web/app/src/style-boundary/registry.tsx
  - web/app/src/style-boundary/scenario-manifest.json
---

# style-boundary 的 page.application-detail 当前仍会卡在 app-shell-header 可见性探针

## 时间

`2026-04-17 23`

## 失败现象

执行：

```bash
node scripts/node/check-style-boundary.js page page.application-detail
```

报错：

```text
[1flowbase-style-boundary] locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.app-shell-header').first() to be visible
```

同一轮里：

```bash
node scripts/node/check-style-boundary.js page page.home
```

可以正常 `PASS`。

## 触发条件

- 从仓库根执行 `style-boundary` page probe。
- 场景为 `page.application-detail`。
- 入口场景使用 `renderRouterScene('/applications/app-1/orchestration')`。

## 根因判断

- 当前证据更像 `page.application-detail` 场景加载链本身不稳定，至少不是简单的 manifest 宽度断言错误。
- 因为 `page.home` 同环境通过，且 `registry.test.tsx` 里的 scene registry 单测仍是绿色，所以不要把这类 header 可见性超时直接归因到本次 schema UI 改动。

## 解法建议

1. 先把这条结果当成验证链路风险记录，不要直接判定为样式回归。
2. 后续若要继续追：
   - 优先查 `style-boundary` runtime scene 的实际加载日志/控制台错误
   - 复核 `renderRouterScene('/applications/app-1/orchestration')` 在 dev-up 环境下是否发生重定向或首屏异常
   - 再决定是增加等待条件、修 scene 种子，还是修真实页面异常

## 验证方式

- `2026-04-17 23` 已验证：`page.home` 通过，`page.application-detail` 稳定卡在 `.app-shell-header` 可见性等待。

## 复现记录

- `2026-04-17 23`：schema card / overlay 迁移完成后，从仓库根重跑 `style-boundary`，`page.application-detail` 仍超时在 `.app-shell-header`，与此前判断一致。
