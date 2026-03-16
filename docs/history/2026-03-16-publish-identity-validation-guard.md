# 2026-03-16 Publish Identity Validation Guard

## 背景

- `docs/dev/runtime-foundation.md` 已把 workflow editor 完整度中的 `publish binding identity / starter portability` 校验列为持续推进项。
- 现有保存链路虽然已经具备 `schema / node_support / tool_reference / tool_execution / publish_version / variables` 这些结构化 issue，但 publish endpoint 的 `id / alias / path` 冲突在部分入口仍更容易退化成通用 schema 报错，不利于 editor、workspace starter 和后续 publish governance 共享同一套更细粒度排障语义。
- 这会直接影响用户层的保存闭环：配置 publish draft 时，如果 endpoint 标识冲突，操作者更难在字段级快速定位并修复问题。

## 目标

1. 把 publish endpoint `id / alias / path` 冲突提前收口成独立 `publish_identity` 类别。
2. 让 workflow 保存、definition preflight 和 workspace starter 保存共享同一套后端 guard。
3. 让前端 editor 在本地校验阶段就能给出 publish identity 摘要，减少“点保存后才知道冲突”的往返。

## 实现

- 新增 `api/app/services/workflow_publish_identity_validation.py`，对 `publish` 草稿中的 endpoint `id / alias / path` 做归一化后去重检查，重点覆盖：
  - `id` 重复
  - `alias` 在小写归一化后冲突
  - `path` 在 slash + 小写归一化后冲突
- 在 `api/app/services/workflow_definitions.py` 中把这条校验前移到 schema model validate 之前；命中冲突时统一抛出 `publish_identity` 结构化 issues，而不是退回泛化的 schema 文本。
- 新增 `web/lib/workflow-publish-identity-validation.ts`，把同一类规则补到 editor 本地校验。
- 在 `web/components/workflow-editor-workbench/use-workflow-editor-validation.ts` 中接入 `publish_identity` 分类摘要、persist blocked message 和 validation navigator 数据源。
- 为 workflow route 与 workspace starter route 新增对应测试，验证保存和 preflight 都会返回 `publish_identity` issue。

## 影响范围

- `api/app/services/workflow_publish_identity_validation.py`
- `api/app/services/workflow_definitions.py`
- `web/lib/workflow-publish-identity-validation.ts`
- `web/components/workflow-editor-workbench/use-workflow-editor-validation.ts`
- `api/tests/test_workflow_routes.py`
- `api/tests/test_workspace_starter_routes.py`

## 验证

- `api/.venv/Scripts/uv.exe run pytest -q tests/test_workflow_routes.py -k 'publish_identity or invalid_variables'`
- `api/.venv/Scripts/uv.exe run pytest -q tests/test_workspace_starter_routes.py -k 'publish_identities or invalid_variables'`
- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`

## 结果判断

- 这次改动没有引入新的执行链，也没有改动 publish binding/runtime 主模型，而是在既有保存闭环上补了一层更细粒度的 identity guard。
- 它对“用户层”有直接帮助：workflow editor 和 workspace starter 在 publish draft 配置阶段更容易定位冲突字段。
- 它对“AI 与人协作层 / 治理层”也有间接帮助：后续 publish governance、published surface 和导出/审计入口可以继续复用稳定的 endpoint identity 语义，不必再在边缘入口各自判断别名/路径冲突。

## 下一步

1. 按既定优先级继续补 `starter portability` 校验，让 workflow 保存和 starter 沉淀共享更多可迁移性 guard。
2. 继续把 editor/publish 聚合热点从 `get-workflow-publish.ts`、`workflow-tool-execution-validation.ts` 等长文件下沉到更细 helper。
3. 在敏感访问策略入口落地后，把 `publish_identity / publish_version / sensitive_access_policy` 三类问题收成更统一的 publish draft 治理面。
