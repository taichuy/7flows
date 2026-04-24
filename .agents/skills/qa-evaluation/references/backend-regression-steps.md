# Backend Regression Steps

只要评估范围涉及后端 API、状态入口、插件边界、runtime、`resource kernel` 或 `route / service / repository / domain / mapper` 分层，就必须按以下顺序做后端回归；不要跳过前置验证直接下 QA 结论。

## Fixed Order

1. 读相关 spec
2. 跑后端验证命令
3. 抽样检查关键路由
4. 抽样检查 service 写入口
5. 抽样检查 repository / mapper 分层
6. 最后再给 QA 结论

## Step 1: Read Specs First

至少补齐：

- `api/AGENTS.md`
- 当前任务说明、改动范围、验收标准
- 与本次范围直接相关的后端项目记忆

如果存在直接相关的 spec / plan，再补齐对应文件；不要把过期 spec 当成默认真相来源。

如果涉及插件、runtime 或动态建模，必须额外确认：

- `public / control / runtime` 三平面归属
- `host-extension / runtime extension / capability plugin` 边界
- `resource kernel` 是否仍由宿主托管
- `dynamic modeling` 是否仍是元数据系统，而不是 runtime 数据本身
- `scope_kind` 是否只保留 `workspace/system`
- `system` 是否固定使用 `SYSTEM_SCOPE_ID`
- runtime 物理 scope 列是否统一为 `scope_id`
- 活跃后端代码是否已清掉 `team/app` alias
- 如果涉及文件管理，`file_storages` 是否仍归 `root/system` 管理，文件记录是否仍保存实际 `storage_id` 快照

## Step 2: Run Backend Verification

优先运行仓库约定的后端验证脚本；如果脚本尚未落地，至少执行最小后端验证命令。
同一工作区内的 `cargo` 验证命令默认串行执行，不要并发启动多条 `cargo test / check / clippy`，否则容易卡在 `package cache` 或 `artifact directory` 锁上，拿不到稳定 QA 证据。

优先：

```bash
node scripts/node/verify-backend.js
```

最小验证：

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo check --workspace
```

如果只改单一 crate，至少补：

```bash
cargo test -p <crate-name>
```

如果需要补多个 crate 的 targeted tests，也按串行顺序逐条执行，并在记录里保留每条命令对应的结果，不要把锁等待当成测试通过。

无法执行时，必须在报告里明确说明为什么要跑、为什么没跑成、因此哪些结论只能停留在 `未验证`。

## Step 3: Sample Key Routes

至少抽查每个被改动或被影响平面中的关键路由，确认：

- 路径是否仍放在正确平面
- 是否保持 `ApiSuccess` / `204 No Content` / 统一错误结构
- 认证、ACL、审计和 OpenAPI 暴露是否仍由宿主管理
- 公共 API 契约变化后，调用方和相关回归是否同步成立

## Step 4: Sample Service Write Entrypoints

至少抽查关键状态写入口，确认：

- 状态修改是否仍通过命名明确的 service action / command
- route 没有绕过 service 直接改状态
- repository 没有偷偷承担事务意图、权限判定或状态流转
- 关键副作用、审计、幂等仍由 service 编排
- `workspace`、`system` 与 session scope 语义没有在写入口被重新混用

## Step 5: Sample Repository And Mapper Layering

至少抽查一个关键 `repository + mapper` 配对，确认：

- `repository` 只做持久化与查询投影，不偷带业务逻辑
- `mapper` 只做转换，不藏权限、状态或额外查询语义
- `storage-postgres` 的 repository / mapper 拆分仍然成立
- `storage-durable` 没有吸收额外 durable backend 细节，`storage-object` 没有混入插件产物存储或业务 service 规则
- 复杂 SQL、JSON 字段、枚举转换等易错点有对应 targeted tests
- runtime metadata、物理表列名与 `scope_id` 语义保持一致

## Step 6: Blast Radius Before Conclusion

出 QA 结论前，至少补一轮后端 blast radius 审查：

- 公共 API、session 或 auth 契约变化后，调用方是否同步成立
- `storage-postgres`、`storage-durable`、`storage-object` 或持久化层调整后，service、route、tests 是否仍成立
- runtime 或插件相关改动后，白名单槽位与消费方式是否仍成立
- `workspace/system`、`SYSTEM_SCOPE_ID` 与 runtime `scope_id` 约束是否贯穿 route / service / repository / tests
- `_tests`、文件大小、目录收纳和最小验证命令是否仍遵守质量门禁

如果以上任一步没有证据，结论必须降级为：`未验证，不下确定结论`。
