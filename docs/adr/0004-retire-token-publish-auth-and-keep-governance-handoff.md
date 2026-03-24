# ADR-0004: 退役 token publish auth，并保留 workflow 级治理 handoff

- Status: Accepted
- Date: 2026-03-24

## Context

7Flows 的 published surface 已经围绕 `internal` / `api_key` 打通了 draft definition 校验、binding lifecycle、gateway auth、API key 管理、publish activity audit、run diagnostics 与 operator handoff。与此同时，仓库里仍保留了历史 `authMode=token` binding 与对应 backlog 治理能力，用于把旧版本 binding 收口到 workflow detail、workflow library、publish audit、run diagnostics 和 `sensitive-access`。

如果继续把 `token` 当成“以后可能支持”的普通 publish 选项，产品会再次回到半状态：UI / schema 暗示支持，底层 gateway 与 audit 却没有真实能力。现有代码事实已经明确表明，本轮更高杠杆的方向不是补一套新的 token secret / rotation / gateway 体系，而是把“token 已退役，仅作为 legacy inventory 治理”沉淀为共享事实。

## Decision

- 当前开源主链只承诺 `authMode=api_key` 与 `authMode=internal` 两类 durable publish auth。
- `authMode=token` 不再作为待实现能力暴露给 workflow definition、publish draft 或发布网关；它仅作为历史 binding 的 legacy inventory 出现在治理 handoff、cleanup backlog 和审计导出中。
- workflow 级 `legacy_auth_governance` contract 必须显式携带这条 publish auth contract，确保 workflow library、publish detail、publish audit、run diagnostics、operator action result 与 bulk feedback 复用同一份事实。
- workflow detail 的 legacy cleanup export 也必须把这条 contract 写进导出 artifact，避免离开 UI 后再次丢失“支持哪些 auth mode、为什么还留着 token backlog”的上下文。

## Consequences

- 正向结果：作者、operator 和审计入口对 publish auth 的理解保持一致，不再需要靠零散文案猜测 `token` 是否还会回归。
- 正向结果：legacy backlog 继续可治理、可导出、可交接，但不再反向污染 workflow definition 与 gateway contract。
- 代价：如果未来真的决定重新引入 token 类鉴权，就必须先补 secret 存储、轮换治理、gateway 鉴权入口、published activity / audit 追踪，再通过新的 ADR 明确恢复边界，而不能直接复用旧文案。
- 约束：后续任何新增入口只要展示 `legacy_auth_governance`，都应直接消费共享 contract，不要再复制一套“支持模式”口径。

## Follow-up

- README 与 `docs/open-source-positioning.md` 继续保持当前开源能力边界的诚实表述。
- 发布治理相关前端入口继续复用共享 contract 卡片；不要在局部组件里单独创造另一套 token 解释。
- 若未来要重新评估 token roadmap，先以 ADR 形式说明为什么恢复，以及运行时 / gateway / audit 事实链如何同步补齐。
