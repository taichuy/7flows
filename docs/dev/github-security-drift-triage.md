# GitHub 安全告警漂移排查

开始前先读 `AGENTS.md`、`docs/AGENTS.md` 与 `docs/dev/team-conventions.md`。

## 适用场景

- GitHub Security / Dependabot 仍显示 `open`，但本地锁文件和 `pnpm audit` 已经升级到 patched version。
- 需要判断这是“仓库仍有真实漏洞”，还是“GitHub dependency graph / alert state 尚未刷新”。

## 快速执行

在仓库根目录运行：

```bash
node scripts/check-dependabot-drift.js
```

如果本轮目的是本地先生成 `dependabot-drift.json`，再继续 dry-run `scripts/sync-github-security-drift-issue.js` 预览 issue 正文，可改用：

```bash
node scripts/check-dependabot-drift.js \
  --report-output /tmp/dependabot-drift.json \
  --allow-platform-state-exit-zero

node scripts/sync-github-security-drift-issue.js \
  --report /tmp/dependabot-drift.json \
  --dry-run
```

其中 `--allow-platform-state-exit-zero` 只会把 `exit 2`（`platform_drift`）与 `exit 3`（`alerts_unavailable` / `repository_blocked_and_alerts_unavailable`）软化为 `0`，方便继续串接 issue 预览；如果本地仍有真实未修复告警，`exit 1` 仍会保持失败，避免把“继续修依赖”误降级成可忽略信号。

脚本会显式调用 `gh api` 查询当前仓库的：

- 默认分支
- GraphQL `dependencyGraphManifests`
- Dependabot open alerts
- 本地 manifest inventory（当前原生 dependency graph coverage 根是 `web` 的 `package.json + pnpm-lock.yaml`；本地 drift 解析仍额外覆盖 `api/`、`services/compat-dify/` 的 `pyproject.toml + uv.lock`）
- 与本地 `pnpm-lock.yaml` / `uv.lock` 和对应 `package.json` / `pyproject.toml` 的版本对比

如果在 GitHub Actions 中运行，脚本还会把结论写入 `GITHUB_STEP_SUMMARY`，方便在 workflow 页面直接查看证据。

如果仓库内已存在 `.github/workflows/dependency-graph-submission.yml`，脚本还会顺带查询默认分支最新一条 `Dependency Graph Submission` run，并优先读取其中的 `dependency-submission-report` artifact（`dependency-submission.json`，必要时回退到 `dependency-submission.txt`）把摘要串进当前结论里，避免 `GitHub Security Drift` 只停留在“manifests 还是 0”而说不清到底是平台设置阻塞、部分 root 已提交，还是平台刷新延迟。若在 GitHub Actions 中消费这条证据链，`GitHub Security Drift` job 还必须显式具备 `actions: read`，否则会在读取 workflow run / artifact 时得到 `Resource not accessible by integration` 的 403。

为避免 `push` 同时触发两条 workflow 时把 submission run 永久冻结在 `in_progress` 视角，脚本现在会在 GitHub Actions 中默认额外等待最多 `30` 秒，让最新 `Dependency Graph Submission` run 尽量先完成再冻结 drift 证据；本地 CLI 默认不等待，如需覆盖可设置 `CHECK_DEPENDABOT_DRIFT_SUBMISSION_WAIT_SECONDS`。

## 结果解释

- `exit 0`
  - 当前没有 open alert。
- `exit 1`
  - 至少一个告警在本地锁文件里仍低于 patched version，或脚本无法解析当前依赖事实。
  - 这时优先修依赖、补锁文件，再重新验证。
- `exit 2`
  - GitHub 仍有 open alert，但脚本确认本地锁文件版本已经达到 patched version。
  - 这通常表示 GitHub 的 dependency graph / alert state 与默认分支事实发生了漂移。

## 推荐排查顺序

