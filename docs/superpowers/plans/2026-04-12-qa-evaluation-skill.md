# QA Evaluation Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable `qa-evaluation` skill package for 1Flowse that supports task-scoped regression evaluation and explicit full-project audits.

**Architecture:** Keep the trigger rules, iron law, and workflow in a concise `SKILL.md`, then push mode selection, report structure, severity rules, and checklists into `references/`. Treat the missing skill directory as the RED baseline, then add the minimal documentation needed to match the approved spec and existing `.agents/skills` patterns.

**Tech Stack:** Markdown skill docs, local references, shell verification with `test`, `sed`, `rg`, `find`, and `wc`

---

## File Structure

**Create**
- `.agents/skills/qa-evaluation/SKILL.md`
- `.agents/skills/qa-evaluation/references/modes.md`
- `.agents/skills/qa-evaluation/references/task-mode-checklist.md`
- `.agents/skills/qa-evaluation/references/project-evaluation-checklist.md`
- `.agents/skills/qa-evaluation/references/report-template.md`
- `.agents/skills/qa-evaluation/references/severity-rules.md`
- `.agents/skills/qa-evaluation/references/anti-patterns.md`

**Modify**
- `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`

**Notes**
- Keep `SKILL.md` searchable and under the same structural pattern as the existing project skills.
- The skill must read as a project QA evaluator, not as another implementation skill.
- This session does not provide a subagent test harness, so structural verification is required now and pressure-scenario testing remains a follow-up verification gap.

### Task 1: Build The QA Evaluation Skill Shell

**Files:**
- Create: `.agents/skills/qa-evaluation/SKILL.md`

- [x] **Step 1: Verify the skill package is missing**

Run: `test -f .agents/skills/qa-evaluation/SKILL.md`

Expected: exit code `1` because the skill does not exist yet.

- [x] **Step 2: Write the skill entry file**

Create `.agents/skills/qa-evaluation/SKILL.md` with:

```md
---
name: qa-evaluation
description: Use when evaluating 1Flowse task outcomes or current project quality and need an evidence-driven QA report instead of direct implementation
---

# QA Evaluation

## Overview
[Short statement: qa-evaluation is a 1Flowse-specific evaluator that reports evidence-backed findings without directly changing code.]

## When to Use
- Validate a completed task against acceptance scenarios
- Check whether a shared component or API change created blast-radius regressions
- Audit the current project state when the user explicitly requests a full evaluation
- Produce structured findings across UI, flows, state, API, and boundaries

## The Iron Law
[No QA conclusion without direct evidence. Default to reporting, not fixing.]

## Quick Reference
- Default to `task mode`
- Only enter `project evaluation mode` when the user explicitly requests a full-project assessment
- Read `.memory/AGENTS.md`, user memory, project memory, and feedback memory before judging
- Frontend structure problems must escalate to `frontend-logic-design`
- Backend contract and state problems must be checked against `backend-development`
- If evidence is missing, say `未验证，不下确定结论`

## Implementation
- Mode selection: `references/modes.md`
- Task checks: `references/task-mode-checklist.md`
- Project checks: `references/project-evaluation-checklist.md`
- Report structure: `references/report-template.md`
- Severity rules: `references/severity-rules.md`
- Anti-patterns: `references/anti-patterns.md`

## Common Mistakes
[List the highest-signal failure modes: no evidence, full audit overuse, code-review drift, UI-only nitpicking, and no blast-radius check.]
```

- [x] **Step 3: Verify the skill entry file**

Run: `sed -n '1,220p' .agents/skills/qa-evaluation/SKILL.md`

Expected: the file includes frontmatter, trigger conditions, iron law, quick-reference rules, and reference links.

Run: `wc -w .agents/skills/qa-evaluation/SKILL.md`

Expected: concise word count suitable for a frequently loaded skill, ideally under `500`.

### Task 2: Build The QA Reference Set

**Files:**
- Create: `.agents/skills/qa-evaluation/references/modes.md`
- Create: `.agents/skills/qa-evaluation/references/task-mode-checklist.md`
- Create: `.agents/skills/qa-evaluation/references/project-evaluation-checklist.md`
- Create: `.agents/skills/qa-evaluation/references/report-template.md`
- Create: `.agents/skills/qa-evaluation/references/severity-rules.md`
- Create: `.agents/skills/qa-evaluation/references/anti-patterns.md`

