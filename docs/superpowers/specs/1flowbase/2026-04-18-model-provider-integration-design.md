# 1flowbase 模型供应商接入与多协议 Provider Kernel 设计稿

日期：2026-04-18
状态：已确认设计，待用户审阅

关联文档：
- [modules/05-runtime-orchestration/README.md](./modules/05-runtime-orchestration/README.md)
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)
- [2026-04-10-product-design.md](./2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](./2026-04-10-product-requirements.md)

## 1. 文档目标

本文档用于收口 `1flowbase` 第一版模型供应商接入设计，明确：

- 为什么不能只做单一 `OpenAI` 接入，而要直接做多协议 `provider kernel`
- `../1flowbase-official-plugins` 与主仓库各自负责什么
- provider plugin 的产物、注册发现与安装生命周期如何定义
- provider plugin 的模型发现与模型列表获取如何定义
- provider plugin 的国际化目录与 demo 脚手架如何定义
- `workspace` 级供应商实例、凭据与节点绑定的真实数据边界
- `LLM` 节点如何从当前静态 `OpenAI` 下拉升级为真实可配置供应商选择
- `05 runtime orchestration` 与 `08 plugin framework` 在本专题里的落点与边界

## 2. 背景与问题

当前仓库已经进入 `05 runtime orchestration`，具备：

- `draft -> compiled plan`
- 单节点 `debug preview`
- `application logs`
- `node last run`

但当前运行链路对“模型供应商可用”仍然是隐含前提，真实系统里还缺失以下关键真值：

- `../1flowbase-official-plugins` 仍是空仓库，没有任何官方模型供应商插件包
- 主仓库没有“供应商 catalog / workspace 已配置供应商实例 / 凭据 / 可用模型目录”闭环
- 前端 `LLM` 节点的模型选择仍是硬编码 `openai + 静态模型列表`
- `plugin-runner` 只有宿主骨架，没有 `load / unload / invoke` 闭环

如果这轮只做“接一个 OpenAI”，后续要补 `Moonshot`、`SiliconFlow`、`Azure OpenAI`、`Anthropic`、`Gemini` 时，必然会返工：

- 数据结构会从“单一 provider”改成“多协议实例”
- 前端表单会从固定字段改成 schema-driven
- 运行时边界会从“宿主直接接某一家接口”改成“provider plugin 实现统一 contract”

因此这轮必须直接把内核做成：

- 多协议 `provider kernel`
- 开放统一 `provider runtime contract`
- 官方只提供一个参考 plugin：`openai_compatible`
- `1flowbase` 只定义标准 contract 与执行治理，provider 插件自己解决大模型接口接入

### 2.1 多协议 `provider kernel` 的正式定义

这里的“多协议 `provider kernel`”不是指：

- 宿主内置很多家 provider 适配器
- 首轮必须官方一次接很多 provider

更准确地说，它是 `1flowbase` 提供的一套统一运行内核，用来让不同协议风格的 `provider plugin` 按同一规则接入、发现模型、发起调用、输出流式事件，并接受宿主统一治理。

它至少包括五层：

- 插件层
  - 注册发现、安装产物、启用、分配
- 实例层
  - `provider instance`、凭据、验证、状态
- 模型层
  - 模型发现、缓存、刷新
- 调用层
  - 统一输入、统一事件、统一输出
- 治理层
  - tool / MCP 执行、监控、审计、错误语义

“多协议”的重点也不是“数量多”，而是宿主从第一天就不假设所有 provider 都长得像 `OpenAI-compatible`。

### 2.2 宿主与插件职责对照

| 主题 | `1flowbase` 宿主 / provider kernel | `provider plugin` |
| --- | --- | --- |
| 注册发现 | 发现插件版本、安装产物、分配给 workspace | 提供 manifest、schema、能力声明 |
| 安装启用 | 校验、安装、启用、任务状态、局部 reload | 提供可安装产物 |
| 实例配置 | 管理 `provider instance`、凭据、验证入口 | 定义需要哪些配置字段 |
| 模型发现 | 按 `provider instance` 拉模型、缓存、刷新 | 实现 `static / dynamic / hybrid` 模型发现 |
| 协议转换 | 不关心各家协议细节 | 把真实供应商协议转成统一 contract |
| 调用输入 | 定义标准输入结构 | 把标准输入翻译成真实请求 |
| 流式输出 | 消费统一事件流 | 解析供应商响应并输出统一事件 |
| Tool / MCP | 真正执行 tool、MCP、权限控制、审计 | 只声明调用意图，不直接执行 |
| 监控计费 | 聚合 `usage/token`、写运行态 | 显式暴露 usage 真值 |
| 错误治理 | 定义统一错误类别、回写诊断 | 把原始错误归一化 |

