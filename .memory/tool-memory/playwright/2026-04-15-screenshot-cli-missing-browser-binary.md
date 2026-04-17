---
memory_type: tool
topic: Playwright screenshot CLI 在当前环境可能缺少浏览器二进制
summary: 直接运行 `pnpm --dir web/app exec playwright screenshot ...` 时，可能因为 `~/.cache/ms-playwright/.../chrome-headless-shell` 不存在而失败；当前已验证的替代做法是优先用 `node scripts/node/check-style-boundary.js ...` 完成运行时页面验收。
keywords:
  - playwright
  - screenshot
  - browser-binary
  - chrome-headless-shell
  - style-boundary
match_when:
  - 需要用 Playwright CLI 直接生成页面截图
  - 报错包含 `Executable doesn't exist`
  - 报错包含 `chrome-headless-shell`
created_at: 2026-04-15 22
updated_at: 2026-04-17 10
last_verified_at: 2026-04-17 10
decision_policy: reference_on_failure
scope:
  - playwright
  - web/app
  - scripts/node/check-style-boundary.js
---

# Playwright screenshot CLI 在当前环境可能缺少浏览器二进制

## 时间

`2026-04-15 22`

## 失败现象

在仓库根执行：

```bash
pnpm --dir web/app exec playwright screenshot --device="Desktop Chrome" <url> <file>
```

会报：

```text
Executable doesn't exist ... chrome-headless-shell
```

## 触发条件

1. 想直接用 Playwright CLI 生成截图。
2. 当前环境没有预装对应版本的 Playwright browser binary。

## 根因

Playwright CLI 依赖本地缓存里的浏览器可执行文件；当前环境只装了 npm 包，没有装对应的 `chrome-headless-shell`。

## 已验证解法

如果目标是做前端运行时验收，不要先走 `playwright screenshot`。优先改用：

```bash
node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx
```

这条路径已在当前仓库验证可用，并能完成真实页面渲染检查。

如果确实需要直接使用 Playwright CLI 或 Playwright API，先安装浏览器二进制：

```bash
pnpm --dir web exec playwright install chromium
```

`2026-04-17 10` 已验证：在报错 `Executable doesn't exist` 后执行这条命令，可补齐 `chromium` 与 `chrome-headless-shell`，随后仓库根下通过 `node` 脚本调用 `playwright.chromium.launch()` 成功完成页面校验。

## 避免建议

需要截图前，先判断这是“截图留档”还是“运行时验收”：

1. 运行时验收优先 `check-style-boundary.js`。
2. 只有必须直接跑 Playwright 时，再确认 Playwright browser binary 是否已安装；新环境可先执行 `pnpm --dir web exec playwright install chromium`。
