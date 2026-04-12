# 02 权限与资源授权

日期：2026-04-10
状态：进行中

## 讨论进度

- 状态：`in_progress`
- 完成情况：已完成首轮资源、动作、范围、默认角色矩阵与授权规则收敛。
- 最后更新：2026-04-10 16:06 CST

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)

## 本模块范围

- 资源对象授权
- 路由访问控制
- 角色与动作模型
- 外部数据源等敏感资源权限
- 资源 owner 与授权编码规范

## 已确认

- 权限由后端统一治理。
- 继承 `01 用户登录与团队接入` 的输入：`root` 是应用级唯一超管；`admin`、`manager` 是空间级角色模板；权限点只挂角色，不直接挂用户；后端先判 `root` 再判空间内角色权限点并集。
- 前端权限裁剪不作为安全边界。
- 路由权限不能绕过资源权限。
- P1 正式授权资源为：`Application`、`Flow`、`Publish Endpoint`、`Route/Page Definition`、`State Model`、`State Data`、`External Data Source`、`Plugin Config`、`Embedded App`、`User`、`Role/Permission`。
- P1 标准动作统一为：`view`、`create`、`edit`、`delete`、`manage`、`publish`、`use`、`configure`。
- 数据范围模型仅支持两档：`own`、`all`。
- 路由访问必须同时满足“有路由访问权限”和“有路由绑定资源动作权限”。
- 页面中的具体数据和按钮操作必须再次通过资源动作权限校验。
- `root` 拥有应用级全部权限。
- `admin` 拥有当前空间全部权限。
- `manager` 仅能操作自己应用及其从属资源，不具备成员管理、团队配置、权限配置能力。
- P1 允许创建自定义空间角色，但只允许空间级角色，不允许创建、复制或修改 `root`。
- 权限配置与授权管理默认由 `root/admin` 执行；用户如果需要不同能力，可通过修改空间角色权限点完成。
- `External Data Source`、`Plugin Config` 等敏感配置在 P1 不做额外脱敏或密文隔离；拥有相应权限者可直接查看明文配置。
- 资源 owner 默认是创建者。
- P1 不支持 owner 转移。
- owner 被禁用后，`admin` 可继续管理该资源，也可通过协作者接管或复制资源的方式延续使用。
- P1 不支持显式 `deny`，仅支持 `allow` 并集。
- 审计范围至少覆盖：角色变更、权限点变更、成员角色绑定、敏感资源配置变更、发布动作。
- 权限点命名统一采用 `resource.action.scope`。

## 已确认设计基线

- 设计第 1 段已确认：P1 资源授权对象固定为 `Application`、`Flow`、`Publish Endpoint`、`Route/Page Definition`、`State Model`、`State Data`、`External Data Source`、`Plugin Config`、`Embedded App`、`User`、`Role/Permission`。
- 设计第 2 段已确认：P1 动作统一使用 `view`、`create`、`edit`、`delete`、`manage`、`publish`、`use`、`configure`，并统一按 `own/all` 两档数据范围扩展。
- 设计第 3 段已确认：默认角色矩阵为 `root` 应用级全权限、`admin` 当前空间全权限、`manager` 仅自己应用及其从属资源权限；允许创建自定义空间角色，但不允许触碰 `root`。
- 设计第 4 段已确认：进入页面先过路由权限，页面内的数据与按钮再过资源动作权限；前端展示不是安全边界，真实放行以后端为准。
- 设计第 5 段已确认：敏感配置在 P1 不做额外脱敏，拥有相应权限者可直接查看明文；P1 仅做 `allow` 并集，不支持显式 `deny`。
- 设计第 6 段已确认：资源 owner 默认归创建者、不支持转移；owner 被禁用后由 `admin` 接管、协作者接管或复制资源延续使用；审计范围与权限编码规范一并固定。

## 待讨论

- 当前轮无原则性未决项。
- 若继续细化本模块，下一步是按 `resource.action.scope` 展开逐资源权限矩阵，并补齐“协作者接管”机制的精确定义。