## 3. 范围与非目标

### 3.1 本稿范围

本稿覆盖：

- `../1flowbase-official-plugins` 的模型供应商源码包结构
- provider plugin 的 `i18n/` 与 `demo/` 目录约定
- provider plugin 安装产物、版本标识与 CI/CD 边界
- provider plugin 的注册发现、安装任务与本地装载边界
- provider runtime contract
- provider plugin 的模型发现 contract 与缓存策略
- `plugin-runner` 的最小 provider `load / invoke / stream` 闭环
- provider plugin 与 `workspace provider instance` 的双层生命周期
- `workspace` 级模型供应商实例与凭据管理
- `LLM` 节点的供应商实例与模型选择
- `compiled plan` 对 provider 配置的解析规则
- 一个官方参考 plugin：`openai_compatible`
- 管理台“模型供应商”设置页

### 3.2 非目标

本稿不在当前轮次内解决：

- embedding / moderation / speech / tts 的真实执行闭环
- provider 用量计费、账单与消耗看板
- 对外公开 API 的 OpenAI-compatible 代理层
- 面向任意第三方代码插件的完整通用沙箱平台
- 完整插件市场首页、推荐排序与搜索体系
- 自动升级策略、灰度升级和大规模版本治理 UI
- 面向任意第三方插件语言运行时的完整通用构建平台

## 4. 模块边界

### 4.1 `08 plugin framework` 负责什么

`08` 在本专题里负责：

- 定义 provider plugin 的源码包与安装产物结构
- 定义 provider plugin 的国际化资源目录与 demo 脚手架规范
- 定义 provider plugin 的注册发现、安装任务与已安装注册表边界
- 定义 provider runtime contract
- 提供 `plugin-runner` 的最小 provider `load / invoke / stream` 闭环
- 明确 `provider plugin` 不直接扩展 HTTP 接口，只通过标准 contract 与宿主通信
- 保持插件来源与信任分级边界

这一轮会把 `08` 前移到“可跑 provider plugin”的最小可用状态，但不推进到完整 marketplace。

### 4.2 `05 runtime orchestration` 负责什么

`05` 在本专题里负责：

- 消费已经解析好的 `provider instance + model`
- 消费 provider plugin 输出的标准化流事件与最终结果
- 接住 `tool call / MCP / usage / finish reason` 等运行时语义
- 在 `compiled plan` 中保留运行所需最小 provider 元信息
- 在节点执行失败时输出 provider 相关诊断

`05` 不负责 provider 配置管理、凭据存储和 catalog 管理。

### 4.3 边界结论

这轮采用“provider plugin 负责接供应商协议，宿主负责 contract 与执行治理”的双层方案：

- 插件包既负责定义 `provider` 的品牌、schema、默认地址和模型目录，也负责实现真实接口接入
- 主仓库负责把定义转换成可配置的 `workspace` 供应商实例
- 运行时通过 `plugin-runner` 调用 provider plugin
- 插件负责发起请求、解析流式返回、归一化 tool call / MCP / usage
- 宿主负责执行工具、执行 MCP、落 checkpoint、写监控、做权限与审计

这样做的原因是：

- 这才是稳定的长期边界，避免把各家协议差异写死在主仓库
- 后续监控、计费、可观测性都依赖 provider plugin 主动暴露 `usage/token` 与事件流
- `tool call / MCP / streaming` 差异必须由 provider 插件收敛后，再交给宿主消费

## 5. 总体方案

### 5.1 官方源码仓库

`../1flowbase-official-plugins` 采用与 `../dify-official-plugins/models/<provider>` 对齐的目录结构：

```text
models/<provider>/
  manifest.yaml
  provider/<provider>.yaml
  provider/<runtime-source>
  models/llm/*.yaml
  i18n/*.json
  readme/README_*.md
  demo/*
  scripts/*
  _assets/*
```

其中：

- `manifest.yaml` 描述插件元信息、支持的模型类型、runner 元信息
- `provider/*.yaml` 描述品牌、帮助链接、配置表单 schema、模型索引
- `provider/<runtime-source>` 实现真实 provider runtime
- `models/llm/*.yaml` 描述预置模型条目
- `i18n/*.json` 存放插件元数据、表单字段、模型说明等国际化资源
- `readme/README_*.md` 存放多语言文档
- `demo/*` 存放本地调试用的简单 demo 页面与示例资源
- `scripts/*` 存放由宿主侧 `plugin CLI` 生成的插件本地辅助脚本与 demo 启动脚本
- `_assets/*` 提供图标与品牌资源

