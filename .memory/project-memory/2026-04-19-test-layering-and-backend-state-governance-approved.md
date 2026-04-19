---
memory_type: project
topic: 测试分层与后端一致性状态机治理方向已确认
summary: 用户在 `2026-04-19 18` 确认采用测试三层分级与后端状态机治理方案。测试正式分为 `fast/full/runtime-gate` 三层；前端 full gate 采用 `lint + full vitest + build + style-boundary`，`page-debug` 只进入 release 或 nightly 级运行态烟测；后端保留 `verify-backend` 作为总门禁，同时后续补一个纯测试入口。第一批正式状态机对象固定为 `flow_run`、`node_run`、`model_provider_instance`、`plugin_task`，采用“service 做迁移守卫，数据库做值域/唯一性/事务约束，测试按 service/repository/route 分层”的混合治理方案。覆盖率先只给高风险模块设阈值，`scripts/node` 测试纳入 full gate，并支持按脚本 targeted fast run。唯一调整是 warning 不作为当前治理阻塞项，相关输出统一落到 `tmp/` 供后续查看。
keywords:
  - testing
  - fast
  - full
  - runtime-gate
  - backend
  - state-machine
  - consistency
  - coverage
  - scripts
  - warning
match_when:
  - 需要继续落地测试分层命名和命令入口
  - 需要制定后端状态机治理实施计划
  - 需要判断哪些模块优先进入状态迁移矩阵
  - 需要决定 warning 是否阻塞当前治理推进
created_at: 2026-04-19 18
updated_at: 2026-04-19 18
last_verified_at: 2026-04-19 18
decision_policy: verify_before_decision
scope:
  - web
  - api
  - scripts/node
  - README.md
  - docs
---

# 测试分层与后端一致性状态机治理方向已确认

## 时间

`2026-04-19 18`

## 谁在做什么

- 用户要求把测试体系、后端接口数据一致性和状态机治理方向一次性讨论清楚。
- AI 基于仓库现状给出测试分层、后端状态机对象范围、覆盖率和门禁策略建议。
- 用户确认按建议推进，并只调整 warning 处理策略。

## 为什么这样做

- 当前仓库已经积累了较多测试资产，但缺少正式分层命名，导致开发快验、仓库全量门禁和运行态烟测混在一起。
- 后端已有 service/repository/route 和数据库约束基础，但状态迁移规则尚未被正式收口成统一矩阵与非法迁移测试。

## 为什么要做

- 把测试从“开发时顺手写的验证”升级成长期可维护的质量系统。
- 让后端一致性从“靠纪律”升级成“写入口收口 + 数据库约束 + 分层测试”三重保证。

## 截止日期

- 无硬性截止日期；后续实现时优先按该方向拆计划并逐项落地。

## 决策背后动机

- 开发期需要更快的反馈链路，因此正式把测试分为 `fast/full/runtime-gate` 三层。
- 后端状态机治理优先覆盖高风险对象，不追求一次性把所有资源都纳入。
- 覆盖率先服务高风险模块，不先引入全仓统一硬阈值。
- warning 当前不作为治理阻塞项，避免在基础分层尚未建立时被噪音拖住主线。

## 当前冻结的决定

- 测试分层正式采用 `fast/full/runtime-gate` 三层命名。
- 前端 full gate 为 `lint + full vitest + build + style-boundary`。
- `page-debug` 不进每次 PR，只作为 release 或 nightly 级运行态烟测。
- 后端保留 `verify-backend` 作为总门禁，并在后续补纯测试入口。
- 第一批正式状态机对象固定为：
  - `flow_run`
  - `node_run`
  - `model_provider_instance`
  - `plugin_task`
- 状态机治理采用混合方案：
  - service 做迁移守卫；
  - 数据库负责值域、唯一性、外键、事务和幂等约束；
  - 测试按 service / repository / route 分层。
- `scripts/node` 测试纳入 full gate，同时支持 targeted fast run。
- warning 不作为当前治理阻塞项；相关输出统一进入 `tmp/`。
