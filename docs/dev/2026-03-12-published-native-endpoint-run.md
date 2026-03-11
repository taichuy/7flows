# 2026-03-12 Published Native Endpoint Run

## 背景

上一轮提交 `feat: add publish endpoint lifecycle` 已经把 `workflow_published_endpoints` 从静态快照推进到可治理的 `draft / published / offline` 生命周期，但 `API 调用开放` 仍停留在“有发布事实、没有调用入口”的阶段：

- 外部还不能沿着 active publish binding 真正触发 workflow
- 发布链路还没有证明“调用只认当前 published binding”
- 运行时还缺少一个显式入口来执行“已固定的 workflow version + compiled blueprint”

这会让 `publish binding + lifecycle` 很难真正服务主业务。

## 目标

- 补最小 `native` 发布调用入口
- 执行严格绑定 `published binding -> target workflow version -> compiled blueprint`
- 保持 MVP 诚实：本轮只支持 `protocol=native`、`auth_mode=internal`、非流式调用
- 不把发布网关逻辑塞回 `workflow_publish` 管理路由，也不让发布态执行回退到最新 workflow 定义

## 实现

### 1. 新增独立发布网关路由

新增：

- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run`

返回值当前会带：

- 触发到的 publish binding 元数据
- 固定命中的 `workflow_version`
- 固定命中的 `compiled_blueprint_id`
- 本次执行生成的 `RunDetail`

这条路由当前仍属于最小 `native` 发布入口，不包含 alias/path、API key、SSE streaming 和兼容协议映射。

### 2. 发布网关职责单独落层

新增 `PublishedEndpointGatewayService`，专门负责：

- 读取当前 active 的 `published` binding
- 校验 `protocol / auth_mode / streaming` 是否属于当前 MVP 已支持范围
- 加载 binding 指向的 `WorkflowVersion` 与 `WorkflowCompiledBlueprint`
- 调用 runtime 执行固定蓝图

这样发布态调用没有继续挤进：

- `workflow_publish.py` 的“发布管理”职责
- `runs.py` 的“内部运行 API”职责

## 3. Runtime 补齐固定蓝图执行入口

`RuntimeService` 新增 `execute_compiled_workflow(...)`，用于执行已经选定的：

- `workflow`
- `workflow_version`
- `compiled_blueprint`

这让发布网关可以复用统一运行时，而不是自行复制一套 run / node_run / event 创建逻辑。

同时保持两个边界：

- `execute_workflow(...)` 仍负责“内部直接按当前 workflow 运行”
- `execute_compiled_workflow(...)` 负责“按外部已选定的稳定蓝图运行”

## 4. 当前约束

为了不假装未完成能力已经可用，本轮显式收口了以下限制：

- 仅支持 `published` 状态 binding
- 仅支持 `protocol=native`
- 仅支持 `auth_mode=internal`
- 仅支持 `streaming=false`

以下能力仍未做：

- endpoint alias/path
- API key / token 鉴权实体
- 限流、缓存、审计
- OpenAI / Anthropic 协议映射
- streaming / SSE 发布输出

## 影响范围

- `api/app/api/routes/published_gateway.py`
- `api/app/services/published_gateway.py`
- `api/app/services/runtime.py`
- `api/app/services/workflow_publish.py`
- `api/app/schemas/workflow_publish.py`
- `api/app/main.py`
- `api/tests/test_workflow_publish_routes.py`

## 验证

已执行：

```powershell
cd api
.\.venv\Scripts\python.exe -m ruff check app\main.py app\services\runtime.py app\services\workflow_publish.py app\services\published_gateway.py app\schemas\workflow_publish.py app\api\routes\published_gateway.py tests\test_workflow_publish_routes.py
.\.venv\Scripts\python.exe -m pytest tests\test_workflow_publish_routes.py
.\.venv\Scripts\python.exe -m pytest tests\test_run_routes.py
```

验证结果：

- `ruff check` 通过
- `tests/test_workflow_publish_routes.py` 7 项通过
- `tests/test_run_routes.py` 18 项通过

## 当前判断

- 上一次提交需要承接，而且这轮承接方向是正确的：`publish lifecycle` 之后，最该补的就是最小可调用的 `native` 发布入口
- 基础框架已经不是“只能继续搭底座”的状态，而是能围绕主业务继续补完整度
- 当前架构继续保持了解耦：发布网关、发布管理、运行时执行仍是分层推进
- 但 `api/app/services/runtime.py` 已进一步增长到约 1552 行，后续如果继续补 publish/scheduler/callback 细节，必须优先拆 execution orchestration，而不是继续堆进单文件

## 下一步

1. 围绕当前 `native` 发布入口补发布实体：
   - alias/path
   - API key / token
   - rate limit / cache / audit
2. 把 OpenAI / Anthropic 协议映射挂到同一条 publish binding 主线
3. 收口 callback ticket 的过期、清理、来源审计和更强鉴权
