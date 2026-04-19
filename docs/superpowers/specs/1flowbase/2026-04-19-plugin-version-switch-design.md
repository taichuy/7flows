# 1flowbase 插件版本指针与模型供应商版本切换设计稿

日期：2026-04-19
状态：已确认设计，待用户审阅

关联文档：
- [2026-04-18-official-plugin-release-install-design.md](./2026-04-18-official-plugin-release-install-design.md)
- [2026-04-18-model-provider-integration-design.md](./2026-04-18-model-provider-integration-design.md)
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)

## 1. 文档目标

本文档用于收口 `1flowbase` 第二轮官方插件安装与版本管理设计，明确：

- 插件版本决策为什么必须上提到全局插件层，而不是只留在模型供应商页面
- 一个 `workspace` 下某个插件家族当前到底指向哪个版本
- “升级到最新版本”和“回退到本地旧版本”如何统一为同一套版本切换能力
- 模型供应商作为第一份消费方，切版本后如何处理全部实例、模型目录缓存和页面提示
- 本轮哪些能力先落在 `/settings/model-providers`，哪些真正的通用插件页面明确后置

## 2. 背景与问题

截至 `2026-04-19`，当前系统已经具备：

- 官方插件 `latest` 安装能力
- `install -> enable -> assign` 的插件生命周期
- 模型供应商实例配置、验证、刷新模型和 `LLM` 节点消费链路

但现状仍停留在第一版“只装 latest”的边界：

- 官方安装区只显示 `latest`，不支持版本切换
- `/settings/model-providers` 仍按“安装包行”展示，而不是按“供应商当前指针”展示
- 本地即使已经装了多个版本，也没有正式的回退入口
- 插件版本决策目前没有被建模成全局插件能力

更关键的是，用户已经明确新的产品语义：

- 插件版本本质上是一个“指针”
- 下载 `latest` 后，这个供应商在当前 `workspace` 下就应直接使用 `latest`
- 回退不是“新增一个旧版本实例集合”，而是“把这个供应商当前指针切回本地旧版本”
- 这个供应商下的全部实例要一起跟随切换

因此，这轮不能只给 `/settings/model-providers` 补一个按钮，而是要把“插件版本指针”上提为全局插件层 contract，再让模型供应商先接入。

## 3. 核心结论

本轮设计固定采用以下口径：

- 插件版本决策属于全局插件层，不属于模型供应商特有能力
- 当前真正落地的前端表面先放在 `/settings/model-providers`
- 通用插件版本管理页面明确后置到下一轮
- 当前插件家族键直接使用 `provider_code`
- 同一个 `workspace + provider_code` 同时只允许一个当前启用版本
- “升级到最新版本”和“回退到本地旧版本”统一收口为 `switch_version`
- 官方来源本轮仍然只支持下载 `latest`
- 如果目标 `latest` 本地已经装过，不重复下载，直接切换指针
- 如果本地没有旧版本，不提供回退
- 模型供应商切版本时，全部实例一起迁移到目标安装版本
- 实例状态不立即降级为 `invalid`，但模型目录缓存必须失效，并在页面上明确提示需要刷新/验证

一句话总结就是：

`插件层决定当前 workspace 这个供应商正在用哪个版本；模型供应商层只负责在版本切换后把全部实例和缓存一起跟过去。`

## 4. 为什么版本决策必须上提到全局插件层

如果把这轮能力只做在 `/settings/model-providers`：

- 版本切换语义会和通用插件生命周期脱节
- 后续其他插件类型也要再重复造一套“当前版本 / latest / 回退”逻辑
- “当前 workspace 到底启用的是哪个版本”会同时出现在插件层和业务层两个真值源里

因此版本决策必须由全局插件层负责：

- 官方插件目录
- 已安装版本集合
- 当前启用版本指针
- `latest` 检测
- 版本切换任务与审计

模型供应商只作为第一份接入方，在版本切换完成后执行自己的业务迁移逻辑。

## 5. 数据与状态模型

### 5.1 插件家族键

本轮仍然只有 provider plugin，因此当前插件家族键直接使用 `provider_code`。

例如：

- `openai_compatible`

这意味着：

- 同一个 `provider_code` 可以在宿主中存在多个已安装版本
- 但在同一个 `workspace` 下，当前只允许一个版本处于“正在使用”的状态

未来如果宿主引入非 provider plugin，再把这个概念抽象成更通用的 `plugin_family_code`。这一轮不提前扩字段。

### 5.2 已安装版本与当前指针

本轮不新增单独的“workspace 默认版本表”。

当前启用版本真值直接复用现有 assignment 语义，但把它升级成“版本指针”：

- `plugin_installations`
  - 继续表示“本地已安装的具体版本”
