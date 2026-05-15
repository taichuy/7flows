# GitHub Automation

This directory owns GitHub Actions automation for repository quality gates.

## Files

| Path | Purpose |
| --- | --- |
| `.github/workflows/verify.yml` | Automatic CI for `pull_request` and `push` to `main` / `latest`; runs repo, backend consistency, coverage, and React Doctor frontend gates in parallel, then publishes one aggregate issue only for `latest` pushes. |
| `.github/workflows/quality-gate.yml` | Manual and nightly quality gate run; full `ci` scope runs component gates in parallel before one aggregate Issue report. |
| `.github/actions/quality-gate/action.yml` | Reusable repository-local action used by CI, manual, and nightly quality gates. |

## Automatic CI

`verify.yml` runs automatically on:

- `pull_request`
- `push` to `main`
- `push` to `latest`

It runs three local Quality Gate Action jobs in parallel:

```yaml
scope: repo
scope: backend-consistency
scope: coverage
```

It also runs React Doctor as a frontend quality gate against `web/app` changed files:

```yaml
uses: millionco/react-doctor@main
directory: web/app
diff: main
fail-on: warning
offline: "true"
```

The final aggregate job downloads the three component artifacts and publishes a single
report with:

```yaml
INPUT_PUBLISH_ISSUE: ${{ github.event_name == 'push' && github.ref == 'refs/heads/latest' }}
```

Automatic CI creates a GitHub Issue only for `latest` branch pushes and uploads the
merged `tmp/test-governance` directory as the `test-governance-artifacts` artifact. The
issue body includes the aggregate result summary, component status table, warning status,
coverage percentages, evidence paths, and a failure excerpt when a component gate fails.
Use the artifact for full logs and raw coverage files.
Runs use branch-level concurrency, so a newer push cancels an older in-progress quality gate
for the same branch before stale runs can publish or close quality issues.

## Manual And Nightly Quality Gate

`quality-gate.yml` is triggered from GitHub Actions with `workflow_dispatch` and by a daily
schedule at 18:00 UTC, which is 02:00 Asia/Shanghai.

Recommended first run:

```text
scope: ci
report_type: ci
environment: leave empty
```

For `scope: ci`, manual and scheduled runs mirror the automatic CI shape: `repo`,
`backend-consistency`, and `coverage` run as separate jobs, then an aggregate job downloads
their artifacts, publishes one Issue report, and uploads `test-governance-artifacts`.
This keeps wall time close to the slowest component gate instead of the sum of all gates.
Each component job publishes `publish_issue: "false"`; only the aggregate job publishes the
final report with `publish_issue: "true"`.

For narrower dispatch scopes such as `repo`, `backend-consistency`, or `coverage`,
`quality-gate.yml` runs one targeted job and publishes that single-scope report directly.
Manual runs share the same target-branch concurrency group as automatic quality gates.
Scheduled runs target `latest`, use `scope: ci`, and set `environment: nightly-latest`.

## Scope Options

| Scope | Command |
| --- | --- |
| `ci` | GitHub workflow only: parallel `repo` + `backend-consistency` + `coverage`, then `github-quality-gate-aggregate.js` |
| `repo` | `node scripts/node/verify-repo.js` |
| `backend` | `node scripts/node/verify-backend.js` |
| `backend-consistency` | `node scripts/node/verify-backend-consistency.js` |
| `coverage` | `node scripts/node/verify-coverage.js all` |

Use `ci` for the full online repository quality gate. The local `node scripts/node/verify-ci.js`
entry still runs the same gates serially for environments that need one local command, but the
GitHub workflow intentionally splits `ci` across jobs for faster feedback and clearer artifacts.
Use narrower scopes only when debugging or when a faster targeted report is enough. Do not run
the backend consistency scope locally unless explicitly requested, because it exercises
database-backed Rust suites.

## Report Type

| `report_type` | Use When |
| --- | --- |
| `ci` | Code quality, regression, or repository validation. |
| `cd` | Deployment or release validation. |

For `cd` reports, set `environment` to a value such as `staging` or `production`.

## Evidence

The Quality Gate Action writes:

- `tmp/test-governance/quality-gate.latest.log`
- `tmp/test-governance/quality-gate-report.md`
- `tmp/test-governance/quality-gate-report.json`
- `tmp/test-governance/backend-consistency-targets.json` for `ci` and `backend-consistency`

Existing warning, coverage, screenshot, and QA evidence files remain under
`tmp/test-governance/`.
For `ci` and `backend-consistency` scopes, the report also includes the current backend
consistency target results: label, Cargo package, Rust test filter, status, duration,
passed count, and failed count. If the target result artifact is unavailable, the report
falls back to the static target registry with `not_run` status.

## Setup Order

Workflows must install pnpm before enabling `setup-node` pnpm cache:

```yaml
- uses: pnpm/action-setup@v5
- uses: actions/setup-node@v5
  with:
    cache: pnpm
```

Putting `setup-node` before `pnpm/action-setup` can fail with `Unable to locate executable
file: pnpm`.
