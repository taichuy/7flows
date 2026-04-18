---
memory_type: project
topic: 模型供应商接入改按统一 contract 与单一参考 plugin 推进
summary: 用户于 `2026-04-18 08` 明确否决“只做 OpenAI 单供应商”的收缩方案，并进一步明确长期正确边界应为“`1Flowse` 定义标准 contract，provider 插件自己解决大模型接口接入”；同时用户否决“首批官方 provider 一次接入”，改为首轮只要求一个官方参考 plugin `openai_compatible`，其余 provider 通过同一 contract 独立接入。
keywords:
  - model-provider
  - provider-kernel
  - openai-compatible
  - reference-plugin
  - provider-contract
  - plugin-framework
  - runtime-orchestration
match_when:
  - 需要继续实现模型供应商接入
  - 需要判断是做一批官方 provider 还是开放统一 contract
  - 需要区分官方插件仓库与主仓库的职责边界
created_at: 2026-04-18 08
updated_at: 2026-04-18 08
last_verified_at: 2026-04-18 08
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowse/2026-04-18-model-provider-integration-design.md
  - ../1flowse-official-plugins
  - docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowse/modules/08-plugin-framework/README.md
  - api
  - web
---

# 模型供应商接入改按统一 contract 与单一参考 plugin 推进

## 时间

`2026-04-18 08`

## 谁在做什么

- 用户在确认“进入大模型供应商接入部分”的实现方向时，最终拍板不做单一 `OpenAI` 闭环，而是直接采用多协议 `provider kernel`。
- AI 依据这个拍板收口正式设计稿，并准备后续实现计划。

## 为什么这样做

- 当前 `05 runtime orchestration` 已经有最小运行闭环，但前提仍是假设模型供应商已经可用。
- 如果这轮只做单一 `OpenAI`，后续接 `Moonshot`、`SiliconFlow`、`Azure OpenAI`、`Anthropic`、`Gemini` 时会重做数据结构、设置页表单和运行时分发。
- 用户明确要求保留 `OpenAI-compatible` 能力，并认可 Dify 风格的 `base_url + api_key` 配置体验。

## 为什么要做

- 要让 `1Flowse` 真的进入“可配置、可验证、可运行”的模型供应商接入阶段。
- 要在进入供应商接入时就把长期正确边界钉死，避免把不同供应商协议逻辑继续堆进宿主。

## 截止日期

- 无

## 决策背后动机

- 官方插件仓库 `../1flowse-official-plugins` 负责 Dify 风格 provider 包，并由 provider 插件自己实现真实接口接入。
- 主仓库负责：
  - 官方 provider catalog
  - `workspace` 级 provider instance
  - 凭据与验证
  - `LLM` 节点绑定
  - 工具与 MCP 执行治理
  - `usage/token` 监控真值
- 运行时边界固定为：
  - 插件负责“发起请求 / 解析响应 / 归一化流式、tool call、MCP、usage”
  - 宿主负责“执行工具 / 执行 MCP / 写状态 / 写审计 / 写监控”
- 首轮官方只要求一个参考 plugin：
  - `openai_compatible`
- 其他 provider 不作为宿主首轮前置条件，应通过同一 contract 独立接入

## 关联文档

- `docs/superpowers/specs/1flowse/2026-04-18-model-provider-integration-design.md`
