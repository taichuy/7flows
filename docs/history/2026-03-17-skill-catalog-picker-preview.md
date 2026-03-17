# 2026-03-17 Skill Catalog Picker And Preview

## 背景

- 上一轮提交 `98f4ca8 feat: add skill catalog foundation for llm agents` 已把 product-level `SkillDoc`、`/api/skills` REST surface、workflow/workspace starter persistence guard，以及 `llm_agent.config.skillIds -> prompt [Skills]` 注入链落到后端主链。
- 但编辑器侧仍只有 `Skill IDs` 原始文本框，人类用户要先记住 `skillId` 再手工录入；这使得“人配置 -> 后端校验 -> runtime 注入”的闭环虽然成立，但离用户层可用体验还有明显缺口。
- `docs/dev/runtime-foundation.md` 已把 `Skill Catalog` 的下一步收敛到 `editor picker / summary preview`、MCP retrieval、phase-aware 注入策略与 reference lazy fetch；在当前全局完整度下，优先补人类配置入口比继续只做后端内核更有助于用户层与 AI 协作层同时闭环。

## 目标

- 给 `llm_agent` 节点补最小可用的 Skill Catalog picker 与 summary preview，而不是继续停留在纯文本 `skillIds` 输入。
- 保留原始 `skillIds` 文本入口，避免阻断高级/批量粘贴场景，同时把 catalog 勾选与文本输入收敛到同一份配置事实。
- 顺手把 `llm-agent-node-config-form.tsx` 中新增的 skill 选择/预览职责拆出去，避免 `llm_agent` 主表单继续累积过多数据获取和 UI 分支。

## 实现

- 新增 `web/lib/get-skills.ts`：
  - 统一封装 `/api/skills` list/detail 的前端获取与字段归一化。
  - 给 editor 提供 `SkillCatalogListItem` / `SkillCatalogDetail` 的稳定读模型。
- 新增 `web/components/workflow-node-config-form/llm-agent-skill-section.tsx`：
  - 在 `llm_agent` 配置面板中拉取 Skill Catalog。
  - 支持按 `skill id / name / description` 搜索、勾选绑定、查看摘要与 reference summary。
  - 保留 `Selected skill IDs` 文本区，catalog picker 与手工输入都回写同一份 `skillIds`。
  - 对不在当前 catalog 中的 `skillIds` 做前端提示，和后端 persistence guard 形成前后呼应的 fail-fast 体验。
- `web/components/workflow-node-config-form/llm-agent-node-config-form.tsx`：
  - 把原先内联的 `Skill IDs` 文本块替换为独立 `LlmAgentSkillSection`。
  - 主表单只保留 `skillIds` 写回逻辑，不再直接承担 skill catalog 获取、筛选和 preview 细节。

## 影响范围

- 用户层：
  - 做这个功能之前，人类只能手工输入 `skillIds`，对 service-hosted skill 的可发现性很弱。
  - 做完之后，编辑器已经能直接浏览、搜索、勾选并预览 skill 摘要与 references，用户可以更自然地把 `SkillDoc` 接进 `llm_agent`。
- AI 与人协作层：
  - 本轮没有改变 runtime 的 `SkillDoc` 注入语义，但显著缩短了“人类定义 skill 绑定 -> runtime 认知注入”的路径，减少了因为 id 记忆/录入错误导致的配置漂移。
- 架构与解耦：
  - 这轮不是再造新架构，而是在既有 architecture 上补 user-facing 闭环，并把 `llm-agent-node-config-form.tsx` 中的 skill 目录读取与 preview 职责拆到独立 section。
  - 它增强的是扩展性与可维护性：后续即使继续补 phase-aware skill binding、reference lazy fetch 或更丰富的 preview，也能优先沿 `get-skills.ts + llm-agent-skill-section.tsx` 演进，而不是把逻辑重新堆回主表单。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 下一步

1. 为 `Skill Catalog` 补 MCP retrieval contract，让 REST / MCP 指向同一份 service-hosted 事实，而不是只停留在 editor / REST 闭环。
2. 为 `llm_agent` 补 phase-aware skill binding、reference lazy fetch 与 prompt budget 控制，避免 skill 注入长期停留在“全量 body + summary 列表”的单层策略。
3. 若 catalog 数量继续增长，再把当前 section 内的 list/detail 获取抽成 hook，并评估是否需要在 editor 中补 reference body drilldown，但前提仍是服务侧事实优先，不引入重型 SkillHub。
