# ADR-0005: 同源 API 入口与 backend 统一授权边界

- Status: Accepted
- Date: 2026-04-03

## Context

7Flows 的 `web/` 层和 `api/` 层在历史演进中形成了两条并存的 API 入口路径：

1. **Next.js BFF 代理**：`web/app/api/_shared/console-api-proxy.ts` + 各 route handler，把浏览器请求在 Next 层 JSON 化后再转给 FastAPI。
2. **浏览器直打后端**：`web/lib/api-base-url.ts` 的 `getApiBaseUrl()` 在浏览器侧返回 `http://localhost:8000`（配置的 backend URL），部分 client component 直接调用。

这两条路径同时存在导致：
- 授权责任分裂：部分校验在 Next 层（BFF cookie 检查），部分在 FastAPI 层，不能在单一位置审计"这条 API 是否有正确的鉴权"。
- 流式/导出/状态码透传能力受限：BFF 把响应强制读成 JSON，无法直接透传 stream、binary 或非 200 status。
- 同源 `/api` rewrite 被 Next route handler 遮蔽：`web/next.config.ts` 已有 dev `/api -> FastAPI` rewrite，但只要 `web/app/api/` 下存在对应 handler，rewrite 就不生效。

在 Phase 44–47 的连续推进中，以下基础设施已经确立：
- `web/next.config.ts` 开发态 rewrites（`/api/:path*` → FastAPI，`/v1/:path*` → FastAPI）
- FastAPI 端 `require_console_route_access()` + `ConsoleRouteAccessPolicy` + `build_console_route_access_policy_matrix()` 统一守卫
- `api/app/services/workspace_access.py` 里的 `can_access()` RBAC 矩阵
- 同源 OIDC start/callback seam 和浏览器 same-origin 登录壳

## Decision

**1. 浏览器侧只走同源 `/api` 和 `/v1`，不再直打 backend host**

- 所有浏览器侧 fetch 调用统一走相对路径（空字符串 base URL），由 Next.js dev rewrite / 生产反向代理转发到 FastAPI。
- `getApiBaseUrl({ browserMode: "same-origin" })` 是当前过渡标记，最终目标是所有客户端调用不再需要区分 `same-origin` vs `direct` 模式。
- SSR/RSC 的 server-to-server 直连不在此约束范围内（明确标注在 lib 文件里）。

**2. FastAPI 是唯一的 console 授权入口**

- 所有 console surface 路由必须通过 `require_console_route_access(route, method)` 接入统一依赖，不允许在 route 文件内散落 role if 判断或独立 auth helper。
- 策略矩阵 `build_console_route_access_policy_matrix()` 是唯一授权事实来源；若矩阵中找不到对应路由，系统 fail-closed 返回 403（`AuthorizationError("工作台路由契约缺失：...")`）。
- 例外：`auth.py`（认证入口本身）、`health.py`（健康检查）、`published_gateway*.py`（对外发布面，走 API key 鉴权）明确不走 console 守卫链。

**3. Next.js BFF 业务代理路由逐步退场**

- `web/app/api/_shared/console-api-proxy.ts` 和各 business route handler 不再扩展新能力。
- 删除顺序必须遵循"先补 backend authz seam + 浏览器直连 refresh-retry 契约，再删对应代理"，不允许反向操作。
- `session/login`、`session/logout`、`session/refresh` 这三个 session 管理路由属于 auth shell 层，不在业务代理退场范围内（由 OIDC 替换计划单独处理）。

**4. 路由注册和策略矩阵必须手动同步**

- 目前没有自动扫描注册机制，新增路由文件必须同时：
  1. 在 `api/app/main.py` 添加 `include_router(...)`
  2. 在 `api/app/services/workspace_access.py` 的策略矩阵中添加对应 `ConsoleRouteAccessPolicy` 条目
  3. 补定向测试覆盖 guest/authenticated/manage 语义

**5. 已知明确例外需要注释说明**

- `POST /api/sensitive-access/requests`：无 `csrf_protected_methods`，原因是该入口由 runtime 触发而非浏览器表单提交；必须在策略矩阵中保留注释说明。
- BFF `allowGuest: true` 设置：目前 3 个 BFF route handler 使用此标志，但其对应的 backend route 实际为 manager-only；这是 BFF 信号不准确的已知问题，退场后自然消除。

## Consequences

**正向结果：**
- 授权决策集中在 FastAPI 层，可以在一个文件（`workspace_access.py`）里审计所有 console 路由的权限矩阵。
- 浏览器侧不再需要知道 backend host，CORS 配置简化，跨环境部署更一致。
- 流式响应、二进制导出、HTTP status 透传不再被 BFF JSON 包装器阻断。
- fail-closed 设计：新路由若忘记加策略矩阵条目，系统默认拒绝而非放行。

**代价与约束：**
- 短期内需要同时维护 BFF 和直连两条路径，直到首批直连迁移完成。
- `getApiBaseUrl()` 的 64 个 plain 调用点需要逐批迁移，每批都需要验证 same-origin rewrite 正确覆盖了对应路径。
- 生产环境的同源转发（Nginx / Traefik / Ingress 配置）目前尚未在仓库里形成完整事实，属于部署层待补项。
- 策略矩阵的手动维护有"新增路由忘记补 policy"的风险，但 fail-closed 机制可在测试阶段拦截遗漏。

**后续约束：**
- 任何新的 console API 路由在合并前必须同时具备：策略矩阵条目 + `require_console_route_access()` 依赖 + 定向测试。
- `api/app/api/routes/__init__.py` 的 `__all__` 列表已废弃（只列了 4 个模块，实际有 18+），应在下一轮清理中删除或重写为完整列表，避免误导。
- 浏览器侧 `get-credentials.ts`、`get-workflows.ts` 等使用 `typeof window === "undefined"` 安全保护的模式应作为基准，向 `get-skills.ts`、`get-sensitive-access.ts`、`get-run-detail.ts`、`get-run-trace.ts`、`get-run-views.ts`、`get-workspace-starters.ts` 等 6 个缺少此保护的文件推广。

## Follow-up

- `[ ]` 完成 Phase 47 的 T137–T139：补 backend authz seam → 建立浏览器直连 refresh-retry 契约 → 删首批 Next business proxy。
- `[ ]` 生产环境反向代理配置（Nginx / Traefik / Ingress）形成仓库内事实，与 `web/next.config.ts` dev rewrites 对称。
- `[ ]` 清理 `api/app/api/routes/__init__.py` 的过时 `__all__`。
- `[ ]` 将 6 个缺少 `typeof window` 保护的 `get-*.ts` 文件补上安全保护或明确标注 server-only。
- `[ ]` OIDC 替换本地密码的完整落地（`oidc_enabled` 默认 `False` 的问题）由 Phase 45 延续任务处理，不在本 ADR 范围内。
