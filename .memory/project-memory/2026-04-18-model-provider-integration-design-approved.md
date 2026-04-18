---
memory_type: project
topic: 模型供应商接入改按多协议 provider kernel 与首批官方 provider 推进
summary: 用户于 `2026-04-18 08` 明确否决“只做 OpenAI 单供应商”的收缩方案，确认直接采用多协议 `provider kernel` 方案推进；`../1flowse-official-plugins` 负责 Dify 风格静态 provider 包，主仓库负责 catalog、workspace provider instance、凭据、LLM 节点绑定与协议适配器。
keywords:
  - model-provider
  - provider-kernel
  - openai-compatible
  - moonshot
  - siliconflow
  - azure-openai
  - anthropic
  - gemini
  - plugin-framework
  - runtime-orchestration
match_when:
  - 需要继续实现模型供应商接入
  - 需要判断是做单一 OpenAI 还是多协议 provider kernel
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

# 模型供应商接入改按多协议 provider kernel 与首批官方 provider 推进

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
- 要在不等待完整动态插件平台成熟的前提下，先把官方 provider 与宿主 runtime 消费链路打通。

## 截止日期

- 无

## 决策背后动机

- 官方插件仓库 `../1flowse-official-plugins` 只负责 Dify 风格静态 provider 包，不先承担动态执行。
- 主仓库负责：
  - 官方 provider catalog
  - `workspace` 级 provider instance
  - 凭据与验证
  - `LLM` 节点绑定
  - 运行时协议适配器
- 首批协议族固定为：
  - `openai_compatible`
  - `azure_openai`
  - `anthropic_messages`
  - `google_gemini`
- 首批官方 provider 固定为：
  - `openai`
  - `openai_compatible`
  - `moonshot`
  - `siliconflow`
  - `azure_openai`
  - `anthropic`
  - `google_gemini`

## 关联文档

- `docs/superpowers/specs/1flowse/2026-04-18-model-provider-integration-design.md`
