# 2026-03-17 sandbox readiness summary

## 背景

- 2026-03-17 前几轮已经把 `sandbox_backends` registry / health / capability / execute client 接进 runtime 与 system overview，也把 `sandbox_code`、compat `tool/plugin`、native tool 的强隔离语义继续收口为 fail-closed。
- 但作者与 operator 在首页 / system overview 仍只能看到“有哪些 backend、状态是不是 up/down”，很难快速回答：
  - `sandbox / microvm` 现在到底哪条执行级别真的可用？
  - 当前缺的是 backend 离线、execution class 未覆盖，还是 dependency / policy 类能力没有 ready？
- 这会让“沙箱隔离以及安全可靠可信这个链路场景”仍然停留在实现细节里成立，而没有真正进入可消费的治理与排障入口。

## 目标

- 在不新增第二套诊断模型的前提下，把 sandbox readiness 收口到已有的 `system overview` 主链。
- 让首页能直接展示强隔离 readiness，而不是逼作者和 operator 先跑一次失败的 run 再反推环境状态。
- 把 capability gap 明确表达为结构化事实，继续支撑后续 runtime / diagnostics / editor preflight 的统一解释层。

## 本轮实现

### 1. `SystemOverview` 新增 `sandbox_readiness`

- 更新 `api/app/schemas/system.py`
- 新增：
  - `SandboxExecutionClassReadinessCheck`
  - `SandboxReadinessCheck`
- `SystemOverview` 现新增 `sandbox_readiness` 字段，统一承载：
  - enabled / healthy / degraded / offline backend 计数
  - `sandbox` / `microvm` 的 execution class readiness
  - aggregate `languages / profiles / dependency modes`
  - `builtin package sets / backend extensions / network policy / filesystem policy` capability flag

### 2. system route 聚合 readiness reason

- 更新 `api/app/api/routes/system.py`
- 新增 `_build_sandbox_readiness()` 与 `_build_sandbox_execution_class_reason()`：
  - 当 backend 可用时，直接返回对应 execution class 的 backend pool
  - 当 backend 不可用时，显式区分：
    - 没有 enabled backend
    - backend enabled 但不健康
    - backend 健康但未声明对应 execution class
- `capabilities` 现同步补上 `sandbox-readiness-summary`

### 3. 首页新增 `Isolation readiness` 面板

- 新增 `web/components/sandbox-readiness-panel.tsx`
- 更新 `web/lib/get-system-overview.ts`
- 更新 `web/app/page.tsx`
- 首页现在可以直接看到：
  - 当前 enabled backend 数量与 healthy / degraded 分布
  - `sandbox / microvm` 哪些 ready、哪些 blocked
  - blocked 的直接 reason
  - 当前可用语言、profile、dependency mode 与 capability flag

## 影响评估

### 架构链条

- **扩展性增强**：后续新增 backend、profile 或 dependency governance 时，只需要继续喂给同一条 readiness 聚合链，不必再补一套页面专用判断。
- **兼容性增强**：system overview 现在能同时表达“backend 注册事实”和“execution class readiness 事实”，减少 operator 把 backend 在线误解为所有强隔离路径都 ready。
- **可靠性 / 稳定性增强**：作者与 operator 能在运行前先发现 readiness gap，减少“运行后才发现 microvm 根本没覆盖”的延迟阻断。
- **安全性增强**：强隔离 fail-closed 不再只是运行时实现约束，也开始变成显式可见的治理事实，更利于验证“安全承诺是否真的站得住”。

### 对产品闭环的帮助

- 这轮推进的是 **用户层 + AI 与人协作层 + AI 治理层** 之间的衔接，不是样式层修补。
- **人类用户 / 作者**：在首页就能判断当前环境是否适合声明 `sandbox / microvm`，减少盲配 execution policy。
- **人与 AI 协作**：AI 或 workflow 作者如果声明了强隔离，operator 能更快知道问题是 backend readiness 还是 workflow 本身。
- **AI 治理层**：安全可靠可信链路不再只依赖 run trace 事后排障，而开始具备运行前 readiness 入口。

## 验证

- 定向测试：`cd api; ./.venv/Scripts/uv.exe run pytest -q tests/test_system_routes.py`
  - 结果：`5 passed`
- 后端变更检查：`cd api; ./.venv/Scripts/uv.exe run ruff check app/api/routes/system.py app/schemas/system.py tests/test_system_routes.py`
  - 结果：通过
- 后端全量测试：`cd api; ./.venv/Scripts/uv.exe run pytest -q`
  - 结果：`330 passed in 34.67s`
- 前端类型检查：`cd web; pnpm exec tsc --noEmit`
  - 结果：通过
- 前端 lint：`cd web; pnpm lint`
  - 结果：通过
- diff 检查：`git diff --check`
  - 结果：通过（仅有 CRLF 提示，无 diff 错误）

## 未完成与下一步

1. 继续把 compat plugin 对 `sandboxBackend` 的协议兑现补成真实隔离执行，而不是只停留在 host 侧 readiness 与 trace 绑定。
2. 继续推进 native tool 真正接入统一 `SandboxBackendRegistration / SandboxExecution` contract，而不是长期停留在 fail-closed honesty。
3. 把同一条 readiness explanation 继续下沉到 workflow editor preflight / diagnostics drilldown，让作者在保存前也能直接看到 capability gap。