这一轮 `runner.language` 不再只是元信息字段，而是 provider plugin 真正可执行闭环的一部分。

这里必须明确：

- `../1flowbase-official-plugins` 是源码仓库，不是宿主直接运行的安装对象
- 它服务于插件作者、CI 构建和官方发布，不应由 `1flowbase` 运行时直接扫描源码目录作为正式安装来源
- `plugin CLI` 首轮先放主仓库作为宿主侧 tooling，插件仓库不负责维护其 source of truth

### 5.1.1 国际化资源目录

参考 `Dify` 已有的多语言 `README` 和内联 `I18nObject` 思路，`1flowbase` 进一步要求 provider plugin 拥有专门的 `i18n/` 目录，而不是把国际化文案散落在 `manifest / provider / model yaml` 中。

正式规则：

- 插件源码包必须包含 `i18n/`
- 至少包含一个默认语言文件，例如 `i18n/en_US.json`
- 推荐同时提供 `i18n/zh_Hans.json`
- `readme/` 只负责长文档国际化，不替代 `i18n/` 的结构化文案职责

`i18n/` 至少应覆盖：

- plugin label
- plugin description
- provider label
- 字段 label / placeholder / help
- model label / description
- demo 页面中的调试文案

设计基线建议为：

- `manifest / provider / model yaml` 内优先存稳定 `i18n_key`
- 宿主或插件运行时再按 locale 解析对应文案
- 若缺失 locale，则回退默认语言

### 5.1.2 Demo 页面与脚手架

参考 `Dify` 已经具备的 `plugin init`、`module append` 和开发 `GUIDE`，`1flowbase` 还应额外提供“一键生成简单 demo 页面”的统一入口。

这条能力必须满足：

- 可以是命令，也可以是脚本
- 但对插件作者应表现为一个稳定入口，而不是手工复制模板

当前第一版已在主仓库内落地为：

- `node scripts/node/plugin.js init <plugin-path>`
- `node scripts/node/plugin.js demo init <plugin-path>`
- `node scripts/node/plugin.js demo dev <plugin-path> --port 4310`

首轮命令面至少提供：

- `plugin init`
  - 生成 provider plugin 基础源码结构
- `plugin demo init <plugin-path>`
  - 生成本地 demo 页面和调试脚手架
- `plugin demo dev <plugin-path>`
  - 启动 demo 页面并预留本地 `plugin-runner` URL 配置位

首轮先不单独拆新仓库，而是在主仓库内提供宿主侧 tooling。最小落点可先固定为：

- `scripts/node/plugin.js`
- `scripts/node/plugin/core.js`

当前正确口径：

- `plugin init` 已生成 provider 插件源码骨架
- `plugin demo init` 已生成本地静态 demo 页面和辅助配置文件
- `plugin demo dev` 已通过 Node 内建静态服务提供 demo
- 真实 `plugin-runner` debug runtime 握手与 `load / invoke / stream` 闭环暂未打通；当前页面只保留 runner URL 配置位与后续接线边界

后续若命令面、产物格式和模板稳定，再把这组能力拆成独立 `plugin CLI` 仓库单独发版。

这个 demo 页面至少要能验证：

- provider instance 配置录入
- validate
- list models
- 选择模型
- 发起简单 prompt
- 流式输出
- tool call / MCP 事件
- usage / token 消耗

### 5.2 安装产物

`1flowbase` 真正安装和运行的是 provider plugin 产物，而不是源码目录。

安装产物至少包含：

- `manifest`
- provider schema
- model index
- `i18n` resources
- runtime bundle
- 依赖冻结信息
- `checksum`
- `signature`
- `contract_version`

产物文件名建议固定为：

```text
<vendor>@<plugin_name>@<version>@<sha256>.1flowbasepkg
```

例如：

```text
1flowbase@openai_compatible@0.1.0@<sha256>.1flowbasepkg
```

这样做的原因是：

- `version` 用于语义化版本治理
- `sha256` 用于精确锁定产物，避免同版本漂移
- 宿主可以在不接触源码仓库的前提下做下载、校验、安装与升级

以下目录默认不进入正式运行时安装包：

- `demo/`
- 开发态 `scripts/`

原因是它们属于插件作者本地调试与脚手架资源，不属于宿主运行 provider plugin 所需最小闭包。

### 5.3 注册发现与来源

provider plugin 的发现入口首轮固定为两种：

- 官方 registry / artifact storage
- 本地上传 `pkg`

不把以下入口作为首轮正式能力：

- 直接从源码目录安装
- 直接从任意 Git 仓库拉源码安装
- 安装时在线临时拉第三方依赖

宿主发现到的 provider plugin 元信息至少包括：

