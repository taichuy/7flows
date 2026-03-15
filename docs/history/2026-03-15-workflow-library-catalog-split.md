# 2026-03-15 Workflow Library Catalog 拆分与热点衔接

## 背景

- 用户要求先复核项目现状、最近提交和代码热点，再按优先级继续推进，并把结果同步到当前事实索引与开发记录。
- `docs/dev/runtime-foundation.md` 已把 `api/app/services/workflow_library.py` 标记为工作流定义/来源治理侧的后端长文件热点。
- 当前工作区已经存在一组围绕 `workflow_library.py` 的未提交拆分半成品，因此本轮最自然的衔接不是切换到无关子线，而是把这次 catalog/source/starter 拆分真正收口到可验证状态。

## 目标

1. 把 `workflow_library.py` 从“catalog/source/starter/DB orchestration 混在一起”的形态收口成更清晰的 service + pure helper 分层。
2. 保持 workflow starter、node catalog、tool source lane 的行为与当前 editor/library 语义一致。
3. 用最小但真实的后端测试覆盖本轮拆分后的关键行为，并保持全量 pytest 通过。

## 实现

### 1. 拆出纯 catalog/source helper

- 新增 `api/app/services/workflow_library_catalog.py`，承接以下纯逻辑：
  - builtin starter / node catalog 常量与构造
  - starter / node / tool source lane 汇总
  - tool source 描述映射
  - starter blueprint -> definition 的默认配置与画布坐标拼装
- `api/app/services/workflow_library.py` 保留为依赖数据库和 registry 的 orchestration service，只继续负责：
  - snapshot 聚合
  - tool registry hydrate 与 workspace 可见性过滤
  - workspace starter 持久化读取
  - tool definition 序列化

### 2. 继续把剩余纯汇总逻辑从 service 移走

- 本轮额外把 `build_tool_source_lanes()` 也迁入 `workflow_library_catalog.py`，避免 `WorkflowLibraryService` 里继续残留纯 transform 逻辑。
- 经过这一步后，`workflow_library.py` 已从原先约 688 行收口到约 220 行，catalog/source 的增长压力被转移到 helper 文件，不再继续挤压 service 的 orchestration 边界。

### 3. 补充拆分回归测试

- 新增 `api/tests/test_workflow_library_catalog.py`，覆盖：
  - builtin agent starter 仍会保留 catalog 默认 config 与画布 position
  - tool source lane 会把 native / compat 工具按来源聚合计数
  - starter source lane 在存在 workspace starter 时会正确切到 `available`

## 影响范围

- `api/app/services/workflow_library.py`
- `api/app/services/workflow_library_catalog.py`
- `api/tests/test_workflow_library_catalog.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_library_catalog.py
.\.venv\Scripts\uv.exe run ruff check app/services/workflow_library.py app/services/workflow_library_catalog.py tests/test_workflow_library_catalog.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `pytest -q tests/test_workflow_library_catalog.py`：通过，`3 passed`
- `ruff check`：通过
- `pytest -q`：通过，`227 passed`

## 当前结论

- `workflow_library.py` 已不再是阻塞继续开发的单体热点，当前职责更接近真正的 orchestration service。
- workflow library 的 builtin starter、node catalog 与 source governance 逻辑现在已经有独立 helper 与行为测试，后续继续补来源治理或 starter/library 入口时，边界更容易保持稳定。
- 这次拆分属于对最近一次 `plugin_runtime` 模块拆分后的自然承接：先继续清理后端结构热点，再为后续 `workflow.py`、敏感访问控制和 editor/library 完整度迭代腾出更稳的落点。

## 下一步

1. 继续治理 `api/app/schemas/workflow.py` 与相关 route/service 的集中职责，避免 workflow schema/publish schema 再次回涨成新的主热点。
2. 继续把统一敏感访问控制闭环挂到 ToolGateway、credential resolve、context read 和 publish export，优先解决安全与审批事实层空缺。
3. 在前端侧继续补 workflow library / editor 对 variables、schema builder 和敏感访问策略入口的承接，但不要把未落地治理能力伪装成已完成 UI。
