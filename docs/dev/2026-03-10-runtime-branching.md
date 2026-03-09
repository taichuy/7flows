# Runtime Branching And Failure Path

## 背景

`docs/dev/runtime-foundation.md` 已经把最小执行器、`runs / node_runs / run_events` 和工作流版本快照打通，但执行器仍然是“按拓扑顺序把所有节点都跑一遍”的占位行为。

这会带来两个明显问题：

- `condition` / `router` 节点虽然存在，但不能真正控制下游路径。
- 任意节点失败都会立刻终止整个 Run，无法表达显式失败分支。

## 目标

这次改动先补上运行时最小但真实可用的分支能力，而不是直接引入完整 DAG 条件表达式或重试系统。

目标聚焦为：

- 让 `condition` / `router` 节点可以激活命中的控制分支。
- 让节点失败后可以沿显式失败边继续执行。
- 继续复用 `run_events` 作为统一事件流，不为分支逻辑另起一套状态通道。

## 决策与实现

### 1. 节点是否执行由“激活边”决定

执行器不再简单遍历拓扑序中的所有节点，而是先记录哪些下游节点被上游边激活：

- `trigger` 节点始终执行。
- 其他节点只有在至少一个上游边被激活后才会执行。
- 没有被激活到的节点会落一条 `NodeRun(status="skipped")`，并发出 `node.skipped` 事件。

这样可以让未命中的分支在运行态里可追踪，而不是静默消失。

### 2. `condition` / `router` 的最小分支语义

对 `condition` 和 `router` 节点，执行器读取节点输出里的 `selected` 字段来决定命中的分支：

- 如果某条出边的 `condition` 与 `selected` 相等，则该边被激活。
- 如果存在显式匹配，则未标 `condition` 的同级边不会作为兜底一起执行。
- 如果没有显式匹配，未标 `condition` 的边会作为默认分支激活。

当前 MVP 里，`condition` / `router` 仍然主要通过 `config.selected` 或 `config.mock_output.selected` 提供稳定输出，暂未引入完整表达式求值。

### 3. 显式失败边

节点执行抛错后：

- 当前 `NodeRun` 会记为 `failed` 并写入 `node.failed` 事件。
- 执行器会检查该节点的出边中是否存在失败条件。
- 当 `condition` 为 `failed`、`error` 或 `on_error` 时，视为失败分支并继续激活下游节点。
- 若没有任何失败边命中，则保持现有行为：整个 Run 失败。

这让“节点失败但工作流被兜底处理”的语义能在当前 IR 下先落地，而不需要额外引入新的边类型。

### 4. Run 成功的最小约束

如果整个执行过程最终没有任何 `output` 节点真正完成，Run 会被判定为失败。

这样可以避免某条分支提前结束、但系统仍然错误地把空结果记成成功。

## 影响范围

- `api/app/services/runtime.py`
  - 新增按激活边调度节点的逻辑
  - 新增 `node.skipped` 事件
  - 新增 `mock_error` 测试辅助能力
- `api/tests/test_runtime_service.py`
  - 覆盖条件分支命中/未命中
  - 覆盖失败分支继续执行
- `api/tests/test_run_routes.py`
  - 覆盖路由层返回“已处理失败分支”的成功 Run

## 验证方式

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\pytest.exe -q
.\.venv\Scripts\python.exe -m ruff check app tests
```

本次结果：

- `pytest`: 10 passed
- `ruff`: All checks passed

## 当前边界与下一步

这次只补到了“显式分支可走”的层面，仍然没有实现：

- 条件表达式求值
- 多上游 join 语义
- 节点级 retry / backoff
- MCP 授权上下文读取

下一步建议继续沿 `runtime-foundation.md` 的顺序，优先补节点级重试策略，再把失败分支与统一事件流衔接得更完整。
