# 2026-03-16 Published Invocation Blocking Approval Focus

## 背景

- `runtime-foundation` 已把 publish diagnostics 列为持续优先项：published invocation detail 需要继续承担 operator 排障入口，而不是只做 payload 预览。
- 在同一次 run 同时出现多个节点的 sensitive access 事件时，publish 详情虽然已有完整 timeline，但 operator 仍需要手动分辨“哪一段审批真正阻塞当前 callback resume”。

## 目标

- 让 published invocation detail 自动聚焦当前阻塞 node run 的审批 timeline。
- 保留整条 run 的完整 sensitive access timeline，避免只显示局部而丢失全局上下文。
- 用最小 contract 扩展推进闭环，不回头重做 publish / run 模型。

## 实现

- 后端在 `api/app/api/routes/published_endpoint_invocation_detail.py` 中基于 waiting lifecycle 与 callback tickets 推导 `blocking_node_run_id`。
- 同一响应新增 `blocking_sensitive_access_entries`，优先从 `load_sensitive_access_timeline(...).by_node_run` 取阻塞 node run 的 timeline，保留 `sensitive_access_entries` 作为完整 run 级事实。
- 前端在 `web/components/workflow-publish-invocation-detail-panel.tsx` 新增 `Blocking approval timeline` 区块；仅当阻塞 timeline 是完整 timeline 的真子集时展示，避免重复信息。
- `web/lib/get-workflow-publish.ts` 同步补齐新的 detail response 类型。

## 影响范围

- Published invocation detail 的 operator 可读性增强，尤其是 callback waiting 与审批并存的场景。
- 这条改动没有引入新的流程控制语义，仍然复用既有 `run / node_run / callback ticket / sensitive access timeline` 事实主链。
- 后续如果继续补 notification retry、approval action 等 operator 动作入口，可直接挂在这条“阻塞 node run 聚焦视图”之上。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
- `cd web; pnpm exec tsc --noEmit`
- `cd web; pnpm lint`

验证结果：

- 后端 `308 passed in 35.31s`
- 前端 TypeScript 与 ESLint 通过

## 下一步

1. 在 blocking approval timeline 上继续补更直接的 operator 动作入口，例如 approval / notification retry 的上下文落点。
2. 把类似的 blocking-focus 模式复用到 run diagnostics 的更细粒度 panel，减少 publish 与 run 视角之间的交互落差。
3. 继续治理 publish detail 周边的数据聚合热点，避免后续 operator 能力继续堆回单个面板或单个 data loader。
