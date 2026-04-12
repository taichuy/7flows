# Embedded App Doc Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `docs/dev_READEME.md` and `docs/superpowers/specs/1flowse/2026-04-10-p1-architecture.md` with the confirmed Embedded App static-upload design.

**Architecture:** This is a doc-only change. Update the informal architecture memo and the formal P1 architecture spec so both point to the same Embedded App boundary: static build zip upload, platform-mounted routes, and login-state reuse. Keep edits surgical and preserve existing document tone.

**Tech Stack:** Markdown documentation

---

### Task 1: Update `docs/dev_READEME.md`

**Files:**
- Modify: `docs/dev_READEME.md`

- [ ] **Step 1: Locate the current directory structure section**

Run: `nl -ba docs/dev_READEME.md | sed -n '160,240p'`
Expected: See `# 目录结构：` and existing `web/` / `api/` bullets.

- [ ] **Step 2: Expand the directory bullets with Embedded App landing zones**

Add these responsibilities under the existing structure:

```md
- `web/`
  - `app/src/embedded`
    - Embedded App 宿主页、挂载页、错误页、加载态
  - `app/src/features/embedded-apps`
    - 控制台中的 Embedded App 管理界面
  - `packages/embedded-contracts`
    - Embedded App manifest / 元数据契约

- `api/`
  - `apps/api-server/src/routes/embedded`
    - 上传、发布、路由解析
  - `apps/api-server/src/routes/assets`
    - 静态资源分发与回退入口
  - `crates/embedded-runtime`
    - 入口识别、挂载解析、回退规则
```

- [ ] **Step 3: Add a short Embedded App conclusion under the directory section**

Append a short paragraph that states:

```md
P1 的 `Embedded App` 主线固定为：用户独立开发前端子系统，产出静态 build zip 上传到平台；平台负责挂载路由、复用登录态、分发静态资源，不支持前端源码插件，也不支持 SSR / Node runtime 托管。
```

### Task 2: Update `2026-04-10-p1-architecture.md`

**Files:**
- Modify: `docs/superpowers/specs/1flowse/2026-04-10-p1-architecture.md`

- [ ] **Step 1: Add the new Embedded App design doc to related documents**

Insert this link near the top:

```md
- [2026-04-11-embedded-app-static-upload-design.md](./2026-04-11-embedded-app-static-upload-design.md)
```

- [ ] **Step 2: Align the front-end structure bullets with the current repo layout**

Replace the conceptual `apps/web` style bullets with the current layout:

```md
- `web/app`
  - 平台主前端与应用工作区
- `web/packages/ui`
- `web/packages/flow-schema`
- `web/packages/page-protocol`
- `web/packages/page-runtime`
- `web/packages/api-client`
- `web/packages/embed-sdk`
- `web/packages/embedded-contracts`
- `web/packages/shared-types`
```

- [ ] **Step 3: Rewrite section `5.7 嵌入式前端接入`**

Make the P1 boundary explicit:

```md
- 用户在平台外独立开发前端子系统
- 用户自行 build 并上传静态产物 zip
- 平台识别入口目录并挂载到固定路由前缀
- 平台复用 `Session + HttpOnly Cookie + CSRF` 登录态
- 子系统通过同源 API 与轻量 SDK 获取上下文
```

Also add explicit non-goals: no front-end source plugin, no SSR / Node runtime hosting.

- [ ] **Step 4: Extend the backend workspace structure with Embedded App runtime support**

Add this crate to the workspace direction list:

```md
- `crates/embedded-runtime`
  - 嵌入式前端上传包识别、挂载解析、静态资源回退规则
```

- [ ] **Step 5: Rewrite section `13.3 Embedded App` to match the approved design**

State that P1 recommends:

```md
- 后台登记 `Embedded App` 元数据
- 上传 build 后静态 zip，而不是上传前端源码
- 平台将产物落到对象存储或文件存储并挂到固定路由前缀
- 访问前先做登录态与权限校验
- 子系统通过同源接口与 SDK 获取当前上下文
```

Remove wording that implies a long-running external front-end service is the primary P1 path.

### Task 3: Update memory docs and self-check

**Files:**
- Modify: `docs/userDocs/history/2026-04-11-embedded-app-static-upload-exploration.md`
- Modify: `docs/userDocs/runtime-foundation.md`

- [ ] **Step 1: Record the doc alignment result in history**

Append a bullet noting that `docs/dev_READEME.md` and `2026-04-10-p1-architecture.md` were updated to match the static-upload Embedded App design.

- [ ] **Step 2: Add one short runtime summary bullet**

Keep `docs/userDocs/runtime-foundation.md` under the size constraint while noting the alignment.

- [ ] **Step 3: Run a quick doc self-check**

Run: `rg -n "apps/web|外部开发完整前端|前端服务器或对象存储|上传前端源码|SSR|Node runtime" docs/dev_READEME.md docs/superpowers/specs/1flowse/2026-04-10-p1-architecture.md`
Expected: Remaining matches should be intentional and consistent with the new design.
