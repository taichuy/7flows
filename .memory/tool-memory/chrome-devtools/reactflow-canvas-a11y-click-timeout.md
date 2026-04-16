---
memory_type: tool
topic: chrome-devtools 在 React Flow 画布节点上按 a11y uid 点击会超时
summary: 在 AgentFlow 编排页里直接对 React Flow 节点的 a11y uid 执行 click 会超时，已验证应改用页面脚本触发或验证非画布交互元素。
keywords:
  - chrome-devtools
  - react-flow
  - click-timeout
match_when:
  - 通过 chrome-devtools 的 click 点击 React Flow 画布节点 uid 时持续超时
  - 画布节点在 snapshot 里可见但无法变为 interactive
created_at: 2026-04-16 22
updated_at: 2026-04-16 22
last_verified_at: 2026-04-16 22
decision_policy: reference_on_failure
scope:
  - chrome-devtools
  - web/app AgentFlow orchestration
---

# 工具记忆

## 时间

`2026-04-16 22`

## 失败现象

在 `chrome-devtools` 中对 React Flow 画布节点的 a11y uid 执行 `click`，工具返回：

- `The element did not become interactive within the configured timeout.`

## 触发条件

- 页面为 `AgentFlowEditorPage`
- 节点渲染在 React Flow 画布内
- 目标元素来自 `take_snapshot` 的 a11y tree，而不是常规 DOM 按钮

## 根因

React Flow 画布节点在 a11y tree 中可见，但不一定能被 `chrome-devtools.click` 判定为可交互元素；在当前项目里该判定会卡在等待 interactive 的阶段并超时。

## 解法

- 不把 React Flow 画布节点点击作为主要手动验证手段
- 优先验证详情面板 header、tabs、关闭按钮这类常规 DOM 元素
- 必须切换节点时，优先使用 `evaluate_script` 直接触发页面脚本，而不是继续重试 `click`

## 验证方式

- 2026-04-16 22 在 `http://127.0.0.1:3100/applications/019d8f3a-5b3b-71e1-a32b-c97ec4139ab8/orchestration` 复现
- 对 snapshot 中的节点 uid `4_58`、`4_57` 执行 `click` 均超时
- 同页对详情面板 tab 与关闭按钮执行 `click` 正常

## 复现记录

- `2026-04-16 22`：Task 6 手动验证中复现，后续改为验证面板常规元素并记录该限制。
