---
memory_type: project
topic: page-debug 本地页面调试脚本设计已确认
summary: 自 2026-04-18 10 起，页面调试脚本方案已确认采用 `scripts/node/page-debug.js`，默认执行 `snapshot`，输出落在 `tmp/page-debug/<时间戳>/`，抓取范围固定为 `html/css/js`，并补充 AI 友好的页面就绪契约、结构化 JSON 输出、`storage-state.json`、页面截图和控制台日志。
keywords:
  - page-debug
  - playwright
  - snapshot
  - open
  - root auth
  - frontend
  - json output
  - storage state
  - ready state
  - screenshot
  - console log
match_when:
  - 需要实现或调整页面调试脚本
  - 需要确认脚本默认行为和输出目录
  - 需要判断抓取范围是否包含图片和字体
created_at: 2026-04-18 10
updated_at: 2026-04-18 10
last_verified_at: 2026-04-18 10
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-18-page-debug-design.md
  - scripts/node/page-debug.js
  - scripts/node/page-debug/core.js
---

# page-debug 本地页面调试脚本设计已确认

## 时间

`2026-04-18 10`

## 谁在做什么

- 用户要求新增一个面向前端调试的 Node 脚本。
- AI 负责收口脚本入口、认证方式、Playwright 打开页面方式和页面快照输出结构。

## 为什么这样做

- 本地调试时重复手工输入 root 凭据、重复进入登录页，会放大页面验收成本。
- 只在浏览器开发者工具里零散查看 `DOM / CSS / JS`，不利于快速定位页面渲染问题。

## 为什么要做

- 把登录、打开页面、抓取页面统一成一条本地调试路径。
- 让页面渲染结果可以沉淀为目录化产物，便于排查和复看。

## 截止日期

- 无

## 决策背后动机

- 脚本入口固定为 `scripts/node/page-debug.js`，保持和现有 `scripts/node/*` 工具结构一致。
- 默认行为固定为 `snapshot`，因为用户主要诉求是获取页面产物，而不是只打开页面。
- 输出目录固定为 `tmp/page-debug/<时间戳>/`，避免把调试产物落到正式文档目录。
- 抓取范围只包含 `html/css/js`，图片和字体不做本地落盘。
- 登录方案固定复用 `.env + 现有登录接口 + Playwright context cookie`，不引入数据库旁路逻辑。
- 脚本主要服务于“开发者给一个路由，AI 直接接手排查”的场景，因此成功和失败都需要稳定的结构化输出。
- `open` 与 `snapshot` 必须默认生成 `storage-state.json`，便于后续 Playwright 自动化继续复用认证态。
- `open` 与 `snapshot` 还必须默认生成页面截图和结构化控制台日志，作为前端问题排查证据。
- 页面抓取前必须先达到基础稳定态；若页面业务数据需要更明确的完成条件，则通过 `--wait-for-selector` 补充等待。
