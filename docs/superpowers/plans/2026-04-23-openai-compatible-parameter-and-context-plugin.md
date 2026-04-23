# OpenAI Compatible Parameter And Context Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the official `openai_compatible` plugin package so it declares a provider-level parameter schema, extracts model context/output metadata from explicit upstream fields, and ships a version bump ready for packaging.

**Architecture:** Keep this work inside the sibling plugin repository. Declare the provider-level schema in `provider/openai_compatible.yaml`, keep runtime extraction logic in `src/lib.rs`, add unit coverage around model normalization, and bump the plugin package version only after tests pass. Do not move host-specific fallback logic into the plugin.

**Tech Stack:** Rust, YAML provider package metadata, `cargo test`

**Source Spec:** `docs/superpowers/specs/2026-04-23-model-provider-parameter-schema-and-context-override-design.md`

**Repository Root:** `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible`

---

## File Structure

**Modify**
- `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/provider/openai_compatible.yaml`
- `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/src/lib.rs`
- `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/manifest.yaml`
- `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/Cargo.toml`
- `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/readme/README_en_US.md`

**Notes**
- Extract metadata only from explicit upstream fields. If a provider’s `/models` payload does not expose context or output limits, return `null`.
- Keep invocation passthrough limited to already supported parameters: `temperature`, `top_p`, `max_tokens`, `seed`.
- Do not add host-only manual override logic to the plugin.

### Task 1: Declare The Provider-Level Parameter Schema

**Files:**
- Modify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/provider/openai_compatible.yaml`
- Modify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/readme/README_en_US.md`

- [x] **Step 1: Write the schema section in provider metadata**
  - Add `parameter_form` to `provider/openai_compatible.yaml`.
  - Include first-pass fields:
    - `temperature`
    - `top_p`
    - `max_tokens`
    - `seed`

- [x] **Step 2: Validate the YAML shape against host expectations**

Run from `/home/taichu/git/1flowbase`:

```bash
cargo test -p plugin-framework provider_package -- --nocapture
```

Expected:

- PASS once the host-side provider-package parser from the backend plan is available.

- [x] **Step 3: Update README contract notes**
  - Document that the plugin now exposes provider-level parameter schema and explicit model metadata extraction only.

### Task 2: Extract Explicit Model Metadata In `src/lib.rs`

**Files:**
- Modify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/src/lib.rs`

- [x] **Step 1: Add failing unit tests around model normalization**
  - Cover payloads exposing:
    - `context_window`
    - `context_length`
    - `input_token_limit`
    - `max_output_tokens`
    - `output_token_limit`
    - `max_tokens`
  - Cover a payload with none of the above and assert `None`.

- [x] **Step 2: Run plugin unit tests and verify RED**

Run:

```bash
cargo test --manifest-path /home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/Cargo.toml -- --nocapture
```

Expected:

- FAIL because `normalize_model_entry()` still hard-codes `context_window = None` and `max_output_tokens = None`.

- [x] **Step 3: Implement explicit field extraction**
  - Add numeric extraction helpers that accept integer JSON values from the known aliases only.
  - Keep unknown or malformed values as `None`.
  - Leave invocation passthrough behavior unchanged.

- [x] **Step 4: Re-run plugin unit tests and verify GREEN**

Run:

```bash
cargo test --manifest-path /home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/Cargo.toml -- --nocapture
```

Expected:

- PASS with explicit metadata extraction coverage.

### Task 3: Bump The Plugin Version For Packaging

**Files:**
- Modify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/manifest.yaml`
- Modify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/Cargo.toml`

Current repo constraint:
- `Cargo.toml` keeps the sentinel crate version `0.0.0`; repo workflow tests enforce `manifest.yaml` as the single release-version source for `openai_compatible`.

- [x] **Step 1: Update version metadata**
  - Bump the plugin package version in:
    - `manifest.yaml`
    - `Cargo.toml`
  - Keep both files aligned.

- [x] **Step 2: Build the plugin binary and verify it still compiles**

Run:

```bash
cargo build --manifest-path /home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/Cargo.toml
```

Expected:

- PASS with the new version metadata and model-normalization code.

### Task 4: Commit The Plugin Slice

**Files:**
- Modify only the files listed above in the sibling plugin repository

- [x] **Step 1: Stage the plugin-repo files**

Run:

```bash
git -C /home/taichu/git/1flowbase-official-plugins add \
  runtime-extensions/model-providers/openai_compatible/provider/openai_compatible.yaml \
  runtime-extensions/model-providers/openai_compatible/src/lib.rs \
  runtime-extensions/model-providers/openai_compatible/manifest.yaml \
  runtime-extensions/model-providers/openai_compatible/Cargo.toml \
  runtime-extensions/model-providers/openai_compatible/readme/README_en_US.md
```

- [x] **Step 2: Commit the plugin slice**

Run:

```bash
git -C /home/taichu/git/1flowbase-official-plugins commit -m "feat: expose openai compatible parameter schema"
```

Expected:

- One commit in the plugin repository containing only package-schema, metadata extraction, and version-bump work.
