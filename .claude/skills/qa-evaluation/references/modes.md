# QA Evaluation Modes

## Selection Rules

| 模式 | 什么时候进入 | 必要输入 | 默认输出 |
| --- | --- | --- | --- |
| `task mode` | 用户要验证当前任务、当前改动、某个局部版块 | 任务目标、改动范围、验收场景、相关页面 / 模块 / API 边界 | 局部问题报告与修正方向 |
| `project evaluation mode` | 用户明确要求“全量评估项目”“评估项目现状代码”“做完整 QA 审计” | 项目当前范围、相关 spec、项目记忆、反馈记忆 | 全量问题报告，不直接修复 |

## Default Rules

- 默认进入 `task mode`
- `project evaluation mode` 只有用户明确授权才允许启动
- `task mode` 可以在当前会话运行，但要提示存在上下文偏置
- 更推荐在新会话中运行，以降低实现路径带来的宽容偏差

## Companion Skill Routing

| 问题类型 | 需要联动 |
| --- | --- |
| 信息架构、入口层级、L0 / L1 / L2 / L3 深度关系 | `frontend-logic-design` |
| 前端页面语法、交互一致性、视觉系统约束 | `frontend-development` |
| 后端 API 契约、状态入口、边界污染 | `backend-development` |

## Hard Stops

- 用户没有明确要求时，不要把局部回归升级成全量项目审计
- 评估范围不清时，先收敛范围，再开始下结论
- 没有验收场景和边界输入时，`task mode` 只能给出受限结论
