---
memory_type: project
topic: 模块 03 application shell 需要为 04 05 06B 预留明确能力锚点后才能写入正式 spec
summary: 用户在 `2026-04-15 09` 明确同意应用详情统一采用 `orchestration/api/logs/monitoring` 四个通用 path，但否决现版 `03` 设计直接入 spec，要求 `03` 明确为后续 `04 编排`、`05 运行日志/监控`、`06B 应用级 API Key / 对外交付` 预留对象关联、分区壳层、最小接口锚点与数据边界；参考口径对齐 `../dify` 的 workflow app。
keywords:
  - module-03
  - application
  - orchestration
  - api-key
  - logs
  - monitoring
  - dify
match_when:
  - 需要继续编写或重写 `03-workspace-and-application` spec
  - 需要判断 `Application` 详情页四分区应该只做空态还是需要未来接口锚点
  - 需要设计 `03` 与 `04/05/06B` 的边界
created_at: 2026-04-15 09
updated_at: 2026-04-15 09
last_verified_at: 2026-04-15 09
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md
  - docs/superpowers/specs/1flowbase/modules/04-chatflow-studio/README.md
  - docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowbase/modules/06b-publish-gateway/README.md
  - web
  - api
---

# 模块 03 application shell 需要为 04 05 06B 预留明确能力锚点后才能写入正式 spec

## 时间

`2026-04-15 09`

## 谁在做什么

- 用户正在审核 `03 workspace and application` 的正式设计收敛稿。
- AI 需要把当前 `Application` 容器方案修正成“可承接后续模块”的正式 spec 基线。

## 为什么这样做

- 旧版 `03` README 仍停留在 `概览 + 编排` 的两段式结构，无法覆盖用户当前已经拍板的四分区应用详情壳层。
- 如果 `03` 只保留四个视觉空态、不声明后续资源锚点，后面 `04/05/06B` 仍会各自重新发明应用级入口、API key、运行日志和监控聚合边界。

## 为什么要做

- `Application` 已被确定为一等交付容器，而不是 `Flow` 的临时别名。
- 因此 `03` 必须先把“应用内能力如何挂载到宿主”定义清楚，再交给后续专题分别补真实实现。

## 截止日期

- 无

## 决策背后动机

- 用户已确认应用详情路径统一为：
  - `/applications/:applicationId/orchestration`
  - `/applications/:applicationId/api`
  - `/applications/:applicationId/logs`
  - `/applications/:applicationId/monitoring`
- `/applications/:applicationId` 必须直接重定向到 `orchestration`，不再保留独立 `overview`。
- 用户在 `2026-04-15 09` 进一步明确：
  - 对同一 `application_type`，未来对外调用 URL 应保持统一
  - 不同应用之间的区分主要依赖各自 `API Key`
  - 因此不应在 spec 中把未来对外调用契约设计成带 `applicationId` 的调用 URL
- `03` 仍不直接实现真实 `Flow draft/version/graph`、运行时、发布网关或监控计算，但要先定义：
  - `orchestration` 分区如何绑定未来“当前应用主内容主体”
  - `api` 分区如何承接应用级 `API Key` 与触发应用执行的后续能力
  - `logs` 分区如何承接应用级运行日志与 run detail 入口
  - `monitoring` 分区如何承接应用级统计指标与 tracing/observability 配置
- 参考口径可对齐 `../dify`：
  - 应用级 `api-keys`
  - app/workflow logs
  - app statistics
  - trace config
- 但要注意只参考其“应用级密钥 + 统一 service API 入口”的思路，不照搬“把 app id 放进所有调用 URL”的口径。
- spec 编写时要避免把这些能力提前做成 `03` 的实现范围；正确做法是：
  - `03` 定义路由壳层、资源锚点、命名、权限入口与状态位
  - `04/05/06B` 再分别接入真实后端和页面内容

## 关联文档

- `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md`
- `docs/superpowers/specs/1flowbase/modules/04-chatflow-studio/README.md`
- `docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md`
- `docs/superpowers/specs/1flowbase/modules/06b-publish-gateway/README.md`
