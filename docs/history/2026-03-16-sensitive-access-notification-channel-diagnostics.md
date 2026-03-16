# 2026-03-16 Sensitive Access Notification Channel Diagnostics

## 背景

- 用户要求先系统复核 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`、最近 Git 提交与 `docs/history/` 留痕，再判断当前项目是否需要回头补基础框架，还是应直接衔接最近一轮开发继续推进主业务完整度。
- 复核结论是：当前项目已经具备继续推进功能性开发的基础框架。`7Flows IR`、runtime、published surface、trace / replay、workflow editor、sensitive access 基础闭环都已经落地到“可继续扩展”的阶段，不需要回头重搭底座。
- 最近提交 `9681bc9 feat: add sensitive access notification channel governance` 已把通知渠道 capability、target preflight 和最小 operator 面板补齐，但下一步建议里明确留下了 `P0：补通知渠道 preset / health-check / config drilldown`。当前真正缺的是“按 channel 维度聚合最近 dispatch 事实、配置事实与失败摘要”，否则 operator 仍要在 inbox 和 worker 错误之间来回切换。

## 目标

1. 保持 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 单一事实层不变，不引入第二套通知治理模型。
2. 在 channel capability 基础上补真实 dispatch diagnostics，让 operator 能直接看到各渠道的 pending / delivered / failed 聚合与最近失败摘要。
3. 把配置事实收口成 read-only drilldown，尤其补齐 email SMTP 的配置透明度，同时避免泄露 target 原文或 secret。
4. 继续维持 service 边界清晰：preflight / capability 仍放在 governance，诊断聚合单独拆层，不把查询逻辑回灌到主控制 service。

## 实现

### 1. 新增独立的 notification channel diagnostics service

- 新增 `api/app/services/notification_channel_diagnostics.py`。
- 该 service 复用既有 `notification_channel_governance.py` 的 capability 事实，只补：
  - channel 级 dispatch summary（`pending / delivered / failed`）
  - latest dispatch / latest delivered / latest failure 时间
  - latest failure error 与脱敏后的 target 摘要
  - config facts（delivery mode、target contract、timeout、email SMTP host / from address / transport / auth）
- 这样保持 `notification_channel_governance.py` 继续负责 contract 与 preflight，不把 DB 聚合与 operator 诊断硬塞回同一个文件。

### 2. 扩展 `/api/sensitive-access/notification-channels`

- 更新 `api/app/api/routes/sensitive_access.py` 与 `api/app/schemas/sensitive_access.py`。
- `GET /api/sensitive-access/notification-channels` 现在不再只返回静态 capability，而是返回：
  - 原有 `channel / delivery_mode / target_kind / configured / health_status`
  - 新增 `health_reason`
  - 新增 `config_facts[]`
  - 新增 `dispatch_summary`
- route 改为显式依赖 DB，以 `NotificationDispatch` 当前事实构建 diagnostics，而不是凭静态配置推测运行态。

### 3. Sensitive Access 页面补健康钻取

- 更新 `web/lib/get-sensitive-access.ts` 与 `web/app/sensitive-access/page.tsx`。
- channel 卡片现在会直接展示：
  - dispatch summary
  - latest dispatch / delivered / failure 时间
  - config facts 列表
  - latest failure 的脱敏 target 与错误摘要
- 这样 operator 不用跳到具体 dispatch 详情，先在同一页就能判断“是 SMTP 配置缺失、target contract 错误，还是 worker 队列尚未消费”。

### 4. 测试与 contract 校验

- 新增 `api/tests/test_notification_channel_diagnostics.py`，覆盖 diagnostics service 对 dispatch history 与 email config facts 的聚合。
- 更新 `api/tests/test_sensitive_access_routes.py`，把 `/notification-channels` 的 route contract 扩到新的 diagnostics 字段。

## 影响范围

- 敏感访问 operator 控制面从“知道 channel 支持什么”推进到“知道 channel 最近是否在失败、失败在哪里、配置缺什么”。
- 可靠性与稳定性判断更诚实：email channel 不再只告诉你 degraded，而是能直接给出 SMTP host / from address 缺失、最近失败摘要和当前 dispatch 积压情况。
- 架构边界保持稳定：runtime / sensitive access 主链不变，新增的只是围绕既有事实层的只读诊断聚合。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest tests/test_notification_channel_governance.py tests/test_notification_channel_diagnostics.py tests/test_sensitive_access_routes.py -q
.\.venv\Scripts\uv.exe run ruff check app/api/routes/sensitive_access.py app/schemas/sensitive_access.py app/services/notification_channel_diagnostics.py tests/test_notification_channel_diagnostics.py tests/test_sensitive_access_routes.py
.\.venv\Scripts\uv.exe run pytest -q
```

在 `web/` 目录执行：

```powershell
pnpm exec tsc --noEmit
pnpm lint
```

在仓库根目录执行：

```powershell
git diff --check
```

结果：

- 局部后端测试：通过（`11 passed`）
- changed-files `ruff check`：通过
- `pnpm exec tsc --noEmit`：通过
- `pnpm lint`：通过
- 后端全量 `pytest` 与 `git diff --check` 见本轮收尾验证

## 结论

- 当前项目仍然不需要回头重做基础框架；后端 runtime、发布链、trace / replay、workflow editor 和 sensitive access 主链都已经处在“可以持续按优先级推进”的状态。
- 本轮衔接的是最近提交明确留下的 P0 空缺，而不是另起新支线，因此与现有 history / runtime-foundation 连续性良好。
- 项目依旧**未进入**“只剩人工逐项界面设计 / 人工验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。

## 下一步建议

1. **P0：补通知渠道 preset 与默认 target 策略**
   - 让 runtime / operator 不只看得到 contract，还能直接复用稳定 target preset，减少每次人工填 target 的漂移。
2. **P0：补 inbox 的批量 approve / reject / retry**
   - 继续把 operator 面板从“单票据操作”推进到“真实日常治理入口”。
3. **P1：把相同的安全解释层继续接到 run / published detail**
   - 避免 operator 在 inbox、run 诊断和 published 详情之间继续看到三套不同的安全解释文案。
