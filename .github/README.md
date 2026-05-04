# GitHub Automation

This directory owns GitHub Actions automation for repository quality gates.

## Files

| Path | Purpose |
| --- | --- |
| `.github/workflows/verify.yml` | Automatic CI for `pull_request` and `push` to `main`. |
| `.github/workflows/quality-gate.yml` | Manual quality gate run that creates one new GitHub Issue report per run. |
| `.github/actions/quality-gate/action.yml` | Reusable repository-local action used by CI and manual quality gates. |

## Automatic CI

`verify.yml` runs automatically on:

- `pull_request`
- `push` to `main`

It calls the local Quality Gate Action with:

```yaml
scope: ci
report_type: ci
publish_issue: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
```

Automatic CI creates a GitHub Issue for main branch push failures and uploads
`tmp/test-governance` as the `test-governance-artifacts` artifact. The issue body includes
a failure excerpt; use the artifact for full logs.

## Manual Quality Gate

`quality-gate.yml` is triggered from GitHub Actions with `workflow_dispatch`.

Recommended first run:

```text
scope: ci
report_type: ci
environment: leave empty
```

Manual runs call the same Quality Gate Action with `publish_issue: "true"`. Each manual run
creates a new GitHub Issue. It does not reuse a fixed Issue and does not append comments to
old reports.

## Scope Options

| Scope | Command |
| --- | --- |
| `ci` | `node scripts/node/verify-ci.js` |
| `repo` | `node scripts/node/verify-repo.js` |
| `backend` | `node scripts/node/verify-backend.js` |
| `coverage` | `node scripts/node/verify-coverage.js all` |

Use `ci` for the full repository quality gate. Use narrower scopes only when debugging or
when a faster targeted report is enough.

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

Existing warning, coverage, screenshot, and QA evidence files remain under
`tmp/test-governance/`.

## Setup Order

Workflows must install pnpm before enabling `setup-node` pnpm cache:

```yaml
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v4
  with:
    cache: pnpm
```

Putting `setup-node` before `pnpm/action-setup` can fail with `Unable to locate executable
file: pnpm`.
