# Team Conventions

## Purpose

This file stores shared, durable collaboration conventions for every contributor and every AI assistant working on 7Flows.

- Shared repo canonical language is English from 2026-03-17 onward for new shared docs, ADRs, skills, and newly added standing governance sections.
- Personal notes must live under `docs/.private/` and must not be committed.
- Product direction, architecture boundaries, and runtime facts still belong to `AGENTS.md`, `docs/product-design.md`, `docs/technical-design-supplement.md`, `docs/open-source-commercial-strategy.md`, and `docs/dev/runtime-foundation.md`.

## Shared Vs Local Memory

- Put shared engineering rules, review baselines, and collaboration expectations here.
- Put per-developer machine preferences, private reminders, proxies, or personal automation notes under `docs/.private/`.
- If a local note becomes a repo-wide rule, promote it into `AGENTS.md`, this file, a skill, or an ADR depending on scope.
- Do not use `docs/.private/` as a shared source of truth.

## Shared Working Rules

### Mainline-first delivery

- Prioritize end-to-end product closure over local cleanup, style polishing, or non-blocking refactors.
- Use `docs/dev/runtime-foundation.md` as the default source for round priority and current delivery gaps.
- Keep file splitting driven by mixed reasons-to-change, boundary leakage, or change propagation; file length is only a warning signal.

### Validation and closure

- Durable changes must end with focused validation that matches the change type.
- After a verified round, make a non-interactive Git commit unless the work is explicitly exploratory and not ready to preserve.
- Material changes must leave traceability in `docs/history/` and update `docs/dev/runtime-foundation.md` when current facts or next priorities changed.

### Local development baseline

- Backend local development should use `api/.venv` and `uv` when that environment is available.
- `docs/.taichuy/` remains a local draft area for design discussion and copywriting scratch work; it is gitignored and not a shared fact source.
- Development flows should remain runnable from local workspace code and local loopback services.

## Review And Merge Guardrails

- Auto-committing to a branch after local validation is allowed.
- Default repository pull requests must target the `taichuy_dev` branch unless maintainers explicitly announce a temporary override.
- Human review is required before merge for prompt, governance, skill, script, and local-execution-boundary changes.
- Use `.agents/skills/safe-change-review/SKILL.md` for that review path.

The following paths and change types are `P0` review scope:

- `AGENTS.md`
- `.agents/skills/`
- `docs/dev/team-conventions.md`
- `docs/adr/`
- `scripts/`
- `docker/`
- CI / workflow configs
- shell / PowerShell / Python / batch scripts
- package manager hooks and bootstrap commands
- prompt instructions, automation instructions, and merge-time governance rules

Reviewers must explicitly check for:

- prompt injection or hidden instruction escalation
- dangerous scripts, hidden downloads, or remote code execution paths
- credential exfiltration or surprising data export behavior
- external callback, webhook, or notification endpoints
- violations of the local loopback / local dependency rule

## Local-Only Dependency Rule

- Do not introduce required remote scripts, CDN assets, external hosted dependencies, or external notification endpoints into local development flows.
- Do not add `curl | bash`, remote install snippets, hidden bootstrap downloads, or shared prompts that rely on third-party hosted code.
- Allowed references inside development docs and scripts should resolve to workspace files, local sibling repos, or local loopback services.

## ADR Usage

Add or update `docs/adr/` when a decision needs durable rationale beyond a dated implementation note, especially for:

- architecture boundaries
- collaboration workflow changes
- review and security guardrails
- integration boundaries
- multi-round governance decisions

Use `docs/history/` for chronological implementation trace, and `docs/adr/` for standing decisions.
