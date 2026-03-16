# 2026-03-16 Workflow Variable Validation Navigation

## 背景

- `workflow-editor` 最近几轮已经把 node contract、tool reference、tool execution、publish version 等问题收口到统一的 `validation issue path` 与 sidebar navigator。
- 但 `variables` 仍停留在前端局部纯文本提示：变量名为空或 trim 后重复时，用户能看到摘要，却不能沿同一套 navigator 快速定位，也没有后端同口径持久化 guard。
- 这会让 `variables` 成为 workflow 保存链路中的一个薄弱点：一部分脏数据只能靠手工肉眼排查，且 workflow / workspace starter 的保存语义不完全一致。

## 目标

- 把 `workflow variables` 的空白名、trim 后重复名纳入结构化 validation issue。
- 让 editor sidebar、variables 卡片高亮、save blocking 与后端持久化 guard 复用同一条规则。
- 保持最小增量，不为 variables 单独再造一套表单校验框架。

## 实现

### 前端

- 新增 `web/lib/workflow-variable-validation.ts`：
  - 输出 `category = variables`
  - 为每个问题补 `path = variables.{index}.name`
  - 统一生成 `field = name`
- `web/components/workflow-editor-variable-form.tsx`
  - 改为消费结构化 variable issues，而不是本地字符串数组。
  - variables 面板的问题列表直接展示 issue message。
- `web/components/workflow-editor-workbench.tsx`
  - 把 variable issues 合并进现有 navigator。
  - 把 variable summary 合并进 save blocking message。

### 后端

- 新增 `api/app/services/workflow_variable_validation.py`
  - 统一收集空白变量名与 trim 后重复名。
- `api/app/services/workflow_definitions.py`
  - 在 schema / tool / publish version guard 之后追加 `variables` guard。
  - 返回结构化 `WorkflowDefinitionValidationIssue(category="variables")`，保证 workflow 与 workspace starter 持久化链路一致。

### 测试

- `api/tests/test_workflow_routes.py`
  - 新增 workflow create 对空白/trim 漂移变量名的拒绝断言。
- `api/tests/test_workspace_starter_routes.py`
  - 新增 workspace starter create 对同类变量问题的拒绝断言。
- `api/tests/test_workflow_publish_routes.py`
  - 顺手把一条旧 publish version 测试对齐到当前结构化 `detail.message + issues[]` 错误体，避免全量回归继续按过期字符串契约断言。

## 影响范围

- workflow editor 现在对 variables 与 node/publish 问题共享同一套定位方式。
- workflow / workspace starter 的持久化规则更一致，不再允许变量名靠空白差异绕过保存。
- 下一步如果继续补字段级滚动 / 输入框聚焦，variables 不需要再单独补胶水层。

## 验证

- `api/.venv/Scripts/uv.exe run pytest tests/test_workflow_routes.py tests/test_workspace_starter_routes.py -q`
  - `64 passed`
- `api/.venv/Scripts/uv.exe run pytest -q`
  - `300 passed`
- `web/pnpm exec tsc --noEmit`
  - 通过
- `web/pnpm lint`
  - 通过

## 项目现状判断

- 基础框架已经足够支撑继续沿主业务链推进，不需要回头重搭。
- 当前仍未进入“只剩人工逐项界面设计/验收”的阶段，因此本轮不触发通知脚本。
- 结构热点依旧存在，尤其是 `web/components/workflow-editor-workbench.tsx` 与 `api/app/services/workflow_definitions.py`；但这轮先补一致性 guard，优先级高于为拆而拆。

## 下一步

1. 继续把 variable / publish / node 的 `path` 聚焦从卡片级高亮推进到字段级滚动与 focus。
2. 按既定主线继续补 `starter portability`、`publish binding identity` 与 sensitive access policy guard。
3. 在不回流主文件的前提下，继续拆解 `workflow-editor-workbench.tsx` 的 orchestration 热点。
