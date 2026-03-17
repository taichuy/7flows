---
name: development-closure
description: 用于 7Flows 一轮实现、文档或 skill 调整接近完成时，统一收尾验证、文档同步、Git 提交和下一步规划，避免遗漏 runtime-foundation、user-preferences、team-conventions、ADR 等开发闭环。
---

# 7Flows 开发闭环收尾

## 何时使用

当本轮工作已经形成可交付结果，准备结束一个任务、子任务或一次文档优化时使用，尤其包括：

- 已修改代码、文档、skill 或测试，并准备汇报“本轮完成”
- 需要确认是否补 `docs/dev/runtime-foundation.md`、`docs/dev/user-preferences.md`、`docs/dev/team-conventions.md`、`docs/adr/`
- 需要在仓库已有脏工作区中只提交本轮相关改动

不要用于：

- 只有探索、阅读、对比，还没有形成 durable change 的阶段
- 纯 brainstorm，尚未进入可验证输出

## 先建立上下文

至少复核：

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/dev/runtime-foundation.md`
- `docs/dev/team-conventions.md`
- 本轮改动触达的代码、文档和 skill

如果任务涉及产品边界、OpenClaw 对外切口、开源 / 商业分层、插件兼容、安全、变量传递或 runtime 架构，再补读：

- `docs/product-design.md`
- `docs/open-source-commercial-strategy.md`
- `docs/technical-design-supplement.md`

## 收尾顺序

### 1. 先判断“哪类事实发生了变化”

- 当前仍成立的实现事实、结构热点、近期优先级：更新 `docs/dev/runtime-foundation.md`
- 稳定的用户偏好、自治开发偏好与汇报口径：更新 `docs/dev/user-preferences.md`
- 团队级共享约定：更新 `docs/dev/team-conventions.md`
- 跨回合需要长期保留“背景 / 决策 / 后果”的规则：更新 `docs/adr/`
- 可复用的协作规则或专项流程：更新 `AGENTS.md` 或 `.agents/skills/*`
- 当前开发者若需要保留个人过程留痕：写入 `docs/.private/history/YYYY-MM-DD-*.md`
- 只是一次性任务说明：不要硬写进长期文档

### 2. 同步文档，不把规则留在对话里

- 共享规则变化时，优先更新公共规则入口，而不是继续堆共享 history。
- 只要当前事实或下一步优先级发生变化，就同步 `docs/dev/runtime-foundation.md`。
- 如果稳定的自治开发偏好或汇报格式变化，就同步 `docs/dev/user-preferences.md`。
- 如果新增、删除或重命名 skill，要同步 `AGENTS.md`、`README.md`、`docs/README.md`、`docs/dev/README.md`。

### 3. 做与改动类型匹配的验证

- 后端改动：优先跑相关测试，再跑 `api/.venv/Scripts/uv.exe run pytest -q`
- 前端改动：至少跑 `web/pnpm lint` 和 `web/pnpm exec tsc --noEmit`；若已有测试，再跑对应测试
- 纯文档 / skill 改动：至少跑 `git diff --check`，并检查新增路径、skill 名称和索引引用是否一致

如果仓库存在历史债务：

- 明确区分“本轮新增问题”和“仓库既有问题”
- 不要把历史 lint / test 债务误报成“本轮已清零”

### 4. 再决定是否提交 Git

- 先看 `git status --short`
- 不要把用户已有的无关脏改动一起带进提交
- 只提交本轮相关文件
- 默认做一次非交互式提交；如果本轮只是中间探索态，不适合提交，要在最终汇报里明确说明原因

### 5. 最终汇报至少回答四件事

- 本轮改了什么
- 做了哪些验证，结果是什么
- 同步了哪些文档 / skill
- 下一步建议，且按优先级排序

## 关键约束

- 没有 fresh verification evidence，就不要声称“完成”“通过”“已修复”。
- 不要只改代码不补共享事实入口。
- 不要因为工作区已有其他改动，就跳过本轮提交和验证。

## 推荐组合

- 后端实现或审查结束后，常与 `backend-testing`、`backend-code-review` 组合
- 前端改动结束后，常与 `frontend-testing`、`component-refactoring` 组合
- skill 体系调整结束后，常与 `skill-governance` 组合
- prompt / skill / governance / script 这类高风险改动收尾前，常与 `safe-change-review` 组合
