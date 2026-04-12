# UserDocs Memory Retrieval Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `.memory` to the approved summary-first memory retrieval model, including YAML metadata, `tool-memory`, and legacy root cleanup.

**Architecture:** Keep `.memory/AGENTS.md` as the runtime rule entrypoint, keep `user-memory.md` as the fixed long-term memory file, and convert the four scalable memory categories to a uniform YAML-first format. Add `tool-memory` as a dedicated failure-case store and remove obsolete root files from the retrieval path.

**Tech Stack:** Markdown, YAML front matter, repository docs conventions

---

### Task 1: Align top-level memory rules and directories

**Files:**
- Modify: `.memory/AGENTS.md`
- Create: `.memory/tool-memory/template.md`
- Modify: `.memory/reference-memory/AGENTS.md`
- Delete: `.memory/runtime-foundation.md`

- [ ] **Step 1: Rewrite the top-level retrieval rules**

```md
## 检索规则
- 固定先读 `.memory/AGENTS.md` 与 `.memory/user-memory.md`
- `feedback-memory`、`project-memory`、`reference-memory`、`tool-memory` 统一先读文件前 30 行的 `YAML front matter`
- 单轮最多扫描 200 个记忆文件，只展开最多 5 条最相关有效记忆
- 选择原则固定为：宁缺毋滥，只选有用的，可少选，不凑满 5 条
```

- [ ] **Step 2: Add the new `tool-memory` template**

```md
---
memory_type: tool
topic: <工具失败主题>
summary: <一句话说明失败现象和可复用解法>
keywords:
  - <tool>
match_when:
  - <何时命中>
created_at: yyyy-mm-dd hh
updated_at: yyyy-mm-dd hh
last_verified_at: 无
decision_policy: reference_on_failure
scope:
  - <tool>
---
```

- [ ] **Step 3: Remove the obsolete root runtime summary file**

Run: `git rm -- .memory/runtime-foundation.md`
Expected: the file is staged for deletion and no longer participates in `.memory` retrieval.

### Task 2: Convert existing memory files to YAML-first format

**Files:**
- Modify: `.memory/feedback-memory/template.md`
- Modify: `.memory/feedback-memory/2026-04-12-no-extra-confirmation-when-explicit.md`
- Modify: `.memory/feedback-memory/2026-04-12-script-classification.md`
- Modify: `.memory/project-memory/template.md`
- Modify: `.memory/project-memory/2026-04-12-auth-team-backend-plan-stage.md`
- Modify: `.memory/project-memory/2026-04-12-auth-team-backend-scope.md`
- Modify: `.memory/project-memory/2026-04-12-canvas-editor-spec.md`
- Modify: `.memory/project-memory/2026-04-12-design-system-direction.md`
- Modify: `.memory/project-memory/2026-04-12-dev-runtime-entry.md`
- Modify: `.memory/reference-memory/api-reference.md`
- Modify: `.memory/reference-memory/script-reference.md`
- Modify: `.memory/reference-memory/source-reference.md`

- [ ] **Step 1: Add YAML front matter to the templates**

```yaml
---
memory_type: feedback
topic: <主题>
summary: <摘要>
keywords:
  - <keyword>
match_when:
  - <命中场景>
created_at: yyyy-mm-dd hh
updated_at: yyyy-mm-dd hh
last_verified_at: 无
decision_policy: direct_reference
scope:
  - <范围>
---
```

- [ ] **Step 2: Add matching YAML metadata to each existing memory file**

```yaml
---
memory_type: project
topic: 用户认证与团队接入后端落地边界
summary: 当前后端实现范围扩展为模块 01 全闭环加模块 02 的角色 CRUD 与权限绑定接口。
keywords:
  - auth
  - team
  - access-control
match_when:
  - 需要实现或评估认证与团队权限后端
created_at: 2026-04-12 17
updated_at: 2026-04-12 17
last_verified_at: 无
decision_policy: verify_before_decision
scope:
  - api
  - docs/superpowers/specs/1flowse/modules/01-user-auth-and-team/README.md
---
```

- [ ] **Step 3: Keep all YAML headers within the first 30 lines**

Run: `for f in .memory/feedback-memory/*.md .memory/project-memory/*.md .memory/reference-memory/*.md .memory/tool-memory/*.md; do sed -n '1,30p' "$f"; done`
Expected: each file shows the full front matter block without spilling critical fields below line 30.

### Task 3: Verify retrieval-ready structure

**Files:**
- Verify: `.memory/AGENTS.md`
- Verify: `.memory/feedback-memory/*.md`
- Verify: `.memory/project-memory/*.md`
- Verify: `.memory/reference-memory/*.md`
- Verify: `.memory/tool-memory/template.md`

- [ ] **Step 1: Check the final file layout**

Run: `find .memory -maxdepth 2 -type f | sort`
Expected: top-level memory files are limited to `AGENTS.md`, `user-memory.md`, and the approved memory directories.

- [ ] **Step 2: Spot-check the metadata fields**

Run: `rg -n "^memory_type:|^topic:|^summary:|^keywords:|^match_when:|^created_at:|^updated_at:|^last_verified_at:|^decision_policy:|^scope:" .memory/feedback-memory .memory/project-memory .memory/reference-memory .memory/tool-memory`
Expected: every memory file contains the required YAML keys exactly once.

- [ ] **Step 3: Commit the alignment**

```bash
git add docs/superpowers/specs/1flowse/2026-04-12-memory-retrieval-and-summary-design.md \
  docs/superpowers/plans/2026-04-12-userdocs-memory-retrieval-alignment.md \
  .memory
git commit -m "docs: align memory retrieval structure"
```
