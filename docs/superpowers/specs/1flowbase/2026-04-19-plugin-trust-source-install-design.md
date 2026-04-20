# 1flowbase 插件签名信任链、来源白名单与安装入口设计稿

日期：2026-04-19
状态：已确认设计，待用户审阅

关联文档：
- [2026-04-18-official-plugin-release-install-design.md](./2026-04-18-official-plugin-release-install-design.md)
- [2026-04-19-plugin-version-switch-design.md](./2026-04-19-plugin-version-switch-design.md)
- [2026-04-18-model-provider-integration-design.md](./2026-04-18-model-provider-integration-design.md)
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)

## 1. 文档目标

本文档用于收口 `1flowbase` 下一阶段插件来源治理与安装增强设计，明确：

- 为什么“镜像源”“用户上传”“本地 drop-in”不能只当成几条入口，而必须补上统一的签名信任链
- 官方源、镜像源、用户上传和本地 drop-in 四种来源如何在同一套安装闭环下共存
- 宿主后端如何区分“来源”和“信任级别”，避免继续把 `verification_status=valid` 混成“官方验签通过”
- 宿主后端如何把 `source allowlist`、`signature policy` 和 `trust_level` 拆开建模
- `/settings/model-providers` 如何在不破坏现有安装与版本管理语义的前提下新增“从源安装 / 上传插件”双入口
- 这一轮应该先做哪些基础设施，哪些能力应后置

## 2. 背景与问题

截至 `2026-04-19`，当前官方插件链路已经具备：

- 官方目录由后端通过 `official-registry.json` 拉取
- 官方插件安装由后端统一执行下载、`sha256` 校验、解包、安装、启用、分配
- 设置页已经有“安装模型供应商”区和官方 `latest` 安装入口
- 插件版本已经按“插件是指针”的语义建模，可升级到 `latest`、回退到本地旧版本

但当前仍有三个关键缺口：

- 国内网络或内网环境下，只依赖默认官方 registry 可达性不足，需要镜像源
- 当前 `/api/console/plugins/install` 只是“按后端本地目录安装”，不是浏览器上传
- 当前只有 checksum 完整性校验，没有官方签名真实性校验，无法证明“这个包确实由官方发布流程签发”

如果现在直接补“镜像源 + 上传入口”，但不补签名信任链和来源策略，会带来三个直接后果：

- 镜像源只能解决可达性，不能证明包的官方身份
- 用户上传包只能解决兜底安装，不能区分“官方离线包”和“普通手工包”
- 系统会继续把“装进来了”和“官方可信”混为一谈，后续版本治理、审计和 UI 文案都会失真

一句话说，当前问题不是入口不够，而是“来源”和“可信度”还没有被拆开建模。

## 3. 核心结论

本轮设计固定采用以下口径：

- 插件安装能力升级为“多来源入口 + 一套信任底座”
- 分发来源、来源准入策略和信任级别是三个独立维度，不能混成一个字段
- 来源固定区分为：
  - `official_registry`
  - `mirror_registry`
  - `uploaded`
  - `filesystem_dropin`
- 来源准入固定由部署配置控制：
  - `source allowlist`
  - `enforce_source_allowlist`
- 签名阻断策略固定由部署配置控制：
  - `require_signature_for_registry_sources`
  - `allow_unverified_uploads`
  - `allow_unverified_filesystem_dropins`
- 信任级别固定区分为：
  - `verified_official`
  - `checksum_only`
  - `unverified`
- `signature_status` 继续保留，但只表示签名检查诊断结果，不再承担“是否官方可信”的最终语义
- 即使当前策略不阻断安装，后端仍必须执行验签并记录 `signature_status`
- `verification_status` 不再扩展成“官方验签状态”；它只保留现有兼容语义，后续由新的 `trust_level` 接管产品表达
- 镜像源允许存在，但镜像只负责搬运，不拥有“声明官方身份”的权力
- 用户上传允许存在，但默认是手工来源；只有在后端验签通过时，才能提升为“官方签发的离线包”
- `filesystem_dropin` 允许存在，但它是运维控制的本地来源，不等价于官方来源
- `HostExtension` 默认走 `filesystem_dropin`；若部署显式开启，则可接受 `root` 上传，但 `source_kind` 仍保持 `uploaded`
- `HostExtension uploaded` 安装成功后只写数据库 `desired_state=pending_restart`，必须重启后才能尝试激活
- 上传入口不替代官方源，只作为高级能力和离线兜底

