# File Manager Storage Platform Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved file-manager architecture with real file tables, root-managed storage bindings, built-in `attachments`, and first-party `local` plus `rustfs` support without mixing business files into plugin artifact storage.

**Architecture:** Execute this work in four ordered tracks. First, turn `storage-object` into the single file-storage driver boundary with built-in `local` and `rustfs` drivers. Second, add system metadata, PostgreSQL persistence, and control-plane services for `file_storages` and `file_tables`. Third, reuse the existing dynamic-model runtime to provision `attachments`, create workspace file tables from the fixed template, and expose upload plus content-read APIs that honor record-level `storage_id` snapshots. Fourth, add the settings console and finish with focused backend plus frontend regression and QA.

**Tech Stack:** Markdown planning docs only.

---

## Execution Status

- Last updated: 2026-04-23 20
- Overall status: In progress
- Current phase: Phase 2 - Metadata, Permission, And Persistence Root
- Current task: `2026-04-23-file-management-control-plane-and-postgres.md` / Task 1
- Phase snapshot:
  - Phase 1 - Driver Boundary Root: Completed
  - Phase 2 - Metadata, Permission, And Persistence Root: In progress
  - Phase 3 - Provisioning, Upload, And Runtime Access: Pending
  - Phase 4 - Console And Final Regression: Pending

## Approved Design Source

Execute these plans against the approved spec:

1. [2026-04-23-file-manager-storage-design.md](../specs/2026-04-23-file-manager-storage-design.md)

## New Execution Plans

1. [2026-04-23-storage-object-contract-and-built-in-drivers.md](./2026-04-23-storage-object-contract-and-built-in-drivers.md)
   Turns `storage-object` into the stable driver boundary and lands built-in `local` plus `rustfs` adapters.
2. [2026-04-23-file-management-control-plane-and-postgres.md](./2026-04-23-file-management-control-plane-and-postgres.md)
   Adds domain records, permission catalog entries, control-plane services, and PostgreSQL persistence for `file_storages` and `file_tables`.
3. [2026-04-23-file-table-template-upload-and-runtime-access.md](./2026-04-23-file-table-template-upload-and-runtime-access.md)
   Boots the built-in `attachments` table, provisions workspace file tables from the fixed template, and adds upload plus content-read routes wired through runtime metadata and record-level `storage_id`.
4. [2026-04-23-file-manager-settings-ui-and-regression.md](./2026-04-23-file-manager-settings-ui-and-regression.md)
   Adds the settings console experience for storages and file tables, then closes with targeted regression and `qa-evaluation`.

## Recommended Execution Order

### Phase 1: Driver Boundary Root

1. `2026-04-23-storage-object-contract-and-built-in-drivers.md`

Run this first. Every later slice depends on the `storage-object` public contract being stable and testable.

### Phase 2: Metadata, Permission, And Persistence Root

2. `2026-04-23-file-management-control-plane-and-postgres.md`

Run this second. API routes and UI should not appear before `file_storages` and `file_tables` exist as durable control-plane records.

### Phase 3: Provisioning, Upload, And Runtime Access

3. `2026-04-23-file-table-template-upload-and-runtime-access.md`

Run this third. It depends on both the driver boundary and the durable metadata layer.

### Phase 4: Console And Final Regression

4. `2026-04-23-file-manager-settings-ui-and-regression.md`

Run this last. It assumes the backend APIs, upload flow, and `attachments` bootstrap already exist.

## Shared Scope Rules

These rules apply to every plan in this set:

1. Business files must not reuse `api/plugins`; the default local business-file root is `api/storage`.
2. Official first-party driver support in V1 is exactly `local` and `rustfs`.
3. `rustfs` driver code is built in, but no `rustfs` storage instance is created or enabled by default.
4. `file_storages` are `root/system` resources only; workspace users cannot mutate storage config.
5. `file_tables` are real registered tables, not logical labels inside one global attachment table.
6. The platform must create a built-in system file table named `attachments`.
7. Workspace-created file tables reuse the fixed `attachments` schema template in V1; no custom extra fields.
8. Rebinding a file table changes only future uploads; old file records continue reading via their own `storage_id`.
9. File records do not store redundant `storage_type`; resolve driver type through `storage_id -> file_storages.driver_type`.
10. File record CRUD keeps using the existing runtime data permissions; only storage management and binding management add new system-level control-plane permissions.

## Shared Naming Rules

Use these names consistently across plans:

1. “file storage” means one configured storage instance in `file_storages`.
2. “file table” means one real model-backed table registered in `file_tables`.
3. “attachments template” means the fixed field set: `title`, `filename`, `extname`, `size`, `mimetype`, `path`, `meta`, `url`, `storage_id`.
4. “bound storage” means the storage currently used for new uploads into one file table.
5. “record storage snapshot” means the `storage_id` saved on each file record at upload time.
6. “content read” means the private backend path that streams or redirects to the stored object based on the record snapshot.

## Dependency Notes

- The driver-boundary plan owns `storage-object` contracts, built-in drivers, and driver-only tests.
- The control-plane plan owns durable metadata tables, permission catalog changes, repository implementations, and service-level authorization rules.
- The provisioning/upload plan owns `attachments` bootstrap, workspace file-table creation, upload orchestration, record snapshot semantics, and new backend APIs.
- The console/regression plan owns API-client DTOs, settings navigation, file-management panels, frontend tests, and final QA evidence.