1. 先运行 `node scripts/check-dependabot-drift.js`。
2. 再运行 `cd web && corepack pnpm audit --registry=https://registry.npmjs.org --json`，确认 npm registry 视角也没有新漏洞。
3. 如果脚本显示 `dependencyGraphManifests` 为空，或 `graph coverage 缺口` 仍覆盖本地 manifest roots：
   - 到仓库 `Settings -> Security & analysis` 检查 `Dependency graph` 是否开启。
   - 不要把任何未经 artifact 复验的仓库设置自动化当成“已经开启”——当前共享事实只承认 `dependency-submission.json` / `dependabot-drift.json` 中 `repositoryBlockerEvidence` 已消失、`dependencyGraphVisibility` 开始出现 roots 之后，才算真正解除 `dependency_graph_disabled`。即使某些 `gh api repos/... security_and_analysis` patch 返回 `200`，也不能替代这一步复验。
   - 如仓库策略允许，再检查 `Automatic dependency submission` 是否已配置并正常跑在默认分支。
   - 再检查 `.github/workflows/dependency-graph-submission.yml` 是否已在默认分支成功提交 `web/pnpm-lock.yaml`、`api/uv.lock` 与 `services/compat-dify/uv.lock` 的手工 snapshot；该 workflow 只用 `github.token + contents:write` 和本地锁文件 / 依赖树构建事实，不依赖第三方 action 或远程脚本。
   - `uv` roots 不计入 GitHub 原生 graph coverage 缺口，但现在已由仓库内显式 dependency submission workflow 接手；若这些目录仍缺席，优先检查 workflow run 证据与平台刷新延迟，而不是继续误判成管理员开关问题。
4. 不要因为 UI 暂时没刷新就直接 dismiss alert；应先保留命令输出、锁文件事实和结论，再等待依赖图恢复或补管理员侧操作。

## 外部阻塞已确认时的默认处置

如果最新一轮 `dependabot-drift.json` 同时满足以下信号：

- `conclusion.kind=repository_blocked_and_alerts_unavailable`
- `recommendedActions` 已把 `enable_dependency_graph -> configure_dependabot_alerts_token -> rerun_dependency_graph_submission -> rerun_github_security_drift` 排成首要动作链
- `dependencySubmissionEvidence.repositoryBlockerEvidence.kind=dependency_graph_disabled`
- `repositorySecurityAndAnalysis.missingFields` 仍包含 `dependency_graph` / `automatic_dependency_submission`

说明当前主阻塞已经从“本地脚本是否还缺证据”收口到“仓库设置 + workflow token 权限”这两个外部动作；其中 `dependency_graph_disabled` 是更靠前的根因，`DEPENDABOT_ALERTS_TOKEN` 则负责在解除仓库设置阻塞后恢复 workflow 内的 alert 对照。artifact / summary / warning 现在都会先把 `Dependency graph` blocker 摆到 token 之前，避免继续把维护者带去先修次级动作。此时默认不要继续本地润色 `scripts/check-dependabot-drift.js`、`scripts/submit-dependency-snapshots.js` 或 workflow summary 文案，而应按下面顺序推进：

1. 仓库管理员在 `Settings -> Security & analysis` 开启 `Dependency graph`，必要时顺带核对 `Automatic dependency submission`。
2. 仓库管理员在 `Settings -> Secrets and variables -> Actions` 补齐 `DEPENDABOT_ALERTS_TOKEN`，让 `GitHub Security Drift` 能在仓库设置解除后恢复 Dependabot alerts 对照。
3. workflow 维护者重跑 `Dependency Graph Submission`，确认新的 `dependency-submission.json` 不再保留 `repositoryBlockerEvidence`。
4. 确认 `dependencyGraphVisibility.visibleRoots` 开始出现 roots，或至少 `missingRoots` 不再是全量缺席。
5. 再重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否开始收口到最新 graph / alert 事实。

只有以上外部动作都完成后仍异常，才回到本地脚本层继续排查实现问题；否则默认把最新 artifact 与 `recommendedActions.href` 直接交给管理员 / maintainer 执行，不再把同一阻塞循环留在本地会话里。

## 仓库自动复验

- 仓库提供 `.github/workflows/github-security-drift.yml`，会在以下时机自动复验：
  - 手动 `workflow_dispatch`
  - 每日定时 `schedule`
  - `taichuy_dev` 上任意受脚本监控的 manifest（`**/package.json`、`**/pnpm-lock.yaml`、`**/pyproject.toml`、`**/uv.lock`）、治理 helper `scripts/dependency-governance-actions.js`、`scripts/check-dependabot-drift.js`、`scripts/submit-dependency-snapshots.js` 或两条相关 workflow 的 push
