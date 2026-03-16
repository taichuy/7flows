# 2026-03-16 LLM Agent tool policy execution 结构化表单

## 背景

- `docs/dev/runtime-foundation.md` 已把工作流编辑器完整度列为 `P1` 主线，明确要求继续把治理语义从高级 JSON 收口到结构化入口。
- 当前后端 schema 已支持 `llm_agent.config.toolPolicy.execution`，前端本地 validation 也会校验 `nodes.{i}.config.toolPolicy.execution` 与工具 capability 的匹配关系。
- 但编辑器里 `LlmAgentToolPolicyForm` 只暴露了 `allowedToolIds` 与 `timeoutMs`，导致 execution override 仍要手写 JSON，治理语义和校验能力没有真正形成可用闭环。

## 目标

- 为 `llm_agent` 的 `config.toolPolicy.execution` 补齐结构化编辑入口。
- 保持与当前 runtime policy execution 字段语义一致，避免前端再造第二套 execution 配置格式。
- 不扩张范围到新的治理模型，只把已有 schema / validation 已支持的能力接入编辑器。

## 实现

- 在 `web/components/workflow-node-config-form/llm-agent-tool-policy-form.tsx` 中新增 `Tool execution override` section。
- 结构化暴露以下字段：
  - `Execution class`
  - `Profile`
  - `Timeout ms`
  - `Network policy`
  - `Filesystem policy`
- 默认保持“follow tool default”，只有用户显式填写时才写入 `config.toolPolicy.execution`。
- 当 execution override 被清空且 `toolPolicy` 没有其余字段时，自动移除整个 `config.toolPolicy`，保持 definition 干净。

## 影响范围

- 编辑器用户不再需要为了声明 tool execution override 手写高级 JSON。
- 前端 UI 与后端 `WorkflowNodeToolPolicy.execution` 语义重新对齐，definition preflight / capability validation 的结果也更容易被普通用户理解和修正。
- 这条路径为后续继续结构化 `sensitive access policy`、`publish binding identity` 等治理字段提供了同类实现样板。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 评估结论

- 这次改动不改变 runtime 主模型，也不引入新的治理概念，属于把“已存在的后端能力”补成“可真正使用的前端入口”。
- 对用户层的直接帮助是降低 editor 中高级 JSON 的使用频率；对 AI 与人协作层的帮助是让 capability validation 更可操作；对 AI 治理层的帮助是把 execution boundary 约束前移到编排阶段，而不是等运行失败后再回头补字段。

## 下一步

1. 沿同一模式继续补 `sensitive access policy` 的结构化入口。
2. 继续治理 `get-workflow-publish.ts`、`workflow-tool-execution-validation.ts`、`workflow-editor-variable-form.tsx` 等前端热点文件，避免 editor 复杂度回流。
3. 把 execution override 的 operator 解释继续贯通到 run diagnostics / publish detail，让编辑阶段的治理语义和运行阶段的排障语义一致。