- `provider_code`
- `plugin_id`
- `plugin_version`
- `contract_version`
- `protocol`
- `display_name`
- `icon`
- `help url`
- `form schema`
- `predefined models`
- `default base_url`
- `download_url`
- `checksum`
- `signature_status`

其中：

- registry 负责“有哪些版本可用”
- installed registry 负责“宿主当前装了什么”
- workspace assignment 负责“哪些 workspace 可以使用”
- provider instance 负责“用户具体配了什么凭据和地址”

### 5.4 模型发现与模型列表来源

provider plugin 必须提供模型发现能力，但这里的“注册”不能理解成“插件加载时把一份最新模型列表推给应用”。

正确边界应为：

- 插件加载时注册的是“模型发现能力”和静态元信息
- 真正可用于某个 `workspace provider instance` 的模型列表，按需由宿主向插件拉取

原因是最新模型列表往往依赖：

- `base_url`
- credentials / account entitlement
- region / deployment
- 自定义网关实现

因此模型列表不能只在插件级静态确定，而必须允许做到 provider instance 级解析。

provider plugin 的模型发现模式固定为三类：

- `static`
  - 完全来自插件包内的 `models/llm/*.yaml`
- `dynamic`
  - 完全来自插件 runtime 的模型发现接口
- `hybrid`
  - 先提供静态默认模型，再用 runtime 动态模型覆盖或补充

首轮建议允许三种模式都存在，但官方参考 plugin `openai_compatible` 至少要支持：

- `hybrid`

### 5.5 模型列表缓存与刷新

宿主不维护一份“全局永久真值模型注册表”，而是维护 provider instance 级缓存。

原因：

- 最新模型列表可能变化频繁
- 不同 instance 对可见模型的返回可能不同
- 频繁直连供应商接口会增加延迟和额度消耗

建议最小缓存单元为：

- `provider_instance_id`
- `models_json`
- `source`
  - `static / dynamic / hybrid`
- `fetched_at`
- `expires_at`
- `last_fetch_status`
- `last_fetch_message`

交互规则固定为：

- 用户打开模型供应商详情页时，可请求最新模型列表
- 用户在 `LLM` 节点打开实例对应模型选择器时，可请求最新模型列表
- 若缓存仍新鲜，可先回显缓存
- 若缓存过期，可由宿主触发后台刷新，必要时也允许用户手动强制刷新

### 5.6 CI/CD 与依赖策略

provider plugin 的 CI/CD 应固定分为两段：

- 源码仓库 CI
- 产物发布 CD

推荐流程：

1. 检测变更的 provider plugin
2. 校验 `manifest / schema / version`
3. 校验 `i18n/` 资源完整性与默认语言回退
4. 生成或校验 demo 脚手架可启动
5. 构建 runtime bundle
6. 校验依赖锁定
7. 运行插件级测试
8. 打包为 `.1flowbasepkg`
9. 对产物做 `checksum / signature`
10. 上传到官方 artifact storage，并写入 registry 元数据

依赖策略固定为：

- 开发态允许在源码仓库里保留语言原生依赖定义与 lockfile
- 生产安装态不应再现场 `pip install` 或 `npm install`
- 依赖应在 CI 构建产物时被冻结并打包

这样做的原因是：

- 安装可重复
- 不依赖线上包源即时可用
- 更容易做签名校验、审计和回滚

### 5.7 已安装注册表与本地目录

宿主侧至少要维护一份已安装注册表，而不是只靠临时内存缓存。

首轮建议最小实体包括：

- `plugin_installations`
- `plugin_assignments`
- `plugin_tasks`

宿主本地目录建议固定拆为三层：

- `plugin-packages/`
  - 保存原始安装包缓存
- `plugin-installed/<plugin>/<version>/`
  - 保存解压后的只读安装目录
- `plugin-working/<installation-id>/`
  - 保存运行时工作目录

`plugin-runner` 只从安装目录和工作目录加载插件，不直接消费源码目录。

### 5.8 插件类型与生效范围

provider plugin 在插件体系中的固定分类是：

- 种类：`runtime extension`
- 来源与信任分轴表达：
  - `source_kind`: `official_registry / mirror_registry / uploaded / filesystem_dropin`
  - `trust_level`: `verified_official / checksum_only / unverified`
- 生效范围：`host 安装`、`workspace 分配`、`node 显式选择`

它不属于：

- `host-extension`
- 普通 `capability plugin`

原因是：

- 它不应扩展系统级 HTTP 接口
- 它也不是一个安装即自动被节点消费的普通能力插件
- 它挂载在宿主预定义的 `LLM provider runtime slot` 上

### 5.9 插件包与实例的双层生命周期