## 4. 总体方案

### 4.1 一套信任底座，四种来源

后端对插件包的处理固定收口成同一条 intake pipeline：

1. 接收包字节或下载到字节流
2. 执行安全解包
3. 重新读取包内 `manifest` 与 provider 定义
4. 计算摘要并校验包完整性
5. 检查签名元数据并执行验签
6. 生成统一的 `source_kind + trust_level + signature_status`
7. 复用现有安装、启用、分配主链路

四种来源只负责“包从哪里来”：

- 官方源安装：包来自 resolved official registry
- 镜像源安装：包来自 mirror registry
- 上传安装：包来自浏览器上传
- 本地 drop-in：包来自运维控制的本地目录扫描

但“是不是官方可信”统一由后端验签决定，而不是由入口决定。

### 4.2 三期落地顺序

本轮不建议把镜像源和上传入口直接并行开工，而是固定三期推进：

第一期，补签名信任底座、安全解包和来源策略。

- 新增包签名元数据
- 后端统一安全解包、验 checksum、验签
- 数据模型正式拆出 `trust_level`
- 后端补齐 `source allowlist` 与各来源签名策略

第二期，上镜像源。

- 宿主配置可切换默认官方源或镜像源
- UI 显示当前来源
- 安装和升级仍然走原有官方链路

第三期，上上传安装。

- 设置页增加“上传插件”入口
- 后端接收上传文件，复用统一 intake pipeline
- UI 明确区分“手工上传版本”和“官方来源版本”

原因很直接：

- 没有第一期，第二期和第三期都只能做到“可用”
- `filesystem_dropin` 与 `HostExtension` 也依赖同一套来源与签名策略，因此应随第一期一起定口径
- 先做镜像源，对大多数国内安装问题收益最高
- 上传安装的安全边界更复杂，应该在统一验签和安全解包到位后再接入

## 5. 签名信任模型

### 5.1 私钥、公钥与责任边界

官方签名固定采用：

- 私钥只存在于官方发布环境，例如 GitHub Actions secret、私有 CI 或内部发布机
- 公钥内置在宿主后端配置中，可公开
- 私钥绝不进入仓库、绝不下发到客户端、绝不放到宿主运行时

工作方式固定为：

1. 官方发布流水线打包 `.1flowbasepkg`
2. 生成标准化发布清单
3. 用私钥对发布清单签名
4. 把包、checksum、发布清单、签名一起发布
5. 宿主下载或接收上传包后，先验摘要，再验签
6. 只有验签通过，才标记为 `verified_official`

### 5.2 包内元数据

正式产物 `.1flowbasepkg` 新增 `_meta/` 目录，至少包含：

- `_meta/official-release.json`
- `_meta/official-release.sig`

`official-release.json` 最小字段固定为：

```json
{
  "schema_version": 1,
  "plugin_id": "1flowbase.openai_compatible",
  "provider_code": "openai_compatible",
  "version": "0.1.0",
  "contract_version": "1flowbase.provider/v1",
  "artifact_sha256": "sha256:<artifact-bytes>",
  "payload_sha256": "sha256:<payload-tree>",
  "signature_algorithm": "ed25519",
  "signing_key_id": "official-key-2026-04",
  "issued_at": "2026-04-19T13:00:00Z"
}
```

其中：

- `artifact_sha256` 用于校验整个包文件字节，适合官方源和镜像源下载场景
- `payload_sha256` 用于校验解包后的业务内容，适合上传和统一安全解包场景

### 5.3 签名对象

签名对象固定为 `official-release.json` 的规范化 JSON 字节，而不是直接签压缩包文件。

这样做的好处是：

- 镜像重新搬运文件不影响签名语义
- 用户上传同一官方包时，后端仍能独立判断它是不是官方签发
- 后续支持多种压缩格式时，签名体系不用跟着变

### 5.4 签名结果表达

`signature_status` 建议固定为以下集合：

