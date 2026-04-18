---
memory_type: project
topic: 1flowbase modules 旧模块 spec 需要按代码事实重分层
summary: 用户于 `2026-04-14 19` 同意先按代码事实重排 `docs/superpowers/specs/1flowbase/modules` 的模块状态，不再把 `2026-04-10` 的模块讨论稿统一视为当前实现真相；后续讨论优先区分“已实现基线”“部分实现/口径漂移”“未来设计”三类。
keywords:
  - modules
  - spec
  - status
  - code-facts
  - reclassification
match_when:
  - 需要继续整理 `docs/superpowers/specs/1flowbase/modules`
  - 需要判断旧模块 spec 是否仍可作为当前实现依据
  - 需要把模块文档按实现状态重新分层
created_at: 2026-04-14 19
updated_at: 2026-04-14 19
last_verified_at: 2026-04-14 19
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/modules
  - api
  - web
---

# 1flowbase modules 旧模块 spec 需要按代码事实重分层

## 时间

`2026-04-14 19`

## 谁在做什么

- 用户要求重新审视 `docs/superpowers/specs/1flowbase/modules` 这批最早期模块文档，判断哪些已经被后续实现和治理改写。
- AI 已基于当前 `api`、`web`、最新补充设计稿和模块 README 对照完成首轮差异判断。
- 用户确认先不直接细修文档，而是先输出一版“模块状态重排清单”作为集中讨论入口。

## 为什么这样做

- `2026-04-10` 的模块文档里同时混有三类内容：已经落地的边界、后续被新治理覆盖的旧口径、尚未真正实现的未来设计。
- 如果继续把这些模块 README 统一当作“当前真相”，后续实现、评审和 spec 回填会持续误导。

## 为什么要做

- 先按代码事实重分层，能把“应该更新什么”“应该废弃什么”“哪些只是还没做”区分开。
- 后续若要回写模块文档、主 README 或拆新 spec，需要先统一这一层状态语义，避免在错误基线上继续扩写。

## 截止日期

- 无硬截止日期；作为后续整理模块 spec 的前置共识立即生效。

## 决策背后动机

- 后续讨论以代码事实为主，而不是以最早期产品讨论稿为主。
- 模块状态优先重排为三类：
  - 已实现基线
  - 部分实现 / 口径漂移
  - 未来设计
- 当前初步建议：
  - `01/02/06/07` 保留在主模块集，但按“当前实现 + 未实现部分”重写
  - `03/04/05/08` 降级为未来设计或产品设计稿，不再标成已完成实现
