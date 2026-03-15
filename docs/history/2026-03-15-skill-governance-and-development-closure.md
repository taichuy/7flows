# 2026-03-15 Skill 治理与开发闭环优化

## 背景

本轮任务聚焦在“优化相关 skill 和项目开发体系”，并明确参考本地 `superpowers` 项目。

在对比后发现，7Flows 当前 `.agents/skills/` 更偏向领域专项：

- 已有后端 review、前端 review、组件重构、前端测试、oRPC 合同优先
- 但缺少把“验证、文档同步、Git 提交、skill 漂移治理”串起来的元流程 skill
- 同时后端是当前主战场，却没有与 `frontend-testing` 对应的 `backend-testing`

因此问题不只是“再补一个 review 清单”，而是要把 AI 协作体系从“单点专项 skill”升级成“元流程 + 领域 skill”双层结构。

## 目标

1. 补齐一轮开发默认需要的收尾闭环
2. 补齐 skill 自身的治理与索引同步规则
3. 补齐当前 skill 体系里后端测试这一块明显空缺
4. 让这套协作方式进入仓库事实，而不是只停留在对话里

## 本轮决策

### 1. 新增 `development-closure`

新增 `.agents/skills/development-closure/SKILL.md`，把以下动作沉淀成固定流程：

- 判断本轮变化应该写入 `AGENTS.md`、`docs/history/`、`docs/dev/runtime-foundation.md`、`docs/dev/user-preferences.md` 还是某个 skill
- 按改动类型执行验证，而不是统一喊“都测过了”
- 在存在脏工作区时只提交本轮相关文件
- 最终汇报必须包含验证结果、文档同步和优先级化下一步建议

### 2. 新增 `skill-governance`

新增 `.agents/skills/skill-governance/SKILL.md`，把 skill 设计与维护的分层规则写清楚：

- 仓库级规则进 `AGENTS.md`
- 可复用流程进 `SKILL.md`
- 重参考材料进 `references/*`
- 当前事实进 `runtime-foundation.md`
- 带日期的原因和实现过程进 `docs/history/*.md`

同时明确：可以借鉴 `superpowers` 的元流程思路，但不能把当前仓库并不存在的 subagent、git worktree 或强制流程原样照搬进来。

### 3. 新增 `backend-testing`

新增 `.agents/skills/backend-testing/SKILL.md`，补齐后端测试能力沉淀，围绕当前真实基线组织：

- `api/tests/`
- `api/.venv/Scripts/uv.exe run pytest -q`
- FastAPI `TestClient`
- runtime、published surface、plugin compat、credential、waiting / resume 等现有测试面

并显式写出当前现实：后端全量 pytest 是稳定基线，但全仓 `ruff check` 仍有历史债务，不能在 skill 里假装全绿。

### 4. 同步仓库级索引与规则

本轮同步更新了：

- `AGENTS.md`
- `README.md`
- `docs/README.md`
- `docs/dev/README.md`
- `docs/dev/runtime-foundation.md`

其中核心变化包括：

- skill 列表新增三项
- 维护原则新增“元流程 skill + 领域 skill”双层结构
- 明确 `description` 应优先写触发条件
- 明确 skill 变更后要同步索引和历史留痕

## 借鉴边界

本轮参考 `superpowers` 的重点不是具体工具链，而是它把“如何计划、如何验证、如何结束一轮工作”做成了可复用 skill。

7Flows 只借鉴了下面这层：

- 元流程也值得做成 skill
- skill 需要可发现、可触发、可持续维护
- 协作规则不能只散落在对话里

没有直接照搬下面这些内容：

- subagent 驱动开发
- git worktree 强依赖
- 强制 TDD 仪式化流程
- 与当前仓库事实不一致的目录和工具假设

## 影响范围

- `.agents/skills/` 的默认结构从“领域专项为主”扩展为“元流程 + 领域 skill”
- 后续 AI 完成一轮实现或文档优化时，默认应进入 `development-closure`
- 后续 AI 优化 skill 时，默认应进入 `skill-governance`
- 后端测试相关任务不再只能临场拼凑流程

## 验证方式

- 检查新增 skill 文件和索引引用是否一致
- 通过 `git diff --check` 验证补丁没有明显格式问题
- 复核 `AGENTS.md`、`README.md`、`docs/README.md`、`docs/dev/README.md`、`docs/dev/runtime-foundation.md` 是否已同步反映新的 skill 结构

## 下一步

1. 继续根据后续开发热点补 backend refactor、runtime debugging、发布治理验证等高复用 skill
2. 定期复核 skill 与 `runtime-foundation.md`、`AGENTS.md` 的一致性，避免文档与协作流程再次漂移
3. 如果后续前后端测试基线继续演化，再分别补强对应 testing skill 的 references，而不是把所有细节堆回 `SKILL.md`
