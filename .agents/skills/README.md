# 7Flows 技能索引

先读 [.agents/AGENTS.md](/E:/code/taichuCode/7flows/.agents/AGENTS.md)，再根据任务选择技能。默认优先采用“元流程技能 + 服务技能”的组合。

## 元流程技能

- `autonomous-development`
  - 用于用户要求 AI 自主判断阶段问题、比对当前目标、选择最高杠杆任务并推进主链闭环。
  - 典型场景：持续自治开发、需要判断目标是否漂移、需要在多个方向中选当前最值得做的主题。
- `development-closure`
  - 用于一轮工作接近完成时统一做验证、索引同步、Git 提交、推送和下一步规划。
  - 典型场景：代码 / 文档 / skill 已落地，准备结束本轮任务。
- `skill-governance`
  - 用于治理 `AGENTS.md`、目录级 `AGENTS.md`、`.agents/skills/` 和相关索引。
  - 典型场景：技能重构、分层协作调整、技能漂移修正。
- `safe-change-review`
  - 用于 prompt、skill、治理文档、脚本和本地执行边界这类 `P0` 高风险改动的合并前审查。

## 后端服务技能

- `backend-code-review`
  - 面向 `api/` 的后端实现审查与架构边界核对。
- `backend-testing`
  - 面向 `api/` 的后端测试补充、运行时验证和 published surface 验证。

使用案例：

- 改动 runtime、迁移、published gateway、sensitive access、tool gateway 或 callback ticket 时，优先组合后端技能。

## 前端服务技能

- `frontend-code-review`
  - 面向 `web/` 页面、组件、编辑器与治理入口的实现审查。
- `frontend-testing`
  - 面向 `web/` 组件、页面、Hook 与交互测试。
- `component-refactoring`
  - 面向职责混杂、边界泄漏或将继续扩张的 React 组件拆分。

使用案例：

- 改 workflow editor、run diagnostics、publish panel、sensitive access inbox 或大型前端容器组件时，优先组合前端技能。

## 插件 / 兼容服务技能

- `plugin-service-development`
  - 面向 `services/compat-*`、plugin catalog、compat invoke、服务健康检查与外部生态翻译边界。

使用案例：

- 调整 `services/compat-dify` 的翻译 contract、invoke 流程、catalog 结构或未来新增 compat service 时，优先使用。

## 工具技能

- `browser-automation`
  - 面向浏览器自动化、页面真实行为复核、截图 / PDF 留证和最小 smoke；在 7Flows 当前仓库里默认优先 `Playwright CLI / 系统 Chrome`，避免重型 `chrome-devtools` 长驻会话。

使用案例：

- 需要打开本地作者页面、点击或填写表单、核对 DOM 文本、生成截图证据，或用 Playwright CLI 最小复现前端问题时，优先使用。

## 特例技能

- `orpc-contract-first`
  - 只有在明确引入 oRPC 合同优先 API 层时启用。
- `pua`
  - 仅在同一任务多次失败、陷入被动循环或用户明确要求“换个方法继续硬解”时启用。

## 选择顺序

1. 先判断是否命中元流程技能。
2. 再按目录落到后端 / 前端 / 插件服务 / 工具技能。
3. 任务结束前默认回到 `development-closure`；如果触及 `P0` 高风险面，再补 `safe-change-review`。
