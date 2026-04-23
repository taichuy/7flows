# Model Provider Parameter And Context Agent Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent Flow read provider-level parameter schema, display effective model context metadata, and preserve correct parameter state when users switch models under the same provider.

**Architecture:** Keep model metadata mapping in `lib/model-options.ts`, keep parameter-state initialization in `llm-node-config.ts`, and keep the UI split between `LlmModelField` and `LlmParameterForm`. The selector should compute effective context from provider options plus configured-model overrides; the parameter form should depend on the selected provider’s schema instead of the selected model’s schema.

**Tech Stack:** TypeScript, React, Ant Design 5, TanStack Query, Vitest

**Source Spec:** `docs/superpowers/specs/2026-04-23-model-provider-parameter-schema-and-context-override-design.md`

---

## File Structure

**Modify**
- `web/app/src/features/agent-flow/api/model-provider-options.ts`
- `web/app/src/features/agent-flow/lib/model-options.ts`
- `web/app/src/features/agent-flow/lib/llm-node-config.ts`
- `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
- `web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx`
- `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`

**Notes**
- Do not guess parameters when a provider has no `parameter_form`.
- Keep `llm_parameters` numeric/object value shapes unchanged; only the schema lookup changes.
- Show context metadata as read-only display, not as an editable field inside Agent Flow.

### Task 1: Rewrite Frontend Options Mapping Around Provider-Level Schema

**Files:**
- Modify: `web/app/src/features/agent-flow/lib/model-options.ts`
- Modify: `web/app/src/features/agent-flow/api/model-provider-options.ts`
- Test: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`

- [x] **Step 1: Write failing mapping tests**
  - Assert provider-level `parameter_form` is preserved on each mapped provider option.
  - Assert mapped model options carry:
    - `context_window`
    - `max_output_tokens`
    - effective context derived from override-or-metadata precedence

- [x] **Step 2: Run the focused Agent Flow tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
```

Expected:

- FAIL because model options still read `model.parameter_form` and do not map effective context metadata.

- [x] **Step 3: Replace the mapping layer**
  - Add provider-level schema fields to `LlmProviderOption`.
  - Remove model-level `parameterForm`.
  - Map model metadata and computed effective context into `LlmModelOption`.

- [x] **Step 4: Re-run the focused Agent Flow tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
```

Expected:

- PASS with provider-level schema and effective-context mapping.

### Task 2: Make `LlmParameterForm` Depend On The Selected Provider

**Files:**
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
- Modify: `web/app/src/features/agent-flow/lib/llm-node-config.ts`
- Test: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`

- [x] **Step 1: Add failing parameter-form behavior tests**
  - Cover:
    - same-provider model switch keeps the same schema basis
    - different-provider switch reinitializes `llm_parameters`
    - provider with `null` schema renders the empty-state copy

- [x] **Step 2: Run the focused detail-panel tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/node-detail-panel.test.tsx
```

Expected:

- FAIL because `LlmParameterForm` and `selectModel()` still initialize from `selectedModel.parameterForm`.

- [x] **Step 3: Rewrite schema selection**
  - Resolve the selected provider from the current model provider config.
  - Build parameter state from `selectedProvider.parameterForm`.
  - Keep value enabling/disabling behavior unchanged.

- [x] **Step 4: Re-run the focused detail-panel tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/node-detail-panel.test.tsx
```

Expected:

- PASS with provider-level schema initialization.

### Task 3: Render Effective Context In The Model Selector

**Files:**
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
- Test: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- Test: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`

- [x] **Step 1: Add failing selector and inspector assertions**
  - Assert the model dropdown renders effective context.
  - Assert context display prefers the override value over plugin metadata.
  - Assert max-output display remains optional and does not replace context.

- [x] **Step 2: Run the focused Agent Flow tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
pnpm --dir web/app test -- src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected:

- FAIL because the selector currently shows only model name and source tag.

- [x] **Step 3: Add read-only metadata display**
  - Render compact context text for each model row.
  - Use effective context formatting consistent with settings display.
  - Keep the selector searchable by existing text fields.

- [x] **Step 4: Re-run the focused Agent Flow tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
pnpm --dir web/app test -- src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected:

- PASS with read-only effective-context rendering.

### Task 4: Commit The Agent Flow Slice

**Files:**
- Modify only the files listed above

- [x] **Step 1: Stage the Agent Flow files**

Run:

```bash
git add web/app/src/features/agent-flow/api/model-provider-options.ts \
  web/app/src/features/agent-flow/lib/model-options.ts \
  web/app/src/features/agent-flow/lib/llm-node-config.ts \
  web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx \
  web/app/src/features/agent-flow/components/detail/fields/LlmParameterForm.tsx \
  web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx \
  web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
```

- [x] **Step 2: Commit the Agent Flow slice**

Run:

```bash
git commit -m "feat: align agent flow with provider parameter schema"
```

Expected:

- One commit containing only Agent Flow consumer work for this feature.
