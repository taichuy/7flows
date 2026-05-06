---
memory_type: tool
tool: pnpm
topic: pnpm audit fails against npmmirror because audit endpoint is missing
summary: In this repo environment, `pnpm audit` may default to `https://registry.npmmirror.com` and fail with `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`; rerun audit with `--registry=https://registry.npmjs.org`.
keywords:
  - pnpm
  - audit
  - npmmirror
  - registry
  - ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS
match_when:
  - running pnpm audit
  - verifying npm vulnerability fixes
  - pnpm audit reports missing audit endpoint
created_at: 2026-05-07 01
updated_at: 2026-05-07 01
last_verified_at: 2026-05-07 01
decision_policy: reference_on_failure
scope:
  - web
  - tmp/demo
---

# pnpm audit fails against npmmirror

## Failure

`pnpm audit` failed with:

```text
ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS
https://registry.npmmirror.com/-/npm/v1/security/audits
```

## Verified Fix

Run audit against the npm official registry:

```bash
pnpm --dir web audit --audit-level high --registry=https://registry.npmjs.org
pnpm --dir tmp/demo audit --audit-level moderate --registry=https://registry.npmjs.org
```

Both commands returned `No known vulnerabilities found` after the dependency lockfile fixes on `2026-05-07 01`.
