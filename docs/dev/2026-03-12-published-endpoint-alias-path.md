# 2026-03-12 Published Endpoint Alias And Path

## 背景

上一轮已经把 published endpoint 推进到：

- `publish binding + lifecycle + native invoke + api_key auth`

但当前对外地址语义仍然不稳定：

- native invoke 只能通过 `workflow_id + endpoint_id` 触发
- 发布实体虽然存在，但还没有稳定的 `alias/path`
- `API 调用开放` 仍然缺少“可长期引用的外部入口标识”

这和产品设计里“发布网关按 endpoint alias / model alias 找到已发布 workflow version”的方向还有一段距离。

## 目标

本轮只补最小但真实可用的发布实体地址语义：

- 为 published endpoint 增加 `alias` 和 `path`
- 让设计态、持久化实体、管理接口和发布调用入口使用同一套字段
- 保持 `workflow_version + compiled_blueprint` 绑定不变
- 不提前假装补齐 OpenAI / Anthropic、rate limit、cache 或 audit

## 决策与实现

### 1. alias/path 进入设计态与持久化实体

设计态 `publish[]` 新增：

- `alias`
- `path`

并同步落到 `workflow_published_endpoints`：

- `endpoint_alias`
- `route_path`

默认规则：

- `alias` 缺省时回退到 `endpoint.id`
- `path` 缺省时回退到 `/{alias}`

这样最小发布定义不需要额外配置，也能得到稳定外部地址语义。

### 2. 地址字段在入口处统一归一化

约束规则：

- alias 统一转小写
- path 统一转为以 `/` 开头的规范路径
- path 按 segment 校验，只允许受约束的 slug 形态

同一 workflow definition 内会校验：

- `endpoint.id` 唯一
- `name` 唯一
- `alias` 唯一
- `path` 唯一

这保证 publish 实体不会在设计态就出现模糊地址。

### 3. published 版本切换时阻止跨工作流地址冲突

`draft` binding 允许存在，但真正切到 `published` 时会额外校验：

- 其他已发布 binding 是否占用了同一个 alias
- 其他已发布 binding 是否占用了同一个 path

当前只允许“同一 workflow + endpoint_id 的旧 published binding”被新版本替换并自动 offline。

这样可以保持：

- 版本切换仍沿已有 lifecycle 语义推进
- 外部地址不会因为两个不同工作流同时占用同一 alias/path 而变得不确定

### 4. 发布网关新增 alias/path 入口

保留原有入口：

- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run`

新增最小稳定地址入口：

- `POST /v1/published-aliases/{endpoint_alias}/run`
- `POST /v1/published-paths/{route_path:path}`

这两条入口最终仍然会回到同一条发布链：

- 查 active published binding
- 加载 target workflow version
- 加载 compiled blueprint
- 调用 runtime 执行

没有另起第二套执行逻辑。

## 影响范围

后端：

- `api/app/schemas/workflow.py`
- `api/app/models/workflow.py`
- `api/app/services/workflow_publish.py`
- `api/app/services/published_gateway.py`
- `api/app/api/routes/workflow_publish.py`
- `api/app/api/routes/published_gateway.py`
- `api/app/schemas/workflow_publish.py`
- `api/migrations/versions/20260312_0013_published_endpoint_alias_path.py`

测试：

- `api/tests/test_workflow_publish_routes.py`

文档：

- `docs/product-design.md`
- `docs/dev/runtime-foundation.md`

## 验证

已执行：

```powershell
cd api
.\.venv\Scripts\python.exe -m pytest tests/test_workflow_publish_routes.py tests/test_published_endpoint_api_keys.py -q
.\.venv\Scripts\python.exe -m ruff check app\api\routes\published_gateway.py app\api\routes\workflow_publish.py app\models\workflow.py app\schemas\workflow.py app\schemas\workflow_publish.py app\services\published_gateway.py app\services\workflow_publish.py tests\test_workflow_publish_routes.py
```

结果：

- `13 passed`
- `ruff check` 通过

## 当前结论

发布层现在已经从：

- `binding + lifecycle + native invoke + api_key auth`

推进到：

- `binding + lifecycle + alias/path + native invoke + api_key auth`

这让 `API 调用开放` 从“可发布、可调用”继续前进到“有稳定外部地址语义的最小发布实体”。

## 下一步

按优先级建议继续：

1. 补 publish rate limit / cache / audit，让发布实体从“可寻址”推进到“可托管”
2. 在同一 publish binding 链上接 OpenAI / Anthropic 映射，而不是旁路起新入口
3. 收口 callback ticket 生命周期治理，继续稳定 durable runtime 的 waiting/resume 主线
