# 2026-03-16 Workspace Starter Validation Issues

## 背景

- `feat: add workflow preflight issue categories` 已把 workflow save 链路推进成结构化 validation issue，但 workspace starter create/update/save-as 仍主要返回扁平字符串 `detail`。
- 当前 starter 已经是 workflow definition 持久化主链的一部分，不只是附属模板页；如果 starter 入口继续停留在纯文本 `422`，前端就会再次回到脆弱的错误文案拼接，破坏“workflow / starter 共用同一套持久化 guard”的方向。
- 本轮项目复核结论依旧成立：基础框架已经足够支撑继续功能开发，当前更需要沿既有主线补齐一致性，而不是回头重造骨架。

## 目标

- 让 workspace starter 的 validation 失败也返回与 workflow preflight 同风格的 `message + issues[]` 结构。
- 让 starter library 更新入口和 workflow editor 的“保存为 workspace starter”入口都能消费 issue category，而不是只显示扁平报错。
- 为后续 starter portability、publish binding identity、sensitive access policy 等新的持久化 guard 预留稳定扩展点。

## 实现

### 后端

- `api/app/api/routes/workspace_starters.py`
  - 复用 `WorkflowDefinitionValidationIssue`，把 `WorkflowDefinitionValidationError` 转成：
    - `detail.message`
    - `detail.issues[]`
  - 适用入口包括 `create / update / refresh / rebase`，以及这些入口内部复用到的 definition persistence guard。

### 前端

- `web/lib/get-workspace-starters.ts`
  - 新增 `WorkspaceStarterValidationError` 与 issue 解析 helper。
  - 新增 `createWorkspaceStarterTemplate()` / `updateWorkspaceStarterTemplate()`，统一消费 starter validation 错误结构。
- `web/components/workflow-editor-workbench.tsx`
  - `保存为 workspace starter` 现会按 issue category 汇总错误，而不是只展示原始 `detail` 文本。
- `web/components/workspace-starter-library.tsx`
  - starter library 的更新链路切换到统一 helper；当 definition 校验失败时，会展示分类摘要，例如“节点支持 1 项 / 执行能力 1 项”。

### 测试

- `api/tests/test_workspace_starter_routes.py`
  - 更新 validation 失败断言，改为校验结构化 `detail.message` 与 `detail.issues[]`。
  - 覆盖 `node_support`、`tool_reference`、`tool_execution`、`publish_version` 等核心分类。

## 影响范围

- `api/app/api/routes/workspace_starters.py`
- `api/tests/test_workspace_starter_routes.py`
- `web/lib/get-workspace-starters.ts`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workspace-starter-library.tsx`
- `docs/dev/runtime-foundation.md`

## 项目现状判断

### 是否需要衔接最近提交

- 需要，而且这是自然衔接。
- 最近提交刚把 workflow definition preflight 分类 issue 收口到 workflow save 主链；本轮把同一语义补到 workspace starter，避免“workflow 有结构化验证、starter 仍是字符串错误”的断层继续扩大。

### 基础框架是否已写好

- 是。workflow、runtime、publish、diagnostics、sensitive access、starter governance 都已形成真实链路。
- 当前问题更多是主链一致性和边界补真，而不是基础骨架缺失。

### 架构是否支撑继续推进

- 支撑。starter validation 没有另起第二套校验 DSL，而是继续复用 `validate_persistable_workflow_definition()` 及其 issue category。
- 这符合 `7Flows IR` 单一事实模型、统一持久化 guard、前端本地快检 + 后端权威验证的架构方向。

### 是否还有需要继续解耦的热点

- 有，但这轮没有偏题去拆热点文件。
- `web/components/workspace-starter-library.tsx` 仍偏长，不过当前把保存链路统一抽到 `web/lib/get-workspace-starters.ts` 后，后续继续拆 form / mutation helper 会更顺。

## 验证

- `api/.venv/Scripts/uv.exe run pytest tests/test_workspace_starter_routes.py -q`
  - `20 passed`
- `web/pnpm exec tsc --noEmit`
  - 通过

## 结论

- 项目当前仍然可以稳定持续推进，不需要回头重写基础框架。
- 本轮补的是 workflow / starter 持久化主链之间的验证一致性，属于高优先级但低风险的补真工作。
- 这样后续继续补 starter portability、publish binding identity 或敏感访问策略 guard 时，可以沿同一 issue category 机制扩展，而不必再次清理前端对纯文本错误的依赖。

## 下一步

1. 继续为 validation issue 补 `field/path` 级定位信息，减少用户仍需手动排查 JSON 的成本。
2. 把同一套 issue category 继续扩到 starter refresh/rebase 的 bulk result 摘要里，避免批量治理时又退回纯文本 detail。
3. 按 `runtime-foundation` 既定优先级继续推进 starter portability / publish binding identity / sensitive access policy 相关 guard。
