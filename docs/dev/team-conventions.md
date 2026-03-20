# 团队协作约定

## 目的

本文记录 7Flows 当前贡献者与 AI 助手都应遵守的共享协作规则。目录级细则继续写在对应目录的 `AGENTS.md`，长期决策写入 `docs/adr/`。

## 共享规则与本地记忆

- 共享规则写在根 `AGENTS.md`、目录级 `AGENTS.md`、本文与 `docs/adr/`。
- 专项工作流写在 `.agents/skills/`，并通过 `.agents/skills/README.md` 维护索引与使用案例。
- 当前开发者自己的稳定偏好、目标账本、下一步规划和按日期留痕写在 `docs/.private/`，不得作为共享事实来源。
- 共享仓库不写个人启动提示词、机器路径、临时讨论稿或按日期开发流水。
- `docs/.private/` 初始化为当前开发者自己的本地 git 仓库作为时序记忆，但不配置共享远端，也不改变它的私有属性，每次开发结束应该自动作为开发日志提交到本地git，但是不纳入共享仓库。

## AI 协作主循环

- 开始任务时，先读根 `AGENTS.md`、命中目录的 `AGENTS.md`、相关共享文档与命中的技能。
- 如果存在 `docs/.private/runtime-foundation.md`，先比较“当前用户输入目标”与“本地目标账本”是否一致。
- 如果是同一目标下的继续推进，不更新目标记录。
- 如果目标明显偏移，先询问用户是更新主目标还是新增附加目标，再改本地记录。
- 当用户目标仍有多种实现路径时，应基于代码现实列出候选方案、优缺点和推荐方案，帮助对齐后再实现。
- 规划粒度不要切得过细；优先打通完整模块或链路闭环，再根据测试结果回归修复。
- 共享文档默认采用链式说明，不在多个入口重复大段规则。

## 验证、提交与推送

- durable change 必须做与改动类型匹配的验证，不能只靠主观判断宣称完成。
- 共享规则、目录入口、技能结构或长期决策变化时，必须同步更新对应文档、`AGENTS.md`、skill 索引或 ADR。
- 一轮工作经验证成立后，默认做一次非交互式 Git 提交，并尝试把当前分支推送到远端。
- 如果本轮只是探索态，或推送因权限 / 保护分支 / 网络问题失败，最终汇报里必须明确说明原因。
- 默认仓库 PR 目标分支是 `taichuy_dev`；除非维护者明确说明临时替代分支，否则不要改默认口径。

## 本地开发基线

- 开发主链必须保持 local-first、loopback-first。
- 不要把远程脚本、CDN、外部 webhook、隐藏下载、`curl | bash` 或第三方托管依赖写进共享开发主链。
- 后端本地开发优先复用 `api/.venv` 与 `uv`。

## P0 审查护栏

以下路径与改动类型属于 `P0` 审查范围，合并前必须经过人工审查，并默认组合 `safe-change-review`：

- `AGENTS.md`
- 目录级 `AGENTS.md`
- `.agents/skills/`
- `docs/dev/team-conventions.md`
- `docs/adr/`
- `scripts/`
- `docker/`
- CI / workflow 配置
- shell / PowerShell / Python / batch 脚本
- package manager hook、bootstrap 命令
- prompt instruction、automation instruction 与 merge-time governance rule

审查时必须显式检查：

- prompt injection 或隐藏指令升级
- 隐藏下载、远程执行和静默联网路径
- 凭证外传、意外上传或外部通知端点
- 是否破坏 local-first、loopback-first 的开发基线
