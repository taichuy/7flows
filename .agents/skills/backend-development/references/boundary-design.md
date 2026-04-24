# Stable Core Vs Adapter Boundary

| 问题 | 放核心 | 放适配层 |
| --- | --- | --- |
| 是否应该执行这个业务动作 | Yes | No |
| 状态是否合法流转 | Yes | No |
| 第三方协议字段映射 | No | Yes |
| HTTP、RPC、消息、数据库细节 | No | Yes |
| 外部返回结构转换 | No | Yes |
| 业务规则判定 | Yes | No |

## Working Rule

- 核心层回答“该不该做”
- 适配层回答“怎么接入、怎么转换、怎么落地”
- 外部变化先挡在适配层，不直接传进核心模型
- 能力边界用能力名命名，具体实现留在实现 crate 或 adapter；例如主存储边界和 PostgreSQL 实现不要混成一个概念

## Smell Check

如果你一改协议字段名就要改核心业务规则，说明边界已经脏了。
