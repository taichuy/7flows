# 2026-03-15 workflow editor publish draft 跟随当前版本与本地校验

## 背景

- 上一次提交 `c14c0d3 feat: add workflow editor publish draft form` 已经把 workflow editor 中的 `definition.publish` 结构化入口补齐，方向正确，也证明前端基础框架已足够承接继续向产品主业务推进。
- 但复核后发现两个衔接缺口：
  - 新增 publish endpoint draft 时，前端会默认把 `workflowVersion` 写成“保存前的当前版本”，导致用户在编辑器里保存出新版本后，draft 仍可能继续指向旧 workflow version。
  - `web/components/workflow-editor-publish-form.tsx` 单文件已经接近 600 行，协议字段、JSON 处理、默认值归一化和前端校验都混在一起，后续再补协议差异化配置会继续膨胀。

## 目标

1. 让 workflow editor 里的 publish draft 默认语义与后端 `WorkflowPublishedEndpointDefinition` 保持一致：`workflowVersion` 留空时跟随当前保存出来的 workflow version，而不是默认钉死旧版本。
2. 把 publish draft 的基础本地校验前移到编辑器，至少覆盖后端已经明确存在的语义版本、alias/path 规范和唯一性约束。
3. 顺手把 publish draft 表单拆层，避免它继续成为 workflow editor inspector 的新热点文件。

## 实现

### 1. publish draft 默认改为“跟随当前版本”

- 新增 publish endpoint 时不再默认写入 `workflowVersion` 字段。
- 表单上保留 `workflowVersion` 输入框，但默认留空并显示当前 workflow version 作为 placeholder。
- 当用户显式填写语义版本时，draft 才会被固定到某个 workflow version；当清空该字段时，重新回到“跟随当前保存版本”的语义。
- 同时补了“跟随当前 workflow 版本”按钮，方便把已固定的 endpoint 快速恢复成跟随模式。

### 2. 本地校验与后端 schema 对齐

- 新增 `web/components/workflow-editor-publish-form-validation.ts`，对齐后端 `api/app/schemas/workflow.py` 里的关键 publish 约束：
  - `workflowVersion` 必须符合 `major.minor.patch`
  - `alias` / `path` 采用与后端一致的归一化规则
  - `id / name / alias / path` 必须唯一
  - `cache.varyBy` 不能重复
- 这些校验只做前端提示，不会篡改后端事实层；真正保存时仍以后端校验为准。

### 3. publish draft 组件拆层

- 新增 `web/components/workflow-editor-publish-form-shared.ts`，收敛 publish draft 的类型、默认值、归一化与基础 helper。
- 新增 `web/components/workflow-editor-publish-endpoint-card.tsx`，把单个 endpoint draft 的 UI section 从主表单中抽离。
- `web/components/workflow-editor-publish-form.tsx` 现在只保留 workflow 级状态编排、校验汇总与 add/delete/commit 主链，不再继续承担全部字段渲染职责。
- 额外修正了重复 `endpoint id` 场景下的前端稳定性：校验消息按本地 draft 槽位归组，卡片渲染 key 也不再直接复用 `endpoint.id`，避免用户在“故意制造重复值等待修正”的过程中先撞上 React key 冲突。

## 影响范围

- `web/components/workflow-editor-publish-form.tsx`
- `web/components/workflow-editor-publish-endpoint-card.tsx`
- `web/components/workflow-editor-publish-form-shared.ts`
- `web/components/workflow-editor-publish-form-validation.ts`
- `web/components/workflow-editor-inspector.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

在 `web/` 目录执行：

```powershell
pnpm lint
pnpm exec tsc --noEmit
```

结果：两条命令均通过，无 ESLint warning/error，TypeScript `--noEmit` 也通过。

## 当前结论

- workflow editor 里的 publish draft 现在更符合产品直觉：默认随当前 workflow 保存结果前进，不会因为新增草稿时自动写死旧版本而把 publish 绑定悄悄留在历史版本上。
- 基础框架仍然满足持续推进功能性开发、插件扩展性和协议兼容性的要求，但前端配置面板需要持续维持“主链清晰 + 校验前移 + 单文件不过长”的节奏，避免工作台复杂度再次快速回流。

## 下一步

1. 继续把 workflow editor 的 workflow-level 治理入口补齐到敏感访问策略与变量/schema builder。
2. 继续拆 `web/components/run-diagnostics-execution-sections.tsx`，避免 run diagnostics 成为下一个高复杂度单体。
3. 继续把 publish 层更复杂的 protocol-specific advanced options 设计成 section/helper，而不是回填到单一表单文件里。
