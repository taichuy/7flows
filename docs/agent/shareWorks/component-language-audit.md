# Component / Language Audit

日期：2026-04-12
任务：`57536ab9`

- 已在 `docs/draft/DESIGN.md` 的 `Part 2 / 2.3 页面组合 Recipe 最小集` 补入 5 个页面的最小组合配方。
- `overview / orchestration / api / logs / monitoring` 均明确主块与辅助块，供 Codex 直接复用，不再自行拼页。
- 已在 `Part 2 / 5.4 UI 文案禁令` 增加默认产品 UI 文案禁令。
- 新禁令明确禁止 prompt-like、command-like、internal-instruction-like 文案进入默认产品 UI。
- 新禁令同时限定 UI 只允许表达用户任务、业务对象、系统状态、可执行结果。
- 文内加入 4 个禁止示例，针对“把命令和提示词写进 UI”的常见泄漏风险。
