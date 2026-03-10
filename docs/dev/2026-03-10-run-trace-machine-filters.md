# Run Trace 机器过滤增强

## 背景

上一轮已经把 `GET /api/runs/{run_id}/trace` 作为面向 AI / 自动化 的机器检索入口落地，但过滤条件还停留在：

- `event_type`
- `node_run_id`
- `before_event_id`
- `after_event_id`
- `order`

这对“顺着事件序列继续翻”已经够用，但对 AI 真正排障还不够自然：

- 想只看某个时间窗内的事件，需要客户端自己拉全量后再裁剪
- 想快速定位某类 `payload` 结构，需要客户端自己扫所有事件 JSON

## 目标

在不把 `run trace` 做成重型日志仓查询接口的前提下，继续补足两类机器侧最常用的过滤能力：

- 基于 `run_events.created_at` 的时间范围过滤
- 基于 `payload` key 的轻量检索

## 决策

### 1. 时间范围直接落在事件时间戳

`GET /api/runs/{run_id}/trace` 新增：

- `created_after`
- `created_before`

约定：

- 两者都基于 `run_events.created_at`
- 语义分别为 `>=` 和 `<=`
- 若传入的是无时区时间，当前实现默认按 UTC 解释
- 若 `created_after > created_before`，直接返回 `422`

这样 AI / 自动化 可以围绕事件时间做窗口化取证，而不是只靠事件 ID 游标猜时间区间。

### 2. `payload` 检索保持轻量，不引入方言绑定

`GET /api/runs/{run_id}/trace` 新增：

- `payload_key`

当前实现策略：

- 仍然强约束在单个 `run_id` 范围内
- 先取满足其他过滤条件的事件，再在应用层对 `payload` 做 key 匹配
- 匹配时会递归展开嵌套对象与数组中的字典 key
- 同时保留叶子 key 和点路径 key，例如：
  - `artifactType`
  - `results.artifactType`

匹配语义：

- 当前采用大小写不敏感的包含匹配
- 这是为了让 AI 用较少上下文就能做“找包含某类结构的事件”这类检索

不选数据库 JSONPath / 全文方案的原因：

- 当前测试和本地开发都依赖 SQLite，过早引入 PostgreSQL 方言能力会破坏一致性
- 现阶段目标是“run 级 trace 检索增强”，不是建设独立日志搜索系统

### 3. 给机器侧补可发现的 payload key 摘要

`RunTrace.summary` 新增：

- `available_payload_keys`

用途：

- 让 AI / 自动化 在一次 trace 调用里就能先看到这个 run 中出现过哪些 payload key
- 后续可以再按这些 key 继续发起更聚焦的检索

## 影响范围

- `api/app/api/routes/runs.py`
- `api/app/schemas/run.py`
- `api/tests/test_run_routes.py`
- `docs/dev/runtime-foundation.md`
- `docs/dev/2026-03-10-ai-traceability-layering.md`

## 验证

本轮通过接口测试覆盖以下场景：

- 现有基础过滤仍可用
- `run trace` 响应中暴露 `available_payload_keys`
- 支持 `created_after` / `created_before` 时间窗过滤
- 支持按嵌套 `payload` key 做轻量检索
- 非法时间范围返回 `422`

## 下一步

1. 继续评估是否需要为回放 / 导出增加更明确的 trace 元信息。
2. 若后续 run 规模明显增大，再评估为 `payload_key` 过滤补数据库侧索引或离线索引，而不是现在过早绑定方言能力。
