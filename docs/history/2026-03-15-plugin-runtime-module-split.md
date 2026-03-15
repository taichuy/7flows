# 2026-03-15 Plugin Runtime 模块拆分与 compat contract 回归修复

## 背景

- `docs/dev/runtime-foundation.md` 已把 `api/app/services/plugin_runtime.py` 标记为 compat/runtime 侧的长文件热点。
- 当前工作区里遗留了一组未提交的 `plugin_runtime*` 拆分半成品：主文件已开始缩成 facade，但聚合导出尚未补齐，`plugin_runtime_proxy.py` 里还残留语法错误，compat contract 的 credential/input 路由校验也有行为回归风险。
- 用户要求基于本地未提交 Git 继续推进，因此本轮目标不是重新设计插件兼容架构，而是把这次拆分真正落成到可验证、可提交的状态。

## 目标

1. 把 `plugin_runtime.py` 从单体服务拆成稳定的 facade + 子模块结构。
2. 修复拆分过程中引入的导出缺失、语法错误和 compat contract 路由回归。
3. 用现有 `api/tests/test_plugin_runtime.py` 补住关键回归测试，并保持后端全量 pytest 通过。

## 实现

### 1. 拆分 `plugin_runtime` 主文件

- 保留 `api/app/services/plugin_runtime.py` 作为兼容导出 facade。
- 新增并接线：
  - `api/app/services/plugin_runtime_proxy.py`
  - `api/app/services/plugin_runtime_adapter_clients.py`
  - `api/app/services/plugin_runtime_registry.py`
  - `api/app/services/plugin_runtime_types.py`
- 当前职责分层为：
  - facade：统一导出旧入口，降低调用方迁移成本
  - proxy：native/compat 调用代理与 constrained contract 校验
  - adapter clients：health probe 与 tool catalog 拉取
  - registry：tool / adapter 注册与默认 Dify compat adapter 装配
  - types：dataclass、异常与 callable type alias

### 2. 修复拆分回归

- 给 facade 补回 `get_plugin_call_proxy()` 导出，保持 `RuntimeService` 默认依赖不被拆分打断。
- 修复 `plugin_runtime_proxy.py` 中残留的语法错误，恢复模块可导入状态。
- 恢复 compat contract 的显式路由约束：
  - `credential` 字段只能从 `credentials` 进入
  - 非 credential 字段只能从 `inputs` 进入
  - 必填 `input` 与必填 `credential` 继续给出明确错误信息
- 顺手收口 `plugin_runtime_adapter_clients.py` 的超长行，并修复 `plugin_registry_store.py` 的装饰器前空行问题，使局部 `ruff check` 可通过。

### 3. 补充回归测试

- 在 `api/tests/test_plugin_runtime.py` 新增两条 compat contract 回归测试：
  - credential 字段误放进 `inputs` 时应拒绝
  - 普通 input 字段误放进 `credentials` 时应拒绝
- 保留原有 native invoke、compat invoke、catalog client、health checker 与 runtime service 集成测试，确保这次拆分不只靠静态检查兜底。

## 影响范围

- `api/app/services/plugin_runtime.py`
- `api/app/services/plugin_runtime_proxy.py`
- `api/app/services/plugin_runtime_adapter_clients.py`
- `api/app/services/plugin_runtime_registry.py`
- `api/app/services/plugin_runtime_types.py`
- `api/app/services/plugin_registry_store.py`
- `api/tests/test_plugin_runtime.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/services/plugin_runtime.py app/services/plugin_runtime_adapter_clients.py app/services/plugin_runtime_proxy.py app/services/plugin_runtime_registry.py app/services/plugin_runtime_types.py app/services/plugin_registry_store.py tests/test_plugin_runtime.py
.\.venv\Scripts\uv.exe run pytest -q tests/test_plugin_runtime.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `ruff check`：通过
- `pytest -q tests/test_plugin_runtime.py`：通过，`11 passed`
- `pytest -q`：通过，`224 passed`

## 当前结论

- `plugin_runtime.py` 不再是兼容层的单体热点，当前已经收口为稳定 facade。
- compat plugin 的 constrained execution contract 仍保持显式边界，没有因为拆分而放松 credential/input 路由约束。
- `RuntimeService`、plugin routes 和 registry store 继续沿旧导出入口工作，本轮没有引入新的调用面破坏。

## 下一步

1. 沿拆分后的 proxy / registry / adapter client 边界继续补 adapter lifecycle、workspace scoping 和聚合健康视图，而不是重新堆回 facade。
2. 继续治理 `workflow_library.py`、`workflow.py` 等仍在增长的后端热点，避免结构治理只停在 compat 侧。
3. 把 compat plugin 的 execution class 默认策略继续并到 ToolGateway / graded execution 主线里，完成从“可发现/可调用”到“受控执行”的下一步衔接。
