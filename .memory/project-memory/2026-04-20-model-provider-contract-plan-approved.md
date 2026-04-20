---
memory_type: project
topic: model provider contract gate 设计已批准并落成实施计划
summary: 用户在 `2026-04-20 15` 确认 `1flowbase` 的 model provider contract gate 设计无问题，并要求正式写成 implementation plan。计划文件已落在主仓 `docs/superpowers/plans/2026-04-20-model-provider-contract-gate-implementation.md`，当前冻结的实施边界为：本轮只做 `Phase A`，即修复 `style-boundary` 旧 mock、引入 `scripts/node/testing/contracts/model-providers/` 作为共享契约真相源、接入 `test-contracts` 到 `verify-repo`、同步更新最小必要的 README 与 `qa-evaluation` 说明；`cross-repo gate` 只保留在设计中，下一子项目单独实现，且强度已定为 `Blocking`。
keywords:
  - contract-gate
  - implementation-plan
  - style-boundary
  - model-provider
  - verify-repo
  - qa-evaluation
  - cross-repo-gate
match_when:
  - 需要开始执行 model provider contract gate 计划
  - 需要确认本轮实施边界
  - 需要决定是否现在实现 cross-repo gate
created_at: 2026-04-20 15
updated_at: 2026-04-20 15
last_verified_at: 2026-04-20 15
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans
  - scripts/node
  - web/app/src/style-boundary
  - web/app/src/features/settings
  - web/packages/api-client
  - .agents/skills/qa-evaluation
---

# model provider contract gate 设计已批准并落成实施计划

## 时间

`2026-04-20 15`

## 已冻结边界

1. 本轮只实现 `Phase A`，不在当前计划内落地 `cross-repo gate`。
2. `contract gate` 的共享真相源位于 `scripts/node/testing/contracts/model-providers/`。
3. fixture 按 `multiple-providers` 设计，不以单一 provider 作为默认真相。
4. `verify-repo` 将接入新的 `test-contracts`，`verify-ci` 语义保持不变。
5. README 与 `.agents/skills/qa-evaluation/SKILL.md` 需要做最小必要更新。

## 后续执行要求

1. 执行计划时，按用户习惯在 `docs/superpowers/plans/...` 中持续更新任务勾选状态。
2. 任何想把 `cross-repo gate` 提前纳入本轮实现的变更，都需要再次和用户确认。
