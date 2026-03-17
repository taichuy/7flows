# ADR-0001: Shared Language, Local Notes, and Review Guardrails

- Status: Accepted
- Date: 2026-03-17

## Context

7Flows is moving from a single-maintainer workflow toward a collaborative repository model. The previous `docs/dev/user-preferences.md` mixed shared conventions with one developer's local memory, and the repository did not yet have a durable decision record for review-critical governance changes. The project also needs stronger guardrails against prompt injection, dangerous scripts, and remote bootstrap behavior inside local development flows.

## Decision

7Flows adopts the following collaboration structure:

1. Shared repo canonical language is English from 2026-03-17 onward for new shared docs, ADRs, skills, and newly added standing governance sections, while legacy Chinese docs migrate gradually.
2. Shared collaboration rules move to `docs/dev/team-conventions.md`.
3. Per-developer local notes move to `docs/.private/` and must remain gitignored.
4. `docs/adr/` becomes the durable decision log for architecture, collaboration, security, and review-boundary choices.
5. High-risk governance changes may be auto-committed to a branch after validation, but require human review before merge.
6. Prompt, skill, governance, script, bootstrap, and local-execution-boundary changes are `P0` review scope and must be reviewed with the `safe-change-review` skill.
7. Local development flows must stay local-first and loopback-first; shared development paths must not depend on remote scripts, external notification endpoints, or externally hosted bootstrap assets.
8. Default repository pull requests target `taichuy_dev` unless maintainers explicitly announce a temporary override.

## Consequences

- Shared rules stop accumulating in a single-maintainer preference log.
- Legacy Chinese documents can remain temporarily, but new shared governance docs, ADRs, skills, and newly added standing rules should be authored in English.
- Reviewers now have an explicit process for high-risk repository changes.
- Contributors must keep development instructions and scripts free of hidden remote execution or callback behavior.

## Follow-up

- Incrementally migrate active shared governance docs and skills toward English.
- Keep `docs/dev/user-preferences.md` as a deprecation pointer only.
- Apply `safe-change-review` whenever future changes touch prompts, skills, governance docs, scripts, CI, Docker, or local-execution boundaries.
