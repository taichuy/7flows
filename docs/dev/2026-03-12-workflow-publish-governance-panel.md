# Workflow Publish Governance Panel

## 背景

`feat: add published endpoint cache observability` 已经把 publish cache 的命中事实补进后端，但 workflow 页面仍然没有任何发布治理入口，导致：

- 开放 API 的 `binding / lifecycle / cache / activity` 仍主要停留在 API 可用、前端不可见
- 用户无法在 workflow 语境下直接判断某个 endpoint 是否已发布、是否启用 cache、当前缓存里还有什么
- `cache hit/miss` 有了审计统计，但“活跃缓存条目”仍没有独立事实视图

这会让 `API 调用开放` 主线继续断在“后端已做、工作流页不可治理”的状态。

## 目标

- 给 publish binding 增加 `cache inventory summary + active entry list` 事实接口
- 在 workflow 页面补独立的 publish governance panel，消费 binding / activity / cache inventory
- 把已存在的 published API key 生命周期接口接回 workflow 页面，并明确“一次性 secret 只在创建后展示一次”
- 保持 editor 与 publish 治理分层，不把发布管理继续塞回 `workflow-editor-workbench.tsx`

## 决策与实现

### 1. 新增 binding 级 cache inventory 契约

后端新增：

- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/cache-entries`

返回内容包括：

- summary
  - `enabled`
  - `ttl`
  - `max_entries`
  - `vary_by`
  - `active_entry_count`
  - `total_hit_count`
  - `last_hit_at`
  - `nearest_expires_at`
  - `latest_created_at`
- items
  - `cache_key`
  - `hit_count`
  - `expires_at`
  - `response_preview`

这样发布治理就不再只有 invocation audit，而是同时具备“缓存命中效果”和“当前缓存存量”两层事实。

### 2. publish binding 列表补 `cache_inventory`

`GET /api/workflows/{workflow_id}/published-endpoints` 现在除了 `activity` 外，还会返回 binding 级 `cache_inventory` 摘要。

这样 workflow 页面在只请求 binding 列表时，就能先看到：

- 哪些 endpoint 启用了 cache
- 当前活跃条目数量
- 最近命中与最近过期窗口

只有在需要查看具体活跃条目时，才继续请求 `cache-entries` 详情接口。

### 3. workflow 页面新增独立 publish governance panel

前端新增：

- `web/lib/get-workflow-publish.ts`
- `web/components/workflow-publish-panel.tsx`
- `web/components/workflow-publish-lifecycle-form.tsx`

当前 workflow 页面会：

- 继续渲染 editor workbench
- 额外渲染独立 publish panel
- 并行读取 publish bindings
- 对启用 cache 的 binding 进一步读取 cache inventory
- 直接提供 `publish / offline` 生命周期切换入口

这里故意没有把发布治理揉进 `workflow-editor-workbench.tsx`，而是保持：

- editor 负责画布、节点、run overlay
- publish panel 负责开放 API 治理

### 4. API key 生命周期前端治理接回 publish panel

前端继续承接已存在的后端接口：

- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys`
- `POST /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys`
- `DELETE /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys/{key_id}`

workflow 页面现在会对 `auth_mode=api_key` 的 binding 额外读取 active key 列表，并在 publish panel 内提供：

- active key 列表与最近使用时间
- 新建 key 表单
- 一次性 secret 回显区
- 单个 key 的撤销入口

这样开放 API 的“地址 + 生命周期 + cache + API key”第一次在 workflow 页面形成同域治理闭环，而不是继续拆散在后端接口里。

### 5. 继续遵守“摘要优先、详情下钻”

cache inventory 在返回条目时只暴露 `response_preview`，不直接把完整 native 响应 payload 搬到工作流页。

这样前端能快速回答：

- 缓存里有什么类型的结果
- 每个条目命中过几次
- 哪个条目快过期了

同时又不破坏之前已经确定的“详细内容保留在事实层、界面默认展示摘要”的约束。

## 影响范围

- 发布态治理 API
- workflow 页面开放 API 可见性
- cache observability 从“命中统计”扩展到“命中统计 + 活跃缓存存量”
- published API key 从“仅后端可管理”推进到“workflow 页面可治理”
- `API 调用开放` 主线的前后端衔接

## 验证

- `api/.venv/Scripts/uv.exe run --directory api pytest tests/test_workflow_publish_routes.py`
- `pnpm --dir web exec tsc --noEmit`

## 当前结论

基础框架已经不是“只有后端底座”的阶段了：

- 后端发布实体、审计与 cache 已经有持久化事实
- workflow 页面也开始承认这些事实，并补上最小 lifecycle / cache / API key 治理入口

但开放 API 仍未完整闭环，后续还要继续推进：

1. rate limit 的更细诊断反馈
2. API key 使用趋势与最近失败原因的面板化消费
3. OpenAI / Anthropic 协议映射挂到同一条 publish binding 链上
