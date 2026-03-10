# AI Development Traceability Layering

## 背景

在把“详细日志查看”从首页拆到独立 run 诊断页之后，出现了一个更关键的问题：

- run 诊断面板是给人看的
- 那么 AI 开发辅助、自动化排障和后续回放能力，应该依赖什么来做日志追溯

如果不把这件事提前讲清楚，很容易出现两类偏差：

1. 把前端面板误当成唯一事实来源，AI 只能通过 UI 文本倒推运行态
2. 为了照顾机器消费，又不断把低层原始日志塞进首页和诊断面板，导致人类界面被噪音淹没

## 目标

明确一套同时服务三类消费者的追溯分层：

1. 给人看的系统诊断和 run 诊断
2. 给 AI / 自动化 用的原始运行态追溯
3. 给开发协作与交接看的开发过程留痕

## 决策

### 1. 人类诊断层

用途：

- 首页系统诊断
- run 诊断页
- 后续调试工作台

当前接口：

- `GET /api/system/overview`
- `GET /api/system/runtime-activity`
- `GET /api/runs/{run_id}`（供 run 诊断页直接使用）

规则：

- 默认展示摘要、统计、错误提示和跳转入口
- 允许为可读性做聚合、排序、筛选和 payload 预览
- 不要求把全部原始日志直接平铺到 UI

### 2. 机器追溯层

用途：

- AI 辅助开发
- 自动化排障
- 回放与后续机器消费能力

当前事实载体：

- `runs`
- `node_runs`
- `run_events`

当前接口：

- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`

规则：

- 这里才是 AI / 自动化 默认读取的运行态事实来源
- 不依赖首页和前端面板文本抓取
- 不为了首页摘要展示而截断或隐藏关键原始信息
- `GET /api/runs/{run_id}/events` 保留原始事件列表语义
- `GET /api/runs/{run_id}/trace` 提供按 `event_type`、`node_run_id`、时间范围、`payload_key`、事件游标和顺序的机器过滤能力
- `GET /api/runs/{run_id}/trace` 可以继续补 replay / export 所需派生元信息，例如窗口时间边界和 opaque cursor，但不脱离 `run_events` 这一事实底座
- 如果未来需要更强机器查询能力，应继续围绕 `run_events` 衍生接口，而不是反向要求 UI 面板承载原始日志仓

### 3. 开发留痕层

用途：

- 解释为什么这样实现
- 记录这轮改动影响了什么
- 说明验证方式与未决问题

当前载体：

- `docs/dev/`
- 每轮验证结果
- Git 提交历史

规则：

- 这一层回答的是“开发过程”，不替代运行态日志
- 当 AI 需要理解设计意图和演进上下文时，优先查 `docs/dev/` 和提交记录

## 接口边界

| 层级 | 主要消费者 | 当前接口 / 载体 | 边界 |
| --- | --- | --- | --- |
| 人类诊断层 | 用户、开发者 | `/api/system/overview`、`/api/system/runtime-activity`、`/api/runs/{run_id}` 对应 UI | 摘要优先，可做聚合与预览，不承担唯一事实来源 |
| 机器追溯层 | AI、自动化、回放 | `runs` / `node_runs` / `run_events`，`GET /api/runs/{run_id}`，`GET /api/runs/{run_id}/events` | 原始运行态事实来源，不依赖 UI 抓取 |
| 开发留痕层 | 协作者、后续 AI | `docs/dev/`、验证结果、Git 提交 | 记录实现原因、验证与后续计划，不替代运行日志 |

## 当前结论

1. 首页和 run 诊断页都应该继续做人类友好的摘要和排障入口。
2. AI 开发与自动化排障默认直连运行态事实层，而不是解析 UI。
3. `system overview` 类接口继续保持摘要属性，不升级成“万能日志出口”。
4. 当前机器侧已具备第一版 `run trace` 接口，用于围绕 `run_events` 做过滤检索，而不是继续把原始日志堆到首页。

## 影响范围

- `AGENTS.md`
- `docs/dev/runtime-foundation.md`
- `docs/dev/user-preferences.md`
- `docs/dev/2026-03-10-system-diagnostics-observability.md`
- `api/app/api/routes/runs.py`
- `api/app/api/routes/system.py`
- `web/app/page.tsx`
- `web/app/runs/[runId]/page.tsx`

## 验证

本轮同时包含规则对齐与第一版机器 trace 接口落地。

验证方式：

- 确认现有接口已能映射到三层方案
- 确认仓库级规则、用户偏好和开发记录三处表述一致
- 通过接口测试确认 `run trace` 支持时间范围、`payload_key`、游标、顺序以及 replay 元信息

## 下一步

1. 继续增强 `run trace`，在现有时间范围和 `payload_key` 基础上补导出与回放所需字段。
2. 回到 run 诊断页继续做交互时，只做人类排障效率提升，不把它变成 AI 唯一追溯入口。
3. 后续若补 replay / export 能力，也按这三层边界继续展开。
