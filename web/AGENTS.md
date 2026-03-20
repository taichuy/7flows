# web 协作说明

先读根目录 [AGENTS.md](../AGENTS.md)，再处理 `web/`。

## 默认技能

- 前端审查：`frontend-code-review`
- 前端测试：`frontend-testing`
- 复杂组件拆分：`component-refactoring`
- 收尾：`development-closure`

## 前端边界

- UI 只负责工作台、编辑器、排障和治理入口，不创造第二套运行事实或伪造未落地能力。
- 运行追溯、waiting blocker、审批结果、发布诊断等展示应优先消费后端共享契约，而不是页面各自拼装事实。
- 保持当前工作台与编辑器的既有信息结构；如需新增复杂交互，先对齐后端真实语义与 operator 流程。

## 验证要求

- 前端改动至少运行 `pnpm lint`，必要时补 `pnpm test` 或类型检查。
- 如果改动影响共享入口、诊断术语或能力口径，同步更新 `README.md`、`docs/README.md` 或相关技能文档。