- 工作流会上传 `dependabot-drift-report` artifact，并把摘要写入 workflow summary。
- 当 `dependabot-drift.json` 已生成时，工作流还会调用 `scripts/sync-github-security-drift-issue.js` 自动创建 / 更新单一追踪 issue，把当前 `platform_drift` / `alerts_unavailable` / `repository_blocked_and_alerts_unavailable` 外部阻塞同步到仓库 issue 列表，而不是让证据只停留在 artifact。
- 追踪 issue 现在还会为默认分支 blocker 计算 state fingerprint，并在 body 里保留最近几次 blocker 快照历史：如果连续两次 workflow 看到的是同一份外部阻塞事实，脚本会保持 `noop` 而不是重复改写 issue；如果 blocker 曾被关闭、随后又回归，脚本会自动 reopen 同一条 issue，而不是新建第二条平行噪音。
- issue body 现在会同步镜像 `repositorySecurityAndAnalysis.manualVerificationRequired/manualVerificationReason`：如果 repo API 仍缺失 `dependency_graph` / `automatic_dependency_submission` 字段，issue 会重复提醒“不要把 `gh api -X PATCH repos/{owner}/{repo}` 的成功返回当成完成信号”，并附上 GitHub 官方文档入口，避免异步接手的人只看 issue 时又回到错误动作顺序。
- 除了 summary / artifact，drift step 现在会把脚本生成的整套 machine-readable outputs 一并写入 `GITHUB_OUTPUT` 并透传为 job outputs：除了 `recommended_actions_count`、`recommended_actions_json` 与 `primary_recommended_action_*` 外，还包含 `conclusion_*`、`dependabot alert` 可见性 / 计数、`dependency submission` 证据可用性、`actions: read` 权限阻塞标记、仓库 `security_and_analysis` 状态、`repositoryBlocker` 状态 / roots，以及 `dependency_graph_visible_roots_json` / `dependency_graph_missing_roots_json` / `dependency_graph_check_error` 等 graph 可见性字段，方便后续 workflow / agent 直接消费同一份 follow-up 契约，而不是再解析文本 summary。
- issue sync step 现在也会把 `tracking_issue_action`、`tracking_issue_number`、`tracking_issue_url`、`tracking_issue_should_track`、`tracking_issue_current_ref`、`tracking_issue_default_branch`、`tracking_issue_state_fingerprint`、`tracking_issue_resolved` 与 `tracking_issue_state_changed` 写入 `GITHUB_OUTPUT` 并透传为 job outputs，后续 workflow / agent 不需要再翻 issue 列表或解析日志，就能直接拿到这条外部 blocker handoff 的机器可读坐标，以及“这次同步只是刷新快照，还是 blocker 语义真的变化了”。
- 当首要动作是仓库管理员去开 `Dependency graph` 时，`primary_recommended_action_manual_only=true`、`primary_recommended_action_manual_only_reason=github_settings_ui`、`primary_recommended_action_documentation_href` / `_label` 也会同步输出，明确告诉后续 workflow / agent：这一步当前是 GitHub 设置页里的手动动作，应优先跟随官方文档与 UI 复验，而不是继续尝试 repo settings patch。
- 如果 repo API 仍缺失 `dependency_graph` / `automatic_dependency_submission` 字段，step outputs 还会额外给出 `repository_security_and_analysis_manual_verification_required=true` 与 `repository_security_and_analysis_manual_verification_reason=missing_dependency_graph_fields`，提醒后续 workflow / agent 即使看见某次 `gh api -X PATCH repos/{owner}/{repo}` 返回 200，也不能把它当成完成信号。
- 由于该 workflow 需要查询 `Dependency Graph Submission` 的最新 run 并下载其 artifact，同时还要同步追踪 issue，`.github/workflows/github-security-drift.yml` 现在显式声明 `actions: read`、`contents: read`、`security-events: read` 与 `issues: write`；若后续复制或裁剪该 workflow，请不要丢掉 `actions: read` 与 `issues: write`。
- artifact 现在会同时保留：
  - `dependabot-drift.txt`：给人读的命令输出
  - `dependabot-drift.json`：给后续自动化 / agent 复验消费的机器可读报告，包含 manifest coverage、当前仓库 `security_and_analysis` 快照（`repositorySecurityAndAnalysis`）、最新 dependency submission evidence、submission-time `dependencyGraphVisibility`、dependency submission API 返回的原始 blocker evidence（`kind/status/message`）、有序 `recommendedActions`（`priority/audience/code/summary/rationale/roots/href/hrefLabel/manualOnly/manualOnlyReason/documentationHref/documentationHrefLabel`），以及 `actions: read` 权限阻塞标记与最终 exit code / conclusion
