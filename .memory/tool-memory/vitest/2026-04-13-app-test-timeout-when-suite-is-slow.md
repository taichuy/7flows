---
memory_type: tool
topic: Vitest 默认 5 秒超时在慢速前端集成套件下可能误报失败
summary: 在 `web/app` 中一次性跑多组前端测试时，`App`、`App shell`、`MePage`、`RolePermissionPanel` 等集成测试都可能因 jsdom 与 Ant Design 渲染耗时触发默认 `5000ms` 超时；已验证可通过命令级或单测级显式超时重新确认真实断言结果。
keywords:
  - vitest
  - timeout
  - jsdom
  - antd
  - web/app
match_when:
  - `App.test.tsx`、`app-shell.test.tsx`、`me-page.test.tsx` 或 `role-permission-panel.test.tsx` 报 `Test timed out in 5000ms`
  - 一次性运行 `pnpm --dir web test` 时出现不稳定超时
created_at: 2026-04-13 12
updated_at: 2026-04-14 21
last_verified_at: 2026-04-14 21
decision_policy: reference_on_failure
scope:
  - vitest
  - web/app
  - web/app/src/app/App.test.tsx
---

# Vitest 默认 5 秒超时在慢速前端集成套件下可能误报失败

## 时间

`2026-04-13 12`

## 失败现象

在 `web/app` 里一次性跑整套前端测试时，`src/app/App.test.tsx`、`src/app/_tests/app-shell.test.tsx`、`src/features/me/_tests/me-page.test.tsx`、`src/features/settings/_tests/role-permission-panel.test.tsx` 都可能报：

```text
Test timed out in 5000ms.
```

但同一断言在显式提高超时后可以正常通过。

## 触发条件

- `vitest` 默认 `5000ms` 超时
- `jsdom` 环境
- `Ant Design` 表单、菜单与对话框渲染较重
- 同一轮同时执行多组前端集成测试

## 根因

这是测试环境性能噪声，不是断言逻辑错误。套件一起跑时，壳层导航、个人资料页重定向、角色对话框等渲染链路较长，超过默认超时。

## 解法

1. 先查看是否为超时而非断言失败。
2. 对测试命令或具体测试显式加更长超时，例如：
   - `pnpm test -- --testTimeout=15000 src/app/App.test.tsx`
   - 在慢测试上直接写 `test(..., 15000)` 或 `test(..., 20000)`
3. 如果测试通过依赖对话框按钮点击而非原生 `form.submit()`，优先走更贴近用户行为的交互路径，避免超时和事件链不一致叠加。
4. 用提高超时后的结果判断真实回归状态，不要把默认超时报错直接当成逻辑失败。

## 验证方式

`2026-04-13 12` 已验证：提高到 `15000ms` 后，`App.test.tsx` 全部断言通过。

`2026-04-14 21` 已验证：给 `app-shell`、`MePage`、`RolePermissionPanel` 慢测试补显式超时，并把角色对话框测试改成点击 `OK` 提交后，`pnpm --dir web test` 全量通过。

## 复现记录

- `2026-04-13 12`：一次性运行 App 相关测试时，`App.test.tsx` 因默认 `5000ms` 超时报错；提高到 `15000ms` 后通过。
- `2026-04-14 21`：执行角色策略计划 Task 5 时，`pnpm --dir web test` 在 `app-shell`、`MePage`、`RolePermissionPanel` 上复现慢测超时；为慢测试补显式超时并调整提交方式后全量通过。
