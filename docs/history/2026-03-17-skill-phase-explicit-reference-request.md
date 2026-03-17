# 2026-03-17 Skill phase explicit reference requests

## Background

- The Skill Catalog mainline already had `SkillDoc`, REST + MCP retrieval contracts, phase-aware lazy reference loading, and a single explicit `SKILL_REFERENCE_REQUEST` loop inside `main_plan`.
- That still left a real half-loop in `AgentRuntime`: `assistant_distill` and `main_finalize` could consume phase-scoped skill context, but they could not explicitly ask for one deeper reference body when the current handles were insufficient.
- `docs/dev/runtime-foundation.md` already tracked this as the next P1 Skill Catalog gap.

## Goal

1. Extend explicit single-reference recovery from `main_plan` into `assistant_distill` and `main_finalize`.
2. Keep the same bounded semantics: one requested reference at a time, no second runtime, no heavy SkillHub behavior, no client takeover.
3. Preserve traceability by writing request/load facts back into runtime events and AI call artifacts.

## Implementation

### 1. Add phase-level request preflight inside `AgentRuntime`

- File: `api/app/services/agent_runtime.py`
- Added `_maybe_apply_phase_skill_reference_request()` plus small phase helpers for:
  - request role naming
  - task labeling
  - phase-specific request prompt construction
- The new preflight only runs for `assistant_distill` and `main_finalize`, and only when the phase still has pending skill reference handles.
- If the model emits `SKILL_REFERENCE_REQUEST {...}`, runtime records a dedicated AI call artifact and rebuilds phase skill context with the requested reference body.

### 2. Reuse a generalized phase request application path

- File: `api/app/services/agent_runtime.py`
- Promoted the old `main_plan`-only request applicator into `_apply_phase_skill_reference_request()`.
- `main_plan` now reuses the same helper through the existing wrapper, so request validation stays consistent across phases:
  - bound skill check
  - reference existence check
  - already-loaded detection
  - prompt-inline confirmation
  - structured request event emission

### 3. Wire the new loop into assistant + finalize execution

- File: `api/app/services/agent_runtime.py`
- `assistant_distill` now:
  - loads its default phase skill context
  - optionally runs the explicit request preflight
  - emits `agent.skill.references.requested` / extra `agent.skill.references.loaded` when the request succeeds
  - then distills evidence with the updated skill context
- `main_finalize` now follows the same pattern before the final LLM output step.

## Impact

### User layer

- No new authoring UI is required yet; authors still use existing `skillIds` + `skillBinding`.
- The runtime closes a real phase gap without changing the workflow definition surface.

### AI and human collaboration layer

- Skill retrieval is no longer plan-only recoverable.
- Operators can now trace explicit skill reference requests from `main_plan`, `assistant_distill`, and `main_finalize` through the same runtime facts.

### Governance / architecture layer

- The change stays inside the existing `AgentRuntime` orchestration boundary.
- It does not introduce a new DSL, new scheduler, or a client-side skill execution model.

## Verification

- Targeted backend tests:
  - `api/.venv/Scripts/uv.exe run pytest -q tests/test_agent_runtime_llm_integration.py -k "skill_reference or distill_evidence_with_valid_model or finalize_with_tool_results"`
  - Result: `6 passed, 6 deselected`
- Full backend regression:
  - `api/.venv/Scripts/uv.exe run pytest -q`
  - Result: `365 passed in 59.56s`
- Diff hygiene:
  - `git diff --check`
  - Result: passed

## Remaining gap

- Run events and AI artifacts now contain the full request/load facts for all three phases, but published invocation detail still does not surface the same request trace.
- The recovery flow is still intentionally single-fetch. Multi-fetch request trace remains a later step.

## Next step

1. Surface skill request/load trace in published invocation detail, not only run execution diagnostics.
2. Decide whether multi-fetch semantics are truly needed before extending beyond the current single explicit request boundary.