- `verified`
- `unsigned`
- `invalid`
- `unknown_key`
- `missing_manifest`
- `malformed_signature`

最终 `trust_level` 由规则推导：

- 验签通过：`verified_official`
- `official_registry / mirror_registry` 在摘要校验通过、但签名未通过且策略允许降级时：`checksum_only`
- `uploaded / filesystem_dropin` 未签名或签名失败：`unverified`

这里需要额外固定一条安装策略：

- 对 `official_registry` 或 `mirror_registry`，若部署配置 `require_signature_for_registry_sources=true`，则验签不通过时直接拒绝安装，不允许降级成 `checksum_only`
- 对 `uploaded`，若部署配置 `allow_unverified_uploads=false`，则验签不通过时直接拒绝安装
- 对 `filesystem_dropin`，若部署配置 `allow_unverified_filesystem_dropins=false`，则验签不通过时直接拒绝加载
- `checksum_only` 只用于兼容期历史记录、registry 来源显式允许降级的场景，不用于把手工来源伪装成“半官方”

## 6. 官方 registry 与镜像源设计

### 6.1 配置模型

当前 `API_OFFICIAL_PLUGIN_REGISTRY_URL` 继续保留兼容，但新增更清晰的配置层：

- `API_PLUGIN_ALLOWED_SOURCE_KINDS`
- `API_PLUGIN_ENFORCE_SOURCE_ALLOWLIST`
- `API_PLUGIN_REQUIRE_SIGNATURE_FOR_REGISTRY_SOURCES`
- `API_PLUGIN_ALLOW_UNVERIFIED_UPLOADS`
- `API_PLUGIN_ALLOW_UNVERIFIED_FILESYSTEM_DROPINS`
- `API_PLUGIN_ALLOW_UPLOADED_HOST_EXTENSIONS`
- `API_OFFICIAL_PLUGIN_DEFAULT_REGISTRY_URL`
- `API_OFFICIAL_PLUGIN_MIRROR_REGISTRY_URL`
- `API_OFFICIAL_PLUGIN_TRUSTED_PUBLIC_KEYS_JSON`

解析规则固定为：

- `API_PLUGIN_ALLOWED_SOURCE_KINDS` 至少支持 `official_registry,mirror_registry,uploaded,filesystem_dropin`
- `API_PLUGIN_ENFORCE_SOURCE_ALLOWLIST` 默认 `true`
- `API_PLUGIN_REQUIRE_SIGNATURE_FOR_REGISTRY_SOURCES` 默认 `true`
- `API_PLUGIN_ALLOW_UNVERIFIED_UPLOADS` 默认 `true`
- `API_PLUGIN_ALLOW_UNVERIFIED_FILESYSTEM_DROPINS` 默认 `true`
- `API_PLUGIN_ALLOW_UPLOADED_HOST_EXTENSIONS` 默认 `false`
- 镜像地址为空：使用默认官方 registry
- 镜像地址非空：优先使用镜像 registry
- 对业务层暴露统一 resolved official source

这样做的结果是：

- `control-plane service` 不需要知道当前到底是默认官方还是镜像
- 业务真相源仍然只有一个“当前官方来源”
- UI 能拿到“当前来源标签”，但不需要理解后端分支细节

### 6.2 registry 字段扩展

`official-registry.json` 条目新增：

- `signature_algorithm`
- `signing_key_id`
- `trust_mode`

其中：

- `trust_mode` 第一版可固定为 `signature_required`
- `checksum` 保留
- `signature_status` 可继续保留给 UI 做诊断展示，但不作为最终真值

对于官方与镜像 registry，后端行为固定为：

- 拉 registry
- 下载包
- 验 `artifact_sha256`
- 解包
- 验 `payload_sha256`
- 验签

如果 registry 自己是伪造的，但包没有官方签名，最终仍然不能得到 `verified_official`。

如果 official source 或 mirror source 返回的是 unsigned 包，则本轮按错误处理，而不是继续安装为 `checksum_only`。

### 6.3 来源 allowlist 与本地 drop-in

部署侧固定需要一条来源 allowlist：

