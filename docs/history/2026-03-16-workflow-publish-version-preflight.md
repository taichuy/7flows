# 2026-03-16 Workflow Publish Version Preflight

## 背景

- 用户要求先按 `AGENTS.md` 读取 `docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，再结合最近一次 Git 提交判断项目现状、基础框架成熟度、架构是否支撑后续功能推进，并按优先级继续开发与补文档。
- 最近一次提交 `4e934c2 feat: validate workflow tool catalog references` 已把 `tool` / `llm_agent.toolPolicy` 的目录引用校验推进到 workflow 与 workspace starter 的保存链路。
- 顺着同一条主线继续看，`definition.publish[].workflowVersion` 仍存在“后端会在 publish binding sync 阶段报错，但 editor/save-time 预检不够前置”的缺口：
  - workflow create/update 时，引用完全不存在的版本会在后端 `422` 才暴露。
  - save as workspace starter 时，常见的 source-workflow 场景也缺少同口径校验。
  - editor publish draft 表单虽然已有格式校验，但还不知道“哪些 version 在当前上下文真的可 pin”。

## 现状判断

### 1. 基础框架是否已经写好

- 结论：**是。** 当前仓库已经具备可持续功能开发所需的后端 runtime / published surface / trace 基础和前端工作台 / editor / diagnostics 骨架，不是“先补空框架”的阶段。

### 2. 最近一次提交是否需要衔接

- 结论：**需要直接衔接。** tool catalog reference guard 把“目录引用漂移”前移到了 save-time；publish version reference 本质上属于同类问题，继续补齐后才能让 editor -> persistence -> publish binding 的一致性闭环更完整。

### 3. 架构是否支撑后续功能、扩展性、兼容性、可靠性与安全性

- 结论：**总体支撑，当前主要问题是主链治理密度还要继续提高。**
- `7Flows IR` 优先、单一 runtime orchestration owner、published gateway、plugin compatibility proxy、sensitive access 与 run event fact source 等核心边界仍成立。
- 现阶段最值得继续推进的，不是推翻重搭，而是把“应该在 editor/save-time 发现的问题”继续从 runtime/publish-time 往前收口。

### 4. 文件热点是否需要继续解耦

- 结论：**需要，但应贴着主链演进做。**
- 本轮没有去碰最大的 runtime 热点，而是新增独立 helper 模块，避免把 `workflow_definitions.py` 和 editor 表单逻辑继续往“万能校验器”膨胀。

## 本轮目标

1. 把 `publish.workflowVersion` 引用校验前移到 workflow / workspace starter 的持久化 guard。
2. 让 workflow editor 与 publish draft 表单知道当前可 pin 的版本集合，减少“等后端 422 才知道配错了”。
3. 维持与现有 publish binding 语义一致：
   - 可以 pin 到已存在版本；
   - 可以 pin 到本次保存即将生成的 next version；
   - 如果要跟随本次保存版本，仍推荐直接留空。

## 实现

### 1. 后端：新增 publish version reference helper

- 新增 `api/app/services/workflow_publish_version_references.py`：
  - `build_allowed_publish_workflow_versions()` 负责从 `WorkflowVersion` 历史和当前上下文构造允许的版本集合。
  - `collect_invalid_workflow_publish_version_references()` 负责扫描 `definition.publish[].workflowVersion` 并产出结构化错误信息。

### 2. 后端：workflow create/update 提前校验 publish version

- `api/app/services/workflow_definitions.py` 的 `validate_persistable_workflow_definition()` 新增 `allowed_publish_versions` 参数，并在 tool reference guard 之后继续执行 publish version reference guard。
- `api/app/api/routes/workflows.py` 现在会按持久化语义传入允许版本：
  - create：允许 `0.1.0`
  - update：允许已有历史版本 + `bump_workflow_version(current)`
- 这样 `0.1.1` 这类“本次保存即将物化”的版本仍可用，而 `0.1.2` / `9.9.9` 这类越界引用会在 workflow save 阶段直接被拒绝。

### 3. 后端：workspace starter 常见入口复用同一规则

- `api/app/services/workspace_starter_templates.py` 现在会在以下入口复用同一套 publish version reference guard：
  - create
  - update
  - refresh from workflow
  - rebase from workflow
- 当 starter 带有 `created_from_workflow_id / created_from_workflow_version` 上下文时，会用 source workflow 历史版本和 next version 构造允许集合，避免 editor 外的 API 路径绕过这条规则。

### 4. 前端：editor workbench 与 publish form 同步 preflight

- 新增 `web/lib/workflow-publish-version-validation.ts`：
  - 生成 editor 当前可 pin 的 workflow versions
  - 构造 publish version validation issues
- `web/components/workflow-editor-workbench.tsx` 现已把这组 issue 接到保存阻断消息中；`保存 workflow` 与 `保存为 workspace starter` 会统一提示“可选版本 + 留空跟随当前保存版本”。
- `web/components/workflow-editor-publish-form-validation.ts` 与 `web/components/workflow-editor-publish-form.tsx` 继续复用同一套规则，在 inspector 的 publish draft 表单中直接展示 per-endpoint 错误。
- `web/components/workflow-editor-inspector.tsx` 与 `web/components/workflow-editor-workbench/workflow-editor-hero.tsx` 同步展示当前 pin target 与 issue count，避免 UI 说明落后于真实行为。

## 影响范围

- `api/app/services/workflow_publish_version_references.py`
- `api/app/services/workflow_definitions.py`
- `api/app/api/routes/workflows.py`
- `api/app/services/workspace_starter_templates.py`
- `api/tests/test_workflow_routes.py`
- `api/tests/test_workspace_starter_routes.py`
- `web/lib/workflow-publish-version-validation.ts`
- `web/components/workflow-editor-publish-form-validation.ts`
- `web/components/workflow-editor-publish-form.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/workflow-editor-hero.tsx`

## 验证

### 后端

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest tests/test_workflow_routes.py tests/test_workspace_starter_routes.py tests/test_workflow_publish_routes.py -q
```

结果：

- `81 passed`

### 前端

在 `web/` 目录执行：

```powershell
pnpm exec tsc --noEmit
```

结果：

- 通过

### Diff 检查

在仓库根目录执行：

```powershell
git diff --check
```

结果：

- 无空白错误；仅有现有的 LF/CRLF 提示，不影响本轮行为正确性。

## 结论与下一步

- 当前项目已经具备继续达成产品设计目标的基础框架；优先级应继续放在“真实主链一致性”和“治理能力前移”，而不是回头重搭底座。
- 本轮工作直接衔接最近几次 editor/save-time guard：planned node、contract schema、tool catalog drift 之后，publish version reference 也已前移到统一的前后端 preflight / persistence guard。
- 当前仍未进入“只剩人工逐项界面设计/验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。
- 下一步建议按优先级继续：
  1. **P0**：继续把 execution-aware 落成真实 `sandbox` / `microvm` 分级执行能力。
  2. **P0**：继续补统一敏感访问控制在 publish export / inbox / 通知 worker 上的闭环。
  3. **P0**：继续收口 `WAITING_CALLBACK` 的 published drilldown、operator 入口与通知链路。
  4. **P1**：继续把 publish binding identity / alias-path governance、starter portability 语义和 schema builder 做细，减少保存后才暴露的治理问题。
