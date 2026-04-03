---
name: backend-code-review
description: 基于 7Flows 当前仓库结构与产品架构，对 `api/` 下的后端代码进行高质量审查。适用于 API 路由、运行时、模型、迁移、仓储、任务和后端基础设施的 review、风险分析与改进建议。
---

# 7Flows 后端代码审查

## 何时使用此技能

当用户要求审查、分析或改进以下内容时使用：

- `api/` 下的 Python 代码
- FastAPI 路由、Schema、Service、Repository、Model、Task
- Alembic 迁移、运行时表结构、执行链路
- 工作流执行、发布接口、插件代理、MCP、沙盒、安全、凭证相关后端设计

不要用于：

- `web/` 下的前端代码
- 单纯的产品文案、Markdown 排版或 UI 设计讨论

## 使用流程

1. 先识别审查范围，确认是路由层、服务层、运行时、数据层还是跨层改动。
2. 如果涉及工作流语义、插件代理、发布协议、变量传递、调试、缓存或安全，优先阅读：
   - `docs/product-design.md`
   - `docs/open-source-positioning.md`
   - `docs/technical-design-supplement.md`
   - `docs/dev/team-conventions.md`
   - `docs/.private/runtime-foundation.md`（如当前本地开发者已维护）
3. 应用通用后端规则与 7Flows 项目规则共同审查。
4. 输出时优先报告高风险问题：架构偏移、权限越界、运行态破坏、迁移风险、协议耦合。

## 审查清单

- 数据库架构设计：参见 [references/db-schema-rule.md](references/db-schema-rule.md)
- 分层与依赖方向：参见 [references/architecture-rule.md](references/architecture-rule.md)
- 仓储抽象与查询位置：参见 [references/repositories-rule.md](references/repositories-rule.md)
- SQLAlchemy 使用规范：参见 [references/sqlalchemy-rule.md](references/sqlalchemy-rule.md)
- 7Flows 后端架构约束：参见 [references/sevenflows-backend-architecture.md](references/sevenflows-backend-architecture.md)

## 7Flows 审查重点

### 1. 是否坚持 `7Flows IR` 优先

- 内部核心模型应围绕 workflow / node / edge / run / node run / published endpoint，而不是被 OpenAI / Anthropic / Dify 插件协议牵着走。
- 如果代码引入第二套内部 DSL、第二套执行状态机或协议专属核心模型，应优先指出。


### 2. 是否绕过显式授权和显式 loop

- 节点默认不能读取所有前序节点结果。
- 循环必须通过 `loop` 节点显式建模，不能靠回边或隐藏调度偷偷实现。

### 3. 是否复用统一事件流

- 运行态、调试、流式输出应尽量围绕 `run_events` 演进，而不是各协议、各页面各造一套事件数据。

### 4. 是否符合当前仓库结构

- 路由保持薄，service 负责编排，repository 承担复杂持久化，model 保持数据定义。
- 优先在现有目录和层次内演进，而不是照搬 Dify 里的模块命名和路径。。

## 输出要求

- 先给出 findings，按严重度排序。
- 每条问题尽量附文件路径和行号。
- 重点描述行为风险、架构后果和修复方向，而不是只说“代码不优雅”。
- 如果没有发现问题，要明确说明，并补充剩余风险或测试空白。