- 不在 allowlist 的来源直接拒绝进入安装或加载流程
- 在 allowlist 的来源仍然必须执行安全解包、checksum 和验签
- 是否因为验签失败而阻断，由该来源对应的签名策略决定

`filesystem_dropin` 的正式语义固定为：

- 来源于运维控制的本地目录
- 不等价于“官方来源”
- 不暴露为普通浏览器上传入口
- 它是 `HostExtension` 的默认来源，而不是唯一来源

宿主启动时对 `filesystem_dropin` 固定执行：

1. 扫描受控目录中的插件包
2. 复用统一 package intake pipeline
3. 记录 `source_kind=filesystem_dropin`
4. 根据签名结果生成 `trust_level`
5. 对 `HostExtension` 按启动生命周期加载或拒绝加载

对 `HostExtension uploaded` 额外固定：

- 仅在 `API_PLUGIN_ALLOW_UPLOADED_HOST_EXTENSIONS=true` 时允许
- 仅 `root` 账号可执行上传
- 上传后 `source_kind` 仍保持 `uploaded`
- 安装成功后只写数据库 `desired_state=pending_restart`
- 宿主重启时先执行产物 reconcile，再根据数据库状态尝试激活；运行时只写 `runtime_status`

### 6.4 官方 catalog API 形状

`GET /api/console/plugins/official-catalog` 升级为同时返回来源元信息和条目列表，例如：

```json
{
  "source_kind": "mirror_registry",
  "source_label": "镜像源",
  "registry_url": "https://mirror.example.com/official-registry.json",
  "entries": [
    {
      "plugin_id": "1flowbase.openai_compatible",
      "provider_code": "openai_compatible",
      "display_name": "OpenAI Compatible",
      "protocol": "openai_compatible",
      "latest_version": "0.2.0",
      "help_url": "https://platform.openai.com/docs/api-reference",
      "model_discovery_mode": "hybrid",
      "install_status": "assigned"
    }
  ]
}
```

这样做的目的不是把后端配置泄漏到业务层，而是为了让设置页在任何时候都能明确显示：

- 当前来源：官方源 / 镜像源
- 当前目录是否来自镜像优先策略

## 7. 上传插件安装设计

### 7.1 产品入口

`/settings/model-providers` 的“安装模型供应商”区块改成双入口：

- `从源安装`
- `上传插件`

产品规则固定为：

- “从源安装”承载官方源和镜像源的统一列表卡片
- “上传插件”是单独按钮，打开上传弹窗
- 上传成功后仍停留在同一页面，并刷新“已安装供应商”和“安装模型供应商”

### 7.2 上传协议

新增接口：

- `POST /api/console/plugins/install-upload`

协议固定使用 `multipart/form-data`，字段只接收：

- `file`

支持格式：

- 主格式：`.1flowbasepkg`
- 兼容输入：`.tar.gz`、`.zip`

产品语义上仍以 `.1flowbasepkg` 作为标准正式产物；其余格式只作为兼容输入，不作为长期正式契约。

### 7.3 后端处理流程

上传安装固定按以下顺序处理：

1. 校验 `uploaded` 在来源 allowlist 内
2. 校验文件扩展名、魔数和大小限制
3. 将原始文件落到隔离临时目录
4. 安全解包，禁止路径穿越和绝对路径写入
5. 重新读取包内 `manifest.yaml`、provider 定义和签名元数据
6. 校验 `plugin_id`、`provider_code`、`version`、`contract_version`
7. 执行摘要校验和验签
8. 生成 `source_kind=uploaded`
9. 根据签名结果推导 `trust_level`
10. 若当前策略不允许 `unverified upload`，则在此处拒绝安装
11. 若包声明 `consumption_kind=host_extension`，则校验上传者必须是 `root`，且部署已开启 `API_PLUGIN_ALLOW_UPLOADED_HOST_EXTENSIONS=true`
12. 复用现有安装链路，将原始包归档到 `packages/`，解包产物原子写入 `installed/`
13. 写入 `package_path`、`installed_path`、摘要与指纹快照，并将 `artifact_status` 标记为 `ready`
14. 若包声明 `consumption_kind=host_extension`，则只写数据库 `desired_state=pending_restart`，不得立即激活
15. 写入任务记录、审计日志并清理临时目录

