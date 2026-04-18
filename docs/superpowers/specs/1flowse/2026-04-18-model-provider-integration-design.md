# 1Flowse 模型供应商接入与多协议 Provider Kernel 设计稿

日期：2026-04-18
状态：已确认设计，待用户审阅

关联文档：
- [modules/05-runtime-orchestration/README.md](./modules/05-runtime-orchestration/README.md)
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)
- [2026-04-10-product-design.md](./2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](./2026-04-10-product-requirements.md)

## 1. 文档目标

本文档用于收口 `1Flowse` 第一版模型供应商接入设计，明确：

- 为什么不能只做单一 `OpenAI` 接入，而要直接做多协议 `provider kernel`
- `../1flowse-official-plugins` 与主仓库各自负责什么
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

- `../1flowse-official-plugins` 仍是空仓库，没有任何官方模型供应商插件包
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
- `1Flowse` 只定义标准 contract 与执行治理，provider 插件自己解决大模型接口接入

## 3. 范围与非目标

### 3.1 本稿范围

本稿覆盖：

- `../1flowse-official-plugins` 的模型供应商插件包结构
- 主仓库的官方 provider catalog 读取与缓存
- provider runtime contract
- `plugin-runner` 的最小 provider `load / invoke / stream` 闭环
- `workspace` 级模型供应商实例与凭据管理
- `LLM` 节点的供应商实例与模型选择
- `compiled plan` 对 provider 配置的解析规则
- 一个官方参考 plugin：`openai_compatible`
- 管理台“模型供应商”设置页

### 3.2 非目标

本稿不在当前轮次内解决：

- 插件市场、安装任务、版本升级与卸载保护
- embedding / moderation / speech / tts 的真实执行闭环
- 多租户级 provider marketplace 分发
- provider 用量计费、账单与消耗看板
- 对外公开 API 的 OpenAI-compatible 代理层
- 面向任意第三方代码插件的完整通用沙箱平台

## 4. 模块边界

### 4.1 `08 plugin framework` 负责什么

`08` 在本专题里负责：

- 定义官方 provider 插件包的声明式结构
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

### 5.1 官方插件仓库

`../1flowse-official-plugins` 采用与 `../dify-official-plugins/models/<provider>` 对齐的目录结构：

```text
models/<provider>/
  manifest.yaml
  provider/<provider>.yaml
  provider/<runtime-source>
  models/llm/*.yaml
  _assets/*
```

其中：

- `manifest.yaml` 描述插件元信息、支持的模型类型、runner 元信息
- `provider/*.yaml` 描述品牌、帮助链接、配置表单 schema、模型索引
- `provider/<runtime-source>` 实现真实 provider runtime
- `models/llm/*.yaml` 描述预置模型条目
- `_assets/*` 提供图标与品牌资源

这一轮 `runner.language` 不再只是元信息字段，而是 provider plugin 真正可执行闭环的一部分。

### 5.2 宿主 catalog

主仓库启动时从 `../1flowse-official-plugins` 扫描官方 provider 包，构建只读 catalog：

- `provider_code`
- `protocol`
- `display_name`
- `icon`
- `help url`
- `form schema`
- `predefined models`
- `default base_url`

catalog 是宿主内缓存，不先落数据库。

原因：

- 官方 provider 是宿主已知静态能力，不是用户数据
- 首轮要先打通配置与运行闭环，没必要先做完整安装注册表
- 后续即使改成 DB-backed installed registry，也可以平滑演进

catalog 只负责“声明真值”，不替代 provider runtime 本身。

### 5.3 workspace 供应商实例

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

### 5.4 节点绑定

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

### 6.1 控制面实体

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

### 6.2 状态

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

### 6.3 凭据边界

敏感字段不得混入普通 metadata，至少包括：

- `api_key`
- `access_token`
- `client_secret`
- 自定义 `Authorization` header 中的敏感值

首轮采用应用层加密后写入 PostgreSQL，并使用宿主主密钥解密。

## 7. 协议、contract 与 provider 抽象

### 7.1 协议族

协议族不是品牌名，而是 provider plugin 所实现的接口风格。

`1Flowse` 不把协议族写死在宿主交付范围里，而是要求任何 provider plugin 都必须实现统一 contract。

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

`1Flowse` 需要先定义统一 provider runtime contract，插件只能实现这个 contract，不能自定义运行主协议。

