# 1Flowbase 官方 Provider 插件发布与安装页设计稿

日期：2026-04-18
状态：已确认设计，待用户审阅

关联文档：
- [2026-04-18-model-provider-integration-design.md](./2026-04-18-model-provider-integration-design.md)
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)
- [2026-04-10-product-design.md](./2026-04-10-product-design.md)

## 1. 文档目标

本文档用于收口 `1Flowbase` 第一版“官方 provider 插件打包发布 + 宿主安装页”设计，明确：

- 官方 provider 插件如何从源码仓库打包为正式安装产物
- 官方插件仓库如何通过 `GitHub Release asset` 发布可安装版本
- 官方插件列表如何以稳定索引文件供宿主消费，而不是直接把 GitHub API 当成产品契约
- 宿主如何从官方索引读取插件并完成下载、校验、安装、启用、分配
- 设置页如何拆分为“已安装供应商”和“官方可安装供应商”两块
- 这一轮哪些能力先做、哪些能力明确后置

## 2. 背景与问题

截至 `2026-04-18`，模型供应商第一版闭环已经完成：

- 主仓库已具备 provider plugin 安装、启用、分配、instance 配置和模型发现链路
- 官方插件仓库已有参考插件 `openai_compatible`
- 设置页已有“模型供应商” section，但当前只覆盖已启用且已分配的 provider 安装包与 instance 管理

当前缺口主要有两个：

- 官方插件仓库还没有正式的产物打包、校验和 GitHub Release 发布流程
- 宿主还不支持从官方线上来源读取可安装插件并一键安装到当前 workspace

如果这轮继续停留在“本地源码目录 + 手工 install”：

- 用户无法直观看到官方插件的线上交付效果
- 设置页缺少“我还能装什么”的官方供应商安装区
- 后续 marketplace 仍然缺少一个稳定的最小基线

因此这轮必须把“官方 provider 插件发布形态”和“宿主安装页入口”一起收口。

## 3. 核心结论

本轮设计固定采用以下口径：

- 正式安装对象是 `GitHub Release asset`
- 正式产物格式是 `.1flowbasepkg`
- `plugin CLI` 的打包 source of truth 继续放在主仓库
- 官方插件仓库通过 GitHub Actions 调用主仓库打包能力
- 官方插件列表不直接读取 GitHub Releases API 作为产品契约，而是读取官方仓库维护的稳定索引 `official-registry.json`
- 安装页第一版只指向官方仓库，不开放自定义 GitHub 仓库输入
- 安装页主动作是“安装到当前 workspace”，但底层仍保留 `install -> enable -> assign` 三段生命周期
- UI 第一版只展示每个官方插件的 `latest` 版本
- 校验第一版强制做 `sha256`，`signature_status` 先固定为 `unsigned`
- 官方仓库地址通过宿主环境变量配置，但 UI 不暴露切换入口

## 4. 总体方案

### 4.1 产物边界

官方插件仓库 `../1flowbase-official-plugins` 继续作为源码仓库：

- 面向插件作者
- 面向 CI 校验
- 面向 GitHub Release 发布

宿主 `1Flowbase` 不直接消费该源码目录作为正式线上安装来源。

正式安装对象固定为 `.1flowbasepkg` 产物。第一版可将其实现为：

- 一个固定扩展名的压缩包
- 内部仍然保留宿主运行所需的最小 provider package 目录结构
- 不包含 `demo/` 与开发态 `scripts/`

这样做的结果是：

- 运行时继续安装“产物”，不是“源码目录”
- 宿主安装行为与本地手工开发态调试分离
- 后续 `checksum / signature / registry` 都有稳定锚点

### 4.2 文件命名与版本规则

正式产物文件名固定为：

```text
1flowbase@openai_compatible@0.1.0@<sha256>.1flowbasepkg
```

每个插件单独发布 tag，命名固定为：

```text
openai_compatible-v0.1.0
```

不采用仓库统一 tag，例如 `v0.1.0`，原因是官方仓库后续可能承载多个 provider 插件，必须允许每个插件独立发版。

### 4.3 官方列表来源

官方可安装插件列表由官方插件仓库中的稳定索引文件提供，例如：

```json
{
  "version": 1,
  "generated_at": "2026-04-18T20:00:00Z",
  "plugins": [
    {
      "plugin_id": "1flowbase.openai_compatible",
      "provider_code": "openai_compatible",
      "display_name": "OpenAI Compatible",
      "protocol": "openai_compatible",
      "latest_version": "0.1.0",
      "release_tag": "openai_compatible-v0.1.0",
      "download_url": "https://github.com/taichuy/1flowbase-official-plugins/releases/download/openai_compatible-v0.1.0/1flowbase@openai_compatible@0.1.0@<sha256>.1flowbasepkg",
      "checksum": "sha256:<sha256>",
      "signature_status": "unsigned",
      "help_url": "https://github.com/taichuy/1flowbase-official-plugins/tree/main/models/openai_compatible",
      "model_discovery_mode": "hybrid"
    }
  ]
}
```

