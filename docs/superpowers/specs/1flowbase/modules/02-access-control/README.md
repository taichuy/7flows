# 02 权限与资源授权

日期：2026-04-15
状态：部分实现 / 口径漂移

## 当前结论

- 当前模块不再按 `2026-04-10` 的模拟开发计划理解。
- 现代码已经完成 ACL 基础设施：
  - 权限目录
  - 默认角色模板
  - 成员 / 角色管理
  - `state_model` 控制面 ACL
  - `state_data` runtime `own/all` ACL
  - 设置区与部分路由的权限消费
- 但早期 README 中那套“完整资源授权产品闭环”并未全部落地。
- 因此本模块当前应作为“已具备主线复用能力的基础 ACL 层”维护，而不是继续当作待完整开发的独立大模块。

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)

## 当前代码事实

### 已落地的规则

- 权限由后端统一治理。
- `root` 为应用级超管；非 `root` 按当前 `workspace` 内角色权限并集鉴权。
- 权限编码使用 `resource.action.scope`。
- 数据范围当前统一只支持 `own` / `all`。
- 当前仍采用 `allow` 并集，不支持显式 `deny`。
- 前端权限裁剪不是安全边界，真实放行以后端为准。

### 已落地的能力

- 权限目录与默认角色模板：
  - `root / admin / manager`
  - `admin.auto_grant_new_permissions = true`
  - `manager.is_default_member_role = true`
- 权限配置管理：
  - 角色列表、创建、更新、删除
  - 角色权限替换
  - 新权限自动授予开启了 `auto_grant_new_permissions` 的角色
- 成员管理：
  - 成员列表、创建、停用、重置密码
  - 成员角色绑定
  - 新成员默认绑定当前 `workspace` 的默认角色
- 工作空间配置权限：
  - `workspace.view.all`
  - `workspace.configure.all`
- 模型与数据权限：
  - `state_model` 控制面读写权限
  - `state_data` runtime CRUD 的 `own/all`
- 前端权限消费：
  - 顶层路由使用 `permissionKey`
  - 设置区按 `api_reference.view.all`、`user.view.all`、`role_permission.view.all` 分区显示

## 当前未闭环范围

以下内容仍然属于“目录先行”或“未来资源接入”，不能算当前已实现：

- `application`
- `flow`
- `publish_endpoint`
- `route_page` 的完整资源授权模型
- `external_data_source`
- `plugin_config`
- `embedded_app` 的真实资源管理闭环

这些资源现在多数只存在于权限目录中，尚未形成对应的后端资源、控制面 service、正式 route 和前端管理页面闭环。

## 与旧 README 的主要差异

### 仍然保留的设计基线

- 权限点只挂角色，不直接挂用户。
- `root` 拥有全局放行能力。
- `admin` 管理当前 `workspace` 的配置、成员和权限。
- `manager` 只应拥有业务资源的默认能力，而不具备成员和权限管理能力。
- 路由权限与资源动作权限应分层治理。

### 当前不能再直接当作代码事实的部分

- 早期列出的正式授权资源全量清单
- “路由访问必须同时满足路由权限 + 路由绑定资源动作权限”的通用产品闭环
- owner 转移
- 协作者接管
- 敏感资源的完整产品级授权面

这些内容不是被否定，而是尚未随着对应业务资源一起落地。

## 主线定位

- `02` 当前已经足够支撑主线继续推进。
- 后续不再单独扩大 `02` 的实现范围来追赶早期计划稿。
- 后续正确做法是：
  - 先推进 `03 Flow 前置容器`
  - 再推进 `04 Flow Studio`
  - 在 `03/04/06B/08` 出现真实资源时，按现有 ACL 模板逐项接入

## 下一步

- 把新增主线资源接入现有 ACL 模板：
  - `permission catalog`
  - service 权限校验
  - route 权限约束
  - 自动化测试
  - 前端入口裁剪
- 清理少量遗留术语漂移：
  - 继续把历史 `team` 口径统一到 `workspace`
- 若后续需要继续细化本模块，优先补的是“逐资源接入清单”，不是重新扩写一版抽象权限设计稿。
