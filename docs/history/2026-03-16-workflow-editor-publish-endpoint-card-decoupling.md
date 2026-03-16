# 2026-03-16 Workflow Editor Publish Endpoint Card Decoupling

## 背景

- 2026-03-16 当天 workflow editor 已连续完成 `workbench orchestration`、`workflow-level state` 与 `selected node actions` 的拆层，最近一次 Git 提交为 `ac379a8 refactor: split workflow editor node actions`。
- 在继续复核当前代码、`runtime-foundation` 与近期开发留痕后，可以确认这条 editor 解耦主线仍然成立，且需要继续沿同一方向衔接，而不是横向切到新的大主题。
- 抽查 `web/components/workflow-editor-publish-endpoint-card.tsx` 后，发现 publish endpoint 卡片仍把基础字段、schema JSON、rate limit、cache policy 与 validation focus 滚动全部堆在单文件中，已经成为 inspector / publish 侧新的自然热点。

## 目标

- 继续沿 workflow editor 主线做低风险解耦，缩小 publish endpoint card 的单文件复杂度。
- 把 `rate limit` 与 `cache policy` 两块可独立演进的 publish policy UI 从主卡片中拆出。
- 保持 publish draft 的交互、字段路径聚焦、保存前校验与现有组件 API 不变。

## 实现

### 1. 新增 publish endpoint policy sections

- 新增 `web/components/workflow-editor-publish-endpoint-card-sections.tsx`。
- 将以下逻辑从主卡片拆出到独立 section：
  - `WorkflowEditorPublishEndpointRateLimitSection`
  - `WorkflowEditorPublishEndpointCacheSection`

### 2. 主卡片收口为基础字段 + schema + orchestration

- `web/components/workflow-editor-publish-endpoint-card.tsx` 现在主要保留：
  - endpoint 基础 metadata 字段
  - schema JSON 编辑
  - validation focus scroll/focus
  - 调用拆出的 policy sections
- `rate limit` 与 `cache` 的默认值、输入解析和嵌套 patch 逻辑不再继续堆在主卡片里，后续如果要继续补 publish binding identity、更多 policy 字段或 capability 呈现，可以在独立 section 内演进。

## 影响范围

- `web/components/workflow-editor-publish-endpoint-card.tsx`
- `web/components/workflow-editor-publish-endpoint-card-sections.tsx`
- `docs/dev/runtime-foundation.md`
- `docs/history/2026-03-16-workflow-editor-publish-endpoint-card-decoupling.md`

## 验证

- `cd web; pnpm lint`
- `cd web; pnpm exec tsc --noEmit`
- `git diff --check`

## 结论

- 最近一次提交 `ac379a8` 之后，项目仍然最适合继续沿 workflow editor 解耦主线推进；这轮改动属于明确衔接，而不是偏离方向的新开题。
- 当前基础框架已足够承接后续功能性开发，重点不在“是否重搭架构”，而在于持续把 editor / publish / diagnostics 的热点从大文件和混合职责中拆出来。
- 下一步可继续顺着 publish / inspector 主线，优先拆 publish binding identity、schema editor 与 validation focus 之间剩余耦合，并结合后端 preflight 继续收敛字段级提示的一致性。