前端传来的元信息一律不可信，后端只能以解包后重新读取到的内容为准。

### 7.4 上传成功后的语义

上传来源固定保持：

- `source_kind=uploaded`

即使包是官方离线包，来源也不能改写成 `official_registry`。否则后续追溯会失真。

但如果验签通过，则可以得到：

- `source_kind=uploaded`
- `trust_level=verified_official`

UI 应显示为：

- `手工上传 / 官方签发`

而不是“官方源安装”。

若上传对象是 `HostExtension`，则 UI 还必须明确显示：

- `仅 root 可上传`
- `已安装，需重启应用后生效`

## 8. 数据模型与状态表达

### 8.1 installation 记录新增字段

当前安装记录建议扩展为：

- `source_kind`
- `trust_level`
- `verification_status`
- `checksum`
- `signature_status`
- `signature_algorithm`
- `signing_key_id`
- `desired_state`
- `artifact_status`
- `runtime_status`
- `availability_status`
- `package_path`
- `installed_path`
- `manifest_fingerprint`
- `last_load_error`

其中：

- `source_kind` 回答“包从哪里来”
- `trust_level` 回答“系统当前有多信任它”
- `verification_status` 继续保留兼容，不再承担“官方可信”语义
- `desired_state` 回答“控制面希望它处于什么状态”
- `artifact_status` 回答“本地产物是否齐全且可校验”
- `runtime_status` 回答“运行时最近一次加载结果”
- `availability_status` 是只读派生值，回答“系统当前是否可安全对外宣称它可用”

### 8.2 字段语义约束

固定约束如下：

- `verification_status=valid` 只表示该包已按宿主当前安装流程完成校验并入库
- `trust_level=verified_official` 才表示其官方身份已被密码学证明
- `signature_status=unsigned` 不代表失败，只代表没有官方签名
- `source_kind=mirror_registry` 不天然等于官方可信，仍需验签成功
- `source_kind=filesystem_dropin` 只表示包来自运维控制的本地目录，不天然等于官方可信
- 控制面不得直接把 `availability_status` 写成真值
- 目录结构不承载业务状态；状态只能记录为数据库快照或派生值

派生规则至少应满足：

- `desired_state=disabled` 时，`availability_status=disabled`
- `desired_state=pending_restart` 且 `artifact_status=ready` 时，`availability_status=pending_restart`
- `desired_state in (pending_restart, active_requested)` 且 `artifact_status=missing` 时，`availability_status=artifact_missing`
- `artifact_status in (staged, install_incomplete, corrupted)` 时，`availability_status=install_incomplete`
- `artifact_status=ready` 且 `runtime_status=load_failed` 时，`availability_status=load_failed`
- `desired_state=active_requested`、`artifact_status=ready` 且 `runtime_status=active` 时，`availability_status=available`

### 8.3 reconcile 机制

系统必须显式维护 reconcile：

- 宿主启动时扫描 `installed_path`
- `HostExtension` 激活前做一次 reconcile
- `RuntimeExtension / CapabilityPlugin` 在关键加载或调用前做轻量 reconcile

reconcile 最少检查：

- `package_path` 是否存在
- `installed_path` 是否存在
- `manifest.yaml` 是否存在
- 已记录的摘要或 `manifest_fingerprint` 是否仍匹配

不一致时只允许更新快照字段，例如：

- 缺包：`artifact_status=missing`
- 解包未完成：`artifact_status=install_incomplete`
- 文件被篡改或摘要不匹配：`artifact_status=corrupted`

### 8.4 版本管理与升级规则

版本管理继续按 `provider_code` 聚合，不因来源不同而改变交互模型。

但规则收紧为：

- “升级到最新版本”只针对 official catalog 中可确认的 `verified_official` 版本
- 上传来源版本可以切换，但不参与“推荐版本 / 官方最新”语义
- `filesystem_dropin` 来源版本允许被宿主加载，但不参与 official catalog 的推荐和升级语义
- 上传且未验签版本允许安装和回退，但 UI 必须明确标记“手工上传版本”
- `HostExtension uploaded` 不参与“安装即生效”，而是固定进入 `pending_restart`

## 9. 前端交互设计

### 9.1 从源安装区

