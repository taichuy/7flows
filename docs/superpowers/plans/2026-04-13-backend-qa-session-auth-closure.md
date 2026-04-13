# Backend QA Session Auth Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend session and password-security loop by implementing current-device logout, revoke-all, self-service password change, and administrator password reset with `session_version` invalidation.

**Architecture:** Reuse the existing `AuthRepository`, `MemberService`, `SessionStore`, and `require_session` middleware. Add one focused `SessionSecurityService` in `control-plane` for self-session and self-password actions, keep member administration in `MemberService`, and use the existing `session_version` check in `require_session` as the single invalidation gate.

**Tech Stack:** Rust stable, Axum, argon2, SQLx/PostgreSQL, Redis or in-memory session store

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-13-backend-qa-remediation-design.md`

**Approval:** User approved splitting the remediation work into multiple backend plans on `2026-04-13 14`, with this file covering topic B from the spec.

---

## Scope Notes

- This plan covers topic B from the remediation design.
- This plan may add temporary compatibility aliases for legacy member action paths so behavior can land before topic C removes them.
- Final OpenAPI cleanup and old-path removal belong to topic C.

## File Structure

**Create**
- `api/crates/control-plane/src/session_security.rs`
- `api/crates/control-plane/src/_tests/session_security_service_tests.rs`
- `api/apps/api-server/src/_tests/me_routes.rs`

**Modify**
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/apps/api-server/src/routes/session.rs`
- `api/apps/api-server/src/routes/me.rs`
- `api/apps/api-server/src/routes/members.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `api/apps/api-server/src/_tests/session_routes.rs`
- `api/apps/api-server/src/_tests/member_routes.rs`

### Task 1: Add Session-Security Application Service

**Files:**
- Create: `api/crates/control-plane/src/session_security.rs`
- Create: `api/crates/control-plane/src/_tests/session_security_service_tests.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`

- [ ] **Step 1: Add failing service tests**

Create `api/crates/control-plane/src/_tests/session_security_service_tests.rs` with coverage for:

```rust
#[tokio::test]
async fn change_password_rejects_wrong_old_password() {}

#[tokio::test]
async fn change_password_updates_hash_and_deletes_current_session() {}

#[tokio::test]
async fn revoke_all_bumps_session_version_and_deletes_current_session() {}
```

Use in-memory doubles for `AuthRepository` and `SessionStore`. The tests must assert:

- wrong `old_password` returns `InvalidInput("old_password")`;
- successful self-password change updates the stored hash and increments `session_version`;
- revoke-all calls `bump_session_version(actor_user_id, actor_user_id)` and deletes the current session id.

- [ ] **Step 2: Run the focused service failures**

Run: `cargo test -p control-plane change_password_updates_hash_and_deletes_current_session -- --exact`

Expected: FAIL because `control_plane::session_security` does not exist.

- [ ] **Step 3: Implement `SessionSecurityService`**

Create `api/crates/control-plane/src/session_security.rs` with:

```rust
pub struct ChangeOwnPasswordCommand {
    pub actor_user_id: uuid::Uuid,
    pub session_id: String,
    pub old_password: String,
    pub new_password_hash: String,
}

pub struct RevokeAllSessionsCommand {
    pub actor_user_id: uuid::Uuid,
    pub session_id: String,
}

pub struct LogoutCurrentSessionCommand {
    pub session_id: String,
}
```

Implement:

- `logout_current_session` by deleting only the current session id;
- `revoke_all_sessions` by bumping `session_version`, deleting the current session id, and appending `session.revoke_all` audit log;
- `change_own_password` by verifying `old_password`, writing the new hash with `update_password_hash`, deleting the current session id, and appending `user.password_changed` audit log.

Export the module from `api/crates/control-plane/src/lib.rs`.

- [ ] **Step 4: Re-run the service tests**

Run: `cargo test -p control-plane session_security_service -- --nocapture`

Expected: PASS

- [ ] **Step 5: Commit the service slice**

```bash
git add api/crates/control-plane/src/session_security.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/_tests/mod.rs api/crates/control-plane/src/_tests/session_security_service_tests.rs
git commit -m "feat: add session security service"
```

### Task 2: Expose The New Session And Password Endpoints

**Files:**
- Modify: `api/apps/api-server/src/routes/session.rs`
- Modify: `api/apps/api-server/src/routes/me.rs`
- Modify: `api/apps/api-server/src/routes/members.rs`
- Create: `api/apps/api-server/src/_tests/me_routes.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`

- [ ] **Step 1: Add failing route regressions**

Create `api/apps/api-server/src/_tests/me_routes.rs` with:

```rust
#[tokio::test]
async fn change_password_route_invalidates_old_session() {}
```

Extend `api/apps/api-server/src/_tests/session_routes.rs` with:

```rust
#[tokio::test]
async fn delete_session_route_clears_current_session() {}