这里必须明确区分两个对象：

- 用户下载、上传、启用的是“插件包”
- 用户真正配置和使用的是“provider instance”

#### 插件包生命周期

插件包生命周期首轮固定为：

- `downloaded_or_uploaded`
- `verified`
- `installed`
- `enabled`
- `assigned`

含义：

- `downloaded_or_uploaded`
  - 已拿到安装包，但还未校验
- `verified`
  - 已通过 `checksum / signature / contract_version / manifest` 校验
- `installed`
  - 已解压并写入 installed registry
- `enabled`
  - 已允许 `plugin-runner` 局部加载
- `assigned`
  - 已授权给某个 `workspace` 使用

#### provider instance 生命周期

provider instance 生命周期固定为：

- `draft`
- `ready`
- `invalid`
- `disabled`

也就是：

- 插件包解决“这个 provider runtime 能不能被系统使用”
- provider instance 解决“这个 workspace 有没有把它真正配好”

### 5.10 安装、启用与任务模型

插件安装和升级不应阻塞同步 HTTP 请求，而应走异步任务。

首轮推荐任务状态至少包括：

- `pending`
- `running`
- `success`
- `failed`
- `canceled`
- `timed_out`

前端轮询终止条件固定为：

- 进入任何终态
- 任务不存在

安装 / 升级任务至少要能承载：

- 下载或接收安装包
- 校验签名和哈希
- 解压到安装目录
- 写已安装注册表
- 通知 `plugin-runner` 局部 `load / reload`
- 记录错误信息与最终状态

### 5.11 热加载边界

启用 provider plugin 不应要求重启整个系统。

正式规则固定为：

- 配置 provider instance：不重启
- 验证 provider instance：不重启
- 安装 provider plugin：不重启整个系统
- 启用 provider plugin：不重启整个系统

允许的最重动作只有：

- `plugin-runner` 级别局部 `load / reload`

### 5.12 workspace 供应商实例

真正入库的不是“provider 定义”，而是“workspace 供应商实例”。

一个 `workspace` 可以配置多个实例，例如：

- `OpenAI Production`
- `OpenAI Staging`
- `OneAPI Gateway`

实例至少包含：

- 归属 `workspace_id`
- `provider_code`
- `protocol`
- 用户可编辑的 `display_name`
- 非敏感配置
- 加密后的 secret 配置
- 当前状态与最近验证结果

### 5.13 节点绑定

`LLM` 节点不再只保存一个裸 `model` 字符串，而是改为：

- `config.provider_instance_id`
- `config.model`

其中：

- `provider_instance_id` 决定这次运行走哪个供应商实例
- `model` 只表示该实例下的模型名

这样才能支持：

- 同一个 `workspace` 下多个 OpenAI-compatible 网关并存
- 同名模型在不同实例上的独立配置
- 后续 provider 级重试、观测和审计

## 6. 数据模型

### 6.1 插件框架实体

首轮最小插件框架实体建议包括：

- `plugin_installations`
- `plugin_assignments`
- `plugin_tasks`
- `provider_instance_model_catalog_cache`

其中：

- `plugin_installations`
  - 记录插件唯一标识、版本、来源、校验状态、启用状态、安装路径
- `plugin_assignments`
  - 记录某个 `workspace` 可见哪些 provider plugin
- `plugin_tasks`
  - 记录安装、升级、卸载、启用、禁用这类异步任务状态
- `provider_instance_model_catalog_cache`
  - 记录 provider instance 级模型列表缓存、来源与刷新状态

### 6.2 控制面实体

首轮新增两个核心实体：

- `model_provider_instances`
- `model_provider_instance_secrets`

建议字段如下：

#### `model_provider_instances`

- `id`
- `workspace_id`
- `provider_code`
- `protocol`
- `display_name`
- `status`
- `config_json`
- `last_validated_at`
- `last_validation_status`
- `last_validation_message`
- `created_by`
- `created_at`
- `updated_at`

#### `model_provider_instance_secrets`

- `provider_instance_id`
- `encrypted_secret_json`
- `secret_version`
- `updated_at`

### 6.3 状态

实例状态首轮固定为：

- `draft`
- `ready`
- `invalid`
- `disabled`

规则：

- 新建后默认 `draft`
- 校验通过进入 `ready`
- 校验失败进入 `invalid`
- 管理员手动停用进入 `disabled`

只有 `ready` 实例进入 `LLM` 节点默认可选列表。

### 6.4 凭据边界

敏感字段不得混入普通 metadata，至少包括：

- `api_key`
- `access_token`
- `client_secret`
- 自定义 `Authorization` header 中的敏感值

