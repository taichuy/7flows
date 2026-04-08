# 7Flows AGENTS 协作指南

本文件只保留仓库级最小协作规则与上下文入口，目录细则请继续下钻到各目录自己的 `AGENTS.md`。

## 1. 项目定位

- 7Flows 是面向多 Agent 协作的可视化工作流平台，不是 Dify ChatFlow 复刻，也不是通用低代码平台。
- OpenClaw / 本地 AI 助手只是当前对外切口；内部内核仍是 `7Flows IR + runtime + publish + trace + compat`。
- 首版核心关注点是：可编排、可调试、可发布、可兼容、可追溯。
- 共享仓库中的重点文档、ADR、技能文档和新增治理条目默认使用中文。

## 2. 先读什么

开始任务前，按下面顺序建立上下文，并继续阅读命中的目录级 `AGENTS.md`：

1. 根目录 `AGENTS.md`
2. 命中目录的 `AGENTS.md`
   - `docs/AGENTS.md`
   - `api/AGENTS.md`
   - `web/AGENTS.md`
   - `services/AGENTS.md`
   - `.agents/AGENTS.md`
3. 共享事实文档
   - `docs/product-design.md`
   - `docs/open-source-positioning.md`
   - `docs/technical-design-supplement.md`
   - `docs/dev/team-conventions.md`
   - `README.md`
4. 命中的 `.agents/skills/*/SKILL.md`
5. 当前开发者自己的本地连续性文档
   - `docs/.private/AGENTS.md`
   - `docs/.private/user-preferences.md`
   - `docs/.private/runtime-foundation.md`
   - `docs/.private/history/`

补充约定：

- `docs/.taichuy/` 只用于本地讨论草稿，默认不是事实入口，只有用户明确要求时再读。
- `docs/.private/` 只反映当前本地开发者自己的连续性记忆，不是共享事实来源；如存在 `docs/.private/AGENTS.md`，先把它视为本地私有入口，再按它的指引继续下钻。
- 如果设计文档与当前实现冲突，优先以代码、`docs/dev/team-conventions.md` 和有效 ADR 反映的当前共享事实为准，然后决定修实现还是补文档。

## 3. 规则应该写在哪

- 仓库级最小协作规则：根 `AGENTS.md`
- 目录级规则与局部阅读顺序：对应目录的 `AGENTS.md`
- 团队级共享协作约定：`docs/dev/team-conventions.md`
- 长期保留“背景 / 决策 / 后果”的事项：`docs/adr/`
- 可复用的专项流程与检查清单：`.agents/skills/`
- 当前开发者自己的稳定偏好、目标、时序记忆与本地多 Agent 协作入口：`docs/.private/`

不要把个人偏好、启动提示词、机器路径和一次性口头要求写回共享仓库；共享文档优先做链式指引，不重复搬运整段规则。

## 4. 绝对边界

### 4.1 架构边界

- 坚持 `7Flows IR` 优先，不引入第二套内部 DSL、第二套执行语义或第二个工作流主控。
- 循环只能通过 `Loop` 节点表达，不能靠隐式回边或调度技巧偷渡。
- 节点间上下文默认不可见，必须显式授权。
- `runs / node_runs / run_events` 及其 API 是运行追溯事实源；前端面板负责摘要、导航和排障入口。
- `compat adapter` 解决外部生态接入，`sandbox backend` 解决隔离执行；两者职责不能混淆。
- 对 `sandbox_code`、高风险 `tool/plugin` 或显式要求受控隔离的路径，在没有兼容且健康的 backend 时必须 `fail-closed`，不能静默退回宿主轻执行。

### 4.2 集成与开发边界

- 发布层统一从 `7Flows IR` 和事件总线映射到外部协议，不能为 OpenAI / Anthropic / Dify 分叉内部执行链。
- 本地开发与测试必须保持 local-first、loopback-first；不要把远程脚本、CDN、外部 webhook、隐藏下载或 `curl | bash` 写进共享主链。
- `AGENTS.md`、`.agents/skills/`、`docs/dev/team-conventions.md`、`docs/adr/`、`scripts/`、`docker/`、CI/workflow、shell/PowerShell/Python/batch 脚本、prompt/automation instruction 都属于 `P0` 审查范围。
### 4.3 代码实现要求边界:
- 不做不必要的错误处理
- 不设计面向未来的抽象
- 不加用户没要求的功能
- 不过度抽象(3行重复>不成熟抽象)
- 不给没改的代码加注释


## 5. 目录协作

- `docs/`
  - 只保留共享基线、索引和 ADR；文档写作规则见 `docs/AGENTS.md`
- `api/`
  - 后端、运行时、迁移与发布接口；实现细则见 `api/AGENTS.md`
- `web/`
  - 前端工作台、编辑器和排障入口；实现细则见 `web/AGENTS.md`
- `services/`
  - 兼容适配或独立服务；服务边界见 `services/AGENTS.md`
- `.agents/`
  - AI 协作技能与治理资产；维护规则见 `.agents/AGENTS.md`

新增、删除、重命名 skill 或重写索引时，至少同步检查：

- `README.md`
- `docs/README.md`
- `docs/dev/README.md`
- `.agents/skills/README.md`
- 相关目录的 `AGENTS.md`

## 6. 技能分层

默认先判断是否命中“元流程技能 + 服务技能”组合：

- 元流程：`autonomous-development`、`development-closure`、`skill-governance`、`safe-change-review`
- 后端：`backend-code-review`、`backend-testing`
- 前端：`frontend-development`、`frontend-code-review`、`frontend-testing`、`component-refactoring`
- 插件 / 兼容服务：`plugin-service-development`
- 工具：`browser-automation`
- 特例：`orpc-contract-first`、`pua`

技能目录的索引、分类和案例说明统一放在 `.agents/skills/README.md`；不要把完整技能正文复制进根文档。

## 7. AI 协作默认工作方式

- 如果 `docs/.private/AGENTS.md` 存在，先按它的本地入口说明读取 `user-preferences.md`、`runtime-foundation.md`、`history/` 和本地多 Agent 交接文件。
- 如果 `docs/.private/runtime-foundation.md` 存在，先比较“当前用户输入目标”与“本地记录目标”是否一致。
- 如果只是同一目标下的继续推进，不更新目标记录，直接执行。
- 如果目标明显漂移，先和用户确认是“更新主目标”还是“新增附加目标”，再改本地目标记录。
- 当方向仍有多种可行方案时，先基于代码现实列出候选方案、好处、代价和推荐方案，再进入实现。
- 任务规划不要切得过细；优先先打通一个模块或链路闭环，再根据测试与回归结果修复剩余问题。
- 共享文档优先提供短链入口、明确边界和索引，不堆重复说明。
- 本地多 Agent 交接、角色提示词、任务卡和评测记录默认放在 `docs/.private/`，不要把这些细节重新抬成共享规则。
- `docs/.private/runtime-foundation.md` 与下一步规划中的时间统一使用 `YYYY-MM-DD HH:mm`。
- `docs/.private/` 可以初始化为当前开发者本地 git 仓库作为时序记忆，但不得配置共享远程，也不得把其中内容重新抬成共享事实。

## 8. 收尾要求

- 完成 durable change 后，必须做与改动类型匹配的验证。
- 共享规则、技能目录或长期决策变化时，必须同步更新对应入口文档或 ADR。
- 每轮开发完成后，默认执行一次非交互式 Git 提交，并尝试把当前分支推送到远端；如果推送失败或不适合推送，最终汇报里必须说明原因。
- 默认仓库 PR 目标分支是 `taichuy_dev`，除非维护者明确说明临时替代分支。