宿主安装页和宿主后端都消费这份索引，而不是直接把 GitHub Releases API 返回结构暴露到产品层。

这样做的好处是：

- 前端字段稳定，不受 GitHub API 结构变化影响
- 后端可以只信任官方明确暴露的条目
- 后续扩展 marketplace 时，官方索引可以直接演进为正式 registry

## 5. 主仓库打包能力

### 5.1 `plugin CLI` 责任

主仓库现有 `node scripts/node/plugin.js` 是 provider plugin tooling 的 source of truth。本轮在此基础上新增正式打包命令，例如：

```text
node scripts/node/plugin.js package <plugin-path> --out <output-dir>
```

命令职责固定为：

- 读取 provider package
- 校验 `manifest / provider schema / models / i18n`
- 过滤 `demo/` 与开发态 `scripts/`
- 生成 `.1flowbasepkg`
- 计算 `sha256`
- 输出产物 metadata，供 GitHub Actions 后续发布和回写索引使用

这条能力继续归主仓库维护，不在官方插件仓库复制一套独立 pack 脚本，避免 `contract_version`、打包规则和宿主消费规则漂移。

### 5.2 产物内容

打包输出中必须保留：

- `manifest.yaml`
- `provider/*.yaml`
- runtime entrypoint
- `models/llm/*.yaml`
- `i18n/*.json`
- `readme/README_*.md`

默认不进入正式安装产物：

- `demo/`
- 开发态 `scripts/`
- 仅服务于本地调试的临时文件

## 6. 官方插件仓库 CI/CD

### 6.1 CI

官方插件仓库新增 CI workflow，在 `push / pull_request` 时运行。最小职责：

- 校验 provider 插件目录结构完整
- 调用主仓库 `plugin package` 做 dry-run 打包
- 校验产物可被宿主识别
- 校验 `official-registry.json` 结构合法

CI 的目标不是发布产物，而是提前阻断：

- manifest 结构错误
- provider runtime entrypoint 缺失
- 模型索引与 i18n 资源不完整
- registry 条目和插件目录不一致

### 6.2 CD

官方插件仓库新增 CD workflow，针对插件级 tag 触发，例如：

- `openai_compatible-v0.1.0`

CD 的固定步骤：

1. 解析 tag 对应的插件目录与版本
2. 调用主仓库 `plugin package`
3. 计算 `sha256`
4. 生成正式 `.1flowbasepkg`
5. 创建或更新 GitHub Release
6. 上传 release asset
7. 更新 `official-registry.json` 中该插件的 latest 条目

第一版不做真实签名服务，`signature_status` 固定写为 `unsigned`。但字段必须保留，避免未来接口返工。

## 7. 宿主后端能力

### 7.1 官方来源配置

宿主新增官方仓库来源配置，例如：

- `API_OFFICIAL_PLUGIN_REPOSITORY=taichuy/1flowbase-official-plugins`
- `API_OFFICIAL_PLUGIN_REGISTRY_URL=<optional>`

第一版 UI 不暴露仓库切换入口，但后端通过环境变量配置来源，避免仓库地址被硬编码在前后端代码里。

### 7.2 官方 catalog 读取

宿主后端新增官方插件 catalog 读取能力，例如：

- `GET /api/console/plugins/official-catalog`

职责：

- 拉取官方 `official-registry.json`
- 过滤仅支持当前宿主 contract 的 provider 插件
- 返回 UI 安装区所需字段

这条接口只负责“官方可安装什么”，不和当前已安装 catalog 混在一起。

### 7.3 官方安装入口

宿主后端新增官方安装入口，例如：

- `POST /api/console/plugins/install-official`

第一版入参只允许官方 `plugin_id`，可选 `version` 参数位先保留但 UI 不暴露。

处理流程固定为：

1. 根据官方索引解析目标插件的 latest 条目
2. 下载 `.1flowbasepkg`
3. 校验 `sha256`
4. 解包到临时目录
5. 复用现有 install 逻辑写入 installation
6. 自动执行 `enable`
7. 自动执行 `assign`
8. 返回最终 installation 与 task 视图

这样做的结果是：

- UI 只暴露一个“安装到当前 workspace”主动作
- 后端内部仍保留 install、enable、assign 的真实生命周期与审计
- 用户不需要理解内部三段状态机