- 自动同步 issue 会直接复用 `dependabot-drift.json` 里的 `recommendedActions`、`repositoryBlockerEvidence`、`dependencyGraphVisibility` 与 Dependabot 漂移摘要；如果 blocker 解除，脚本会自动关闭同一条 issue，避免每次 workflow 都制造重复噪音。
- `sync_issue` step outputs 现在也会镜像首要推荐动作的 `priority/code/audience/summary/rationale/roots/href/manualOnly/documentationHref` 字段，并统一加上 `tracking_issue_primary_action_*` 前缀；后续 workflow / agent 若已经拿到了 tracking issue URL，就不必再额外解析 issue body 或跨 step 回拼首要 blocker handoff。
- issue 正文中的“状态轨迹”只会在 blocker 语义变化时追加新条目，不会因为时间戳、run 链接或例行复验而刷出重复 history；维护者既可以直接看顶部当前快照，也能回看 `primary_action`、blocker 类型与 `missingRoots` 的收口轨迹。
- 与之对应，workflow outputs 里的 `tracking_issue_state_changed=false` 表示本次 issue sync 只是刷新时间戳、run 链接或其它 freshness 字段；只有当 fingerprint 变化时，它才会翻成 `true`，便于后续 agent 区分“继续沿用原 blocker 判断”与“需要重新审阅新的外部事实”。
- 为了让追踪 issue 始终代表默认分支事实，脚本只会在当前 ref 与 `report.defaultBranch` 一致时真正创建 / 更新 / 关闭 issue；对非默认分支的 `workflow_dispatch` 人工复验，脚本会显式输出 `skipped_non_default_branch`，避免把实验性分支结果误同步成仓库级 blocker 结论。
- 当默认分支仍存在 `graph coverage` 缺口时，summary / artifact 现在会额外串上最新 `Dependency Graph Submission` run 证据；如果 submission workflow 已明确给出 `repository blocker`，优先按仓库设置阻塞处理，而不是继续怀疑本地 inventory 或 snapshot 覆盖面。
- `repositorySecurityAndAnalysis` 会保留同一时刻从 `GET /repos/{owner}/{repo}` 读到的 `security_and_analysis` 原始字段集合、`dependencyGraphStatus` / `automaticDependencySubmissionStatus` 归一化状态，以及 `missingFields`。如果 GitHub repo API 没返回 `dependency_graph` 或 `automatic_dependency_submission` 字段，不要把“字段缺失”误判成“已开启”；仍以 submission artifact 的 `repositoryBlockerEvidence` 与 `dependencyGraphVisibility` 作为最终验收事实。
- `recommendedActions` 的默认 audience 目前收口为 `repository_admin`、`workflow_maintainer` 与 `dependency_owner`；人工排查和后续 agent 续跑时，优先按 `priority` 顺序执行，不要跳过前置动作直接处理后继结论。
- 工作流会优先读取仓库 secret `DEPENDABOT_ALERTS_TOKEN`；如果未配置，则退回 `github.token`，并在无法读取 Dependabot alerts 时输出降级 warning，而不是把整条自动复验链直接打断。
- exit code 解释与本地一致：
  - `0`：没有 open alert
  - `1`：仍有真实未修或无法解析的告警，工作流失败
  - `2`：已确认是平台状态漂移，工作流保留 warning 与证据，但不把本轮代码视为失败
