# 08 插件体系

日期：2026-04-18
状态：规则已确认，最小实现范围已收口，能力仍未完备

## 讨论进度

- 状态：`rules_confirmed_minimum_runtime_defined`
- 完成情况：插件来源分级、消费边界、`plugin-runner` 宿主方向、provider plugin 生命周期、注册发现与安装产物边界已收敛。
- 最后更新：2026-04-18 08 CST

## 本模块范围

- 插件来源与信任分级
- 插件消费方式与绑定边界
- provider plugin 的类型、槽位与生效范围
- 插件源码仓库与安装产物的边界
- 插件国际化资源目录与 demo 脚手架规范
- 注册发现、安装任务、installed registry 与 assignment 规则
- `plugin-runner` 宿主方向
- manifest / schema / runtime contract / RPC 的实现基线

## 当前代码事实

- `plugin-framework` 已有基础消费类型与绑定约束
- `runtime extension` 在 assignment 校验层已限制为 `workspace` 或 `model`；公开绑定类型仍保留 `Tenant` 变体，待后续收口
- `capability plugin` 继续要求显式选择使用
- `plugin-runner` 目前只有独立宿主与健康检查骨架
- 当前还没有：
  - 插件安装任务
  - manifest / schema 校验器
  - 已安装注册表
  - 插件分配与启用控制面
  - runner `load / unload / invoke` 闭环
  - 管理台与分配 UI

## 已确认稳定规则

- 插件体系继续保留“声明式能力插件 + 受控代码插件”的双轨方向。
- 插件来源与信任继续分轴建模：
  - `source_kind`
    - `official_registry`
    - `mirror_registry`
    - `uploaded`
    - `filesystem_dropin`
  - `trust_level`
    - `verified_official`
    - `checksum_only`
    - `unverified`
- 风险来源代码插件启用前必须由 `root / admin` 二次确认，不得静默启用；其中 `host-extension` 上传固定只允许 `root`。
- 插件消费语义继续分为：
  - `host-extension`
  - `runtime extension`
  - `capability plugin`
- 其中：
  - `host-extension` 才允许参与系统级扩展，属于宿主级特权插件
  - `runtime extension` 与 `capability plugin` 不允许注册 HTTP 接口
  - `host-extension` 不进入普通 marketplace，默认走 `filesystem_dropin`；若部署显式开启则允许 `root` 上传
  - 二者只能挂到宿主预定义 slot
- `runtime extension` 继续只允许绑定：
  - `workspace`
  - `model`
- `capability plugin` 即使已安装和分配，也仍需在具体配置里显式选中。

## provider plugin 的固定口径

- 多协议 `provider kernel` 不是“宿主内置很多家 provider 适配器”
- 它是宿主提供的一套统一运行内核，让不同协议风格的 provider plugin 按同一规则接入、发现模型、发起调用并接受统一治理
- provider plugin 属于 `runtime extension`
- 它挂在宿主预定义的 `LLM provider runtime slot`
- 它不属于 `host-extension`
- 它也不属于普通 `capability plugin`

原因：

- 它不应扩展系统级 HTTP 接口
- 它负责接供应商协议并输出标准运行时事件
- 宿主只负责治理、执行工具和执行 MCP，不负责写死各家 provider 协议

## 源码仓库与安装产物

这里必须严格区分两层：

- `../1flowbase-official-plugins`
  - 源码仓库
  - 面向插件作者与 CI/CD
- `1flowbase` 宿主
  - 安装和运行的是插件产物
  - 不直接消费源码目录

安装产物至少应包含：

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

默认不进入正式运行时安装包的开发目录：

- `demo/`
- 开发态 `scripts/`

## 注册发现与安装来源

provider plugin 的发现入口首轮固定为：

- 官方 registry / artifact storage
- 本地上传 `pkg`

不作为首轮正式能力：

- 直接从源码目录安装
- 直接从任意 Git 仓库拉源码安装
- 安装时现场拉第三方依赖

这意味着：

- registry 负责“有什么版本可发现”
- installed registry 负责“宿主已经装了什么”
- assignment 负责“哪个 workspace 能用”
- provider instance 负责“用户是否已经配好凭据和地址”

## 国际化资源目录

参考 `Dify` 已有的多语言 `README` 与内联 `I18nObject` 思路，`1flowbase` 要进一步收敛为专门的 `i18n/` 目录。

正式规则：

- provider plugin 源码包必须包含 `i18n/`
- 至少提供默认语言，例如 `i18n/en_US.json`
- `readme/` 只负责长文档，不替代结构化 i18n 文案

`i18n/` 应承载：