首轮采用应用层加密后写入 PostgreSQL，并使用宿主主密钥解密。

## 7. 协议、contract 与 provider 抽象

### 7.1 协议族

协议族不是品牌名，而是 provider plugin 所实现的接口风格。

`1flowbase` 不把协议族写死在宿主交付范围里，而是要求任何 provider plugin 都必须实现统一 contract。

当前已知常见协议族包括：

- `openai_compatible`
- `azure_openai`
- `anthropic_messages`
- `google_gemini`

这些是常见例子，不是首轮必须全部随宿主一起交付的硬范围。

### 7.2 provider 与 protocol 的关系

- 一个 `provider` 必须绑定一个主协议
- 一个协议可以承接多个 `provider`

例如，未来可以存在：

- `openai` -> `openai_compatible`
- `moonshot` -> `openai_compatible`
- `siliconflow` -> `openai_compatible`

这让系统能同时满足：

- 品牌级图标、帮助文案、默认地址
- 协议级实现复用

### 7.3 Provider Runtime Contract

`1flowbase` 需要先定义统一 provider runtime contract，插件只能实现这个 contract，不能自定义运行主协议。

首轮官方只要求提供一个参考实现：`openai_compatible`。

其他 provider 或协议族：

- 可以由官方后续继续补充
- 也可以由第三方按同一 contract 独立实现
- 不应成为宿主首轮上线的前置条件

contract 至少包含：

- 模型发现接口
- 标准输入
- 标准流事件
- 标准最终输出
- 标准能力声明
- 标准错误语义

### 7.4 模型发现接口

provider plugin 必须显式声明模型发现能力，而不是只把模型列表埋在静态文件里。

建议 contract 至少包括：

- `model_discovery_mode`
  - `static / dynamic / hybrid`
- `list_models(provider_instance, refresh_policy)`
  - 返回该 instance 当前可见模型列表
- `supports_model_fetch_without_credentials`
  - 标明是否允许在未配置 credentials 时获取模型列表

其中：

- `static`
  - 宿主可直接使用插件包中的模型索引
- `dynamic`
  - 宿主必须通过插件 runtime 调 `list_models`
- `hybrid`
  - 宿主先显示静态默认列表，再叠加动态结果

返回结果至少包含：

- `model_id`
- `display_name`
- `source`
  - `static / dynamic`
- `supports_streaming`
- `supports_tool_call`
- `supports_multimodal`
- `context_window`
- `max_output_tokens`
- `provider_metadata`

这里要强调：

- “模型供应商插件加载完成”不等于“最新模型列表已经推送给应用”
- 正确语义是“插件已注册模型发现能力，宿主可按需向它拉最新列表”

### 7.5 标准输入

provider plugin 接收的标准输入至少包括：

- `provider_instance_id`
- `provider_code`
- `protocol`
- `model`
- `messages`
- `system`
- `tools`
- `mcp_bindings`
- `response_format`
- `temperature / top_p / max_tokens / seed`
- `trace_context`
- `run_context`

其中：

- 插件负责把这些标准输入翻译为对应供应商的真实请求格式
- 宿主不直接拼接各家协议特有字段

### 7.6 标准流事件

provider plugin 在流式执行中必须输出统一事件流，至少包括：

- `text_delta`
- `reasoning_delta`
- `tool_call_delta`
- `tool_call_commit`
- `mcp_call_delta`
- `mcp_call_commit`
- `usage_delta`
- `usage_snapshot`
- `finish`
- `error`

其中：

- `tool_call_*` 由插件负责把供应商私有格式归一化
- `mcp_call_*` 由插件负责把供应商协议中的 MCP 调用语义归一化
- `usage_*` 必须显式暴露，至少能承载输入、输出、推理、缓存等 token 维度

### 7.7 标准最终输出

provider plugin 在结束时必须返回统一结果，至少包括：

- `final_content`
- `tool_calls`
- `mcp_calls`
- `usage`
- `finish_reason`
- `provider_metadata`

### 7.8 标准能力声明

provider plugin 必须声明自身能力，至少包括：

- `streaming`
- `tool_call`
- `mcp`
- `multimodal`
- `structured_output`

### 7.9 标准错误语义

provider plugin 必须把供应商原始错误归一化为宿主可消费的错误类别，并附带原始摘要。

常见错误类别至少包括：

- `auth_failed`
- `endpoint_unreachable`
- `model_not_found`
- `rate_limited`
- `provider_invalid_response`

## 8. API 设计

首轮插件框架接口建议最小新增：

- `GET /api/console/plugins/catalog?kind=provider`
  - 返回 registry 中可发现的 provider plugin 版本