- `3`：workflow token 无法读取 Dependabot alerts；若同轮 artifact 已确认 `dependency_graph_disabled`，summary / conclusion 会先把仓库设置 blocker 作为首要动作，再把 `DEPENDABOT_ALERTS_TOKEN` 作为 blocker 解除后的后续恢复动作。
- 当管理员完成 `Security & analysis` 检查后，优先手动重跑该 workflow，再判断告警是否自动收口。

## 显式 dependency submission

- 仓库新增 `.github/workflows/dependency-graph-submission.yml`，会在 `workflow_dispatch`、每日定时和 `taichuy_dev` 上的 `package.json` / `pnpm-lock.yaml` / `pyproject.toml` / `uv.lock` 变更时执行。
- 共享治理 helper `scripts/dependency-governance-actions.js` 的 push 也会触发该 workflow，避免 `recommendedActions` 契约改动后没有远端复验。
- 当前它使用 `scripts/submit-dependency-snapshots.js` 为所有已跟踪的 submission roots 提交手工 snapshot；按当前代码事实，命中的 roots 是 `web`（pnpm）、`api`（uv）和 `services/compat-dify`（uv）。
- workflow artifact 现在会同时保留：
  - `dependency-submission.txt`：给人读的摘要
  - `dependency-submission.json`：给 `check-dependabot-drift` 与后续自动化复验消费的机器可读报告，包含 root 级 `status`、`snapshotId`、`blockedReason`、`warning`、`blockedKind/blockedStatus/blockedMessage`、有序 `recommendedActions`（`priority/audience/code/summary/rationale/roots/href/hrefLabel/manualOnly/manualOnlyReason/documentationHref/documentationHrefLabel`）、同轮 `repositorySecurityAndAnalysis` 快照，以及一次“提交后立即回看 `dependencyGraphManifests`”的 `dependencyGraphVisibility` 结构化证据；当多个 blocked roots 来自同一仓库级设置阻塞时，还会额外汇总为顶层 `repositoryBlockerEvidence`
- submission step 现在也会把脚本生成的整套 machine-readable outputs 一并写入 `GITHUB_OUTPUT` 并透传为 job outputs：除了 `recommended_actions_count`、`recommended_actions_json` 与 `primary_recommended_action_*` 外，还包含 `submission_mode`、仓库 `security_and_analysis` 状态、`repositoryBlocker` 状态 / roots、dependency graph 可见 / 缺失 roots，以及 graph 可见性检查错误等字段，方便后续 workflow / agent 按优先级直接接棒处理。
- 当前 GitHub 官方文档对 `Dependency graph` / `Automatic dependency submission` 的可验证入口仍是仓库设置页，而不是 repo settings patch：`[Enabling the dependency graph](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph)`、`[Configuring automatic dependency submission](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/configuring-automatic-dependency-submission-for-your-repository)`。
- 当 repo API 仍缺失 `dependency_graph` / `automatic_dependency_submission` 字段时，submission outputs 同样会把 `repository_security_and_analysis_manual_verification_required=true` 暴露给后续自动化；这表示要继续把管理员引导到 `Settings -> Security & analysis` 与新的 artifact 复验，而不是只看某次 patch 返回码。
- 当仓库级 `Dependency graph` 尚未开启时，该 workflow 现在会把 run 收口为“保留 summary + artifact 证据并输出 warning”的平台阻塞态，而不是继续把每次 push 打成无法区分真伪的红灯；此时优先处理仓库 `Settings -> Security & analysis`，不要误判成锁文件解析或本地脚本失效。
- 如果 artifact 中已经出现 `repositoryBlockerEvidence.kind=dependency_graph_disabled` 且 `status=404`，说明阻塞来自 GitHub dependency submission API 的直接返回，而不是本地 inventory / lock 解析错误；管理员侧应优先处理仓库 `Dependency graph` 设置，再决定是否需要重跑 workflow。
- 目前不要把 `gh api repos/{owner}/{repo}` 之类的仓库设置 patch 当成可靠的 `Dependency graph` 自动化入口：现有实践里它可能返回成功响应，但最新 `dependency-submission.json` 仍继续保留 `dependency_graph_disabled` / `404`。对后续 agent / maintainer 来说，真正的完成信号只有两条：一，`Dependency Graph Submission` artifact 不再带仓库级 blocker；二，`GitHub Security Drift` 里的 `dependencySubmissionEvidence.repositoryBlockerEvidence` 已清空或改为非设置类阻塞。
- 如果 `dependency-submission.json` 或 `dependabot-drift.json` 中 `repositorySecurityAndAnalysis.missingFields` 仍包含 `dependency_graph` / `automatic_dependency_submission`，说明当前 repo API 视角依旧不完整；这时更要保留 artifact，把 repo API 快照与 submission blocker 两条证据一起交给管理员人工确认，而不是只看某一次 API patch 返回码。
- 该脚本直接调用 GitHub dependency submission REST API：
  - `web` 侧通过 `pnpm list --lockfile-only` 提交 resolved tree，并保留 `direct|indirect`、`runtime|development` 关系事实；这足以覆盖当前 `next` / `flatted` 这类 default branch runtime 告警主线。
  - `uv` 侧直接解析 `uv.lock` 中的 editable root、runtime direct deps、optional `dev` group 与 transitive dependency tree，把 `api/uv.lock`、`services/compat-dify/uv.lock` 也纳入 GitHub graph / drift 对照入口。