首轮官方只要求提供一个参考实现：`openai_compatible`。

其他 provider 或协议族：

- 可以由官方后续继续补充
- 也可以由第三方按同一 contract 独立实现
- 不应成为宿主首轮上线的前置条件

contract 至少包含：

- 标准输入
- 标准流事件
- 标准最终输出
- 标准能力声明
- 标准错误语义

### 7.4 标准输入

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

### 7.5 标准流事件

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

### 7.6 标准最终输出

provider plugin 在结束时必须返回统一结果，至少包括：

- `final_content`
- `tool_calls`
- `mcp_calls`
- `usage`
- `finish_reason`
- `provider_metadata`

### 7.7 标准能力声明

provider plugin 必须声明自身能力，至少包括：

- `streaming`
- `tool_call`
- `mcp`
- `multimodal`
- `structured_output`

### 7.8 标准错误语义

provider plugin 必须把供应商原始错误归一化为宿主可消费的错误类别，并附带原始摘要。

常见错误类别至少包括：

- `auth_failed`
- `endpoint_unreachable`
- `model_not_found`
- `rate_limited`
- `provider_invalid_response`

## 8. API 设计

首轮控制面接口固定新增：

- `GET /api/console/model-providers/catalog`
  - 返回官方 provider catalog
- `GET /api/console/model-providers`
  - 返回当前 workspace 已配置实例
- `POST /api/console/model-providers`
  - 创建实例
- `PATCH /api/console/model-providers/:id`
  - 更新实例 metadata 与非敏感配置
- `POST /api/console/model-providers/:id/validate`
  - 主动验证凭据与连接
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

- 官方 provider catalog
- 当前 workspace 已配置实例列表

### 9.2 配置体验

配置交互参考 Dify，但遵守当前 1Flowse 页面结构：

- catalog 卡片点击后打开实例配置弹窗或抽屉
- 表单由 `provider schema` 驱动
- 必填项、secret 项、可选项都由 schema 决定
- 保存与验证分离，但保存后必须能一键验证

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

- secret 配置不进入普通列表接口回包
- 普通 `view` 权限只能看到 provider metadata 与状态，不能看到 secret 明文
- `validate` 动作必须走显式 service，并写审计日志
- 删除或禁用被引用 provider 时必须返回冲突错误，不得静默破坏 draft/version
- 运行时错误允许返回可诊断信息，但不得回显完整 secret、完整认证头或完整 endpoint token
- provider plugin 不得直接执行宿主工具与 MCP；它只能声明调用意图，由宿主执行

## 12. 验证策略

后端至少覆盖：

- 官方 provider catalog 扫描与解析
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
- `LLM` 节点实例与模型选择器
- 失效实例错误态

端到端至少覆盖：

- `openai_compatible` 一条最小闭环
  - 设置页录入 `base_url + api_key`
  - 实例校验通过
  - `LLM` 节点绑定实例与模型
  - provider plugin 成功发起请求
  - 流式事件、tool call、usage 能被宿主正确消费

## 13. 实施顺序建议

建议固定按以下顺序推进：

1. 定义 provider runtime contract 与标准事件流
2. 先做 `plugin-runner` 的最小 provider `load / invoke / stream` 闭环
3. 初始化 `../1flowse-official-plugins` 并落 `openai_compatible` 参考 plugin 包结构
4. 主仓库实现 catalog loader 与 schema 解析
5. 落数据库实体、控制面 service 与 route
6. 落 `Settings / 模型供应商` 页面
7. 升级 `LlmModelField` 到真实 provider-aware 选择器
8. 在编译阶段接入 provider 校验
9. 先用 `openai_compatible` 打通真实链路
10. 其他 provider 后续通过同一 contract 独立接入，不要求宿主改边界

## 14. 结论

本专题的核心决策不是“先接哪个品牌”，而是：

- 从第一天就把模型供应商做成多协议 `provider kernel`
- 官方插件仓库采用 Dify 风格静态声明结构
- `1Flowse` 只定义标准 contract、执行治理和监控真值
- provider plugin 自己解决大模型接口接入，并显式暴露 `streaming / tool call / MCP / usage`
- 首轮只要求一个官方参考 plugin `openai_compatible`，不把一批官方 provider 绑成宿主首发范围

这样可以让 `1Flowse` 在进入模型供应商接入阶段时，先把长期正确的架构边界定下来，而不是把供应商协议差异写死在宿主里。
