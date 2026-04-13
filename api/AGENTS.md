# api 本地硬规则

- session 必须持有一个 `current_workspace_id`。
- `route` 只做协议层、上下文提取、响应映射；不得直接承载业务写入。
- 所有关键写动作必须经过命名明确的 `service command`。
- `repository` 不得承载权限判断、状态流转、HTTP 语义。
- `mapper` 只做转换，不得藏业务规则。
- 成员、角色、权限、模型、会话等关键动作必须写审计日志。