- 当前 `pnpm list --lockfile-only` 在本仓库下还不能稳定暴露 development roots，所以 workflow summary 仍会显式提示这只是“先收口 runtime dependency graph 覆盖”的中间态，不要误以为 pnpm devDependencies 已全部进入 GitHub graph。
- workflow summary / artifact 现在还会显式给出“当前哪些 roots 已经在 GitHub graph 里可见、哪些 roots 提交后仍暂未可见”；这一步只表达 submission 之后的即时观测，不直接等价于最终失败，便于把“仓库设置阻塞”“平台刷新延迟”“部分 root 已经出现”区分开。
- 这样做的目标不是替代 `github-security-drift` 的告警比对，而是把跨 `pnpm + uv` 的最高优先级 runtime / governance roots 都收口到“仓库自己显式提交 dependency snapshot”的稳定链路上。
- workflow 的 exit code 现约定为：`0` = snapshot 已提交；`2` = 被仓库 `Dependency graph` 设置阻塞、需管理员处理但代码事实已保留；其它非零 = 本地脚本、权限或 API 合约异常，需继续修实现。
- 如果 workflow 成功但 `dependencyGraphManifests` 仍长期缺少这些 lockfile，说明平台侧仍可能存在刷新延迟或权限异常，应优先保留该 workflow run 证据，再继续管理员侧排查。

## 当前仓库已验证的信号

- `web/package.json` 已把 `next` 固定到 `^15.5.14`，并把 `eslint-config-next` 对齐到 `^15.5.14`。
- `web/package.json` 的 `pnpm.overrides` 已把 `flatted` 固定到 `3.4.2`。
- `web/pnpm-lock.yaml` 已解析到 `next@15.5.14` 与 `flatted@3.4.2`。

因此，当 GitHub 仍报告这两个依赖的 open alert 时，应优先按“平台状态漂移”而不是“本地锁文件仍未修复”处理。

当前脚本仍把 `uv` 根从“原生 graph coverage 缺口”里剥离，但不再只停留在本地告警版本解析。换句话说：

- `web` 的 `pnpm` 根仍应作为 GitHub 原生 dependency graph / automatic dependency submission 的事实来源；如果它缺席，优先排查管理员设置或工作流侧 submission。
- `api/`、`services/compat-dify/` 的 `uv` 根通过显式 dependency submission workflow 进入 graph / alert drift 对照；若它们缺席，优先检查 workflow 证据与平台刷新，而不是误报成管理员开关未开启。

如果后续 GitHub 开始返回 Python 生态告警，脚本也会优先使用对应目录下的 `uv.lock` 解析实际版本，并回看 `pyproject.toml` 中的声明 specifier；不要再把 Python 告警手动降级为“脚本不支持”。

新增 `uv` / `pnpm` manifest root 时，优先保持文件名落在上述受支持集合内；workflow path filter 会自动命中，不需要再为具体目录手工补一轮枚举。
