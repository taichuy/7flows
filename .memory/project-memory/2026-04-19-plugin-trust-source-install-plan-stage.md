---
memory_type: project
topic: 官方插件信任链与双入口安装进入实现计划阶段
summary: 自 `2026-04-19 14` 起，`docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md` 成为“签名信任底座 + 镜像源 + 上传插件安装”专题的执行计划。计划固定先补 `plugin-framework` 统一 intake pipeline，再补宿主持久化与 official/mirror source contract，随后接浏览器上传和设置页 source/trust UI。为保持 spec 的三类来源模型，遗留 `POST /api/console/plugins/install` 兼容路径在本轮只作为内部手工导入入口保留，持久化口径统一归到 `source_kind=uploaded`，不再延续 `downloaded_or_uploaded`。用户随后改为要求当前会话持续执行整份 plan 直到完成，但仍需按 task 级别同步计划文档与验证结果。
keywords:
  - official-plugin
  - signature-trust
  - mirror-registry
  - upload-install
  - trust-level
  - implementation-plan
match_when:
  - 需要执行官方插件信任链与双入口安装实施计划
  - 需要确认 legacy `/api/console/plugins/install` 应如何映射到新来源模型
  - 需要判断本轮是否允许修改 `1flowbase-official-plugins`
created_at: 2026-04-19 14
updated_at: 2026-04-19 15
last_verified_at: 2026-04-19 15
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-19-plugin-trust-source-install.md
  - docs/superpowers/specs/1flowbase/2026-04-19-plugin-trust-source-install-design.md
  - api/apps/api-server/src/config.rs
  - api/apps/api-server/src/official_plugin_registry.rs
  - api/apps/api-server/src/routes/plugins.rs
  - api/crates/control-plane/src/plugin_management.rs
  - api/crates/plugin-framework/src/package_intake.rs
  - web/app/src/features/settings/pages/SettingsPage.tsx
---

# 官方插件信任链与双入口安装进入实现计划阶段

## 时间

`2026-04-19 14`

## 谁在做什么

- 用户已认可 `2026-04-19-plugin-trust-source-install-design.md` 的方向，并要求开始实现清单。
- AI 已把后续工作收口成正式 implementation plan，准备按任务顺序执行。
- 用户先选择 `Inline Execution` 并要求每轮执行结束只对应一个 task，随后又明确要求当前会话持续执行任务直到整份 plan 完成。

## 为什么这样做

- 这轮同时跨 `plugin-framework`、宿主后端、设置页 UI 和数据迁移，如果没有任务级拆分，很容易在实现时把来源、信任和签名诊断再次混用。
- 现有仓库还保留 legacy `/api/console/plugins/install` 本地目录安装路径，需要先在计划阶段固定其兼容语义，避免实现中临时发明第四种来源类型。

## 为什么要做

- 让后续开发严格按“信任底座 -> 镜像源 -> 上传插件”的顺序推进。
- 保证后端和前端都围绕 `source_kind + trust_level + signature_status` 三字段工作，而不是继续沿用 `verification_status=valid` 代指官方可信。

## 截止日期

- 无

## 决策背后动机

- `1flowbase-official-plugins/*` 继续不在本仓库内修改；本轮只做 host app 侧实现。
- legacy `/api/console/plugins/install` 只保留内部兼容入口，不进入设置页，不再保留 `downloaded_or_uploaded` 这种混合语义。
- 正式产品面只开放两条入口：`从源安装` 与 `上传插件`；可信度统一由后端验签结论决定。
- 当前进入实现阶段后的推进节奏固定为：当前会话内 inline 持续推进整份 plan，但每完成一个 task 都要立即同步 `docs/superpowers/plans`，让用户能按 task 追踪进度与验证状态。

## 当前进展

- Task 1 已完成：`plugin-framework` 已落地统一 package intake pipeline，并独立提交 `f9f2b1d0`。
- Task 2 已完成：宿主持久化、迁移和 repository 映射已切到 `source_kind + trust_level + signature_status`，并独立提交 `5711a6`。
- Task 3 已完成：`api-server` 现可解析默认官方源/镜像源，official catalog 已返回 source metadata，official install/upgrade 已统一走 intake + `signature_required` 策略；这一 task 的验证中还确认了 `trust_mode=allow_unsigned` 时成功路径的 `signature_status` 应为 `unsigned`，不是 `unverified`。
- 下一步直接进入 Task 4：补浏览器上传安装入口，并把 legacy `/api/console/plugins/install` 收口为内部兼容手工导入、持久化统一归到 `source_kind=uploaded`。
