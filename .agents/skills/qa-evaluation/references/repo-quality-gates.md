# Repository Quality Gates

## Ownership

- 开发阶段不自动注入完整仓库质量门禁清单。
- 进入自检、验收、回归或交付阶段后，由 `qa-evaluation` 负责回答“当前范围该跑哪条门禁、是否需要组合、证据能否支撑 QA 结论”。
- 最近作用域的 `AGENTS.md` 只保留实现规则与少量不可变 QA 边界，不再枚举完整脚本清单。

## Repo-Level Gate Map

| 命令 | 主要覆盖面 | 什么时候优先跑 | 不替代什么 |
| --- | --- | --- | --- |
| `node scripts/node/test-scripts.js [filter]` | `scripts/node` 自身脚本与编排逻辑 | 改了 Node 验证脚本、CLI 编排、治理脚本 | 不替代前后端业务回归 |
| `node scripts/node/test-contracts.js` | 共享 DTO / consumer contract / style-boundary contract consumer | 改共享 console API DTO、settings / agent-flow provider consumer、`style-boundary` registry 或其他跨消费者契约 | 不替代页面质量和后端分层回归 |
| `node scripts/node/test-frontend.js fast` | 前端快速回归 | 需要仓库级前端快检，但还没到 full gate | 不替代移动端/真实运行态证据 |
| `node scripts/node/test-frontend.js full` | 前端 lint、test、build、style-boundary full gate | 要给前端结论兜底，或 `verify-repo` 前置确认 | 不替代具体页面走查和截图证据 |
| `node scripts/node/test-backend.js` | 后端测试聚合入口 | 改后端实现，需要仓库根统一触发后端最小回归 | 不替代后端分层审查和 route/service blast radius 判断 |
| `node scripts/node/verify-repo.js` | 仓库级 full gate | 需要判断“当前改动是否达到仓库级可合入基线” | 不替代 coverage 结论与运行态页面证据 |
| `node scripts/node/verify-coverage.js [frontend|backend|all]` | 覆盖率门禁 | 用户明确要求 coverage、CI 收口或全量质量审计 | 不替代功能正确性 |
| `node scripts/node/verify-ci.js` | CI 总入口 | 需要模拟 CI 最终门禁，或判断“是否可过 CI” | 不替代局部根因定位 |
| `node scripts/node/runtime-gate.js <page-debug args>` | 单路由 / 运行态页面 / 跳转链路证据 | 评估受保护页面、跳转、ready signal、console/runtime 行为 | 不替代静态代码检查与仓库级 full gate |

## Quality Gate Watch Routing

- 仓库管理者、有 GitHub Actions 和 issue 权限：按 `quality-gate-watch.md` 的 GitHub 场景走，用远端 workflow run、artifact JSON 和 issue 状态闭环。
- 无权限贡献者：不要假装能关闭 issue 或确认远端门禁；按 `quality-gate-watch.md` 的本地脚本场景运行 `verify-ci` / `verify-repo` / 定向脚本，并把产物路径、退出码和关键日志作为证据交付。
- 两种场景都不能只凭 issue 正文、PR 绿色标识或口头推测下 QA 结论；需要可复查的运行证据。

## Selection Defaults

- 默认先按最近作用域选门禁，不要一上来就 `verify-ci`。
- 只改局部前端页面时，先满足 `web/AGENTS.md` 的局部验证，再决定是否升级到仓库级 `test-frontend` 或 `verify-repo`。
- 只改后端局部实现时，先满足 `api/AGENTS.md` 的局部验证，再决定是否升级到 `test-backend` 或 `verify-repo`。
- 命中共享契约、共享 DTO、共享样式场景注册、跨消费者协议时，优先补 `test-contracts`。
- 需要给“仓库级基线是否通过”下结论时，优先 `verify-repo`；需要给“CI 是否可过”下结论时，优先 `verify-ci`。
- 需要讨论覆盖率缺口时，再补 `verify-coverage`；不要拿 coverage 结果替代功能结论。
- 需要运行态页面证据时，优先 `runtime-gate` 或直接 `page-debug`，不要只靠静态阅读代码。
- 证据已经足够支撑当前任务 QA 结论时停止；不要为了显得全面继续叠加无新增覆盖面的门禁。

## Hard Stops

- 没有实际运行证据时，不要声称某条门禁“应该会过”。
- 不能因为局部测试通过，就跳过共享消费者或 blast radius 检查。
- 不能因为 `verify-repo` 通过，就省略用户明确要求的页面运行态、截图或 coverage 证据。
