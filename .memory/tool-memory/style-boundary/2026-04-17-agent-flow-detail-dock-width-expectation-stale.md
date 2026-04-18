---
memory_type: tool
topic: style-boundary 校验 agent-flow detail dock 时可能被过期宽度断言拦住
summary: 对 `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css` 跑 `style-boundary` 时，`page.application-detail` 场景仍断言 `.agent-flow-editor__detail-dock` 宽度为 `520px`，但当前运行态实际为 `320px`，会导致与本次局部样式改动无关的失败。
keywords:
  - style-boundary
  - agent-flow
  - detail-dock
  - width
  - 520px
match_when:
  - 运行 `node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
  - 报 `editor-detail-dock.width expected=520px actual=320px`
created_at: 2026-04-17 14
updated_at: 2026-04-17 14
last_verified_at: 2026-04-17 14
decision_policy: reference_on_failure
scope:
  - style-boundary
  - scripts/node/check-style-boundary.js
  - web/app/src/style-boundary/scenario-manifest.json
  - web/app/src/features/agent-flow/lib/detail-panel-width.ts
---

# style-boundary 校验 agent-flow detail dock 时可能被过期宽度断言拦住

## 时间

`2026-04-17 14`

## 失败现象

执行：

```bash
node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css
```

报错：

```text
[1flowbase-style-boundary] 样式边界失败：page.application-detail editor-detail-dock.width expected=520px actual=320px
```

## 触发条件

- 命中 `agent-flow-editor.css` 对应的 `page.application-detail` 场景
- manifest 仍要求 `.agent-flow-editor__detail-dock` 为 `520px`
- 当前代码真实默认宽度来自 `NODE_DETAIL_DEFAULT_WIDTH = 320`

## 根因

`style-boundary` 场景断言与当前 `agent-flow` 详情面板默认宽度常量不一致，属于场景基线过期，不一定代表本次局部样式改动引入了回归。

## 解法

1. 先检查报错属性是否来自当前改动点。
2. 如果报错是 `editor-detail-dock.width 520px -> 320px`，优先回看：
   - `web/app/src/style-boundary/scenario-manifest.json`
   - `web/app/src/features/agent-flow/lib/detail-panel-width.ts`
3. 确认产品期望后，再决定是更新 manifest 断言还是恢复详情面板默认宽度；不要把这种基线漂移直接算到当前局部样式修改上。

## 验证方式

`2026-04-17 14` 已验证：执行上述命令稳定报 `expected=520px actual=320px`。

## 复现记录

- `2026-04-17 14`：在验证 agent-flow 节点详情紧凑布局时，`style-boundary` 因 detail dock 宽度旧断言失败。