- `plugin_assignments`
  - 从“某安装包已分配到 workspace”
  - 收紧为“某 `workspace + provider_code` 当前指向哪个 installation”

这意味着 assignment 不再只是一个“可用性标记”，而是这个供应商当前启用版本的正式指针。

### 5.3 assignment 表约束

为保证“一个供应商一个当前版本”，assignment 层需要收紧到：

- 每个 `workspace + provider_code` 唯一
- assignment 记录持有：
  - `installation_id`
  - `workspace_id`
  - `provider_code`
  - `assigned_by`
  - `created_at`

结果是：

- 当前版本切换时，不是创建第二个 assignment
- 而是把同一 `workspace + provider_code` 的 assignment 指向另一个 installation

## 6. 版本切换语义

### 6.1 动作统一为 `switch_version`

本轮统一新增正式动作：

- `switch_version`

它同时覆盖：

- 升级到 `latest`
- 回退到本地旧版本

前端文案按场景区分：

- `升级到最新版本`
- `回退到该版本`

但任务层和后端 service 层只维护一套切换动作。

### 6.2 升级到最新版本

当用户选择“升级到最新版本”时：

1. 读取官方 catalog 中该插件家族的 `latest`
2. 如果 `latest` 本地未安装：
   - 下载并安装 `latest`
   - 启用目标 installation
3. 如果 `latest` 本地已安装：
   - 不重复下载
4. 执行 `switch_version`
5. 批量迁移该供应商全部实例到目标 installation
6. 失效模型目录缓存
7. 返回新当前版本视图

### 6.3 回退到本地旧版本

当用户选择某个旧版本“回退到该版本”时：

1. 目标版本必须已经存在于本地已安装版本列表
2. 不从官方源下载历史版本
3. 不允许回退到当前已启用版本
4. 执行 `switch_version`
5. 批量迁移全部实例
6. 失效模型目录缓存
7. 返回新当前版本视图

如果本地不存在旧版本，则 UI 不提供该回退选项。

## 7. 模型供应商作为第一份消费方

### 7.1 迁移规则

模型供应商切版本时，必须把当前 `workspace + provider_code` 下的全部 `ModelProviderInstance` 一起迁移到目标 installation：

- `installation_id` 改为目标版本 installation
- `provider_code / protocol / display_name / config_json` 保持原值
- 当前实例状态保留，不直接改成 `invalid`

用户已经明确：这里的“回退/升级”是全量切换，不是只影响新建实例。

### 7.2 风险控制

虽然实例状态不直接降级，但切版本后不能假装一切已经重新验证完成。

因此本轮固定采用以下风险控制：

- 清空或失效该实例的模型目录缓存
- `catalog_refresh_status` 重置为 `idle`
- `catalog_refreshed_at` 清空
- `catalog_last_error_message` 清空
- UI 给出提示：
  - 已切换插件版本
  - 建议刷新模型并验证关键实例

也就是说，这轮采用的是：

- 行为上立即生效
- 状态上保留实例可用性
- 但通过缓存失效和提示，把“重新验证”的责任显式暴露出来

### 7.3 为什么不直接把实例打成 `invalid`

用户明确要求“下载最新就直接用最新插件”，如果切版本时统一把所有实例打成 `invalid`：

- 行为上会与“插件是指针”语义相冲突
- 会让升级变成“先切断再手动修复”

因此本轮不这么做。

## 8. 官方来源与版本范围

### 8.1 官方来源继续只支持 `latest`

本轮官方 catalog 继续只暴露每个插件家族的 `latest`：

- 不显示线上历史版本列表
- 不支持直接下载某个历史版本

这样做的原因是：

- 用户已经明确“下载最新的就用最新”
- 本轮回退只面向本地已安装旧版本
- 线上历史版本浏览与下载属于下一轮 marketplace / 通用插件页能力

### 8.2 本地版本列表来源

“版本管理”中显示的可回退版本，只来自当前宿主已经安装过的本地 installation。

最小字段包括：

- installation_id
- plugin_version
- source_kind
- created_at
- 是否当前启用

## 9. 后端能力设计

### 9.1 通用插件层新增能力

本轮全局插件层新增：

- 插件家族视图查询
- `switch_version`
- 指向 `latest` 的安装并切换
- `workspace + provider_code` 当前版本检测
- `current_version != latest_version` 的更新提示

### 9.2 API 形状

本轮建议新增通用插件路由：

- `GET /api/console/plugins/families`
  - 返回当前 workspace 下按 `provider_code` 聚合后的插件家族视图
- `POST /api/console/plugins/families/{provider_code}/upgrade-latest`
  - 如果 latest 未安装，则先下载 latest，再执行切换
