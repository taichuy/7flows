# Publish Sync Waiting Guard

## 背景

- 当前 `native / openai / anthropic` 发布入口都还属于同步 MVP 能力。
- Durable Runtime 已支持 run 进入 `waiting`，但 publish gateway 之前没有拦住这类 run。
- 结果是同步发布调用在命中 waiting tool / waiting callback 时，可能把“尚未完成的执行”误包装成成功协议响应。

## 目标

- 对同步发布入口保持 MVP 诚实性。
- 避免 OpenAI / Anthropic 兼容接口在 run 进入 `waiting` 时返回伪成功响应。
- 避免把 waiting run 写入 publish cache。

## 实现

- 在 `api/app/services/published_gateway.py` 增加同步发布状态守卫。
- 只有 `run.status == succeeded` 时才继续构建 published response payload。
- 当运行结果进入 `waiting` 时，统一返回 `409`，明确提示“sync published endpoint 尚不支持 waiting run”。
- 该守卫复用于 native / openai / anthropic 三类同步发布入口，因此等待态不会再被缓存成命中结果。
- 补充 `api/tests/test_workflow_publish_routes.py`，覆盖 OpenAI published route 命中 waiting run 时的拒绝行为与 invocation audit 记录。

## 影响范围

- `api/app/services/published_gateway.py`
- `api/tests/test_workflow_publish_routes.py`
- `docs/dev/runtime-foundation.md`

## 验证

- `api/.venv/Scripts/python.exe -m pytest api/tests/test_workflow_publish_routes.py`
- `pnpm lint`
- `pnpm build`

## 下一步

1. 继续把 publish streaming/SSE 挂到统一事件流，让外部协议有正式的“等待中/流式中”承接路径。
2. 在 publish activity 中补充“waiting 被拒绝”的治理说明，帮助区分协议边界问题与普通失败。