#[tokio::test]
async fn revoke_all_route_invalidates_current_session() {}
```

Extend `api/apps/api-server/src/_tests/member_routes.rs` with:

```rust
#[tokio::test]
async fn reset_password_invalidates_member_session() {}
```

- [ ] **Step 2: Run the focused route failures**

Run: `cargo test -p api-server delete_session_route_clears_current_session -- --exact`

Expected: FAIL because `DELETE /api/console/session` is not registered.

Run: `cargo test -p api-server change_password_route_invalidates_old_session -- --exact`

Expected: FAIL because `/api/console/me/actions/change-password` does not exist.

- [ ] **Step 3: Implement the HTTP behavior**

Update `api/apps/api-server/src/routes/session.rs` to expose:

- `GET /api/console/session`
- `DELETE /api/console/session`
- `POST /api/console/session/actions/revoke-all`

Keep cookie clearing in the route layer:

```rust
CookieJar::new().remove(expired_session_cookie(&state.cookie_name))
```

Update `api/apps/api-server/src/routes/me.rs` to add:

```rust
pub struct ChangePasswordBody {
    pub old_password: String,
    pub new_password: String,
}
```

and the new action route:

- `POST /api/console/me/actions/change-password`

Update `api/apps/api-server/src/routes/members.rs` to:

- accept `new_password` in `ResetMemberPasswordBody`;
- add the new action routes:
  - `POST /api/console/members/:id/actions/disable`
  - `POST /api/console/members/:id/actions/reset-password`
- keep the old `/members/:id/disable` and `/members/:id/reset-password` paths as temporary aliases in this plan only, so behavior can land before topic C removes them.

- [ ] **Step 4: Re-run the new-route regressions**

Run: `cargo test -p api-server delete_session_route_clears_current_session -- --exact`

Expected: PASS

Run: `cargo test -p api-server revoke_all_route_invalidates_current_session -- --exact`

Expected: PASS

Run: `cargo test -p api-server change_password_route_invalidates_old_session -- --exact`

Expected: PASS

- [ ] **Step 5: Commit the endpoint slice**

```bash
git add api/apps/api-server/src/routes/session.rs api/apps/api-server/src/routes/me.rs api/apps/api-server/src/routes/members.rs api/apps/api-server/src/_tests/mod.rs api/apps/api-server/src/_tests/session_routes.rs api/apps/api-server/src/_tests/me_routes.rs api/apps/api-server/src/_tests/member_routes.rs
git commit -m "feat: add session and password remediation endpoints"
```

### Task 3: Verify Session Invalidation End To End

**Files:**
- Test: `api/apps/api-server/src/_tests/session_routes.rs`
- Test: `api/apps/api-server/src/_tests/me_routes.rs`
- Test: `api/apps/api-server/src/_tests/member_routes.rs`

- [ ] **Step 1: Verify self-password change invalidates the old cookie**

Run: `cargo test -p api-server change_password_route_invalidates_old_session -- --exact --nocapture`

Expected: PASS and confirm the old cookie fails against `GET /api/console/session`.

- [ ] **Step 2: Verify revoke-all invalidates the current cookie**

Run: `cargo test -p api-server revoke_all_route_invalidates_current_session -- --exact --nocapture`

Expected: PASS

- [ ] **Step 3: Verify administrator reset and disable invalidate the target member**

Run: `cargo test -p api-server reset_password_invalidates_member_session -- --exact --nocapture`

Expected: PASS

Run: `cargo test -p api-server member_routes_create_disable_and_reset_password -- --exact --nocapture`

Expected: PASS with the updated request body field and temporary action-route aliases.

- [ ] **Step 4: Run the unified backend verification**

Run: `node scripts/node/verify-backend.js`

Expected: PASS

- [ ] **Step 5: Commit the verified topic-B batch**

```bash
git add .
git commit -m "test: verify backend qa session auth closure"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-13-backend-qa-session-auth-closure.md`.