- [x] **Step 1: Write the mode rules**

Create `.agents/skills/qa-evaluation/references/modes.md` with a decision table covering:

```md
# QA Evaluation Modes

| Mode | Trigger | Scope | Default output |
| --- | --- | --- | --- |
| `task mode` | User asks to validate a task or current change | Current task, touched modules, affected consumers | Findings and repair direction |
| `project evaluation mode` | User explicitly asks for full-project QA | Current project state across UI, flow, API, state, architecture, tests | Findings report only |
```
```

- [x] **Step 2: Write the task and project checklists**

Create `.agents/skills/qa-evaluation/references/task-mode-checklist.md` with sections for:

```md
# Task Mode Checklist

## Scope
- task goal
- diff scope
- acceptance scenarios
- related page / module / API boundaries

## Evidence
- executed commands
- screenshots if relevant
- manual flows if relevant

## Checks
- function complete
- interaction flow intact
- shared-component blast radius checked
- state / API / data mapping still aligned
- regression coverage present
```
```

Create `.agents/skills/qa-evaluation/references/project-evaluation-checklist.md` with sections for:

```md
# Project Evaluation Checklist

## Context
- read project memory and feedback memory
- read relevant specs and module docs

## Coverage
- UI consistency
- page and flow logic
- responsive and degradation rules
- API contracts
- state and data consistency
- architecture boundaries
- test gaps
```
```

- [x] **Step 3: Write reporting, severity, and anti-pattern references**

Create `.agents/skills/qa-evaluation/references/report-template.md` with a reusable report shell containing:

```md
# QA Report Template

## Scope
## Conclusion
## Findings
### [Severity] [Title]
- Evidence:
- Why it is a problem:
- Recommended direction:
## Uncovered Areas / Risks
```
```

Create `.agents/skills/qa-evaluation/references/severity-rules.md` with `Blocking / High / Medium / Low` definitions and default handling expectations.

Create `.agents/skills/qa-evaluation/references/anti-patterns.md` with entries for:
- acting like an implementation skill
- issuing conclusions without evidence
- turning QA into generic code review
- overusing full-project mode
- checking only visuals and ignoring contracts or state
- stopping at the changed file and skipping blast radius

- [x] **Step 4: Verify the reference set**

Run: `find .agents/skills/qa-evaluation -maxdepth 3 -type f | sort`

Expected: one `SKILL.md` plus the six planned reference files.

Run: `rg -n "task mode|project evaluation mode|未验证，不下确定结论|Blocking|blast radius|项目记忆|反馈记忆" .agents/skills/qa-evaluation`

Expected: the package exposes mode selection, evidence rules, severity terms, propagation checks, and project-memory hooks.

### Task 3: Review The Package And Record Verification Limits

**Files:**
- Modify: `.agents/skills/qa-evaluation/SKILL.md`
- Modify: `.agents/skills/qa-evaluation/references/*.md`
- Modify: `docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md`

- [x] **Step 1: Read the skill and reference files together**

Run:

```bash
sed -n '1,220p' .agents/skills/qa-evaluation/SKILL.md
sed -n '1,220p' .agents/skills/qa-evaluation/references/modes.md
sed -n '1,260p' .agents/skills/qa-evaluation/references/task-mode-checklist.md
sed -n '1,260p' .agents/skills/qa-evaluation/references/project-evaluation-checklist.md
sed -n '1,220p' .agents/skills/qa-evaluation/references/report-template.md
sed -n '1,220p' .agents/skills/qa-evaluation/references/severity-rules.md
sed -n '1,220p' .agents/skills/qa-evaluation/references/anti-patterns.md
```

Expected: the package reads as one coherent QA evaluator with explicit evidence discipline and clear mode boundaries.

- [x] **Step 2: Record the verification gap**

Document in the implementation summary that the environment did not provide a subagent test harness for pressure-scenario RED/GREEN testing from `writing-skills`, so the current verification is structural and content-based only.

- [x] **Step 3: Commit the skill package**

Run:

```bash
git add -f .agents/skills/qa-evaluation docs/superpowers/plans/2026-04-12-qa-evaluation-skill.md
git commit -m "docs: add qa evaluation skill"
```

Expected: a clean commit containing the plan and the new skill package.
