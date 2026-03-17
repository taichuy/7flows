# 2026-03-17 Collaboration Governance Restructure

## Background

7Flows has been operating with a single-maintainer style memory model where shared conventions and local personal notes were both recorded in `docs/dev/user-preferences.md`. That model was no longer suitable for a collaborative repository: it mixed shared truth with personal machine-specific preferences, left no durable ADR layer for collaboration decisions, and did not yet define an explicit review path for prompt, skill, and script changes that can introduce prompt injection or dangerous execution behavior.

The repository owner also decided that shared repo governance should use English from 2026-03-17 onward, while local personal notes should remain private and uncommitted.

## Goal

- Split shared conventions from local notes.
- Introduce an ADR layer for standing collaboration and architecture decisions.
- Add an explicit high-risk review workflow for prompts, skills, scripts, and local-execution-boundary changes.
- Encode the local-only / loopback-only development rule directly into repo governance.

## Decisions And Changes

### 1. Shared conventions vs local notes

- Added `docs/dev/team-conventions.md` as the new shared source for collaboration rules, review guardrails, and team-level engineering conventions.
- Archived the old single-maintainer preference log to `docs/expired/2026-03-17-single-maintainer-user-preferences-expired.md`.
- Replaced `docs/dev/user-preferences.md` with a deprecation pointer.
- Added `docs/.private/` as the gitignored local-notes location for per-developer private memory.

### 2. ADR layer

- Added `docs/adr/README.md`.
- Added `docs/adr/0000-template.md`.
- Added `docs/adr/0001-shared-language-local-notes-and-review-guardrails.md` to preserve the rationale for this governance shift.

### 3. Review and supply-chain guardrails

- Added `.agents/skills/safe-change-review/SKILL.md`.
- Updated `AGENTS.md` with `P0` review scope for prompt / skill / governance / script / bootstrap / local-execution-boundary changes.
- Declared `taichuy_dev` as the default pull request target branch for future contributors unless maintainers explicitly provide a temporary override.
- Wrote the local-first / loopback-first rule into shared conventions: no required remote scripts, CDN bootstrap assets, external notification endpoints, or hidden downloads inside local development flows.

### 4. Active index and skill migration

- Updated `AGENTS.md`, `README.md`, `docs/README.md`, `docs/dev/README.md`, `docs/dev/runtime-foundation.md`, and the active meta skills to point at `docs/dev/team-conventions.md` instead of `docs/dev/user-preferences.md`.
- Registered `safe-change-review` in the shared skill index.

## Impact

- Shared collaboration memory is now separated from private per-developer memory.
- Review-critical repository changes now have an explicit merge-time review path.
- The repo has a standing ADR structure for future architecture and collaboration decisions.
- English is now the canonical language for newly added shared governance docs, ADRs, skills, and newly added standing rules, while legacy Chinese content can be migrated gradually.

## Validation

- `git diff --check`
- `rg -n "user-preferences\\.md|team-conventions\\.md|docs/\\.private|safe-change-review|docs/adr/" AGENTS.md README.md docs/README.md docs/dev/README.md docs/dev/runtime-foundation.md .agents/skills`

## Next Steps

1. Gradually migrate remaining active shared governance docs and meta skills to English when new standing sections or meaningful rewrites happen.
2. Use `safe-change-review` for future prompt / skill / script / governance changes before merge.
3. Keep personal machine-specific notes inside `docs/.private/` instead of promoting them into shared repo truth.
