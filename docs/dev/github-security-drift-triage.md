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

脚本会显式调用 `gh api` 查询当前仓库的：

- 默认分支
- GraphQL `dependencyGraphManifests`
- Dependabot open alerts
- 与本地 `pnpm-lock.yaml`、`package.json` 的版本对比

如果在 GitHub Actions 中运行，脚本还会把结论写入 `GITHUB_STEP_SUMMARY`，方便在 workflow 页面直接查看证据。

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
3. 如果脚本显示 `dependencyGraphManifests` 为空或明显少于预期：
   - 到仓库 `Settings -> Security & analysis` 检查 `Dependency graph` 是否开启。
   - 如仓库策略允许，再检查 `Automatic dependency submission` 是否已配置并正常跑在默认分支。
4. 不要因为 UI 暂时没刷新就直接 dismiss alert；应先保留命令输出、锁文件事实和结论，再等待依赖图恢复或补管理员侧操作。

## 仓库自动复验

- 仓库提供 `.github/workflows/github-security-drift.yml`，会在以下时机自动复验：
  - 手动 `workflow_dispatch`
  - 每日定时 `schedule`
  - `taichuy_dev` 上与 `web/package.json`、`web/pnpm-lock.yaml`、`scripts/check-dependabot-drift.js` 相关的 push
- 工作流会上传 `dependabot-drift-report` artifact，并把摘要写入 workflow summary。
- 工作流会优先读取仓库 secret `DEPENDABOT_ALERTS_TOKEN`；如果未配置，则退回 `github.token`，并在无法读取 Dependabot alerts 时输出降级 warning，而不是把整条自动复验链直接打断。
- exit code 解释与本地一致：
  - `0`：没有 open alert
  - `1`：仍有真实未修或无法解析的告警，工作流失败
  - `2`：已确认是平台状态漂移，工作流保留 warning 与证据，但不把本轮代码视为失败
-  `3`：workflow token 无法读取 Dependabot alerts；工作流会继续保留 dependency graph 事实与 warning，但完整 drift 对比仍需 `DEPENDABOT_ALERTS_TOKEN` 或本地 `gh` 凭证。
- 当管理员完成 `Security & analysis` 检查后，优先手动重跑该 workflow，再判断告警是否自动收口。

## 当前仓库已验证的信号

- `web/package.json` 已把 `next` 固定到 `^15.5.14`，并把 `eslint-config-next` 对齐到 `^15.5.14`。
- `web/package.json` 的 `pnpm.overrides` 已把 `flatted` 固定到 `3.4.2`。
- `web/pnpm-lock.yaml` 已解析到 `next@15.5.14` 与 `flatted@3.4.2`。

因此，当 GitHub 仍报告这两个依赖的 open alert 时，应优先按“平台状态漂移”而不是“本地锁文件仍未修复”处理。