“从源安装”保持现有列表卡片模型，但头部新增来源提示：

- `当前来源：官方源`
- `当前来源：镜像源`

当配置了镜像地址时，补充说明：

- `优先从镜像源拉取官方插件`

如果当前目录拉取失败，错误提示要明确区分：

- registry 拉取失败
- 包下载失败
- checksum 失败
- 签名失败

### 9.2 上传弹窗

上传弹窗最小包含：

- 文件选择器
- 支持格式说明
- 大小限制说明
- `上传并安装` 按钮
- 错误反馈区

成功后反馈应明确包含：

- 插件名称与版本
- 来源：手工上传
- 信任级别：官方签发 / 未官方验签

### 9.3 版本卡片与标签

安装版本卡片和版本管理弹窗建议统一显示两个标签：

- 来源标签：官方源 / 镜像源 / 手工上传
- 信任标签：官方签发 / 仅 checksum / 未验签

这样可以避免后续出现：

- 这个版本是镜像装的还是手传装的
- 这个版本是不是官方包

两类问题混在一起。

## 10. 后端模块边界

### 10.1 `apps/api-server`

职责固定为：

- 解析环境变量
- 拉取 official registry
- 接收上传文件
- 路由层协议解析与响应映射

不在 route 层承载业务规则。

### 10.2 `crates/control-plane`

职责固定为：

- 统一插件 intake command
- 执行来源 allowlist 判断
- 根据来源生成 `source_kind`
- 根据验签结果生成 `trust_level`
- 写入 `desired_state / artifact_status / runtime_status`
- 派生 `availability_status`
- 复用 install、enable、assign、switch_version 等已有生命周期
- 写任务记录和审计

### 10.3 `crates/plugin-framework`

新增责任应放在这里：

- 安全解包
- 包摘要计算
- 签名元数据读取
- 公钥验签
- 对外暴露统一 package intake 结果

原因是这些规则属于“插件产物边界”，不是 HTTP 协议层，也不是存储层。

## 11. 风险与约束

### 11.1 镜像源风险

好处：

- 最贴近当前架构
- 对国内网络收益最大
- 不改变现有官方安装主链路

风险：

- 需要维护镜像 registry 和包同步
- 镜像自身可能不稳定
- 如果没有签名验签，镜像将拥有伪造官方包的能力

### 11.2 上传安装风险

好处：

- 适合内网、离线、私有包、测试包
- 不依赖宿主服务端直连 GitHub
- 可支持官方离线包导入

风险：

- 上传大包、解压和清理边界更复杂
- 安全边界明显大于官方源安装
- 如果来源与信任不分开，后续版本治理会混乱

### 11.3 基础设施风险

最关键的基础设施风险只有一个：

- 如果签名信任链没有先补齐，镜像源和上传入口都会把系统推进到“更方便伪造来源”的状态

因此本设计明确要求：先做信任底座，再开放更多来源。

## 12. 最终建议

本轮正式建议固定为：

- 不是二选一，而是“多来源安装方案”
- 但多来源必须建立在同一套签名信任链和来源策略上
- 实施顺序固定为：
  1. 签名信任底座、安全解包与来源策略
  2. 镜像源安装
  3. 上传插件安装

产品规则固定为：

- 官方插件优先从“当前配置源”安装
- “当前配置源”默认官方，可切镜像
- 上传插件是手工安装，不参与官方“推荐版本”语义
- `filesystem_dropin` 是运维控制来源，不进入普通 marketplace 安装入口
- 官方升级按钮只针对 official catalog 中的 `verified_official` 版本
- 上传来源版本可以安装和切换，但文案必须标记为“手工上传版本”
- `HostExtension` 默认走 `filesystem_dropin`；若部署显式开启则允许 `root` 上传，但上传后固定进入 `pending_restart`
- 插件可用性不是单一数据库字段真值，而是 `desired_state + artifact_status + runtime_status` 的联合派生结果

一句话总结就是：

`镜像源解决可达性，上传入口解决兜底安装，本地 drop-in 和 root 上传共同承载宿主级特权扩展，签名信任链与来源策略解决真实性和准入；几者缺一不可，但实现顺序不能颠倒。`
