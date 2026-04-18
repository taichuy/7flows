---
memory_type: tool
topic: ESLint 会拦截在 React 组件文件里导出 helper 以及 clipboard 赋值时的 any
summary: 在 `web/app` 中为修前端问题临时把纯函数导出到组件文件，会触发 `react-refresh/only-export-components`；同时直接 `(navigator as any).clipboard = ...` 会触发 `@typescript-eslint/no-explicit-any`。已验证的做法是把 helper 抽到独立 `lib` 文件，并用 `Object.defineProperty` 安装 clipboard。
keywords:
  - eslint
  - react-refresh
  - only-export-components
  - no-explicit-any
  - clipboard
match_when:
  - 前端 lint 报 `react-refresh/only-export-components`
  - 前端 lint 报 `@typescript-eslint/no-explicit-any`
  - 需要给组件旁边补纯函数或浏览器 API patch
created_at: 2026-04-15 10
updated_at: 2026-04-15 10
last_verified_at: 2026-04-15 10
decision_policy: reference_on_failure
scope:
  - eslint
  - web/app/src/features/settings/components/ApiDocsPanel.tsx
  - web/app/src/features/settings/lib
---

# ESLint 会拦截在 React 组件文件里导出 helper 以及 clipboard 赋值时的 any

## 时间

`2026-04-15 10`

## 失败现象

执行 `pnpm --dir web lint` 时，`@1flowbase/web` 报：

- `react-refresh/only-export-components`
- `@typescript-eslint/no-explicit-any`

## 触发条件

- 为了测试或复用，把纯函数直接 `export` 在 React 组件文件里
- 为了快速 patch 浏览器 API，直接写 `(navigator as any).clipboard = ...`

## 根因

- 当前前端 lint 规则要求组件文件只导出组件，避免影响 fast refresh 语义
- TypeScript lint 不允许显式 `any`

## 解法

- 把纯函数、浏览器 patch、常量提到最近的 `features/*/lib` 文件
- 给只读浏览器属性打补丁时，优先使用 `Object.defineProperty`

## 验证方式

- 将 helper 移到独立 `lib` 文件后重新执行 `pnpm --dir web lint`
- lint 恢复通过

## 复现记录

- `2026-04-15 10`：为修 Scalar 复制行为，先把 `normalizeScalarClipboardText` 导出在 `ApiDocsPanel.tsx` 中并使用 `(navigator as any).clipboard` 安装 patch；`pnpm --dir web lint` 失败，随后抽到 `features/settings/lib/scalar-clipboard.ts` 并改用 `Object.defineProperty` 后恢复通过。
