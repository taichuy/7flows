---
memory_type: tool
topic: schema block 条件数组未显式标注类型时会在 web/app build 被 TypeScript 推宽拦住
summary: 在 `web/app` 的 schema 片段里用条件表达式返回 block 数组时，如果不显式标注为 `SchemaBlock[]` 或使用 `satisfies`，`pnpm --dir web/app build` 可能在 `tsc --noEmit` 阶段把 `kind` 推宽成 `string`，报 `TS2322`。
keywords:
  - typescript
  - SchemaBlock
  - TS2322
  - web/app
  - build
  - node-schema-fragments
match_when:
  - 运行 `pnpm --dir web/app build`
  - 报 `TS2322` 且错误点在 schema block 数组
  - 条件数组里出现 `{ kind: 'view', ... }` 但被推断成普通 `string`
created_at: 2026-04-18 00
updated_at: 2026-04-18 00
last_verified_at: 2026-04-18 00
decision_policy: reference_on_failure
scope:
  - typescript
  - pnpm
  - web/app
  - web/app/src/features/agent-flow/schema/node-schema-fragments.ts
---

# schema block 条件数组未显式标注类型时会在 web/app build 被 TypeScript 推宽拦住

## 时间

`2026-04-18 00`

## 为什么做这个操作

调整 agentFlow `start` 节点的 node detail，让它不再显示“失败重试 / 异常处理”策略区。

## 失败现象

执行：

```bash
pnpm --dir web/app build
```

报错：

```text
TS2322: Type '{ kind: string; renderer: string; title: string; }' is not assignable to type 'SchemaBlock'
Type 'string' is not assignable to type '"view"'
```

## 原因

把 `policy_group` 改成条件数组后，TypeScript 会把 `[{ kind: 'view', ... }]` 在该上下文里推宽成普通对象数组，导致 `kind` 从字面量 `'view'` 退化为 `string`，最终不满足 `SchemaBlock` 联合类型。

## 已验证解法

1. 给条件数组显式标注为 `SchemaBlock[]`，或改用 `satisfies SchemaBlock[]`。
2. 再重跑 `pnpm --dir web/app build`，确认 `tsc --noEmit` 与 `vite build` 均通过。

## 后续避免建议

以后在 schema/runtime/renderer 这类依赖字面量联合类型的数组里，只要用了条件拼接或中间变量，就不要依赖默认推断；直接显式收口到目标 block 类型。
