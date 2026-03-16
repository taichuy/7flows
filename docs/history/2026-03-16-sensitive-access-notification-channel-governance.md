# 2026-03-16 Sensitive Access Notification Channel Governance

## 背景

- 用户要求先系统复核 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`、最近 Git 提交与 `docs/history/` 留痕，再判断项目现状、架构边界、基础框架是否足以继续推进，以及哪里最值得衔接。
- 复核结果是：当前项目基础框架已经足够继续做主业务闭环，不需要回头重搭 runtime / publish / trace / inbox 基座；最近提交 `cac7ff0 feat: add smtp email notification delivery` 已把 `email` adapter 补成真实 SMTP 投递，但“通知目标 / 渠道治理”仍是敏感访问闭环里的 P0 空缺。
- 具体问题在于：
  - `slack` / `feishu` 当前真实支持的是 webhook URL，而不是 channel 名称；
  - `email` 虽已有 SMTP adapter，但在 SMTP 未配置时仍缺少统一的 capability 说明；
  - inbox / operator 页面还不能直接看到“哪些渠道当前 ready、哪些 target 形式受支持”；
  - 不合法 target 若继续进入 worker，会制造不必要的 pending / retry 噪音。

## 目标

1. 把通知目标规则与渠道健康状态收口成统一治理事实，而不是散落在各个 adapter 内。
2. 对当前 adapter 明确不支持的 target 或未配置好的渠道，做到“创建 dispatch 时立即诚实失败”，避免继续排入 worker。
3. 把渠道 capability 接到 `/api/sensitive-access/*` 与 `web/app/sensitive-access/page.tsx`，让 operator 能直接看到健康状态与 target 规则。
4. 保持现有 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 单一事实层不变，不引入第二套通知治理模型。

## 实现

### 1. 新增通知渠道治理 service

- 新增 `api/app/services/notification_channel_governance.py`。
- 把以下能力从 adapter 层抽到统一 helper：
  - channel capability 列表
  - channel health / configured 状态
  - target kind、hint、example
  - dispatch preflight（`delivered / pending / failed`）
  - 通用 `http(s)` / email target 解析

### 2. 敏感访问 dispatch 创建阶段复用同一套 preflight

- 更新 `api/app/services/sensitive_access_control.py`。
- `SensitiveAccessControlService` 现显式持有 `Settings`，保证 dispatch 创建和真实 adapter 投递使用同一份配置事实。
- `_create_notification_dispatch()` 现在按 preflight 决定：
  - `in_app`：直接 `delivered`
  - 合法外部 target：`pending`，继续进 worker
  - 不合法 target / 未配置邮件 adapter：立即 `failed`，并写入结构化错误说明
- 这样既保留审批票据与等待恢复主链，又避免把当前不可能成功的通知继续塞进 worker 队列。

### 3. 新增通知渠道 capability API

- 更新 `api/app/api/routes/sensitive_access.py` 与 `api/app/schemas/sensitive_access.py`。
- 新增 `GET /api/sensitive-access/notification-channels`，返回：
  - `channel`
  - `delivery_mode`
  - `target_kind`
  - `configured`
  - `health_status`
  - `summary`
  - `target_hint`
  - `target_example`

### 4. 前端 sensitive-access 页面补渠道观测

- 更新 `web/lib/get-sensitive-access.ts`、`web/app/sensitive-access/page.tsx`、`web/components/sensitive-access-inbox-panel.tsx`。
- 页面现在除了 inbox summary 与审批列表，还会显示 notification channel capability 面板：
  - 当前渠道是否 `ready / degraded`
  - target 形式要求
  - 配置状态
  - 示例 target
- inbox 里对最新失败通知补了更清晰的错误解释，不再只剩 status badge。

## 影响范围

- 统一敏感访问控制仍保持单一事实层，但 operator 现在能更早知道“渠道当前能不能用、target 应该怎么填”。
- `slack / feishu / webhook / email` 的可投递边界更诚实：当前不满足 contract 的 dispatch 不再进入 worker。
- 通知治理从“adapter 内局部知识”提升为“API / UI 可见的治理事实”，更利于后续继续补 preset、健康检查和批量治理动作。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest tests/test_notification_channel_governance.py tests/test_notification_delivery.py tests/test_sensitive_access_routes.py -q
.\.venv\Scripts\uv.exe run pytest -q
.\.venv\Scripts\uv.exe run ruff check app/api/routes/sensitive_access.py app/schemas/sensitive_access.py app/services/notification_channel_governance.py app/services/notification_delivery.py app/services/sensitive_access_control.py tests/test_notification_channel_governance.py tests/test_notification_delivery.py tests/test_sensitive_access_routes.py
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

- 局部后端测试：`14 passed`
- 后端全量测试：`289 passed`
- changed-files `ruff check`：通过
- `pnpm exec tsc --noEmit`：通过
- `pnpm lint`：通过
- `git diff --check`：通过（仅有 CRLF 提示，无 diff 格式错误）

## 结论

- 当前项目仍然具备继续推进产品设计要求的基础框架，不需要回头重写底座。
- 最近提交链需要衔接，但当前更高优先级已经从“把 email adapter 接上”推进到“把 channel governance 做成统一事实并接到 operator 控制面”。
- 这轮改动继续增强了可靠性、可观测性和诚实性：不支持的 target 不再伪装成会被 worker 修好，SMTP 未配置也不再只在更后面才暴露。
- 项目依旧**未进入**“只剩人工逐项界面设计 / 人工验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。

## 下一步建议

1. **P0：补通知渠道 preset / health-check / config drilldown**
   - 把现在的 capability 只读面板继续推进成可治理入口，而不只是说明文案。
2. **P0：补 inbox 的批量 approve / reject / retry**
   - 继续把 operator 控制面从“单票据动作”推进到“真实日常治理入口”。
3. **P1：继续统一 inbox / run / published detail 的安全解释层**
   - 避免同一条审批 / 通知事实在三个入口继续出现不同表述与不同排障路径。