- plugin label / description
- provider label
- 字段 label / placeholder / help
- model label / description
- demo 页面文案

## Demo 脚手架

参考 `Dify` 已有的 `plugin init`、`module append` 和开发 `GUIDE`，`1flowbase` 还应额外提供统一入口一键生成简单 demo 页面。

这条能力可以是命令，也可以是脚本，但必须对插件作者呈现为稳定入口。

首轮归属固定为：

- `plugin CLI` 先放主仓库，作为宿主侧 tooling 维护
- provider 插件仓库不作为 `plugin CLI` 的 source of truth
- provider 插件仓库只承载由 CLI 生成和维护的 `demo/`、开发态 `scripts/` 与 provider 源码

当前第一版实现已落地为：

- `node scripts/node/plugin.js init <plugin-path>`
- `node scripts/node/plugin.js demo init <plugin-path>`
- `node scripts/node/plugin.js demo dev <plugin-path> --port 4310`

首轮至少应支持：

- `plugin init`
- `plugin demo init <plugin-path>`
- `plugin demo dev <plugin-path>`

当前正确口径：

- 第一版 CLI 已存在于主仓库
- `demo dev` 当前提供的是静态 scaffold 和 runner URL 配置位
- 它不代表真实 `plugin-runner` debug runtime 已经打通

demo 页面至少要能覆盖：

- provider instance 配置
- validate
- list models
- prompt / stream
- tool call / MCP
- usage / token

## 模型发现能力

provider plugin 不只是负责“发请求给供应商”，还必须显式暴露模型发现能力。

这里的正确语义不是：

- 插件加载时把一份最新模型列表直接推给应用

而是：

- 插件加载时注册模型发现能力与静态元信息
- 宿主在用户打开 provider instance 详情或 `LLM` 模型选择器时，按需向插件拉取最新模型列表

支持的模式固定为：

- `static`
  - 模型列表完全来自插件包
- `dynamic`
  - 模型列表完全来自插件 runtime 接口
- `hybrid`
  - 先给静态默认模型，再由 runtime 拉取最新模型补充或覆盖

原因：

- 模型列表可能依赖 `base_url`
- 模型列表可能依赖 credentials 与账户权限
- 不同 provider instance 看到的可用模型可能不同

## 生命周期

本模块必须显式维护两套生命周期。

### 插件包生命周期

- `downloaded_or_uploaded`
- `verified`
- `installed`
- `install_failed`

### 插件激活生命周期

- `desired_state`
  - `disabled`
  - `pending_restart`
  - `active_requested`
- `artifact_status`
  - `missing`
  - `staged`
  - `ready`
  - `corrupted`
  - `install_incomplete`
- `runtime_status`
  - `inactive`
  - `active`
  - `load_failed`
- `availability_status`
  - 派生只读
  - 不允许控制面直接写成真值

固定链路为：

- 安装
- reconcile 产物
- 激活
- 分配
- 配置 provider instance
- 验证实例
- 节点显式选择
- 使用

### provider instance 生命周期

- `draft`
- `ready`
- `invalid`
- `disabled`

这里的关键边界是：

- 用户下载和启用的是插件包
- 用户真正配置和运行的是 provider instance

## 安装任务与热加载

插件安装和升级应走异步任务，而不是长时间阻塞同步 HTTP 请求。

任务终态至少包括：

- `success`
- `failed`
- `canceled`
- `timed_out`

启用 provider plugin 的正式规则固定为：

- 不重启整个系统
- 最多只允许 `plugin-runner` 局部 `load / reload`

## 当前模块的正确口径

本模块当前不能写成“已完成实现”。

更准确的说法是：

- 规则已经确认
- 生命周期和注册发现边界已经收口
- provider plugin 产物与宿主边界已经收口
- 基础骨架已经存在
- 但安装任务、已安装注册表、分配 UI、runner 闭环仍未实现

## 后续实现仍应对齐的设计基线

后续若继续推进插件实现，仍应对齐以下结论：

- 来源分级与启用审批规则
- provider plugin 属于 `runtime extension`
- 宿主安装对象是签名后的插件产物，不是源码目录
- `plugin-runner` 作为共享宿主进程
- 安装 / 启用 / 分配 / 配置 / 验证 / 使用的双层生命周期
- 异步安装任务与终态规则
- 升级、禁用、卸载与引用保护策略

这些结论仍然有效，但目前不能被引用成“已有实现”。

## 当前结论摘要

- `08` 保留为独立模块，因为它已经形成稳定扩展边界，不只是未来想法。
- 当前阶段最重要的不是“做多少 provider”，而是先把 provider plugin 的注册发现、生命周期、运行时 contract 和宿主治理边界做对。
