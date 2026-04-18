---
memory_type: project
topic: 模型供应商接入改按统一 contract、插件产物与双层生命周期推进
summary: 用户于 `2026-04-18 08` 明确否决“只做 OpenAI 单供应商”的收缩方案，并进一步明确长期正确边界应为“`1Flowbase` 定义标准 contract，provider 插件自己解决大模型接口接入”；同时用户否决“首批官方 provider 一次接入”，改为首轮只要求一个官方参考 plugin `openai_compatible`，其余 provider 通过同一 contract 独立接入。随后用户又明确：多协议 `provider kernel` 是宿主提供的统一运行内核，不是宿主内置很多家 provider 适配器；系统安装对象必须是插件产物而非源码目录，provider plugin 需要显式建模注册发现、异步安装任务，以及“插件包 / provider instance”双层生命周期；最新模型列表也不能只在插件加载时静态推送，而要由插件显式提供模型发现能力并支持按 provider instance 按需拉取；另外 provider plugin 源码包还应拥有专门的 `i18n/` 目录，并提供统一入口一键生成简单 demo 页面或调试脚手架；该 `plugin CLI` 首轮先放主仓库作为宿主侧 tooling，不放到 provider 插件仓库里跟插件一起维护，插件仓库只承载其生成的 `demo/` 与开发态 `scripts/`；截至 `2026-04-18 11`，第一版 `plugin CLI` 已落地到 `scripts/node/plugin.js`，可生成 provider 骨架和静态 demo scaffold，但真实 `plugin-runner` debug runtime 握手尚未实现。
keywords:
  - model-provider
  - provider-kernel
  - unified-runtime-kernel
  - host-plugin-boundary
  - plugin-cli
  - host-tooling
  - plugin-demo-scaffold
  - openai-compatible
  - reference-plugin
  - provider-contract
  - plugin-artifact
  - plugin-lifecycle
  - provider-instance
  - model-discovery
  - model-catalog
  - plugin-i18n
  - plugin-demo
  - plugin-framework
  - runtime-orchestration
match_when:
  - 需要继续实现模型供应商接入
  - 需要判断是做一批官方 provider 还是开放统一 contract
  - 需要判断 provider kernel 是否等于宿主内置很多家 provider 适配器
  - 需要判断 plugin cli 应该放主仓库还是插件仓库
  - 需要判断 provider plugin demo 脚手架当前是否已落地
  - 需要区分官方插件仓库与主仓库的职责边界
  - 需要决定 provider plugin 是否直接安装源码目录
  - 需要决定插件生命周期、注册发现或安装任务设计
created_at: 2026-04-18 08
updated_at: 2026-04-18 11
last_verified_at: 2026-04-18 11
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md
  - ../1flowbase-official-plugins
  - docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md
  - api
  - web
---

# 模型供应商接入改按统一 contract、插件产物与双层生命周期推进

## 时间

`2026-04-18 08`

## 谁在做什么

- 用户在确认“进入大模型供应商接入部分”的实现方向时，最终拍板不做单一 `OpenAI` 闭环，而是直接采用多协议 `provider kernel`。
- AI 依据这个拍板收口正式设计稿，并准备后续实现计划。

## 为什么这样做

- 当前 `05 runtime orchestration` 已经有最小运行闭环，但前提仍是假设模型供应商已经可用。
- 如果这轮只做单一 `OpenAI`，后续接 `Moonshot`、`SiliconFlow`、`Azure OpenAI`、`Anthropic`、`Gemini` 时会重做数据结构、设置页表单和运行时分发。
- 用户明确要求保留 `OpenAI-compatible` 能力，并认可 Dify 风格的 `base_url + api_key` 配置体验。
- 用户进一步明确插件安装对象应该是“编译后的产物”，而不是直接让宿主吃源码目录。
- 用户进一步明确模型列表不能只靠插件加载时静态注册，点击模型供应商或模型选择器时应能拿到最新模型列表。
- 用户进一步明确插件源码包需要单独的国际化目录，并且要能通过命令或脚本一键生成简单 demo 页面。
- 用户进一步要求把“多协议 provider kernel 到底是什么”写成正式定义，避免后续把它误解成“宿主内置很多家 provider 适配器”。
- 用户进一步确认：`plugin CLI` 首轮先放主仓库，不单独开新仓库，也不挂在 provider 插件仓库内；插件仓库只承载 CLI 生成出来的 `demo/` 与开发资源。
- AI 已于 `2026-04-18 11` 在主仓库落地第一版 `plugin CLI`：`node scripts/node/plugin.js`，支持 `init / demo init / demo dev`，其中 `demo dev` 当前仍是静态 scaffold。