- `POST /api/console/plugins/upload/pkg`
  - 上传本地 provider plugin 产物
- `POST /api/console/plugins/install/registry`
  - 从官方 registry 安装指定版本
- `POST /api/console/plugins/:installation_id/enable`
  - 启用已安装 provider plugin
- `POST /api/console/plugins/:installation_id/assign`
  - 分配 provider plugin 给 workspace
- `GET /api/console/plugins/tasks`
  - 查询插件任务列表
- `GET /api/console/plugins/tasks/:task_id`
  - 查询单个插件任务状态

首轮控制面接口固定新增：

- `GET /api/console/model-providers/catalog`
  - 返回当前 `workspace` 可见的 provider catalog
- `GET /api/console/model-providers`
  - 返回当前 workspace 已配置实例
- `POST /api/console/model-providers`
  - 创建实例
- `PATCH /api/console/model-providers/:id`
  - 更新实例 metadata 与非敏感配置
- `POST /api/console/model-providers/:id/validate`
  - 主动验证凭据与连接
- `GET /api/console/model-providers/:id/models`
  - 返回该 provider instance 当前可用模型列表
- `POST /api/console/model-providers/:id/models/refresh`
  - 强制刷新该 provider instance 的模型列表缓存
- `DELETE /api/console/model-providers/:id`
  - 删除未被引用的实例
- `GET /api/console/model-providers/options`
  - 返回供 `LLM` 节点选择的 `provider instance + models`

删除规则：

- 若实例仍被任何 draft/version 引用，禁止删除
- 可后续补“禁用替代删除”，但这轮先用显式引用保护

## 9. 前端设计

### 9.1 设置页

在 `Settings` 下新增一个 section：

- key: `model-providers`
- path: `/settings/model-providers`

权限键采用现有 `state_model` 资源语义，至少需要：

- `state_model.view.all`
- `state_model.manage.all`

页面固定分两块：

- 当前 `workspace` 可见的 provider catalog
- 当前 workspace 已配置实例列表

### 9.2 配置体验

配置交互参考 Dify，但遵守当前 1flowbase 页面结构：

- catalog 卡片点击后打开实例配置弹窗或抽屉
- 表单由 `provider schema` 驱动
- 必填项、secret 项、可选项都由 schema 决定
- 保存与验证分离，但保存后必须能一键验证
- 若 provider plugin 支持模型发现，则实例详情页应允许查看和刷新该实例的最新模型列表

首轮表单必须支持：

- `display_name`
- `base_url`
- `api_key`
- `organization / project`
- `api_version`
- `validate_model`
- 可选 `default_headers`

### 9.3 LLM 节点

`LlmModelField` 升级为两段式选择：

- 先选供应商实例
- 再选模型

规则：

- 模型列表按实例分组
- 打开实例模型选择器时，宿主应优先读取该 instance 的模型缓存，并在必要时向 provider plugin 拉取最新列表
- 非 `ready` 实例默认不展示在普通选择器中
- 若当前节点引用的实例已失效，面板必须显示正式错误态
- “模型供应商设置”按钮跳转到 `/settings/model-providers`

当前 `web/app/src/features/agent-flow/lib/model-options.ts` 的硬编码列表应在本专题内下线。

## 10. 编译与运行时消费

### 10.1 编译阶段

`compiled plan` 不直接快照 secret，但必须解析并冻结最小运行元信息：

- `provider_instance_id`
- `provider_code`
- `protocol`
- `model`

编译阶段校验：

- 节点是否绑定了 provider instance
- 该实例是否存在且属于当前 `workspace`
- 实例状态是否为 `ready`
- 所选模型是否在允许目录内，或是否符合 provider 的自定义模型规则

任一条件不满足时，直接产出 compile issue，阻止形成可运行 plan。

### 10.2 运行阶段

运行时流程固定为：

1. 根据 `provider_instance_id` 读取实例 metadata
2. 解密 secret 配置
3. 解析 provider plugin 与其 runtime 能力
4. 通过 `plugin-runner` 调用 provider plugin
5. 消费 provider plugin 输出的标准化流事件
6. 宿主在 `tool_call_commit / mcp_call_commit` 后执行真实工具或 MCP
7. 把 `usage / finish / error` 写入运行态与监控事实

边界固定为：

- 插件负责“发起请求 / 解析响应 / 归一化事件”
- 宿主负责“执行工具 / 执行 MCP / 落状态 / 写审计 / 写监控”

### 10.3 失败语义

运行失败时必须在 `node_run` 诊断中保留：

- `provider_instance_id`
- `provider_code`
- `protocol`
- 归一化错误类别
- 原始 provider 响应摘要

常见错误类别至少区分：

