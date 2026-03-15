# 2026-03-15 Published Cache Inventory 敏感访问控制

## 背景

- `2026-03-15 feat: gate published invocation detail access` 已把 published invocation detail drilldown 接到统一敏感访问控制主链，但 cache inventory 入口仍可直接返回活跃 cache entry 的 `response_preview`。
- `docs/dev/runtime-foundation.md` 一直把“继续把同一套控制挂到 published cache inventory / publish export 入口”列为 P0；如果 cache inventory 继续裸露 preview，published governance 与 run trace export / invocation detail 的安全边界仍然不一致。
- cache inventory 是工作台发布治理面板里回答“当前缓存里还留着什么”的事实入口，本质上属于人类查看 run 派生敏感结果的另一种 detail surface，不应绕开统一审批与审计。

## 目标

- 把 published cache inventory 接到现有 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 主链，保证人类查看 cache preview 时同样进入统一治理语义。
- 不把“一个 binding 下活跃 cache entry 对应哪些 run、这些 run 的最高敏级是什么”散落在 route 中，给后续 publish export / cache drilldown 继续复用预留 service 边界。
- 保持已允许访问时的 `PublishedEndpointCacheInventoryResponse` contract 不变，避免无关前端和测试被迫改造。

## 实现

1. 更新 `api/app/services/run_sensitive_access_summary.py`
   - 新增 `resolve_highest_sensitivity_for_runs`，把“多 run 聚合最高敏级”的逻辑抽成共享 helper。
   - 原有 `resolve_highest_run_sensitivity` 改为复用该 helper，避免 published 侧再次复制一套 run-level 判断。
2. 新增 `api/app/services/published_cache_inventory_access.py`
   - 以 `published_cache_inventory` 作为 `workspace_resource` 资源种类，把 binding 级 cache inventory 映射到统一敏感访问控制。
   - 通过 active cache entry -> published invocation -> run 的链路聚合敏级；当新的活跃 entry 对应更高敏 run 时，会自动提升资源敏感级别并强制重新评估。
3. 更新 `api/app/api/routes/published_endpoint_cache.py`
   - 新增 `requester_id` 与 `purpose_text` 查询参数，为人类查看 cache inventory 记录稳定的 requester / purpose 审计字段。
   - 在返回 summary / items 前复用 `build_sensitive_access_blocking_response`，对高敏 cache inventory 返回 `409`，被拒绝时返回 `403`，放行时保持现有响应结构。
4. 更新 `api/tests/test_published_invocation_detail_access.py`
   - 复用现有 published invocation fixture，新增对 cache inventory 的 L3 审批阻塞与 L2 自动放行场景覆盖。
   - 验证 binding 级 resource metadata 会记录 `resource_kind=published_cache_inventory`、`binding_id` 和关联 `run_ids`，确保后续 publish export 可继续复用同一路径。

## 影响范围

- **安全性**：published cache preview 不再天然绕过敏感访问控制；关联高敏 run 的 inventory 查看会进入审批 / 审计主链。
- **扩展性**：binding 级 cache inventory 的 run-sensitive 聚合被抽到独立 service，后续继续扩 publish export 或 cache item detail 时不必复制 route 逻辑。
- **兼容性**：允许访问时不改 `PublishedEndpointCacheInventoryResponse`；既有前端面板和 route contract 继续可用。
- **可维护性**：`resolve_highest_sensitivity_for_runs` 成为共享 helper，published 侧不再把“按 run 汇总敏级”的逻辑散落在多个 route/service 中。

## 验证

- `api/.venv/Scripts/uv.exe run ruff check app/api/routes/published_endpoint_cache.py app/services/published_cache_inventory_access.py app/services/run_sensitive_access_summary.py tests/test_published_invocation_detail_access.py`
- `api/.venv/Scripts/uv.exe run pytest -q tests/test_published_invocation_detail_access.py tests/test_run_trace_export_access.py tests/test_workflow_publish_routes.py -k 'published_invocation_detail or cache_entries or published_endpoints'`
- `api/.venv/Scripts/uv.exe run pytest -q`

结果：

- `ruff check`：通过
- targeted `pytest`：通过（`6 passed`）
- full `pytest`：通过（`243 passed`）

## 当前结论

- 最近提交主线仍然需要衔接，而且这次改动是对 `feat: gate published invocation detail access` 的自然延续，而不是另起新方向。
- 当前基础框架已经足够继续围绕功能完整度推进；此次把 cache inventory 也挂到统一治理主链，进一步证明后端 service 边界可以承接持续演进，而不是只能堆在 route 上。
- 项目仍未进入“只剩人工逐项做界面设计”的阶段，因此本轮不触发本地通知脚本；P0 仍然集中在真实执行隔离、统一敏感访问控制闭环和 `WAITING_CALLBACK` durable resume。

## 下一步

1. 继续把同一套治理挂到 publish export 入口，补齐 published 侧剩余高风险详情面。
2. 为 published governance 前端补 access-blocked / approval-pending 呈现，避免 UI 当前仍把 `409/403` 降级成空数据。
3. 继续推进 notification worker / inbox 和 credential path 的真正 masked/handle 语义，补齐统一治理闭环。
