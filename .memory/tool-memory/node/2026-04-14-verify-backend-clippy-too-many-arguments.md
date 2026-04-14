---
memory_type: tool
topic: verify-backend 会因 clippy::too_many_arguments 在仓储接口阶段失败
summary: `node scripts/node/verify-backend.js` 运行到 Clippy 时，如果某个后端 trait 方法参数过多，会因 `clippy::too_many_arguments` 直接失败；已验证可通过引入输入 struct 收敛参数并重跑脚本恢复通过。
keywords:
  - node
  - verify-backend
  - clippy
  - too_many_arguments
  - rust
match_when:
  - 执行 `node scripts/node/verify-backend.js`
  - 输出 `clippy::too_many_arguments`
  - 失败点位于 `control-plane` 或 `storage-pg` 的 trait / repository 方法
created_at: 2026-04-14 21
updated_at: 2026-04-14 21
last_verified_at: 2026-04-14 21
decision_policy: reference_on_failure
scope:
  - node
  - scripts/node/verify-backend.js
  - api/crates/control-plane
  - api/crates/storage-pg
---

# verify-backend 会因 clippy::too_many_arguments 在仓储接口阶段失败

## 时间

`2026-04-14 21`

## 失败现象

执行：

```bash
node scripts/node/verify-backend.js
```

时，脚本在 Clippy 阶段报 `clippy::too_many_arguments`，指向角色仓储的创建/更新接口参数过多，随后以失败退出。

## 触发条件

- 后端 trait 或 repository 方法新增了多个业务参数；
- 统一后端门禁会执行 Clippy；
- 代码虽可编译，但违反仓库当前 Clippy 门禁。

## 根因

这不是语法错误，而是门禁级静态检查失败。角色策略位落地后，`RoleRepository` 的 `create_team_role` / `update_team_role` 继续沿用多位置参数，超过了当前 Clippy 允许阈值。

## 解法

1. 不要继续堆叠位置参数。
2. 为仓储接口引入明确的输入 struct，例如 `CreateWorkspaceRoleInput`、`UpdateWorkspaceRoleInput`。
3. 同步调整 service、test double 与 PostgreSQL 实现。
4. 重新运行 `node scripts/node/verify-backend.js` 确认门禁恢复通过。

## 验证方式

`2026-04-14 21` 已验证：把角色仓储创建/更新改成输入 struct 后，`verify-backend.js` 全量通过。

## 复现记录

- `2026-04-14 21`：执行角色策略计划 Task 5 时，`verify-backend.js` 因 `RoleRepository` 方法参数过多触发 `clippy::too_many_arguments`；改为输入 struct 后通过。