- `POST /api/console/plugins/families/{provider_code}/switch-version`
  - 仅允许切到本地已安装版本

其中：

- `upgrade-latest` 面向“下载最新的就用最新”
- `switch-version` 面向“本地已安装旧版本回退”

虽然两者底层都落到 `switch_version` 任务，但保留两个 API 更利于前端语义清晰。

### 9.3 插件家族视图

`GET /plugins/families` 至少返回：

```json
{
  "provider_code": "openai_compatible",
  "display_name": "OpenAI-Compatible API Provider",
  "protocol": "openai_compatible",
  "current_installation_id": "uuid",
  "current_version": "0.1.0",
  "latest_version": "0.2.0",
  "has_update": true,
  "installed_versions": [
    {
      "installation_id": "uuid-current",
      "plugin_version": "0.1.0",
      "is_current": true
    },
    {
      "installation_id": "uuid-latest",
      "plugin_version": "0.2.0",
      "is_current": false
    }
  ]
}
```

### 9.4 任务与审计

新增任务类型：

- `switch_version`

最小 task detail 包括：

- `provider_code`
- `previous_installation_id`
- `previous_version`
- `target_installation_id`
- `target_version`
- `migrated_instance_count`

最小 audit event 包括：

- `plugin.version_switched`
- `provider.instances_migrated_after_plugin_switch`

## 10. 前端页面设计

### 10.1 当前轮次只接入 `/settings/model-providers`

虽然版本决策属于全局插件层，但通用插件管理页面明确后置。

本轮前端只在 `/settings/model-providers` 先接入第一份消费表面。

### 10.2 列表层改成“供应商家族”

上半区“已安装供应商”改为按 `provider_code` 展示供应商家族行，而不是具体 installation 行。

每行至少展示：

- 供应商名称
- 协议
- 当前启用版本
- latest 版本
- 是否有更新提示
- 当前实例数
- `版本管理`
- `查看实例`
- `添加 API Key`

如果当前启用版本不是 latest，直接展示 warning 提示，例如：

- `当前使用 0.1.0，最新版本 0.2.0`

### 10.3 版本管理弹窗

点击 `版本管理` 打开版本管理弹窗。

弹窗内容固定分两块：

1. 推荐版本
   - 永远显示 `latest`
   - 放在第一位
   - 打 `推荐` 标记
   - 如果当前不是 latest，展示 `升级到最新版本`
2. 本地已安装版本
   - 展示全部本地安装版本
   - 标记当前版本
   - 非当前版本提供 `回退到该版本`

确认文案必须明确：

- 切版本会把当前 workspace 下这个供应商的全部实例一起切过去
- 切换后建议刷新模型并验证关键实例

### 10.4 实例查看弹窗

`查看实例` 继续保留，但它的语义变成：

- 查看当前供应商家族下、当前版本指针所承载的实例

在发生版本切换后：

- 弹窗顶部显示一次性提示
- 提示实例已经切到新插件版本
- 提示建议刷新模型并验证

### 10.5 官方安装区

下半区“安装模型供应商”继续保留官方安装卡片，但按钮语义调整为：

- 若当前未安装：`安装最新版本`
- 若当前已安装且已是 latest：`已使用最新版本`
- 若当前已安装但落后于 latest：`升级到最新版本`

官方安装区仍然只面向 `latest`，不展示历史版本。

## 11. Out Of Scope

本轮明确不做：

- 通用插件管理页面
- 官方历史版本在线下载
- 历史版本删除/清理入口
- 版本切换后的自动实例重验证
- 版本切换后的自动模型刷新
- 非 provider plugin 的实际前端消费页面

## 12. 对既有设计的修正关系

本设计稿对 [2026-04-18-official-plugin-release-install-design.md](/home/taichu/git/1flowbase/docs/superpowers/specs/1flowbase/2026-04-18-official-plugin-release-install-design.md) 中以下第一版边界做正式修正：

- “UI 第一版只展示 `latest` 版本”仍然只适用于官方安装区，不再适用于整个版本管理能力
- `install-official` 的“只装 latest”仍然成立
- 但宿主本轮新增“本地已安装版本回退”与“当前版本不是 latest 的提示”
- 版本决策真值从“安装页局部行为”上提为全局插件层 contract

## 13. 明确建议

本轮建议按以下顺序实现：

1. 先补全局插件层版本指针与 `switch_version` 后端 contract
2. 再补模型供应商实例批量迁移与缓存失效
3. 最后改 `/settings/model-providers` 页面，先做第一份消费表面

这样可以保证：

- 核心真值先收口在插件层
- 模型供应商只是第一份适配器，不会把版本能力写死在业务页里
- 下一轮通用插件管理页面可以直接复用本轮后端 contract