## 为什么要做

- 要让 `1Flowbase` 真的进入“可配置、可验证、可运行”的模型供应商接入阶段。
- 要在进入供应商接入时就把长期正确边界钉死，避免把不同供应商协议逻辑继续堆进宿主。

## 截止日期

- 无

## 决策背后动机

- 官方插件仓库 `../1flowbase-official-plugins` 负责 Dify 风格 provider 包源码，并由 provider 插件自己实现真实接口接入。
- 宿主安装对象必须是签名后的插件产物，而不是源码目录。
- 主仓库负责：
  - provider plugin 注册发现与 installed registry
  - 插件安装任务、启用和分配
  - `workspace` 级 provider instance
  - 凭据与验证
  - `LLM` 节点绑定
  - 工具与 MCP 执行治理
  - `usage/token` 监控真值
- provider plugin 的发现入口首轮固定为：
  - 官方 registry / artifact storage
  - 本地上传 `pkg`
- provider plugin 必须显式暴露模型发现能力，支持：
  - `static`
  - `dynamic`
  - `hybrid`
- 宿主只在插件加载时注册模型发现能力和静态元信息，不直接把最新模型列表推给应用。
- 最新模型列表按 `provider instance` 按需拉取，并允许宿主做缓存与刷新。
- provider plugin 源码包应显式包含：
  - `i18n/`
  - `readme/`
  - `demo/`
  - `scripts/`
- `i18n/` 负责结构化国际化文案，`readme/` 负责长文档国际化。
- 插件框架应提供统一入口一键生成 demo 页面与本地调试脚手架，至少覆盖 validate、list models、stream 和 usage。
- `plugin CLI` 首轮应作为宿主侧 tooling 放在主仓库，便于与 `contract_version`、runtime bundle、打包规则和 demo 模板同步演进。
- provider 插件仓库不作为 `plugin CLI` 的 source of truth；它只承载被 CLI 生成与维护的 `demo/`、`scripts/`、`i18n/` 和 provider 源码。
- 当前 `plugin CLI` 的真实入口是 `node scripts/node/plugin.js ...`，不是独立二进制，也不是 provider 插件仓库内脚本。
- 当前 `plugin demo dev` 只提供静态 demo 页面与 runner URL 配置位；不应被描述成已打通真实 `plugin-runner` debug runtime。
- 等命令面、产物格式和模板稳定后，再考虑把 `plugin CLI` 拆成独立仓库单独发版。
- provider plugin 的插件包生命周期固定为：
  - `downloaded_or_uploaded -> verified -> installed -> enabled -> assigned`
- provider instance 生命周期固定为：
  - `draft -> ready -> invalid -> disabled`
- 运行时边界固定为：
  - 插件负责“发起请求 / 解析响应 / 归一化流式、tool call、MCP、usage”
  - 宿主负责“执行工具 / 执行 MCP / 写状态 / 写审计 / 写监控”
- 插件安装和升级应走异步任务，前端轮询直到终态；启用 provider plugin 不允许要求整套系统重启，最多只允许 `plugin-runner` 局部 `load / reload`
- 首轮官方只要求一个参考 plugin：
  - `openai_compatible`
- 其他 provider 不作为宿主首轮前置条件，应通过同一 contract 独立接入

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md`
