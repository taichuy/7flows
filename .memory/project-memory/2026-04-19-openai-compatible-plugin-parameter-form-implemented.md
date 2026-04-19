---
memory_type: project
topic: openai_compatible 官方插件已补第一版参数 schema 与新调用透传
summary: 自 `2026-04-19 09` 起，`../1flowbase-official-plugins/models/openai_compatible` 已完成插件侧第一版改造：`listModels()` 会为动态发现模型返回 `parameter_form`，`invoke()` 会优先读取 `model_parameters` 并继续透传 `response_format`；本轮范围固定为 `temperature / top_p / max_tokens / seed`，暂不补“结构化输出能力提示字段”。
keywords:
  - official-plugin
  - openai-compatible
  - parameter_form
  - model_parameters
  - response_format
  - plugin-repo
  - implemented
match_when:
  - 需要确认官方插件仓库是否已经补齐第一版 LLM 参数 schema
  - 需要判断 openai_compatible 是否已经从旧固定字段切到 model_parameters
  - 需要继续推进官方插件仓库的第二轮能力提示改造
created_at: 2026-04-19 09
updated_at: 2026-04-19 09
last_verified_at: 2026-04-19 09
decision_policy: verify_before_decision
scope:
  - ../1flowbase-official-plugins/models/openai_compatible
  - ../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.js
  - ../1flowbase-official-plugins/models/openai_compatible/provider/_tests/openai_compatible.test.mjs
  - ../1flowbase-official-plugins/models/openai_compatible/manifest.yaml
---

# openai_compatible 官方插件已补第一版参数 schema 与新调用透传

## 时间

`2026-04-19 09`

## 谁在做什么

- 用户明确拍板插件仓库改造先走方案 A。
- AI 已在 `../1flowbase-official-plugins/models/openai_compatible` 落地第一版参数 schema 与调用透传改造，并补了插件侧 Node 测试。

## 为什么这样做

- 主仓库宿主侧 contract、运行时透传和前端动态参数表单都已完成，但官方插件此前还没有返回 `parameter_form`，导致前端无法自动长出参数面板。
- 插件侧 `invoke()` 此前仍依赖旧的固定字段 `temperature / top_p / max_tokens / seed`，没有对齐宿主新的 `model_parameters` 约定。

## 为什么要做

- 让 `openai_compatible` 成为第一份真正对齐宿主参数 schema contract 的官方参考插件。
- 为后续其他 provider 插件补同类 schema 提供可复用样板。

## 截止日期

- 无

## 决策背后动机

- 本轮范围固定为：
  - `listModels()` 为动态发现模型返回 `parameter_form`
  - 参数 schema 首轮只补 `temperature / top_p / max_tokens / seed`
  - `invoke()` 优先读取 `model_parameters`，并继续透传 `response_format`
  - 保留旧固定字段回退，避免对旧宿主产生硬兼容断裂
- 本轮明确不做：
  - 插件侧“结构化输出能力提示字段”
  - 主仓库静态模型 YAML 的 `parameter_form` 解析扩展
  - 官方 registry 元数据手工更新
- 版本号已从 `0.1.0` 提升到 `0.2.0`，便于后续走插件仓库正式发布。

## 验证证据

- `rtk node --test 1flowbase-official-plugins/models/openai_compatible/provider/_tests/openai_compatible.test.mjs`
- `rtk node --test 1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs 1flowbase-official-plugins/scripts/_tests/detect-version-releases.test.mjs 1flowbase-official-plugins/models/openai_compatible/provider/_tests/openai_compatible.test.mjs`
- `rtk git -C 1flowbase-official-plugins diff --check`
