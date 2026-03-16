# 2026-03-17 Operator Action Live Snapshots

## 背景

- `docs/dev/runtime-foundation.md` 已把 `P0 WAITING_CALLBACK` 的下一步收敛到“动作执行后的 fresh run snapshot / blocker delta”。
- 上一轮提交 `a3c944b feat: add callback operator status badges` 先把 callback waiting 的 operator status 显式化；随后 `29d41c5 feat: clarify operator action result explanations` 又把手动恢复、cleanup、审批与通知重试的 expectation / result 文案收口到共享 presenter。
- 但当前页内的成功提示仍偏“静态解释”：operator 知道动作做了什么，却还要自己再跳去看 run / ticket 最新状态，才能确认 waiting 链路到底有没有推进。

## 目标

1. 延续 `WAITING_CALLBACK` 主线，不转去做和主业务闭环无关的纯整理。
2. 把 operator 动作成功提示从“通用说明”升级成“带当前实时快照的解释”。
3. 进一步降低人类 operator 在 callback waiting / approval pending 场景中的二次确认成本。

## 实现

### 1. 手动恢复结果接入 run 实时快照

- 更新 `web/app/actions/runs.ts`
  - 复用 `/api/runs/{run_id}/resume` 已返回的 `RunDetail`，不再只读取 `status`。
  - 新增对 `current_node_id` 与当前节点 `waiting_reason` 的提取。
- 更新 `web/lib/operator-action-result-presenters.ts`
  - `formatManualResumeResultMessage` 现可组合：
    - 当前 run 状态
    - 当前节点
    - 当前 waiting reason

这样 operator 在同一条成功消息里，就能先看到“恢复后现在停在哪”，不必只得到一句抽象的“已发起恢复尝试”。

### 2. 审批决策结果接入 waiting / policy 快照

- 更新 `web/app/actions/sensitive-access.ts`
  - 审批动作现复用 `/api/sensitive-access/approval-tickets/{ticket_id}/decision` 返回的：
    - `approval_ticket.waiting_status`
    - `request.decision_label`
    - `request.reason_label`
    - `request.policy_summary`
- 更新 `web/lib/operator-action-result-presenters.ts`
  - `formatApprovalDecisionResultMessage` 现会把审批动作和当前 waiting / policy 快照拼在同一层解释里。

这让 operator 能更直接看清“批准/拒绝之后，waiting 链路现在落到了 waiting / resumed / failed 哪一种事实”。

### 3. 通知重试结果接入最新 waiting 状态

- 更新 `web/app/actions/sensitive-access.ts`
  - 通知重试现复用 `/api/sensitive-access/notification-dispatches/{dispatch_id}/retry` 返回的 `approval_ticket.waiting_status`。
- 更新 `web/lib/operator-action-result-presenters.ts`
  - 通知重试提示不再只说“已投递 / 已入队 / 失败”，还会补一层“当前 waiting 链路仍处于什么状态”。

这能减少 operator 把“通知送达”误读成“run 已经恢复”的风险。

## 影响评估

### 对架构链条的意义

- 本轮没有新增第二套 waiting / approval / notification 模型。
- 复用的仍是既有：
  - `RunDetail`
  - `ApprovalTicketDecisionResponse`
  - `NotificationDispatchRetryResponse`
- 增强的是现有 runtime facts 之上的 **operator action explanation layer**，说明当前主架构已经足以继续承接功能性开发，而不需要回头重搭骨架。

### 对产品闭环的意义

- 主要服务对象仍是 **人类 operator**，属于“AI 与人协作层”的排障 / 恢复场景。
- 改动前：
  - operator 能做动作；
  - 也能看到统一文案；
  - 但动作后最新状态仍需要自己再二次比对页面其余区域。
- 改动后：
  - operator 能在动作结果消息里直接看到 run / waiting / policy 的最新快照；
  - callback waiting 的主链因此更接近“动作 → 结果 → 下一步判断”闭环。

## 文件解耦判断

- 本轮没有做额外拆文件，原因不是忽略解耦，而是当前最值钱的推进点在主业务闭环上。
- 当前新增逻辑继续收口在 `web/lib/operator-action-result-presenters.ts`，职责仍然明确：专门负责 operator 动作结果解释。
- 这次判断符合“先补主链，再做结构整理”的优先级，不属于陷入细枝末节。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 下一步

1. 继续把 callback summary / publish detail 上的 **blocker delta** 做成更持久的页面事实，而不只停留在 action success message。
2. 继续沿 `P0 WAITING_CALLBACK` 收口“动作后是否减少 blocker、是否真正离开 waiting”的统一摘要。
3. 保持优先级集中在 waiting / diagnostics / editor 主线，不回到纯文件整理或无闭环的样式微调。