- `auth_failed`
- `endpoint_unreachable`
- `model_not_found`
- `rate_limited`
- `provider_invalid_response`

### 10.4 Usage 与监控

provider plugin 必须显式暴露消耗事实，因为后续监控、计费、优化都依赖这些真值。

首轮至少要求：

- 输入 token
- 输出 token
- 推理 token
- 缓存命中 token
- 总 token
- 供应商原始 usage 摘要

这些 usage 真值必须能进入：

- `node_run`
- `flow_run` 聚合
- 后续应用级 monitoring
- 未来 provider 成本与消耗分析

## 11. 安全与治理

治理规则固定如下：

- provider plugin 安装对象必须是产物，不得直接执行上传源码目录
- `verified` 前不得进入 `installed / enabled`
- secret 配置不进入普通列表接口回包
- 普通 `view` 权限只能看到 provider metadata 与状态，不能看到 secret 明文
- `validate` 动作必须走显式 service，并写审计日志
- 删除或禁用被引用 provider 时必须返回冲突错误，不得静默破坏 draft/version
- 运行时错误允许返回可诊断信息，但不得回显完整 secret、完整认证头或完整 endpoint token
- provider plugin 不得直接执行宿主工具与 MCP；它只能声明调用意图，由宿主执行
- provider plugin 启用与升级不允许要求整套系统重启；最多只允许 `plugin-runner` 局部重载

## 12. 验证策略

后端至少覆盖：

- provider plugin 产物校验
- installed registry 与 assignment 读写
- 插件安装任务状态流转
- `i18n/` 默认语言与回退规则
- provider instance 模型列表获取与缓存失效策略
- provider schema 解析
- provider runtime contract 校验
- `plugin-runner` provider `load / invoke / stream` 测试
- 实例 CRUD
- secret 加密与解密
- validate 接口
- compile-time provider 校验
- 统一事件流与 usage 归一化测试

前端至少覆盖：

- `Settings` 新 section 路由与可见性
- provider catalog 与实例列表
- schema-driven provider 配置表单
- 插件国际化文案加载与 fallback
- provider instance 模型列表查看与刷新
- `LLM` 节点实例与模型选择器
- 失效实例错误态

端到端至少覆盖：

- `openai_compatible` 一条最小闭环
  - 从 registry 安装或上传 `pkg`
  - 插件任务进入终态
  - provider plugin 被启用并分配到 workspace
  - 本地 demo 页面可一键启动
  - 设置页录入 `base_url + api_key`
  - 用户点击模型供应商或模型选择器时能拿到最新模型列表
  - 实例校验通过
  - `LLM` 节点绑定实例与模型
  - provider plugin 成功发起请求
  - 流式事件、tool call、usage 能被宿主正确消费

## 13. 实施顺序建议

建议固定按以下顺序推进：

1. 定义 provider plugin 产物结构、唯一标识与注册发现边界
2. 定义 `i18n/`、`readme/`、`demo/`、`scripts/` 的源码目录规范
3. 定义插件安装任务、installed registry 与 assignment 最小闭环
4. 定义 provider runtime contract、model discovery contract 与标准事件流
5. 先做 `plugin-runner` 的最小 provider `load / invoke / stream` 闭环
6. 初始化 `../1flowbase-official-plugins` 并落 `openai_compatible` 参考 plugin 源码、i18n 与 demo 脚手架
7. 主仓库实现 schema 解析、provider instance 实体、控制面 service 与 route
8. 落 `Settings / 模型供应商` 页面
9. 升级 `LlmModelField` 到真实 provider-aware 选择器
10. 在编译阶段接入 provider 校验
11. 先用 `openai_compatible` 打通真实链路
12. 其他 provider 后续通过同一 contract 独立接入，不要求宿主改边界

## 14. 结论

本专题的核心决策不是“先接哪个品牌”，而是：

- 从第一天就把模型供应商做成多协议 `provider kernel`
- 官方插件仓库采用 Dify 风格源码结构，但宿主安装对象是签名后的插件产物
- provider plugin 源码结构应显式包含 `i18n/`，并提供统一入口一键生成简单 demo 页面
- provider plugin 的注册发现、安装任务、启用分配和 provider instance 生命周期都必须显式建模
- `1flowbase` 只定义标准 contract、执行治理和监控真值
- provider plugin 自己解决大模型接口接入，并显式暴露 `streaming / tool call / MCP / usage`
- 首轮只要求一个官方参考 plugin `openai_compatible`，不把一批官方 provider 绑成宿主首发范围

这样可以让 `1flowbase` 在进入模型供应商接入阶段时，先把长期正确的架构边界定下来，而不是把供应商协议差异写死在宿主里。
