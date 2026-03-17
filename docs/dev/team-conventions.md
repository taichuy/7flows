# 团队协作约定

## 目的

本文记录 7Flows 当前所有贡献者与 AI 助手都应遵守的共享、稳定协作约定。

- 当前共享仓库中的规范文档、ADR、skills 和新增治理条目默认使用中文；如果关键入口里出现英文且已经影响检索，应优先翻回中文。
- 共享规则写在 `AGENTS.md`、本文、`docs/dev/user-preferences.md`、`docs/dev/runtime-foundation.md` 与 `docs/adr/`。
- 当前开发者的个人笔记、机器偏好、临时推导和按日期开发留痕放在 `docs/.private/`，且不得提交。

## 共享规则与本地记忆

- 共享工程规则、评审基线和团队协作预期写在本文。
- 稳定的用户偏好与自治开发偏好写在 `docs/dev/user-preferences.md`。
- 当前实现事实、结构热点和近期优先级写在 `docs/dev/runtime-foundation.md`。
- 当前开发者的本地提醒、环境差异、临时实验和按日期开发留痕写在 `docs/.private/`，不作为共享事实来源。
- 如果某条本地经验已经升级为仓库级长期规则，应提升到 `AGENTS.md`、本文、某个 skill 或 ADR，而不是继续留在 `docs/.private/`。

## 共享工作规则

### 主链优先

- 优先推进端到端主链闭环，不优先做样式整理、局部美化或非阻塞型重构。
- 默认以 `docs/dev/runtime-foundation.md` 作为本轮优先级和当前缺口的主要入口。
- 文件拆分应由“变化原因混杂、边界泄漏、变更传播过大”驱动，文件长度只作为预警，不是自动拆分命令。

### 验证与收尾

- Durable change 必须做与改动类型匹配的验证，不能只靠主观判断宣称“完成”。
- 一轮工作经验证成立后，默认做一次非交互式 Git 提交；只有明确的探索态才可以暂不提交，但最终汇报必须说明原因。
- 当前事实或下一步优先级变化时，更新 `docs/dev/runtime-foundation.md`。
- 稳定的用户偏好、自治开发偏好或选题方法变化时，更新 `docs/dev/user-preferences.md`。
- 如果当前开发者确实需要跨轮延续自己的过程记忆，可把按日期留痕写进 `docs/.private/history/`；不要把这类个人留痕重新提升成共享知识库。

### 本地开发基线

- 后端本地开发优先复用 `api/.venv` 与 `uv`。
- `docs/.taichuy/` 继续作为本地设计讨论和文案草稿区，默认 git ignore，不作为共享事实入口。
- 开发主链必须保持 local-first、loopback-first，避免把远程脚本、CDN、外部 webhook 或外部托管依赖写进本地开发必经路径。

## 评审与合并护栏

- 本地验证后自动提交到分支是允许的。
- 默认仓库 PR 目标分支是 `taichuy_dev`；除非维护者明确说明临时替代分支，否则不要改默认口径。
- prompt、governance、skill、script、bootstrap 和本地执行边界相关改动，在合并前必须经过人工审查。
- 这类改动默认使用 `.agents/skills/safe-change-review/SKILL.md` 做审查总结。

以下路径与改动类型属于 `P0` 审查范围：

- `AGENTS.md`
- `.agents/skills/`
- `docs/dev/team-conventions.md`
- `docs/adr/`
- `scripts/`
- `docker/`
- CI / workflow 配置
- shell / PowerShell / Python / batch 脚本
- package manager hook 与 bootstrap 命令
- prompt instruction、automation instruction 与 merge-time governance rule

审查时必须显式检查：

- prompt injection 或隐藏的指令升级
- 危险脚本、隐藏下载或远程代码执行路径
- 凭证外传、意外数据导出或隐藏上传
- 外部回调、webhook 或通知端点
- 是否违反 local loopback / local dependency 基线

## 本地依赖规则

- 不要把必需的远程脚本、CDN 资源、外部托管依赖或外部通知端点写入本地开发主链。
- 不要加入 `curl | bash`、远程安装片段、隐藏下载或依赖第三方托管代码的共享提示词。
- 允许引用的开发依赖应优先来自 workspace 文件、本机 sibling repo 或本地回环服务。

## ADR 使用约定

以下情况应新增或更新 `docs/adr/`：

- 架构边界调整
- 协作流程变化
- 评审、安全或供应链护栏更新
- 集成边界或长期治理决策变化

当前开发者自己的按日期开发留痕放在 `docs/.private/history/`；ADR 用于站住“背景 / 决策 / 后果”，不是个人流水账的替代品。