### 7.4 幂等与失败处理

官方安装接口必须支持以下分支：

- 同版本已安装且已启用已分配
  - 返回幂等成功
- 同版本已安装但未启用
  - 补执行 `enable`
- 同版本已启用但未分配到当前 workspace
  - 补执行 `assign`
- 下载失败
  - task 失败，保留明确错误
- `sha256` 不匹配
  - 直接拒绝安装
- release asset 缺失或索引失真
  - 官方 catalog 条目标记不可安装，或安装 task 明确失败

## 8. 设置页设计

### 8.1 页面结构

`/settings/model-providers` 第一版继续保留当前上半区，并新增下半区“安装模型供应商”。

页面整体分为两块：

- 已安装模型供应商
  - 继续展示当前 workspace 已启用且已分配的 provider 安装包
  - 继续负责 instance 创建、编辑、验证、模型刷新
- 安装模型供应商
  - 展示来自官方 `official-registry.json` 的可安装 provider 卡片
  - 第一版只展示 `latest`

这与用户给出的参考方向一致：

- 上面解决“我当前在用什么”
- 下面解决“我还能从官方来源装什么”

### 8.2 官方安装卡片字段

第一版卡片至少展示：

- provider 名称
- 协议类型
- 当前 latest 版本
- 文档入口
- 安装状态
- 安装按钮

安装状态按当前 workspace 语义展示：

- `未安装`
- `已安装`
- `已安装到当前 workspace`
- `安装中`
- `安装失败`

### 8.3 安装按钮语义

卡片主动作固定为：

- `安装到当前 workspace`

它不是单纯的 install，而是一个产品级复合动作，内部串行触发：

- install
- enable
- assign

按钮点击后：

- 创建 task
- UI 轮询 task 直到终态
- 成功后刷新“已安装模型供应商”上半区

### 8.4 当前 section 的保留边界

现有 `ModelProviderCatalogPanel` 和 `ModelProviderInstancesTable` 继续保留，不与官方安装区合并为一个列表。

原因是：

- 当前 catalog 是“已可用 provider installation”
- 官方安装区是“可安装来源”
- 两者数据语义不同，混在一个列表里会把“安装来源”和“使用实例”混淆

## 9. 数据与状态边界

### 9.1 官方插件条目

官方 catalog 属于“远端来源信息”，不是本地 installation 记录。它不写进当前安装表，除非用户真的发起安装。

### 9.2 已安装 installation

宿主本地 installation 仍然沿用现有 `plugin_installations`、`plugin_tasks`、`plugin_assignments`。

需要补齐的是真实字段来源：

- `checksum`
  - 来自官方 registry / release asset
- `signature_status`
  - 第一版固定 `unsigned`
- `source_kind`
  - 官方安装来源应与本地路径安装区分

### 9.3 provider instance

provider instance 仍然只从“已启用且已分配”的安装包中创建，不允许直接从官方 catalog 条目跳过 installation 层创建实例。

## 10. 错误处理与用户反馈

第一版固定处理以下场景：

- 官方 catalog 拉取失败
  - 下半区显示 warning，不影响上半区已安装能力
- 官方插件安装失败
  - 卡片显示失败状态和明确错误
- 校验失败
  - 不写 installation 记录
- 安装成功但后续刷新实例区失败
  - 安装 task 成功，页面额外提示刷新失败，不回滚 installation

页面不隐藏失败事实，也不把失败统一收成模糊文案。

## 11. 非目标

这轮明确不做：

- 自定义 GitHub 仓库地址输入
- 任意第三方 release 资产安装
- 版本下拉选择
- 真正的签名校验服务
- 插件市场搜索、排序、推荐
- 插件升级策略和灰度管理 UI

这些能力都以后续 marketplace 轮次再推进。

## 12. 实施后的期望结果

本轮完成后，最小可见闭环应为：

- 主仓库可把 `openai_compatible` 打包为 `.1flowbasepkg`
- 官方插件仓库可通过 tag 自动创建 GitHub Release asset
- 官方仓库维护稳定 `official-registry.json`
- 宿主设置页可展示“官方可安装供应商”
- 用户点击“安装到当前 workspace”后，宿主自动完成下载、校验、安装、启用、分配
- 安装成功后，插件出现在当前“已安装模型供应商”区，并可直接创建 provider instance

## 13. 推荐实施顺序

推荐实施顺序固定为：

1. 主仓库补 `plugin package`
2. 官方插件仓库补 CI/CD 与 `official-registry.json`
3. 宿主后端补 `official-catalog` 与 `install-official`
4. 设置页补“安装模型供应商”官方卡片区
5. 联调安装成功后自动进入现有 provider instance 管理链路
